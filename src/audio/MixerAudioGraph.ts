import type { AudioEngineOptions } from './types';

export type MixerDeckId = 'a' | 'b';

export interface MixerAudioGraphOptions {
  /** Optional factory for deterministic tests; production uses the browser AudioContext. */
  audioContextFactory?: (() => AudioContext) | undefined;
}

export interface MixerMeterLevels {
  /** RMS programme level for Deck A, normalized from 0 to 1. */
  a: number;
  /** RMS programme level for Deck B, normalized from 0 to 1. */
  b: number;
  /** RMS level after the shared master output gain, normalized from 0 to 1. */
  master: number;
}

interface DeckChannelPath {
  input: GainNode;
  channelGain: GainNode;
  crossfaderGain: GainNode;
  analyser: AnalyserNode;
  meterData: Float32Array;
}

/**
 * App-owned shared Web Audio graph for the two independent deck engines.
 *
 * Deck engines own their own buffers, sources and transport state. This graph
 * owns the shared AudioContext, channel routing, analysers and master output.
 */
export class MixerAudioGraph {
  private readonly contextFactory: () => AudioContext;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterMeterData = new Float32Array(2048);
  private readonly deckPaths = new Map<MixerDeckId, DeckChannelPath>();
  private readonly channelLevels: Record<MixerDeckId, number> = { a: 1, b: 1 };
  private crossfaderPosition = 0.5;

