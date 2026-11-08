import { parseAudioMetadata, type AudioMetadata } from './metadata';
import type {
  AudioEngineListener,
  AudioEngineOptions,
  AudioEngineState,
  AudioPlaybackState,
  NeedleDropSound,
  RecordSoundState,
} from './types';

interface GainRampState {
  from: number;
  to: number;
  startTime: number;
  endTime: number;
}

/**
 * Isolated Web Audio API playback engine for a single turntable deck.
 *
 * Keeps all Web Audio primitives (AudioContext, AudioBuffer, AudioBufferSourceNode)
 * completely decoupled from React state and rendering. Handles AudioContext suspended/resume,
 * track loading, decoding, single-use source recreation, and logical position tracking.
 */
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private readonly contextFactory: () => AudioContext;

  private audioBuffer: AudioBuffer | null = null;
  private audioBufferReversed: AudioBuffer | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentSourceGainNode: GainNode | null = null;
  private readonly sourceGainNodes = new WeakMap<AudioBufferSourceNode, GainNode>();
  private currentSourceGainRamp: GainRampState | null = null;
  private gainNode: GainNode | null = null;
  private stylusGainNode: GainNode | null = null;
  private stylusGainRamp: GainRampState | null = null;
  private isStylusDown = false;
  private recordSoundState: RecordSoundState = 'stopped';
  private recordSoundAssetsPromise: Promise<void> | null = null;
  private vinylLoopBuffer: AudioBuffer | null = null;
  private offRecordLoopBuffer: AudioBuffer | null = null;
  private correctDropBuffer: AudioBuffer | null = null;
  private wrongDropBuffer: AudioBuffer | null = null;
  private vinylLoopSource: AudioBufferSourceNode | null = null;
  private vinylLoopGain: GainNode | null = null;
  private vinylLoopStopTimer: ReturnType<typeof setTimeout> | null = null;
  private offRecordLoopSource: AudioBufferSourceNode | null = null;
  private offRecordLoopGain: GainNode | null = null;
  private offRecordLoopStopTimer: ReturnType<typeof setTimeout> | null = null;
  private isReversed = false;
  private isScratching = false;

  private isBraking = false;
  private brakeStartedAt = 0;
  private brakeDurationSec = 0;
  private brakeInitialRate = 1.0;
  private brakeTimer: ReturnType<typeof setTimeout> | null = null;
  private brakingSource: AudioBufferSourceNode | null = null;

  private trackName: string | null = null;
  private metadata: AudioMetadata | null = null;
  private duration = 0;
  private logicalPosition = 0;
  private playStartedAt = 0;
  private playbackState: AudioPlaybackState = 'idle';
  private error: string | null = null;

  private currentPlaybackRate = 1.0;
  private loadCounter = 0;
  private playCounter = 0;
  private sourceGeneration = 0;
  private isDisposed = false;

  private isCoasting = false;
  private coastTimer: ReturnType<typeof setTimeout> | null = null;
  private coastStartedAt = 0;
  private coastDurationSec = 0;
  private coastInitialRate = 1.0;

  private isSpinningUp = false;
  private spinUpStartedAt = 0;
  private spinUpDurationSec = 0;
  private spinUpInitialRate = 0.2;
  private spinUpTimer: ReturnType<typeof setTimeout> | null = null;

  private tickerTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<AudioEngineListener>();

  constructor(options: AudioEngineOptions = {}) {
    this.contextFactory =
      options.audioContextFactory ??
      (() => {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error('Web Audio API is not supported in this environment');
        }
        return new AudioContextClass();
      });
  }

  /**
   * Lazily initializes or returns the deck's AudioContext.
   *
   * @returns Active AudioContext instance.
   */
  private getOrCreateContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = this.contextFactory();
      this.gainNode = this.audioContext.createGain();
      this.stylusGainNode = this.audioContext.createGain();
      // Default to muted (stylus lifted/parked)
      this.stylusGainNode.gain.value = this.isStylusDown ? 1.0 : 0.0;
      this.gainNode.connect(this.stylusGainNode);
      this.stylusGainNode.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private getOrCreateGainNode(): GainNode {
    const ctx = this.getOrCreateContext();
    if (!this.gainNode) {
      this.gainNode = ctx.createGain();
      this.stylusGainNode = ctx.createGain();
      this.stylusGainNode.gain.value = this.isStylusDown ? 1.0 : 0.0;
      this.gainNode.connect(this.stylusGainNode);
      this.stylusGainNode.connect(ctx.destination);
    }
    return this.gainNode;
  }

  /**
   * Sets stylus contact with the record surface.
   * Smoothly unmutes or mutes track audio through the dedicated stylus GainNode.
   *
   * @param isContact - True if needle is on the record; false if lifted or parked.
   */
  private getRampValue(ramp: GainRampState | null, time: number, fallback: number): number {
    if (!ramp) return fallback;
    const duration = ramp.endTime - ramp.startTime;
    if (duration <= 0 || time >= ramp.endTime) return ramp.to;
    if (time <= ramp.startTime) return ramp.from;
    const progress = (time - ramp.startTime) / duration;
    return ramp.from + (ramp.to - ramp.from) * progress;
  }

  public setStylusContact(isContact: boolean): void {
    if (this.isStylusDown === isContact) {
      return;
    }
    this.isStylusDown = isContact;

    if (this.audioContext && this.stylusGainNode) {
      const now = this.audioContext.currentTime;
      const target = isContact ? 1.0 : 0.0;
      const parameter = this.stylusGainNode.gain;
      const currentValue = this.getRampValue(this.stylusGainRamp, now, parameter.value);
      try {
        if (typeof parameter.cancelAndHoldAtTime === 'function') {
          parameter.cancelAndHoldAtTime(now);
        } else {
          // AudioParam.value is not a reliable read of an in-flight automation
          // ramp on every browser. Reconstruct our own 15ms ramp position.
          parameter.cancelScheduledValues(now);
          parameter.setValueAtTime(currentValue, now);
        }
        parameter.linearRampToValueAtTime(target, now + 0.015);
        this.stylusGainRamp = {
          from: currentValue,
          to: target,
          startTime: now,
          endTime: now + 0.015,
        };
      } catch {
        // Fallback for mocked AudioParam in tests
        parameter.value = target;
        this.stylusGainRamp = null;
      }
    }

    this.notify();
  }

  /**
   * Returns whether the stylus is down in contact with the record.
   */
  public getIsStylusDown(): boolean {
    return this.isStylusDown;
  }

  /** Selects the independent crackle/off-record layer for this deck. */
  public setRecordSoundState(state: RecordSoundState): void {
    this.recordSoundState = state;
    if (state === 'stopped' || this.isDisposed) {
      this.stopRecordLoop('vinyl');
      this.stopRecordLoop('off-record');
      return;
    }
    const context = this.getOrCreateContext();
    void this.ensureRecordSoundAssets(context).then(() => this.syncRecordSoundLoops());
  }

  /** Plays a needle placement cue as a separate audio voice over the track. */
  public playNeedleDropSound(kind: NeedleDropSound): void {
    if (this.isDisposed) return;
    const context = this.getOrCreateContext();
    void this.ensureContextRunning()
      .then(() => this.ensureRecordSoundAssets(context))
      .then(() => {
        if (this.isDisposed) return;
        const buffer = kind === 'correct' ? this.correctDropBuffer : this.wrongDropBuffer;
        if (!buffer) return;
        const source = context.createBufferSource();
        const voiceGain = context.createGain();
        source.buffer = buffer;
        voiceGain.gain.value = kind === 'correct' ? 0.62 : 0.7;
        source.connect(voiceGain);
        voiceGain.connect(context.destination);
        source.onended = () => {
          try {
            source.disconnect();
            voiceGain.disconnect();
          } catch {
            // One-shot nodes may already have been disconnected.
          }
        };
        source.start(0);
      })
      .catch(() => {
        // Placement cues must never break normal deck playback.
      });
  }

  private ensureRecordSoundAssets(context: AudioContext): Promise<void> {
    if (this.recordSoundAssetsPromise) return this.recordSoundAssetsPromise;
    const baseUrl = import.meta.env.BASE_URL || '/';
    const soundBase = baseUrl.endsWith('/') ? baseUrl + 'sounds/' : baseUrl + '/sounds/';
    const decode = async (filename: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(soundBase + filename);
        if (!response.ok) return null;
        return await context.decodeAudioData((await response.arrayBuffer()).slice(0));
      } catch {
        return null;
      }
    };
    this.recordSoundAssetsPromise = Promise.all([
      decode('vinyl_loop.wav'),
      decode('not_on_record_loop.wav'),
      decode('needle_start_record.wav'),
      decode('needle_placed_wrong.wav'),
    ]).then(([vinyl, offRecord, correctDrop, wrongDrop]) => {
      this.vinylLoopBuffer = vinyl;
      this.offRecordLoopBuffer = offRecord;
      this.correctDropBuffer = correctDrop;
      this.wrongDropBuffer = wrongDrop;
      this.syncRecordSoundLoops();
    });
    return this.recordSoundAssetsPromise;
  }

  private syncRecordSoundLoops(): void {
    if (this.recordSoundState === 'on-record' && this.vinylLoopBuffer) {
      this.startRecordLoop('vinyl', this.vinylLoopBuffer, 0.12);
    } else {
      this.stopRecordLoop('vinyl');
    }
    if (this.recordSoundState === 'off-record' && this.offRecordLoopBuffer) {
      this.startRecordLoop('off-record', this.offRecordLoopBuffer, 0.15);
    } else {
      this.stopRecordLoop('off-record');
    }
  }

  private startRecordLoop(kind: 'vinyl' | 'off-record', buffer: AudioBuffer, target: number): void {
    const context = this.audioContext;
    if (!context || context.state === 'closed') return;
    let source = kind === 'vinyl' ? this.vinylLoopSource : this.offRecordLoopSource;
    let gain = kind === 'vinyl' ? this.vinylLoopGain : this.offRecordLoopGain;
    const timer = kind === 'vinyl' ? this.vinylLoopStopTimer : this.offRecordLoopStopTimer;
    if (timer !== null) {
      clearTimeout(timer);
      if (kind === 'vinyl') this.vinylLoopStopTimer = null;
      else this.offRecordLoopStopTimer = null;
    }
    if (!source || !gain) {
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
      if (kind === 'vinyl') {
        this.vinylLoopSource = source;
        this.vinylLoopGain = gain;
      } else {
        this.offRecordLoopSource = source;
        this.offRecordLoopGain = gain;
      }
    }
    const now = context.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(target, now + 0.08);
    } catch {
      gain.gain.value = target;
    }
  }

  private stopRecordLoop(kind: 'vinyl' | 'off-record'): void {
    const source = kind === 'vinyl' ? this.vinylLoopSource : this.offRecordLoopSource;
    const gain = kind === 'vinyl' ? this.vinylLoopGain : this.offRecordLoopGain;
    if (!source || !gain || !this.audioContext) return;
    const oldTimer = kind === 'vinyl' ? this.vinylLoopStopTimer : this.offRecordLoopStopTimer;
    if (oldTimer !== null) clearTimeout(oldTimer);
    const now = this.audioContext.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.08);
    } catch {
      gain.gain.value = 0;
    }
    const timer = setTimeout(() => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch {
        // The loop may already have been stopped during disposal.
      }
      if (kind === 'vinyl' && this.vinylLoopSource === source) {
        this.vinylLoopSource = null;
        this.vinylLoopGain = null;
        this.vinylLoopStopTimer = null;
      } else if (kind === 'off-record' && this.offRecordLoopSource === source) {
        this.offRecordLoopSource = null;
        this.offRecordLoopGain = null;
        this.offRecordLoopStopTimer = null;
      }
    }, 100);
    if (kind === 'vinyl') this.vinylLoopStopTimer = timer;
    else this.offRecordLoopStopTimer = timer;
  }

  /**
   * Ensures the AudioContext is running after user interaction.
   *
   * @throws Error if resume fails.
   */
  private async ensureContextRunning(): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        throw new Error(
          `Failed to activate audio: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }
  }

  /**
   * Subscribes a listener to engine state changes.
   * Returns an unsubscribe function.
   *
   * @param listener - Callback receiving current state snapshots.
   * @returns Cleanup unsubscribe function.
   */
  public subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns the current snapshot of engine state.
   *
   * @returns Frozen state snapshot.
   */
  public getState(): AudioEngineState {
    let currentTime = this.logicalPosition;
    if (this.isBraking && this.audioContext) {
      const brakeElapsed = Math.min(
        this.brakeDurationSec,
        Math.max(0, this.audioContext.currentTime - this.brakeStartedAt),
      );
      const progress = this.brakeDurationSec > 0 ? brakeElapsed / this.brakeDurationSec : 1;
      const averageRate = this.brakeInitialRate * (1 - 0.5 * progress);
      currentTime = Math.min(
        this.duration,
        Math.max(0, this.logicalPosition + brakeElapsed * averageRate),
      );
    } else if (this.playbackState === 'playing' && this.audioContext && !this.isScratching) {
      if (this.isCoasting) {
        // Linear deceleration from coastInitialRate to 0 over coastDurationSec
        const coastElapsed = Math.min(
          this.coastDurationSec,
          Math.max(0, this.audioContext.currentTime - this.coastStartedAt),
        );
        const progress = this.coastDurationSec > 0 ? coastElapsed / this.coastDurationSec : 1;
        const avgRate = this.coastInitialRate * (1 - 0.5 * progress);
        const elapsed = coastElapsed * avgRate;
        currentTime = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      } else if (this.isSpinningUp) {
        // Linear acceleration from spinUpInitialRate to currentPlaybackRate over spinUpDurationSec
        const spinElapsed = Math.min(
          this.spinUpDurationSec,
          Math.max(0, this.audioContext.currentTime - this.spinUpStartedAt),
        );
        const progress = this.spinUpDurationSec > 0 ? spinElapsed / this.spinUpDurationSec : 1;
        const avgRate = this.spinUpInitialRate + 0.5 * (this.currentPlaybackRate - this.spinUpInitialRate) * progress;
        const elapsed = spinElapsed * avgRate;
        currentTime = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      } else {
        const elapsed = (this.audioContext.currentTime - this.playStartedAt) * this.currentPlaybackRate;
        currentTime = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      }
    }

    return {
      trackName: this.trackName,
      metadata: this.metadata,
      duration: this.duration,
      currentTime,
      playbackState: this.playbackState,
      isStylusDown: this.isStylusDown,
      error: this.error,
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private startTicker(): void {
    this.stopTicker();
    this.tickerTimer = setInterval(() => {
      if (this.playbackState === 'playing' || this.isBraking) {
        // The AudioBufferSourceNode's native onended event is the only authoritative
        // end-of-track signal. Do not stop it from this 100ms UI ticker: estimated
        // logical time can reach duration a render quantum before the final samples
        // have actually left the output, which creates an audible discontinuity.
        this.notify();
      }
    }, 100);
  }

  private stopTicker(): void {
    if (this.tickerTimer !== null) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
  }

  /**
   * Loads and decodes an audio file into the deck.
   *
   * @param file - File object or raw ArrayBuffer.
   * @param name - Optional track name override.
   */
  public async loadTrack(file: File | ArrayBuffer, name?: string): Promise<void> {
    const requestId = ++this.loadCounter;
    this.stop();
    this.playbackState = 'loading';
    this.error = null;

    // Clean up previous artwork URL if exists
    if (this.metadata?.artworkUrl) {
      try {
        URL.revokeObjectURL(this.metadata.artworkUrl);
      } catch {
        // ignore in mock environments
      }
    }

    let parsedMeta: AudioMetadata | null = null;
    if (file instanceof File) {
      try {
        parsedMeta = await parseAudioMetadata(file);
      } catch {
        // retain default fallback
      }
    }

    if (this.isDisposed || requestId !== this.loadCounter) {
      if (parsedMeta?.artworkUrl) {
        try {
          URL.revokeObjectURL(parsedMeta.artworkUrl);
        } catch {
          // ignore
        }
      }
      return;
    }

    this.trackName = parsedMeta?.title ?? name ?? (file instanceof File ? file.name : 'Unknown Track');
    this.metadata = parsedMeta;
    this.logicalPosition = 0;
    this.duration = 0;
    this.notify();

    try {
      const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
      if (this.isDisposed || requestId !== this.loadCounter) return;

      const ctx = this.getOrCreateContext();
      // Preload the four supplied record sounds while the selected track decodes.
      void this.ensureRecordSoundAssets(ctx);

      // Web Audio decodeAudioData handles both Promise-based and callback-based APIs
      const decoded: AudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        let isSettled = false;
        try {
          const res = ctx.decodeAudioData(
            arrayBuffer.slice(0),
            (buf) => {
              if (!isSettled) {
                isSettled = true;
                resolve(buf);
              }
            },
            (err) => {
              if (!isSettled) {
                isSettled = true;
                reject(err);
              }
            },
          );

          if (res && typeof res.then === 'function') {
            res.then(
              (buf) => {
                if (!isSettled) {
                  isSettled = true;
                  resolve(buf);
                }
              },
              (err) => {
                if (!isSettled) {
                  isSettled = true;
                  reject(err);
                }
              },
            );
          }
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            reject(err);
          }
        }
      });

      if (this.isDisposed || requestId !== this.loadCounter) return;

      this.applyTerminalEdgeFade(decoded);
      this.audioBuffer = decoded;
      this.audioBufferReversed = this.createReversedAudioBuffer(decoded, ctx);
      this.duration = decoded.duration;
      this.logicalPosition = 0;
      this.playbackState = 'stopped';
      this.error = null;
      this.notify();
    } catch (err) {
      if (this.isDisposed || requestId !== this.loadCounter) return;
      this.audioBuffer = null;
      this.duration = 0;
      this.logicalPosition = 0;
      this.playbackState = 'idle';
      this.error = `Failed to decode audio: ${err instanceof Error ? err.message : 'Invalid audio file'}`;
      this.notify();
      throw err;
    }
  }

  /**
   * Generates a reversed AudioBuffer for reverse audio playback and scratching.
   *
   * @param buffer - Original forward AudioBuffer.
   * @param ctx - AudioContext for buffer allocation.
   * @returns Newly allocated reversed AudioBuffer.
   */
  /**
   * Applies an inaudible short terminal fade (~5-10ms) to the ends of all audio channels
   * to guarantee that the final PCM sample reaches 0 smoothly, eliminating clicks on natural track end.
   */
  /**
   * Applies a short raised-cosine fade to the final 20ms of every decoded channel.
   *
   * The zero-slope start and end avoid introducing a new edge, and the final
   * sample is exactly zero before the source naturally reaches its buffer end.
   *
   * @param buffer - Decoded audio buffer to prepare for click-free natural playback end.
   */
  private applyTerminalEdgeFade(buffer: AudioBuffer): void {
    const fadeSamples = Math.min(
      Math.round(buffer.sampleRate * 0.02),
      Math.floor(buffer.length / 2),
    );
    if (fadeSamples < 2) return;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const fadeStart = data.length - fadeSamples;

      for (let i = 0; i < fadeSamples; i++) {
        const progress = i / (fadeSamples - 1);
        const gain = 0.5 * (1 + Math.cos(Math.PI * progress));
        const sample = data[fadeStart + i];
        if (sample !== undefined) {
          data[fadeStart + i] = sample * gain;
        }
      }
    }
  }

  /**
   * Generates a reversed AudioBuffer for reverse audio playback and scratching.
   *
   * @param buffer - Original forward AudioBuffer.
   * @param ctx - AudioContext for buffer allocation.
   * @returns Newly allocated reversed AudioBuffer.
   */
  private createReversedAudioBuffer(buffer: AudioBuffer, ctx: AudioContext): AudioBuffer {
    const reversed = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const forwardData = buffer.getChannelData(c);
      const reversedData = reversed.getChannelData(c);
      for (let i = 0, j = buffer.length - 1; i < buffer.length; i++, j--) {
        const sample = forwardData[j];
        if (sample !== undefined) {
          reversedData[i] = sample;
        }
      }
    }
    return reversed;
  }

  /**
   * Starts or resumes audio playback from the given or current logical track position.
   *
   * @param offsetPosition - Optional position in seconds from which to start playback.
   */
  public async play(offsetPosition?: number): Promise<void> {
    if (!this.audioBuffer || this.isDisposed) {
      return;
    }

    if (this.playbackState === 'playing' && !this.isScratching && !this.isCoasting) {
      return;
    }

    // Cancel any active coast-down
    this.stopCoastTimer();

    const currentPlayId = ++this.playCounter;

    try {
      await this.ensureContextRunning();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.notify();
      return;
    }

    // If stop, pause, or disposal occurred during async resume, abort play
    if (this.isDisposed || currentPlayId !== this.playCounter) {
      return;
    }

    if (offsetPosition !== undefined) {
      this.logicalPosition = Math.max(0, Math.min(this.duration, offsetPosition));
    } else if (this.logicalPosition >= this.duration) {
      this.logicalPosition = 0;
    }

    this.isReversed = false;
    this.isScratching = false;
    this.startSourceAt(this.logicalPosition, false);
    this.playbackState = 'playing';
    this.error = null;

    this.startTicker();
    this.notify();
  }

  private startSourceAt(position: number, reversed: boolean, rampGain = true): void {
    if (!this.audioBuffer || !this.audioBufferReversed || this.isDisposed) return;
    const ctx = this.getOrCreateContext();
    const gain = this.getOrCreateGainNode();

    const hasOutgoingSource = this.currentSource !== null;
    this.cancelPendingBrake();
    this.fadeOutCurrentSourceNode();

    const generation = ++this.sourceGeneration;
    const source = ctx.createBufferSource();
    const sourceGainNode = ctx.createGain();
    source.buffer = reversed ? this.audioBufferReversed : this.audioBuffer;
    source.connect(sourceGainNode);
    sourceGainNode.connect(gain);
    this.sourceGainNodes.set(source, sourceGainNode);
    this.currentSourceGainNode = sourceGainNode;

    source.onended = () => {
      if (this.currentSource === source && this.sourceGeneration === generation && !this.isScratching) {
        this.handlePlaybackEnded(source, generation);
      }
    };

    const clampedPos = Math.max(0, Math.min(this.duration, position));
    const startOffset = reversed ? Math.max(0, this.duration - clampedPos) : clampedPos;

    this.playStartedAt = ctx.currentTime;
    this.logicalPosition = clampedPos;
    this.isReversed = reversed;

    // Apply current playback rate
    const now = ctx.currentTime;
    source.playbackRate.cancelScheduledValues(now);
    source.playbackRate.setValueAtTime(this.currentPlaybackRate, now);
    sourceGainNode.gain.cancelScheduledValues(now);
    sourceGainNode.gain.setValueAtTime(0, now);
    sourceGainNode.gain.linearRampToValueAtTime(1, now + 0.015);
    this.currentSourceGainRamp = {
      from: 0,
      to: 1,
      startTime: now,
      endTime: now + 0.015,
    };

    // Fade the deck master only when starting from silence. During a cue or
    // scratch-direction change, the per-source gains provide a short crossfade.
    if (rampGain) {
      if (!hasOutgoingSource) {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(1, now + 0.015);
        } catch {
          // mock
        }
      }
    } else {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(1, now);
      } catch {
        // mock
      }
    }

    source.start(0, startOffset);
    this.currentSource = source;
  }

  /**
   * Sets the playback rate factor based on turntable speed (33/45 RPM) and pitch fader.
   *
   * If the deck is actively playing, re-bases the logical playback position to ensure that
   * `getCurrentTime()` remains continuous and monotonic without backward or forward jumps.
   *
   * @param rate - Target playback rate multiplier (clamped between 0.1 and 4.0).
   */
  public setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.1, Math.min(4.0, rate));
    if (Math.abs(this.currentPlaybackRate - clamped) < 0.0001) {
      return;
    }

    if (this.playbackState === 'playing' && this.audioContext && !this.isScratching && !this.isCoasting) {
      // Re-base current position using the old rate before updating to the new rate
      const elapsed = (this.audioContext.currentTime - this.playStartedAt) * this.currentPlaybackRate;
      this.logicalPosition = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      this.playStartedAt = this.audioContext.currentTime;

      if (this.currentSource) {
        const now = this.audioContext.currentTime;
        this.currentSource.playbackRate.cancelScheduledValues(now);
        this.currentSource.playbackRate.setValueAtTime(clamped, now);
      }
    }

    this.currentPlaybackRate = clamped;
    this.notify();
  }

  /**
   * Realtime scratching handler matching vinyl motion.
   * Modulates playback speed and switches between forward and reverse buffers.
   *
   * @param speed - Scratch speed magnitude multiplier.
   * @param reversed - Whether movement is backward.
   * @param position - Target logical position in seconds.
   */
  public scratch(speed: number, reversed: boolean, position: number): void {
    if (!this.audioBuffer) return;

    this.stopCoastTimer();
    this.isScratching = true;
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const clampedPos = Math.max(0, Math.min(this.duration, position));
    this.logicalPosition = clampedPos;

    if (!this.currentSource || reversed !== this.isReversed) {
      this.startSourceAt(clampedPos, reversed);
    }
    this.playbackState = 'playing';

    if (this.currentSource) {
      const absSpeed = Math.abs(speed);
      // Scale instantaneous scratch speed by current deck playback rate
      const scaledSpeed = absSpeed * this.currentPlaybackRate;
      const targetRate = Math.max(0.001, Math.min(4.0, scaledSpeed));
      const now = ctx.currentTime;
      this.currentSource.playbackRate.cancelScheduledValues(now);
      this.currentSource.playbackRate.linearRampToValueAtTime(targetRate, now + 0.02);
    }
  }

  /**
   * Concludes scratching, resetting playback rate and resuming standard forward playback if desired.
   *
   * Explicitly stops the active scratch source (which may be a reversed buffer or playing at a non-standard
   * scratch rate) and spawns a clean forward AudioBufferSourceNode starting at the exact scratch position
   * with the deck's configured base playback rate.
   *
   * @param resumePlayback - Whether to return to forward playback (true if platter motor is running).
   */
  public endScratch(resumePlayback: boolean): void {
    this.isScratching = false;

    if (resumePlayback && this.audioBuffer) {
      // Replace the scratch source with clean forward playback at the exact hand position.
      // startSourceAt crossfades the scratch source into the normal transport source.
      this.isReversed = false;
      this.startSourceAt(this.logicalPosition, false);
      this.playbackState = 'playing';
      this.error = null;
      this.startTicker();
      this.notify();
      return;
    }

    // When the motor is off, finish the free-spin at its final position.
    // Do not invoke the motor's 250ms brake: the platter physics have already
    // brought the manual push to rest.
    const source = this.currentSource;
    this.currentSource = null;
    this.isReversed = false;
    this.stopTicker();
    this.playbackState = this.audioBuffer ? 'paused' : 'idle';

    if (source && this.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      try {
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.02);
        source.onended = null;
        setTimeout(() => {
          try {
            source.stop();
            source.disconnect();
          } catch {
            // The scratch source may already have ended.
          }
        }, 25);
      } catch {
        this.stopSource(source);
      }
    } else if (source) {
      this.stopSource(source);
    }

    this.notify();
  }

  /**
   * Seeks to a specific logical track position and restarts audio at that position.
   *
   * @param position - Timestamp in seconds to seek to.
   */
  public seek(position: number): void {
    this.logicalPosition = Math.max(0, Math.min(this.duration, position));
    if (this.playbackState === 'playing') {
      this.startSourceAt(this.logicalPosition, false);
    }
    this.notify();
  }

  /**
   * Pauses playback and records the logical position.
   */
  /**
   * Initiates an authentic Technics motor inertia coast-down.
   * Audio playback rate ramps smoothly down to 0 over durationMs, decelerating
   * in tandem with the visual platter before pausing at the final position.
   *
   * @param durationMs - Coast-down deceleration duration in milliseconds (default 1200ms).
   */
  public coastDown(durationMs = 1200): void {
    if (this.playbackState !== 'playing' || !this.audioBuffer || !this.currentSource || this.isScratching) {
      return;
    }

    this.stopSpinUpTimer();
    this.stopCoastTimer();

    const ctx = this.getOrCreateContext();
    this.updateLogicalPositionBeforeStopping();
    this.playStartedAt = ctx.currentTime;
    this.coastStartedAt = ctx.currentTime;
    this.coastDurationSec = Math.max(0.1, durationMs / 1000);
    this.coastInitialRate = this.currentPlaybackRate;
    this.isCoasting = true;

    // Schedule linear deceleration of playbackRate to 0
    const now = ctx.currentTime;
    const end = now + this.coastDurationSec;
    try {
      this.currentSource.playbackRate.cancelScheduledValues(now);
      this.currentSource.playbackRate.setValueAtTime(this.currentPlaybackRate, now);
      this.currentSource.playbackRate.linearRampToValueAtTime(0, end);
    } catch {
      // AudioParam scheduling might fail in mock environments
    }

    this.coastTimer = setTimeout(() => {
      this.finishCoastDown();
    }, durationMs);
  }

  private finishCoastDown(): void {
    if (!this.isCoasting) return;

    // Preserve the exact position reached during the coast before reusing pause().
    // Rebase the playback clock so pause() cannot add another interval at nominal speed.
    this.updateLogicalPositionBeforeStopping();
    if (this.audioContext) {
      this.playStartedAt = this.audioContext.currentTime;
    }

    // Power-off must finish through the same GainNode fade-out and delayed
    // source disconnection as the dedicated Pause button. Stopping the source
    // directly here was the power-only click/pop.
    this.isCoasting = false;
    // The 1.2s motor coast already supplied the deceleration; only de-click
    // the final shutdown instead of adding a second audible brake.
    this.pause(0);
  }

  /**
   * Cancels any active coast-down and restores motor torque, ramping playback rate
   * back up to target nominal speed without jumping the track position.
   */
  public cancelCoastDown(): void {
    if (!this.isCoasting) return;
    this.stopCoastTimer();

    if (this.playbackState === 'playing' && this.currentSource && this.audioContext) {
      this.updateLogicalPositionBeforeStopping();
      this.playStartedAt = this.audioContext.currentTime;

      const now = this.audioContext.currentTime;
      try {
        this.currentSource.playbackRate.cancelScheduledValues(now);
        this.currentSource.playbackRate.setValueAtTime(0.2, now);
        this.currentSource.playbackRate.linearRampToValueAtTime(this.currentPlaybackRate, now + 0.15);
      } catch {
        // mock
      }
      this.notify();
    }
  }

  /**
   * Initiates authentic Technics high-torque motor spin-up from fully stopped.
   * Playback begins from the preserved track position with playback rate ramping
   * up smoothly from 0.2 to target nominal rate over durationMs (default 450ms).
   *
   * @param durationMs - Spin-up acceleration duration in milliseconds (default 450ms).
   */
  public async spinUp(durationMs = 450): Promise<void> {
    if (!this.audioBuffer || this.isDisposed) {
      return;
    }

    this.stopCoastTimer();
    this.stopSpinUpTimer();

    const currentPlayId = ++this.playCounter;

    try {
      await this.ensureContextRunning();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.notify();
      return;
    }

    if (this.isDisposed || currentPlayId !== this.playCounter) {
      return;
    }

    if (this.logicalPosition >= this.duration) {
      this.logicalPosition = 0;
    }

    this.isReversed = false;
    this.isScratching = false;

    // Start source at current logical position with gain fade-in
    this.startSourceAt(this.logicalPosition, false, true);

    const ctx = this.getOrCreateContext();
    const now = ctx.currentTime;
    const durationSec = Math.max(0.1, durationMs / 1000);

    this.isSpinningUp = true;
    this.spinUpStartedAt = now;
    this.spinUpDurationSec = durationSec;
    this.spinUpInitialRate = 0.2;

    if (this.currentSource) {
      try {
        this.currentSource.playbackRate.cancelScheduledValues(now);
        this.currentSource.playbackRate.setValueAtTime(this.spinUpInitialRate, now);
        this.currentSource.playbackRate.linearRampToValueAtTime(this.currentPlaybackRate, now + durationSec);
      } catch {
        // mock
      }
    }

    this.playbackState = 'playing';
    this.error = null;
    this.startTicker();
    this.notify();

    this.spinUpTimer = setTimeout(() => {
      if (this.isSpinningUp) {
        this.updateLogicalPositionBeforeStopping();
        this.playStartedAt = this.audioContext?.currentTime ?? 0;
        this.isSpinningUp = false;
        this.spinUpTimer = null;
      }
    }, durationMs);
  }

  private stopSpinUpTimer(): void {
    if (this.spinUpTimer !== null) {
      clearTimeout(this.spinUpTimer);
      this.spinUpTimer = null;
    }
    this.isSpinningUp = false;
  }

  private stopCoastTimer(): void {
    if (this.coastTimer !== null) {
      clearTimeout(this.coastTimer);
      this.coastTimer = null;
    }
    this.isCoasting = false;
  }

  /**
   * Brakes the platter to a pause while preserving the final track position.
   *
   * @param durationMs - Mechanical brake duration; use 0 after a completed motor coast.
   */
  public pause(durationMs = 250): void {
    this.stopCoastTimer();
    this.stopSpinUpTimer();
    this.playCounter++;
    if (this.playbackState !== 'playing' || !this.audioBuffer) {
      return;
    }

    this.updateLogicalPositionBeforeStopping();
    const srcToStop = this.currentSource;
    this.currentSource = null;
    this.currentSourceGainNode = null;
    this.currentSourceGainRamp = null;
    this.playbackState = 'paused';

    if (!srcToStop || !this.gainNode || !this.audioContext) {
      this.stopTicker();
      this.stopCurrentSourceNode();
      this.notify();
      return;
    }

    const now = this.audioContext.currentTime;
    try {
      srcToStop.onended = null;
    } catch {
      // The source is retired manually after the brake.
    }

    if (durationMs > 0) {
      this.isBraking = true;
      this.brakeStartedAt = now;
      this.brakeDurationSec = durationMs / 1000;
      this.brakeInitialRate = this.currentPlaybackRate;
      const end = now + this.brakeDurationSec;

      try {
        srcToStop.playbackRate.cancelScheduledValues(now);
        srcToStop.playbackRate.setValueAtTime(this.brakeInitialRate, now);
        srcToStop.playbackRate.linearRampToValueAtTime(0, end);

        // Keep the audio present during the mechanical slowdown, then fade only
        // the final 20ms to silence so the last sample cannot click.
        const fadeStart = Math.max(now, end - 0.02);
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, fadeStart);
        this.gainNode.gain.linearRampToValueAtTime(0, end);
      } catch {
        // AudioParam automation is best-effort in test/mock environments.
      }

      this.brakingSource = srcToStop;
      this.brakeTimer = setTimeout(() => {
        this.finishPauseBrake(srcToStop);
      }, durationMs + 5);
      this.startTicker();
    } else {
      try {
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.015);
      } catch {
        // mock
      }

      setTimeout(() => this.stopSource(srcToStop), 20);
      this.stopTicker();
    }

    this.notify();
  }

  private finishPauseBrake(source: AudioBufferSourceNode): void {
    const isCurrentBrake = this.brakingSource === source;
    if (isCurrentBrake) {
      this.logicalPosition = this.getState().currentTime;
      this.brakingSource = null;
      this.isBraking = false;
      this.brakeTimer = null;
    }

    this.stopSource(source);
    if (isCurrentBrake) {
      this.stopTicker();
      this.notify();
    }
  }

  private cancelPendingBrake(): void {
    if (this.brakeTimer !== null) {
      clearTimeout(this.brakeTimer);
      this.brakeTimer = null;
    }
    const source = this.brakingSource;
    this.brakingSource = null;
    this.isBraking = false;
    if (source) {
      this.stopSource(source);
    }
  }

  private disconnectSourceGain(source: AudioBufferSourceNode): void {
    const sourceGainNode = this.sourceGainNodes.get(source);
    if (!sourceGainNode) return;
    try {
      sourceGainNode.disconnect();
    } catch {
      // The gain node may already have been disconnected.
    }
    this.sourceGainNodes.delete(source);
  }

  private stopSource(source: AudioBufferSourceNode): void {
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch {
      // The source may already have ended or been disconnected.
    } finally {
      this.disconnectSourceGain(source);
    }
  }

  /**
   * Stops playback and resets logical position to 0.
   */
  public stop(): void {
    this.stopCoastTimer();
    this.stopSpinUpTimer();
    this.cancelPendingBrake();
    this.playCounter++;

    const srcToStop = this.currentSource;
    this.currentSource = null;
    this.currentSourceGainNode = null;
    this.currentSourceGainRamp = null;

    if (this.gainNode && this.audioContext && srcToStop) {
      const now = this.audioContext.currentTime;
      try {
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.015);
      } catch {
        // mock
      }

      try {
        srcToStop.onended = null;
      } catch {
        // ignore
      }

      // Keep source playing and connected until the gain fade completes (15ms + buffer)
      setTimeout(() => {
        try {
          srcToStop.stop();
          srcToStop.disconnect();
        } catch {
          // ignore
        }
      }, 20);
    } else {
      this.stopCurrentSourceNode();
    }

    this.stopTicker();
    this.logicalPosition = 0;
    if (this.audioBuffer) {
      this.playbackState = 'stopped';
    } else {
      this.playbackState = 'idle';
    }
    this.notify();
  }

  private handlePlaybackEnded(source: AudioBufferSourceNode, generation: number): void {
    // Ignore a delayed end event from a source that has already been replaced.
    if (this.currentSource !== source || this.sourceGeneration !== generation) {
      return;
    }

    this.currentSource = null;
    this.currentSourceGainNode = null;
    this.currentSourceGainRamp = null;
    this.sourceGeneration++;
    this.stopTicker();
    this.stopCoastTimer();
    this.stopSpinUpTimer();

    // onended means the source has already completed naturally. Disconnect it,
    // but do not call stop(): ending the source a second time is unnecessary and
    // risks cutting the final output quantum on some browser implementations.
    try {
      source.onended = null;
      source.disconnect();
      this.disconnectSourceGain(source);
    } catch {
      // The source may already have been disconnected by the browser.
    }

    this.logicalPosition = this.duration;
    this.playbackState = 'stopped';
    this.notify();
  }

  private updateLogicalPositionBeforeStopping(): void {
    if (this.playbackState === 'playing' && this.audioContext) {
      if (this.isCoasting) {
        const coastElapsed = Math.min(
          this.coastDurationSec,
          Math.max(0, this.audioContext.currentTime - this.coastStartedAt),
        );
        const progress = this.coastDurationSec > 0 ? coastElapsed / this.coastDurationSec : 1;
        const avgRate = this.coastInitialRate * (1 - 0.5 * progress);
        const elapsed = coastElapsed * avgRate;
        this.logicalPosition = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      } else {
        const elapsed = (this.audioContext.currentTime - this.playStartedAt) * this.currentPlaybackRate;
        this.logicalPosition = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
      }
    }
  }

  private fadeOutCurrentSourceNode(): void {
    const source = this.currentSource;
    const sourceGainNode = this.currentSourceGainNode;
    const ramp = this.currentSourceGainRamp;
    this.currentSource = null;
    this.currentSourceGainNode = null;
    this.currentSourceGainRamp = null;
    if (!source) return;

    try {
      source.onended = null;
      if (!sourceGainNode || !this.audioContext) {
        this.stopSource(source);
        return;
      }

      const now = this.audioContext.currentTime;
      const parameter = sourceGainNode.gain;
      const currentValue = this.getRampValue(ramp, now, parameter.value);
      if (typeof parameter.cancelAndHoldAtTime === 'function') {
        parameter.cancelAndHoldAtTime(now);
      } else {
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(currentValue, now);
      }
      parameter.linearRampToValueAtTime(0, now + 0.015);
      // Keep the outgoing source connected until its short fade has completed.
      setTimeout(() => this.stopSource(source), 20);
    } catch {
      this.stopSource(source);
    }
  }

  private stopCurrentSourceNode(): void {
    const source = this.currentSource;
    this.currentSource = null;
    this.currentSourceGainNode = null;
    this.currentSourceGainRamp = null;
    if (source) this.stopSource(source);
  }

  /**
   * Disposes the engine and closes the AudioContext.
   */
  public dispose(): void {
    this.isDisposed = true;
    this.recordSoundState = 'stopped';
    this.stopRecordLoop('vinyl');
    this.stopRecordLoop('off-record');
    if (this.vinylLoopStopTimer !== null) clearTimeout(this.vinylLoopStopTimer);
    if (this.offRecordLoopStopTimer !== null) clearTimeout(this.offRecordLoopStopTimer);
    this.stopCoastTimer();
    this.loadCounter++;
    this.playCounter++;
    this.stop();
    this.listeners.clear();
    this.audioBuffer = null;
    this.audioBufferReversed = null;

    if (this.metadata?.artworkUrl) {
      try {
        URL.revokeObjectURL(this.metadata.artworkUrl);
      } catch {
        // ignore
      }
      this.metadata = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        void this.audioContext.close();
      } catch {
        // Ignore errors during close
      }
      this.audioContext = null;
    }
  }
}
