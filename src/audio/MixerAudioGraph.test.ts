import { describe, expect, it, vi } from 'vitest';

import { MixerAudioGraph } from './MixerAudioGraph';

class MockAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = { value: 1 };
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = { value: 350 };
  Q = { value: 1 };
  gain = { value: 0 };
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 2048;
  sampleValue = 0;
  getFloatTimeDomainData = vi.fn((samples: Float32Array) => samples.fill(this.sampleValue));
}

class MockAudioContext {
  state: AudioContextState = 'suspended';
  destination = new MockAudioNode();
  createdGains: MockGainNode[] = [];
  createdFilters: MockBiquadFilterNode[] = [];
  createdAnalysers: MockAnalyserNode[] = [];
  close = vi.fn(async () => {
    this.state = 'closed';
  });

  createGain = vi.fn(() => {
    const node = new MockGainNode();
    this.createdGains.push(node);
    return node as unknown as GainNode;
  });

  createBiquadFilter = vi.fn(() => {
    const node = new MockBiquadFilterNode();
    this.createdFilters.push(node);
    return node as unknown as BiquadFilterNode;
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

    const [lowEqA, midEqA, highEqA, lowEqB, midEqB, highEqB] = context.createdFilters;

    expect(channelInputA.connect).toHaveBeenCalledWith(context.createdGains[2]);
    expect(context.createdGains[2]?.connect).toHaveBeenCalledWith(lowEqA);
    expect(lowEqA?.connect).toHaveBeenCalledWith(midEqA);
    expect(midEqA?.connect).toHaveBeenCalledWith(highEqA);
    expect(highEqA?.connect).toHaveBeenCalledWith(context.createdGains[3]);
    expect(context.createdGains[3]?.connect).toHaveBeenCalledWith(deckAnalyserA);
    expect(deckAnalyserA.connect).toHaveBeenCalledWith(masterGain);

    expect(channelInputB.connect).toHaveBeenCalledWith(context.createdGains[5]);
    expect(context.createdGains[5]?.connect).toHaveBeenCalledWith(lowEqB);
    expect(lowEqB?.connect).toHaveBeenCalledWith(midEqB);
    expect(midEqB?.connect).toHaveBeenCalledWith(highEqB);
    expect(highEqB?.connect).toHaveBeenCalledWith(context.createdGains[6]);
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
  it('applies stored channel levels and an equal-power crossfader without creating audio early', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    graph.setChannelLevel('a', 0.4);
    graph.setChannelLevel('b', 0.8);
    graph.setCrossfaderPosition(0.5);
    expect(factory).not.toHaveBeenCalled();
    expect(graph.getChannelLevel('a')).toBe(0.4);
    expect(graph.getCrossfaderPosition()).toBe(0.5);

    const deckA = graph.createDeckAudioOptions('a');
    const deckB = graph.createDeckAudioOptions('b');
    const contextA = deckA.audioContextProvider?.();
    const contextB = deckB.audioContextProvider?.();
    deckA.outputNodeProvider?.(contextA!);
    deckB.outputNodeProvider?.(contextB!);

    const channelGainA = context.createdGains[2];
    const crossfaderGainA = context.createdGains[3];
    const channelGainB = context.createdGains[5];
    const crossfaderGainB = context.createdGains[6];
    expect(channelGainA?.gain.value).toBe(0.4);
    expect(channelGainB?.gain.value).toBe(0.8);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(Math.SQRT1_2);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(Math.SQRT1_2);

    graph.setChannelLevel('a', 0.25);
    graph.setCrossfaderPosition(0);
    expect(channelGainA?.gain.value).toBe(0.25);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(1);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(0);

    graph.setCrossfaderPosition(1);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(0);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(1);
    graph.dispose();
  });

  it('stores independent three-band EQ settings before audio starts and applies the correct filter topology', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    graph.setDeckEq('a', 'low', -8);
    graph.setDeckEq('a', 'mid', 4);
    graph.setDeckEq('a', 'high', 9);
    graph.setDeckEq('b', 'low', 2);
    graph.setDeckEq('b', 'mid', -3);
    graph.setDeckEq('b', 'high', 6);

    expect(factory).not.toHaveBeenCalled();
    expect(graph.getDeckEq('a')).toEqual({ low: -8, mid: 4, high: 9 });
    expect(graph.getDeckEq('b')).toEqual({ low: 2, mid: -3, high: 6 });

    const optionsA = graph.createDeckAudioOptions('a');
    const optionsB = graph.createDeckAudioOptions('b');
    const contextA = optionsA.audioContextProvider?.();
    const contextB = optionsB.audioContextProvider?.();
    optionsA.outputNodeProvider?.(contextA!);
    optionsB.outputNodeProvider?.(contextB!);

    const [lowEqA, midEqA, highEqA, lowEqB, midEqB, highEqB] = context.createdFilters;
    expect(lowEqA?.type).toBe('lowshelf');
    expect(lowEqA?.frequency.value).toBe(250);
    expect(midEqA?.type).toBe('peaking');
    expect(midEqA?.frequency.value).toBe(1000);
    expect(midEqA?.Q.value).toBe(0.8);
    expect(highEqA?.type).toBe('highshelf');
    expect(highEqA?.frequency.value).toBe(10000);
    expect(lowEqA?.gain.value).toBe(-8);
    expect(midEqA?.gain.value).toBe(4);
    expect(highEqA?.gain.value).toBe(9);
    expect(lowEqB?.gain.value).toBe(2);
    expect(midEqB?.gain.value).toBe(-3);
    expect(highEqB?.gain.value).toBe(6);

    graph.setDeckEq('a', 'mid', 20);
    expect(lowEqA?.gain.value).toBe(-8);
    expect(midEqA?.gain.value).toBe(12);
    expect(highEqA?.gain.value).toBe(9);
    expect(midEqB?.gain.value).toBe(-3);
    graph.dispose();
  });

