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
  private duration = 0;
  private logicalPosition = 0;
  private playStartedAt = 0;
  private playbackState: AudioPlaybackState = 'idle';
  private error: string | null = null;

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
   */
  private getOrCreateContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = this.contextFactory();
    }
    return this.audioContext;
  }

  /**
   * Ensures the AudioContext is running after user interaction.
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
   */
  public getState(): AudioEngineState {
    let currentTime = this.logicalPosition;
    if (this.playbackState === 'playing' && this.audioContext) {
      const elapsed = this.audioContext.currentTime - this.playStartedAt;
      currentTime = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
    }

    return {
      trackName: this.trackName,
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
   */
  public async loadTrack(file: File | ArrayBuffer, name?: string): Promise<void> {
    this.stop();
    this.playbackState = 'loading';
    this.error = null;
    this.trackName = name ?? (file instanceof File ? file.name : 'Unknown Track');
    this.logicalPosition = 0;
    this.duration = 0;
    this.notify();

    try {
      const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
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

      this.audioBuffer = decoded;
      this.audioBufferReversed = this.createReversedAudioBuffer(decoded, ctx);
      this.duration = decoded.duration;
      this.logicalPosition = 0;
      this.playbackState = 'stopped';
      this.error = null;
      this.notify();
    } catch (err) {
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
   */
  public async play(offsetPosition?: number): Promise<void> {
    if (!this.audioBuffer) {
      return;
    }

    if (this.playbackState === 'playing' && !this.isScratching) {
      return;
    }

    try {
      await this.ensureContextRunning();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.notify();
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
    if (!this.audioBuffer || !this.audioBufferReversed) return;
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

    source.start(0, startOffset);
    this.currentSource = source;
  }

  /**
   * Realtime scratching handler matching vinyl motion.
   * Modulates playback speed and switches between forward and reverse buffers.
   */
  public scratch(speed: number, reversed: boolean, position: number): void {
    if (!this.audioBuffer) return;

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
      const targetRate = Math.max(0.001, Math.min(4.0, absSpeed));
      const now = ctx.currentTime;
      this.currentSource.playbackRate.cancelScheduledValues(now);
      this.currentSource.playbackRate.linearRampToValueAtTime(targetRate, now + 0.02);
    }
  }

  /**
   * Concludes scratching, resetting playback rate and resuming standard playback if desired.
   */
  public endScratch(resumePlayback: boolean): void {
    this.isScratching = false;
    if (resumePlayback && this.audioBuffer) {
      void this.play(this.logicalPosition);
    } else {
      this.pause();
    }
  }

  /**
   * Seeks to a specific logical track position.
   */
  public seek(position: number): void {
    this.logicalPosition = Math.max(0, Math.min(this.duration, position));
    if (this.playbackState === 'playing') {
      void this.play(this.logicalPosition);
    } else {
      this.notify();
    }
  }

  /**
   * Pauses playback and records the logical position.
   */
  public pause(): void {
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
      const elapsed = this.audioContext.currentTime - this.playStartedAt;
      this.logicalPosition = Math.min(this.duration, Math.max(0, this.logicalPosition + elapsed));
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
    this.stop();
    this.listeners.clear();
    this.audioBuffer = null;
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