  constructor(options: MixerAudioGraphOptions = {}) {
    this.contextFactory = options.audioContextFactory ?? (() => {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this environment');
      }
      return new AudioContextClass();
    });
  }

  /** Lazily creates the one shared context and app-level master route. */
  public getAudioContext = (): AudioContext => {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const context = this.contextFactory();
      const masterGain = context.createGain();
      const masterAnalyser = context.createAnalyser();
      masterAnalyser.fftSize = 2048;

      masterGain.connect(masterAnalyser);
      masterAnalyser.connect(context.destination);

      this.audioContext = context;
      this.masterGain = masterGain;
      this.masterAnalyser = masterAnalyser;
      this.masterMeterData = new Float32Array(masterAnalyser.fftSize);
      this.deckPaths.clear();
    }

    return this.audioContext;
  };

  /**
   * Creates an AudioEngine configuration for one deck.
   *
   * Both configurations resolve the same shared AudioContext but provide
   * distinct channel input nodes. Disposing either engine cannot close it.
   */
  public createDeckAudioOptions(deckId: MixerDeckId): AudioEngineOptions {
    return {
      audioContextProvider: this.getAudioContext,
      outputNodeProvider: (context) => this.getDeckInputNode(deckId, context),
      closeAudioContextOnDispose: false,
    };
  }

  /** Returns the input node all audible layers of this deck must use. */
  public getDeckInputNode(deckId: MixerDeckId, context = this.getAudioContext()): GainNode {
    return this.getDeckPath(deckId, context).input;
  }

  /** Returns the post-channel/post-crossfader analyser for a deck. */
  public getDeckAnalyser(deckId: MixerDeckId): AnalyserNode {
    return this.getDeckPath(deckId, this.getAudioContext()).analyser;
  }

  /** Returns the analyser measuring the final master signal. */
  public getMasterAnalyser(): AnalyserNode {
    this.getAudioContext();
    if (!this.masterAnalyser) {
      throw new Error('Mixer master analyser was not initialized');
    }
    return this.masterAnalyser;
  }

  /** Sets a deck's channel fader from 0 (silent) to 1 (unity). */
  public setChannelLevel(deckId: MixerDeckId, level: number): void {
    const nextLevel = this.clampUnit(level);
    this.channelLevels[deckId] = nextLevel;
    const path = this.deckPaths.get(deckId);
    if (path) this.applyGain(path.channelGain, nextLevel);
  }

  /** Returns the last selected channel fader value without creating audio nodes. */
  public getChannelLevel(deckId: MixerDeckId): number {
    return this.channelLevels[deckId];
  }

  /**
   * Sets the crossfader position from 0 (Deck A) to 1 (Deck B).
   * Uses an equal-power sine/cosine curve, reaching -3 dB per deck at centre.
   */
  public setCrossfaderPosition(position: number): void {
    this.crossfaderPosition = this.clampUnit(position);
    const [gainA, gainB] = this.getCrossfaderGains(this.crossfaderPosition);
    const pathA = this.deckPaths.get('a');
    const pathB = this.deckPaths.get('b');
    if (pathA) this.applyGain(pathA.crossfaderGain, gainA);
    if (pathB) this.applyGain(pathB.crossfaderGain, gainB);
  }

  /** Returns the last selected crossfader position without creating audio nodes. */
  public getCrossfaderPosition(): number {
    return this.crossfaderPosition;
  }

  /**
   * Reads real RMS levels from the post-fader deck analysers and master analyser.
   * Does not create or resume an AudioContext; before audio is initialized it returns silence.
   */
  public getMeterLevels(): MixerMeterLevels {
    if (!this.audioContext || this.audioContext.state === 'closed' || !this.masterAnalyser) {
      return { a: 0, b: 0, master: 0 };
    }

    const pathA = this.deckPaths.get('a');
    const pathB = this.deckPaths.get('b');
    return {
      a: pathA ? this.readRms(pathA.analyser, pathA.meterData) : 0,
      b: pathB ? this.readRms(pathB.analyser, pathB.meterData) : 0,
      master: this.readRms(this.masterAnalyser, this.masterMeterData),
    };
  }

  /** Closes the shared context. Called only by the app-level owner. */
  public dispose(): void {
    const context = this.audioContext;
    this.audioContext = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.masterMeterData = new Float32Array(2048);
    this.deckPaths.clear();

    if (context && context.state !== 'closed') {
      try {
        void context.close();
      } catch {
        // Ignore browser errors during application teardown.
      }
    }
  }

  /** Returns the equal-power gain pair for a normalized A-to-B crossfader position. */
  private getCrossfaderGains(position: number): [number, number] {
    return [
      Math.cos(position * Math.PI * 0.5),
      Math.sin(position * Math.PI * 0.5),
    ];
  }

  /** Schedules a short gain ramp to avoid clicks while a physical-style fader moves. */
  private applyGain(node: GainNode, value: number): void {
    const parameter = node.gain;
    const now = this.audioContext?.currentTime ?? 0;
    if (
      typeof parameter.cancelScheduledValues === 'function' &&
      typeof parameter.setValueAtTime === 'function' &&
      typeof parameter.linearRampToValueAtTime === 'function'
    ) {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(parameter.value, now);
      parameter.linearRampToValueAtTime(value, now + 0.018);
    } else {
      // Lightweight fallback for deterministic AudioParam mocks.
      parameter.value = value;
    }
  }

  /** Converts analyser time-domain samples into a normalized RMS level. */
  private readRms(analyser: AnalyserNode, samples: Float32Array): number {
    try {
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index] ?? 0;
        sumSquares += sample * sample;
      }
      return this.clampUnit(Math.sqrt(sumSquares / samples.length));
    } catch {
      return 0;
    }
  }

  /** Returns the cached signal path for a deck, creating it when first requested. */
  private getDeckPath(deckId: MixerDeckId, context: AudioContext): DeckChannelPath {
    const activeContext = this.getAudioContext();
    if (context !== activeContext) {
      throw new Error('Deck channel requested with a context not owned by this mixer graph');
    }

    const existing = this.deckPaths.get(deckId);
    if (existing) return existing;
    if (!this.masterGain) {
      throw new Error('Mixer master output was not initialized');
    }

    const input = context.createGain();
    const channelGain = context.createGain();
    const crossfaderGain = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;

    const [crossfaderGainA, crossfaderGainB] = this.getCrossfaderGains(this.crossfaderPosition);
    channelGain.gain.value = this.channelLevels[deckId];
    crossfaderGain.gain.value = deckId === 'a' ? crossfaderGainA : crossfaderGainB;

    input.connect(channelGain);
    channelGain.connect(crossfaderGain);
    crossfaderGain.connect(analyser);
    analyser.connect(this.masterGain);

    const path = {
      input,
      channelGain,
      crossfaderGain,
      analyser,
      meterData: new Float32Array(analyser.fftSize),
    };
    this.deckPaths.set(deckId, path);
    return path;
  }

  /** Clamps gain and fader inputs into the inclusive 0-to-1 range. */
  private clampUnit(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}