  it('applies the master output level only after both deck channel paths and retains it before audio starts', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    graph.setMasterLevel(0.65);
    expect(factory).not.toHaveBeenCalled();
    expect(graph.getMasterLevel()).toBe(0.65);

    const optionsA = graph.createDeckAudioOptions('a');
    const optionsB = graph.createDeckAudioOptions('b');
    const contextA = optionsA.audioContextProvider?.();
    const contextB = optionsB.audioContextProvider?.();
    optionsA.outputNodeProvider?.(contextA!);
    optionsB.outputNodeProvider?.(contextB!);

    const masterGain = context.createdGains[0];
    expect(masterGain?.gain.value).toBe(0.65);
    expect(masterGain?.connect).toHaveBeenCalledWith(context.createdAnalysers[0]);
    expect(context.createdAnalysers[0]?.connect).toHaveBeenCalledWith(context.destination);

    graph.setMasterLevel(0.3);
    expect(graph.getMasterLevel()).toBe(0.3);
    expect(masterGain?.gain.value).toBe(0.3);
    expect(context.createdGains[2]?.gain.value).toBe(1);
    expect(context.createdGains[3]?.gain.value).toBeCloseTo(Math.SQRT1_2);
    expect(context.createdGains[5]?.gain.value).toBe(1);
    expect(context.createdGains[6]?.gain.value).toBeCloseTo(Math.SQRT1_2);
    graph.dispose();
  });

  it('applies a symmetric cut-lag zone at both crossfader ends', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    graph.setCrossfaderCutLag(1);
    expect(factory).not.toHaveBeenCalled();
    expect(graph.getCrossfaderCutLag()).toBe(1);

    const deckA = graph.createDeckAudioOptions('a');
    const deckB = graph.createDeckAudioOptions('b');
    const contextA = deckA.audioContextProvider?.();
    const contextB = deckB.audioContextProvider?.();
    deckA.outputNodeProvider?.(contextA!);
    deckB.outputNodeProvider?.(contextB!);

    const crossfaderGainA = context.createdGains[3];
    const crossfaderGainB = context.createdGains[6];

    graph.setCrossfaderPosition(0.1);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(1);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(0);

    graph.setCrossfaderPosition(0.5);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(Math.SQRT1_2);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(Math.SQRT1_2);

    graph.setCrossfaderPosition(0.9);
    expect(crossfaderGainA?.gain.value).toBeCloseTo(0);
    expect(crossfaderGainB?.gain.value).toBeCloseTo(1);
    graph.dispose();
  });

  it('reads real RMS values from both channel meters and the master meter without forcing audio startup', () => {
    const context = new MockAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const graph = new MixerAudioGraph({ audioContextFactory: factory });

    expect(graph.getMeterLevels()).toEqual({ a: 0, b: 0, master: 0 });
    expect(factory).not.toHaveBeenCalled();

    const deckA = graph.createDeckAudioOptions('a');
    const deckB = graph.createDeckAudioOptions('b');
    const contextA = deckA.audioContextProvider?.();
    const contextB = deckB.audioContextProvider?.();
    deckA.outputNodeProvider?.(contextA!);
    deckB.outputNodeProvider?.(contextB!);

    context.createdAnalysers[0]!.sampleValue = 0.75;
    context.createdAnalysers[1]!.sampleValue = 0.25;
    context.createdAnalysers[2]!.sampleValue = 0.5;

    const levels = graph.getMeterLevels();
    expect(levels.a).toBeCloseTo(0.25);
    expect(levels.b).toBeCloseTo(0.5);
    expect(levels.master).toBeCloseTo(0.75);
    graph.dispose();
  });

});
