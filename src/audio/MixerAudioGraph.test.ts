import { describe, expect, it, vi } from 'vitest';

import { MixerAudioGraph } from './MixerAudioGraph';

class MockAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = { value: 1 };
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 2048;
}

class MockAudioContext {
  state: AudioContextState = 'suspended';
  destination = new MockAudioNode();
  createdGains: MockGainNode[] = [];
  createdAnalysers: MockAnalyserNode[] = [];
  close = vi.fn(async () => {
    this.state = 'closed';
  });

  createGain = vi.fn(() => {
    const node = new MockGainNode();
    this.createdGains.push(node);
    return node as unknown as GainNode;
  });

  createAnalyser = vi.fn(() => {
    const node = new MockAnalyserNode();
    this.createdAnalysers.push(node);
    return node as unknown as AnalyserNode;
  });
}

describe('MixerAudioGraph', () => {
  it('creates no AudioContext until a deck requests one', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    const deckA = graph.createDeckAudioOptions('a');
    const deckB = graph.createDeckAudioOptions('b');

    expect(factory).not.toHaveBeenCalled();
    expect(deckA.closeAudioContextOnDispose).toBe(false);
    expect(deckB.closeAudioContextOnDispose).toBe(false);

    graph.dispose();
    expect(factory).not.toHaveBeenCalled();
  });

  it('gives both decks one shared context and separate channel input paths', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });
    const deckA = graph.createDeckAudioOptions('a');
    const deckB = graph.createDeckAudioOptions('b');

    const contextA = deckA.audioContextProvider?.();
    const contextB = deckB.audioContextProvider?.();
    expect(contextA).toBe(contextB);
    expect(factory).toHaveBeenCalledOnce();

    const inputA = deckA.outputNodeProvider?.(contextA!);
    const inputB = deckB.outputNodeProvider?.(contextB!);
    expect(inputA).not.toBe(inputB);

    const masterGain = context.createdGains[0];
    const channelInputA = inputA as unknown as MockGainNode;
    const channelInputB = inputB as unknown as MockGainNode;
    expect(channelInputA).toBe(context.createdGains[1]);
    expect(channelInputB).toBe(context.createdGains[4]);

    const masterAnalyser = context.createdAnalysers[0];
    const deckAnalyserA = graph.getDeckAnalyser('a');
    const deckAnalyserB = graph.getDeckAnalyser('b');

    expect(masterGain?.connect).toHaveBeenCalledWith(masterAnalyser);
    expect(masterAnalyser?.connect).toHaveBeenCalledWith(context.destination);

    expect(channelInputA.connect).toHaveBeenCalledWith(context.createdGains[2]);
    expect(context.createdGains[2]?.connect).toHaveBeenCalledWith(context.createdGains[3]);
    expect(context.createdGains[3]?.connect).toHaveBeenCalledWith(deckAnalyserA);
    expect(deckAnalyserA.connect).toHaveBeenCalledWith(masterGain);

    expect(channelInputB.connect).toHaveBeenCalledWith(context.createdGains[5]);
    expect(context.createdGains[5]?.connect).toHaveBeenCalledWith(context.createdGains[6]);
    expect(context.createdGains[6]?.connect).toHaveBeenCalledWith(deckAnalyserB);
    expect(deckAnalyserB.connect).toHaveBeenCalledWith(masterGain);

    expect(graph.getMasterAnalyser()).toBe(masterAnalyser);
    graph.dispose();
  });

  it('closes and recreates the shared context only when the app-owned graph is disposed', () => {
    const contexts = [new MockAudioContext(), new MockAudioContext()];
    let contextIndex = 0;
    const factory = vi.fn(() => contexts[contextIndex++] as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });
    const options = graph.createDeckAudioOptions('a');

    const first = options.audioContextProvider?.();
    graph.dispose();
    expect(contexts[0]?.close).toHaveBeenCalledOnce();

    const second = options.audioContextProvider?.();
    expect(second).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
    graph.dispose();
    expect(contexts[1]?.close).toHaveBeenCalledOnce();
  });
});
