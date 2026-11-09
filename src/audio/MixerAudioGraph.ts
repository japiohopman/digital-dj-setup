import type { AudioEngineOptions } from './types';

export type MixerDeckId = 'a' | 'b';

export interface MixerAudioGraphOptions {
  /** Optional factory for deterministic tests; production uses the browser AudioContext. */
  audioContextFactory?: (() => AudioContext) | undefined;
}

interface DeckChannelPath {
  input: GainNode;
  channelGain: GainNode;
  crossfaderGain: GainNode;
  analyser: AnalyserNode;
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
  private readonly deckPaths = new Map<MixerDeckId, DeckChannelPath>();

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

  /** Closes the shared context. Called only by the app-level owner. */
  public dispose(): void {
    const context = this.audioContext;
    this.audioContext = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.deckPaths.clear();

    if (context && context.state !== 'closed') {
      try {
        void context.close();
      } catch {
        // Ignore browser errors during application teardown.
      }
    }
  }

  /**
   * Returns the cached signal path for a deck, creating it when first requested.
   *
   * @param deckId - Deck whose channel path is requested.
   * @param context - Active shared AudioContext owned by this graph.
   * @returns The deck input, channel gain, crossfader gain and analyser nodes.
   * @throws Error when the context is not owned by this graph or the master route is unavailable.
   */
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

    // Phase 0 keeps both controls at unity while establishing the route.
    // Phase 1 adds the actual deck fader and crossfader control actions.
    channelGain.gain.value = 1;
    crossfaderGain.gain.value = 1;

    input.connect(channelGain);
    channelGain.connect(crossfaderGain);
    crossfaderGain.connect(analyser);
    analyser.connect(this.masterGain);

    const path = { input, channelGain, crossfaderGain, analyser };
    this.deckPaths.set(deckId, path);
    return path;
  }
}
