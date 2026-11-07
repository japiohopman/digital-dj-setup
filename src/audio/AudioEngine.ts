import { parseAudioMetadata, type AudioMetadata } from './metadata';
import type {
  AudioEngineListener,
  AudioEngineOptions,
  AudioEngineState,
  AudioPlaybackState,
} from './types';

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
  private isReversed = false;
  private isScratching = false;

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
  private isDisposed = false;

  private isCoasting = false;
  private coastTimer: ReturnType<typeof setTimeout> | null = null;
  private coastStartedAt = 0;
  private coastDurationSec = 0;
  private coastInitialRate = 1.0;

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
    }
    return this.audioContext;
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
    if (this.playbackState === 'playing' && this.audioContext && !this.isScratching) {
      if (this.isCoasting) {
        // Linear deceleration from coastInitialRate to 0 over coastDurationSec
        const coastElapsed = Math.min(
          this.coastDurationSec,
          Math.max(0, this.audioContext.currentTime - this.coastStartedAt),
        );
        // Average rate during linear ramp: coastInitialRate * (1 - 0.5 * (coastElapsed / coastDurationSec))
        const progress = this.coastDurationSec > 0 ? coastElapsed / this.coastDurationSec : 1;
        const avgRate = this.coastInitialRate * (1 - 0.5 * progress);
        const elapsed = coastElapsed * avgRate;
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
      if (this.playbackState === 'playing') {
        const current = this.getState().currentTime;
        if (current >= this.duration) {
          this.handlePlaybackEnded();
        } else {
          this.notify();
        }
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

  private startSourceAt(position: number, reversed: boolean): void {
    if (!this.audioBuffer || !this.audioBufferReversed || this.isDisposed) return;
    const ctx = this.getOrCreateContext();

    this.stopCurrentSourceNode();

    const source = ctx.createBufferSource();
    source.buffer = reversed ? this.audioBufferReversed : this.audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      if (this.currentSource === source && !this.isScratching) {
        this.handlePlaybackEnded();
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

    // Immediately stop any active scratch source (especially reversed source or variable scratch rate)
    this.stopCurrentSourceNode();

    if (resumePlayback && this.audioBuffer) {
      this.isReversed = false;
      // Restart forward playback directly from exact scratch position at base rate
      this.startSourceAt(this.logicalPosition, false);
      this.playbackState = 'playing';
      this.error = null;
      this.startTicker();
      this.notify();
    } else {
      this.pause();
    }
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
    if (this.isCoasting) {
      this.updateLogicalPositionBeforeStopping();
      this.stopCurrentSourceNode();
      this.stopTicker();
      this.isCoasting = false;
      this.playbackState = 'paused';
      this.notify();
    }
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

  private stopCoastTimer(): void {
    if (this.coastTimer !== null) {
      clearTimeout(this.coastTimer);
      this.coastTimer = null;
    }
    this.isCoasting = false;
  }

  /**
   * Pauses playback immediately and records the logical position.
   */
  public pause(): void {
    this.stopCoastTimer();
    this.playCounter++;
    if (this.playbackState !== 'playing' || !this.audioBuffer) {
      return;
    }

    this.updateLogicalPositionBeforeStopping();
    this.stopCurrentSourceNode();
    this.stopTicker();

    this.playbackState = 'paused';
    this.notify();
  }

  /**
   * Stops playback and resets logical position to 0.
   */
  public stop(): void {
    this.stopCoastTimer();
    this.playCounter++;
    this.stopCurrentSourceNode();
    this.stopTicker();
    this.logicalPosition = 0;
    if (this.audioBuffer) {
      this.playbackState = 'stopped';
    } else {
      this.playbackState = 'idle';
    }
    this.notify();
  }

  private handlePlaybackEnded(): void {
    this.stopTicker();
    this.stopCurrentSourceNode();
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

  private stopCurrentSourceNode(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Source may already have ended or been stopped
      }
      this.currentSource = null;
    }
  }

  /**
   * Disposes the engine and closes the AudioContext.
   */
  public dispose(): void {
    this.isDisposed = true;
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
