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
  private currentSource: AudioBufferSourceNode | null = null;

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
   * Starts or resumes audio playback from the current logical track position.
   */
  public async play(): Promise<void> {
    if (!this.audioBuffer) {
      return;
    }

    if (this.playbackState === 'playing') {
      return;
    }

    try {
      await this.ensureContextRunning();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.notify();
      return;
    }

    const ctx = this.getOrCreateContext();

    // Reset position to beginning if at the end of track
    if (this.logicalPosition >= this.duration) {
      this.logicalPosition = 0;
    }

    this.stopCurrentSourceNode();

    const source = ctx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      // Only handle if this source node is still the active one
      if (this.currentSource === source) {
        this.handlePlaybackEnded();
      }
    };

    const offset = Math.max(0, Math.min(this.duration, this.logicalPosition));
    this.playStartedAt = ctx.currentTime;
    source.start(0, offset);
    this.currentSource = source;
    this.playbackState = 'playing';
    this.error = null;

    this.startTicker();
    this.notify();
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
