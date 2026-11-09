import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { MixerAudioGraph } from './MixerAudioGraph';

class MockAudioParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  linearRampToValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  startedAtOffset: number | null = null;
  isStarted = false;
  isStopped = false;
  playbackRate = new MockAudioParam();

  connect = vi.fn();
  disconnect = vi.fn();

  start = vi.fn((_when?: number, offset?: number) => {
    this.isStarted = true;
    this.startedAtOffset = offset ?? 0;
  });

  stop = vi.fn(() => {
    this.isStopped = true;
  });
}

class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  createdSources: MockAudioBufferSourceNode[] = [];
  createdGainParams: MockAudioParam[] = [];
  createdGainNodes: Array<{ gain: MockAudioParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

  resume = vi.fn(async () => {
    this.state = 'running';
  });

  close = vi.fn(async () => {
    this.state = 'closed';
  });

  decodeAudioData = vi.fn(async (buffer: ArrayBuffer) => {
    if (buffer.byteLength === 0) {
      throw new Error('Unsupported audio format');
    }
    const sampleLength = 1000;
    const ch0 = new Float32Array(sampleLength);
    const ch1 = new Float32Array(sampleLength);
    return {
      duration: 120, // 2 minutes mock track duration
      length: sampleLength,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => (ch === 0 ? ch0 : ch1)),
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  });

  createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
    const channelArrays: Float32Array[] = [];
    for (let i = 0; i < channels; i++) {
      channelArrays.push(new Float32Array(length));
    }
    return {
      duration: length / sampleRate,
      length,
      numberOfChannels: channels,
      sampleRate,
      getChannelData: vi.fn((ch: number) => channelArrays[ch] ?? new Float32Array(length)),
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  });

  createBufferSource = vi.fn(() => {
    const source = new MockAudioBufferSourceNode();
    this.createdSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });

  createGain = vi.fn(() => {
    const gain = new MockAudioParam();
    this.createdGainParams.push(gain);
    const node = {
      gain,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.createdGainNodes.push(node);
    return node as unknown as GainNode;
  });

  createAnalyser = vi.fn(() => ({
    fftSize: 2048,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }) as unknown as AnalyserNode);
}

describe('AudioEngine', () => {
  let mockContext: MockAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    mockContext = new MockAudioContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const createEngine = (customContext?: MockAudioContext) => {
    const ctx = customContext ?? mockContext;
    return new AudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
  };

  it('cancels a pending needle placement cue when stylus contact is lifted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    engine.setStylusContact(true);
    engine.playNeedleDropSound('correct');
    engine.setStylusContact(false);

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4);
    });
    const assetsPromise = (engine as unknown as {
      recordSoundAssetsPromise: Promise<void> | null;
    }).recordSoundAssetsPromise;
    await assetsPromise;
    await Promise.resolve();

    expect(mockContext.createdSources).toHaveLength(0);
    engine.dispose();
  });

  it('stops an already-playing needle one-shot when stylus contact is lifted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    engine.setStylusContact(true);
    const cuePromise = engine.playNeedleDropSound('correct');
    await vi.waitFor(() => expect(mockContext.createdSources).toHaveLength(1));

    const cueSource = mockContext.createdSources[0];
    const cueGain = mockContext.createdGainParams.at(-1);
    expect(cueSource).toBeDefined();

    engine.setStylusContact(false);

    expect(cueSource?.stop).toHaveBeenCalled();
    expect(cueGain?.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    // The mock stop() does not dispatch onended automatically.
    cueSource?.onended?.();
    await cuePromise;

    expect(cueSource?.disconnect).toHaveBeenCalled();
    engine.dispose();
  });

  it('resolves on-record activation only after the vinyl loop source has started', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    await engine.setRecordSoundState('on-record');

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(mockContext.createdSources).toHaveLength(1);
    expect(mockContext.createdSources[0]?.start).toHaveBeenCalledOnce();
    expect(mockContext.createdSources[0]?.loop).toBe(true);

    engine.dispose();
  });

  it('retries only missing record sound assets after a failed fetch', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('needle_start_record.wav') && fetchMock.mock.calls.filter(([call]) =>
        String(call).endsWith('needle_start_record.wav'),
      ).length === 1) {
        return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    });
    vi.stubGlobal('fetch', fetchMock);
    const engine = createEngine();

    engine.setRecordSoundState('off-record');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const firstAssetsPromise = (engine as unknown as {
      recordSoundAssetsPromise: Promise<void> | null;
    }).recordSoundAssetsPromise;
    await firstAssetsPromise;

    engine.playNeedleDropSound('correct');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const retryPromise = (engine as unknown as {
      recordSoundAssetsPromise: Promise<void> | null;
    }).recordSoundAssetsPromise;
    await retryPromise;
    await Promise.resolve();

    expect(fetchMock.mock.calls.filter(([call]) =>
      String(call).endsWith('needle_start_record.wav'),
    )).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([call]) =>
      String(call).endsWith('vinyl_loop.wav'),
    )).toHaveLength(1);
    expect(mockContext.createdSources).toHaveLength(2);
    engine.dispose();
  });

  it('resolves a needle placement cue only after its one-shot source ends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    let resolved = false;
    const cuePromise = engine.playNeedleDropSound('correct').then(() => {
      resolved = true;
    });

    await vi.waitFor(() => expect(mockContext.createdSources).toHaveLength(1));
    const cueSource = mockContext.createdSources[0];
    expect(cueSource).toBeDefined();
    await Promise.resolve();
    expect(resolved).toBe(false);

    cueSource?.onended?.();
    await cuePromise;
    expect(resolved).toBe(true);
    expect(cueSource?.disconnect).toHaveBeenCalled();

    engine.dispose();
  });

  it('loops needle_start_record.wav for run-out and stops it on state change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    engine.setRecordSoundState('runout');
    await vi.waitFor(() => expect(mockContext.createdSources).toHaveLength(1));
    await Promise.resolve();

    const runoutSource = mockContext.createdSources[0];
    expect(runoutSource).toBeDefined();
    expect((runoutSource as unknown as { loop?: boolean }).loop).toBe(true);
    const correctDropBuffer = (engine as unknown as { correctDropBuffer: AudioBuffer | null }).correctDropBuffer;
    expect(runoutSource?.buffer).toBe(correctDropBuffer);
    expect(mockContext.createdSources).toHaveLength(1);

    engine.setRecordSoundState('stopped');
    await vi.advanceTimersByTimeAsync(110);
    expect(runoutSource?.stop).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('uses not_on_record_loop.wav for an intentional off-record landing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const engine = createEngine();

    engine.setRecordSoundState('off-record');
    await vi.waitFor(() => expect(mockContext.createdSources).toHaveLength(1));
    await Promise.resolve();

    const labelSource = mockContext.createdSources[0];
    const offRecordBuffer = (engine as unknown as { offRecordLoopBuffer: AudioBuffer | null }).offRecordLoopBuffer;
    expect(labelSource?.buffer).toBe(offRecordBuffer);
    expect(labelSource?.loop).toBe(true);

    engine.dispose();
  });

  it('initializes with default idle state', () => {
    const engine = createEngine();
    const state = engine.getState();

    expect(state.trackName).toBeNull();
    expect(state.duration).toBe(0);
    expect(state.currentTime).toBe(0);
    expect(state.playbackState).toBe('idle');
    expect(state.error).toBeNull();
  });

  it('notifies subscribers upon subscribing and on state changes', () => {
    const engine = createEngine();
    const listener = vi.fn();

    const unsubscribe = engine.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ playbackState: 'idle' }),
    );

    unsubscribe();
  });

  it('loads and decodes an audio file successfully', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;

    await engine.loadTrack(buffer, 'test-battle-break.mp3');

    const state = engine.getState();
    expect(state.trackName).toBe('test-battle-break.mp3');
    expect(state.duration).toBe(120);
    expect(state.currentTime).toBe(0);
    expect(state.playbackState).toBe('stopped');
    expect(state.error).toBeNull();
  });

  it('handles decode errors gracefully and reflects error in state', async () => {
    const engine = createEngine();
    const emptyBuffer = new Uint8Array([]).buffer;

    await expect(engine.loadTrack(emptyBuffer, 'corrupted.wav')).rejects.toThrow();

    const state = engine.getState();
    expect(state.playbackState).toBe('idle');
    expect(state.error).toContain('Failed to decode audio');
  });

  it('resumes suspended AudioContext on play', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await engine.loadTrack(buffer, 'track.mp3');

    expect(mockContext.state).toBe('suspended');
    await engine.play();

    expect(mockContext.resume).toHaveBeenCalled();
    expect(engine.getState().playbackState).toBe('playing');
  });

  it('creates a fresh AudioBufferSourceNode each time playback starts', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await engine.loadTrack(buffer, 'track.mp3');

    await engine.play();
    expect(mockContext.createdSources).toHaveLength(1);

    const firstSource = mockContext.createdSources[0];
    expect(firstSource).toBeDefined();

    engine.pause();
    await vi.advanceTimersByTimeAsync(260);
    expect(firstSource?.stop).toHaveBeenCalled();

    await engine.play();
    // A second single-use source node was created
    expect(mockContext.createdSources).toHaveLength(2);
  });

  it('holds the interpolated stylus gain when contact reverses during the fallback ramp', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'stylus-ramp-fallback.mp3');
    await engine.play();

    const stylusGain = mockContext.createdGainParams[1];
    expect(stylusGain).toBeDefined();

    engine.setStylusContact(true);
    expect(stylusGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);

    mockContext.currentTime = 0.0075;
    engine.setStylusContact(false);
    expect(stylusGain?.setValueAtTime).toHaveBeenLastCalledWith(0.5, 0.0075);
    expect(stylusGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.0225);

    mockContext.currentTime = 0.01125;
    engine.setStylusContact(true);
    expect(stylusGain?.setValueAtTime).toHaveBeenLastCalledWith(0.375, 0.01125);
    expect(stylusGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.02625);

    engine.dispose();
  });

  it('crossfades the outgoing source when seeking during playback', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'seek-crossfade.mp3');
    await engine.play();

    const outgoingSource = mockContext.createdSources[0];
    const outgoingGain = mockContext.createdGainParams[2];
    expect(outgoingSource).toBeDefined();
    expect(outgoingGain).toBeDefined();

    mockContext.currentTime = 4;
    engine.seek(18);

    const incomingSource = mockContext.createdSources[1];
    const incomingGain = mockContext.createdGainParams[3];
    expect(incomingSource).toBeDefined();
    expect(incomingGain).toBeDefined();
    expect(outgoingSource?.stop).not.toHaveBeenCalled();
    expect(outgoingGain?.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.015);
    expect(incomingSource?.start).toHaveBeenCalledWith(0, 18);
    expect(incomingGain?.setValueAtTime).toHaveBeenCalledWith(0, 4);
    expect(incomingGain?.linearRampToValueAtTime).toHaveBeenCalledWith(1, 4.015);

    await vi.advanceTimersByTimeAsync(19);
    expect(outgoingSource?.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(outgoingSource?.stop).toHaveBeenCalledTimes(1);
    expect(outgoingSource?.disconnect).toHaveBeenCalledTimes(1);

    engine.dispose();
  });

  it('tracks elapsed time while playing and maintains position on pause', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await engine.loadTrack(buffer, 'track.mp3');

    mockContext.currentTime = 10;
    await engine.play();

    // Advance audio context time by 5 seconds
    mockContext.currentTime = 15;
    expect(engine.getState().currentTime).toBe(5);

    // Pause keeps position at 5
    engine.pause();
    expect(engine.getState().playbackState).toBe('paused');
    expect(engine.getState().currentTime).toBe(5);

    // Resume from paused position
    mockContext.currentTime = 20;
    await engine.play();

    // Advance 3 more seconds
    mockContext.currentTime = 23;
    expect(engine.getState().currentTime).toBe(8);
  });

  it('stops playback and resets logical position to zero', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await engine.loadTrack(buffer, 'track.mp3');

    mockContext.currentTime = 10;
    await engine.play();
    mockContext.currentTime = 14;

    engine.stop();
    const state = engine.getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.currentTime).toBe(0);
  });

  it('handles track ending via onended event', async () => {
    const engine = createEngine();
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await engine.loadTrack(buffer, 'track.mp3');

    await engine.play();
    expect(engine.getState().playbackState).toBe('playing');

    const activeSource = mockContext.createdSources[0];
    expect(activeSource).toBeDefined();
    activeSource?.onended?.();

    const state = engine.getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.currentTime).toBe(120);
    // Natural completion has already ended the source; never stop it a second time.
    expect(activeSource?.stop).not.toHaveBeenCalled();
    expect(activeSource?.disconnect).toHaveBeenCalled();
  });

  it('does not let the 100ms UI ticker pre-empt the native audio end event', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'ticker-end-race.mp3');

    mockContext.currentTime = 0;
    await engine.play();

    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // The extrapolated logical time has reached the end, but the browser has
    // not delivered AudioBufferSourceNode.onended yet.
    mockContext.currentTime = 120;
    await vi.advanceTimersByTimeAsync(100);

    expect(engine.getState().playbackState).toBe('playing');
    expect(source?.stop).not.toHaveBeenCalled();
    expect(source?.disconnect).not.toHaveBeenCalled();

    // Only the native end event is allowed to complete natural playback.
    source?.onended?.();
    expect(engine.getState().playbackState).toBe('stopped');
    expect(source?.stop).not.toHaveBeenCalled();
    expect(source?.disconnect).toHaveBeenCalled();

    engine.dispose();
  });

  it('supports two completely isolated deck instances with independent audio state', async () => {
    const mockContextA = new MockAudioContext();
    const mockContextB = new MockAudioContext();

    const deckA = createEngine(mockContextA);
    const deckB = createEngine(mockContextB);

    await deckA.loadTrack(new Uint8Array([1]).buffer, 'DeckA_Scratch.wav');
    await deckB.loadTrack(new Uint8Array([2]).buffer, 'DeckB_Beats.wav');

    await deckA.play();

    expect(deckA.getState().playbackState).toBe('playing');
    expect(deckB.getState().playbackState).toBe('stopped');
    expect(deckA.getState().trackName).toBe('DeckA_Scratch.wav');
    expect(deckB.getState().trackName).toBe('DeckB_Beats.wav');

    deckA.dispose();
    deckB.dispose();
  });

  it('keeps the live playhead after a quick scratch with no animation-frame movement', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'scratch-tap.wav');
    await engine.play(24);

    // The source progresses between the last UI ticker and the user's touch.
    mockContext.currentTime = 5;
    expect(engine.getState().currentTime).toBe(29);

    // The first platter sample carries the live absolute-angle timecode.
    engine.scratch(0, false, 29);
    expect(engine.getState().currentTime).toBe(29);
    engine.endScratch(true);

    const resumedSource = mockContext.createdSources[1];
    expect(resumedSource?.startedAtOffset).toBe(29);
    expect(engine.getState().playbackState).toBe('playing');

    engine.dispose();
  });

  it('supports bidirectional scratching and playbackRate modulation', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'scratch-cue.wav');

    // Scratch forward with 1.5x speed
    engine.scratch(1.5, false, 12);
    expect(mockContext.createdSources).toHaveLength(1);
    const firstSource = mockContext.createdSources[0];
    expect(firstSource).toBeDefined();
    expect(firstSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(1.5, expect.any(Number));

    // Reverse PCM is prepared asynchronously. Rapid pointer updates keep only
    // the newest position and speed rather than blocking the main thread.
    engine.scratch(2.0, true, 11);
    engine.scratch(2.5, true, 9);
    expect(mockContext.createdSources).toHaveLength(1);
    expect(firstSource?.isStopped).toBe(false);

    await vi.runAllTimersAsync();
    expect(mockContext.createdSources).toHaveLength(2);
    const secondSource = mockContext.createdSources[1];
    expect(secondSource).toBeDefined();
    expect(secondSource?.startedAtOffset).toBe(111);
    expect(secondSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(2.5, expect.any(Number));

    // endScratch resumes normal forward playback if requested
    // The reverse scratch source remains connected until its short crossfade completes.
    expect(secondSource?.isStopped).toBe(false);
    engine.endScratch(true);

    expect(secondSource?.isStopped).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(secondSource?.isStopped).toBe(true);
    expect(mockContext.createdSources).toHaveLength(3);
    const forwardResumeSource = mockContext.createdSources[2];
    expect(forwardResumeSource).toBeDefined();
    expect(forwardResumeSource?.startedAtOffset).toBe(9);
    expect(forwardResumeSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));
    expect(engine.getState().playbackState).toBe('playing');

    engine.dispose();
  });

  it('does not create reverse PCM while loading or starting normal forward playback', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'forward-only.wav');

    expect(mockContext.createBuffer).not.toHaveBeenCalled();

    await engine.play();
    expect(mockContext.createdSources).toHaveLength(1);
    expect(mockContext.createBuffer).not.toHaveBeenCalled();

    engine.dispose();
  });

  it('does not start a stale reverse source when scratch is released during preparation', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'cancel-reverse.wav');

    engine.scratch(1.0, false, 18);
    const firstSource = mockContext.createdSources[0];
    expect(firstSource).toBeDefined();

    engine.scratch(2.0, true, 15);
    engine.endScratch(true);

    expect(mockContext.createdSources).toHaveLength(2);
    const resumedForwardSource = mockContext.createdSources[1];
    expect(resumedForwardSource).toBeDefined();

    await vi.advanceTimersByTimeAsync(0);
    expect(mockContext.createdSources).toHaveLength(2);
    expect(resumedForwardSource?.startedAtOffset).toBe(15);
    expect(resumedForwardSource?.buffer).toBe(firstSource?.buffer);
    expect(engine.getState().playbackState).toBe('playing');

    engine.dispose();
  });

  it('cancels older in-flight track loading when a newer track is loaded', async () => {
    const engine = createEngine();
    let resolveFirst: ((val: AudioBuffer) => void) | null = null;

    mockContext.decodeAudioData = vi.fn().mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });

    const firstLoadPromise = engine.loadTrack(new Uint8Array([1]).buffer, 'first-track.mp3');

    // Second track loaded immediately
    mockContext.decodeAudioData = vi.fn().mockResolvedValueOnce({
      duration: 60,
      length: 60 * 44100,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: vi.fn(() => new Float32Array(100)),
    } as unknown as AudioBuffer);

    await engine.loadTrack(new Uint8Array([2]).buffer, 'second-track.mp3');

    expect(engine.getState().trackName).toBe('second-track.mp3');
    expect(engine.getState().duration).toBe(60);

    // Now let the first load resolve late
    if (resolveFirst) {
      (resolveFirst as (val: AudioBuffer) => void)({
        duration: 90,
        length: 90 * 44100,
        numberOfChannels: 2,
        sampleRate: 44100,
        getChannelData: vi.fn(() => new Float32Array(100)),
      } as unknown as AudioBuffer);
    }
    await firstLoadPromise;

    // Second track remains active and was not overwritten by stale first load
    expect(engine.getState().trackName).toBe('second-track.mp3');
    expect(engine.getState().duration).toBe(60);

    engine.dispose();
  });

  it('aborts playback if stop is called while AudioContext resume is in progress', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'track.mp3');

    let resolveResume: (() => void) | null = null;
    mockContext.state = 'suspended';
    mockContext.resume = vi.fn().mockImplementationOnce(() => {
      return new Promise<void>((resolve) => {
        resolveResume = resolve;
      });
    });

    const playPromise = engine.play();
    // Stop is called while resume is still pending
    engine.stop();

    if (resolveResume) {
      (resolveResume as () => void)();
    }
    await playPromise;

    // State must remain stopped, not playing
    expect(engine.getState().playbackState).toBe('stopped');

    engine.dispose();
  });

  it('rebases logical position continuously when playback rate changes while playing and paused', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'speed-test.mp3');

    mockContext.currentTime = 0;
    await engine.play();

    // Play for 4 seconds at 1.0x rate -> position should be 4
    mockContext.currentTime = 4;
    expect(engine.getState().currentTime).toBe(4);

    // Increase playback rate to 1.5x (e.g. 45 RPM or pitch up)
    engine.setPlaybackRate(1.5);
    // Right after rate change, position is still 4
    expect(engine.getState().currentTime).toBe(4);

    // Advance 2 more seconds at 1.5x -> 2 * 1.5 = +3 seconds -> position should be 7
    mockContext.currentTime = 6;
    expect(engine.getState().currentTime).toBe(7);

    // Pause preserves position calculated with the active rate
    engine.pause();
    expect(engine.getState().playbackState).toBe('paused');
    expect(engine.getState().currentTime).toBe(7);

    // Change rate while paused
    engine.setPlaybackRate(2.0);
    expect(engine.getState().currentTime).toBe(7);

    // Resume at 2.0x
    mockContext.currentTime = 10;
    await engine.play();
    mockContext.currentTime = 12; // 2 seconds at 2.0x = +4 seconds -> 11 seconds
    expect(engine.getState().currentTime).toBe(11);

    engine.dispose();
  });

  it('decelerates audio during power-off coastDown and pauses at final position', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'coast-track.mp3');

    mockContext.currentTime = 0;
    await engine.play();
    expect(engine.getState().playbackState).toBe('playing');

    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Initiate 1200ms coast-down
    engine.coastDown(1200);

    // Advance audio context time to match elapsed time during coast
    mockContext.currentTime = 1.2;

    // Should schedule deceleration down to 0
    expect(source?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(engine.getState().playbackState).toBe('playing');

    // Advance timers by 1200ms to complete coast-down.
    await vi.advanceTimersByTimeAsync(1200);

    // Coast-down must finish through the same GainNode fade as the Pause button.
    expect(engine.getState().playbackState).toBe('paused');
    expect(source?.stop).not.toHaveBeenCalled();
    expect(source?.disconnect).not.toHaveBeenCalled();
    expect(mockContext.createdGainParams[0]?.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
    );

    // The source stays connected throughout the fade, then is stopped/disconnected.
    await vi.advanceTimersByTimeAsync(10);
    expect(source?.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15);
    expect(source?.stop).toHaveBeenCalledTimes(1);
    expect(source?.disconnect).toHaveBeenCalledTimes(1);

    engine.dispose();
  });


  it('uses the same fade-before-stop path for power-off coast-down as the Pause button', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'power-off-declick.mp3');

    mockContext.currentTime = 0;
    await engine.play();
    const source = mockContext.createdSources[0];
    const gain = mockContext.createdGainParams[0];
    expect(source).toBeDefined();
    expect(gain).toBeDefined();

    engine.coastDown(1200);
    mockContext.currentTime = 1.2;
    await vi.advanceTimersByTimeAsync(1200);

    expect(engine.getState().playbackState).toBe('paused');
    expect(source?.stop).not.toHaveBeenCalled();
    expect(gain?.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    await vi.advanceTimersByTimeAsync(19);
    expect(source?.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(source?.stop).toHaveBeenCalledTimes(1);
    expect(source?.disconnect).toHaveBeenCalledTimes(1);

    engine.dispose();
  });

  it('restores motor torque when cancelCoastDown is called during coast-down', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'coast-track.mp3');

    mockContext.currentTime = 0;
    await engine.play();

    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Start coasting
    engine.coastDown(1200);
    await vi.advanceTimersByTimeAsync(400);

    // Power restored mid-coast
    engine.cancelCoastDown();

    // Source should NOT be stopped
    expect(source?.isStopped).toBe(false);
    expect(engine.getState().playbackState).toBe('playing');

    // Timer expires later, but should not pause because coast was canceled
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.getState().playbackState).toBe('playing');

    engine.dispose();
  });

  it('scales scratch playback rate by configured base playback rate', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'scratch-rate.mp3');

    // Set deck to 45 RPM (+35% speed: 1.35x)
    engine.setPlaybackRate(1.35);

    // Scratch with hand speed 1.5x
    engine.scratch(1.5, false, 5);

    const activeSource = mockContext.createdSources[0];
    expect(activeSource).toBeDefined();

    // Playback rate should be 1.5 * 1.35 = 2.025
    expect(activeSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(2.025, 3),
      expect.any(Number),
    );

    engine.dispose();
  });

  it('routes audio through a GainNode with de-click ramps on play and pause', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'declick-test.mp3');

    expect(mockContext.createGain).toHaveBeenCalled();

    await engine.play();
    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Source connects to GainNode, not directly to destination
    expect(source?.connect).toHaveBeenCalledWith(expect.objectContaining({ gain: expect.anything() }));

    // Pause schedules de-click ramp to 0 before stopping source
    engine.pause();
    expect(engine.getState().playbackState).toBe('paused');

    // Advance 260ms to allow mechanical brake and de-click fade timeout to execute
    await vi.advanceTimersByTimeAsync(260);
    expect(source?.stop).toHaveBeenCalled();

    engine.dispose();
  });

  it('spins up from fully stopped preserving track position and accelerating playbackRate', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'spinup-test.mp3');

    // Play first to position 15s, then pause
    mockContext.currentTime = 0;
    await engine.play();
    mockContext.currentTime = 15;
    engine.pause();
    await vi.advanceTimersByTimeAsync(25);
    expect(engine.getState().currentTime).toBe(15);

    // Call spinUp(450ms)
    mockContext.currentTime = 20;
    await engine.spinUp(450);

    const secondSource = mockContext.createdSources[1];
    expect(secondSource).toBeDefined();
    // Starts exactly at preserved track position (15s)
    expect(secondSource?.startedAtOffset).toBe(15);

    // Initial playback rate scheduled from 0.2 up to nominal rate (1.0)
    expect(secondSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(0.2, 20);
    expect(secondSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, 20 + 0.45);

    // Advance timer past spin-up duration
    await vi.advanceTimersByTimeAsync(450);
    expect(engine.getState().playbackState).toBe('playing');

    engine.dispose();
  });

  it('smoothly fades terminal PCM edge across all channels to 0 on decode', async () => {
    const engine = createEngine();
    const length = 44100;
    const ch0 = new Float32Array(length).fill(1.0);
    const ch1 = new Float32Array(length).fill(0.8);

    mockContext.decodeAudioData = vi.fn().mockResolvedValueOnce({
      duration: 1,
      length,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => (ch === 0 ? ch0 : ch1)),
    } as unknown as AudioBuffer);

    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'test-edge.mp3');

    // The final 20ms use a raised-cosine envelope on every channel.
    const fadeSamples = Math.round(44100 * 0.02);
    expect(ch0[length - fadeSamples]).toBeCloseTo(1.0, 5);
    expect(ch1[length - fadeSamples]).toBeCloseTo(0.8, 5);
    expect(ch0[length - fadeSamples + Math.floor(fadeSamples / 2)]).toBeGreaterThan(0);
    expect(ch0[length - fadeSamples + Math.floor(fadeSamples / 2)]).toBeLessThan(1.0);
    expect(ch1[length - fadeSamples + Math.floor(fadeSamples / 2)]).toBeLessThan(0.8);
    expect(ch0[length - 1]).toBe(0);
    expect(ch1[length - 1]).toBe(0);

    engine.dispose();
  });

  it('keeps source alive during pause de-click fade and only stops it after completion', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'fade-timing.mp3');

    await engine.play();
    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Trigger pause (default 250ms mechanical brake)
    engine.pause();

    // Immediately after pause call, source is NOT yet stopped or disconnected
    expect(source?.stop).not.toHaveBeenCalled();
    expect(source?.disconnect).not.toHaveBeenCalled();

    // Advance 150ms (midway through mechanical brake)
    await vi.advanceTimersByTimeAsync(150);
    expect(source?.stop).not.toHaveBeenCalled();

    // Advance remaining time past the 255ms brake completion window
    await vi.advanceTimersByTimeAsync(110);
    expect(source?.stop).toHaveBeenCalled();
    expect(source?.disconnect).toHaveBeenCalled();

    engine.dispose();
  });

  it('stops source after 20ms fade window when pause is called with durationMs=0', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'zero-brake-pause.mp3');

    await engine.play();
    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Zero-duration mechanical pause (only the 15-20ms de-click fade)
    engine.pause(0);

    expect(source?.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(source?.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15);
    expect(source?.stop).toHaveBeenCalled();
    expect(source?.disconnect).toHaveBeenCalled();

    engine.dispose();
  });
  it('routes programme audio, vinyl loops and needle cues through the shared deck channel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
    const graph = new MixerAudioGraph({
      audioContextFactory: () => mockContext as unknown as AudioContext,
    });
    const engine = new AudioEngine(graph.createDeckAudioOptions('a'));

    await engine.loadTrack(new Uint8Array([1, 2, 3]).buffer, 'shared-route.wav');
    await engine.play();
    await engine.setRecordSoundState('on-record');

    const needleCue = engine.playNeedleDropSound('correct');
    await vi.waitFor(() => expect(mockContext.createdSources).toHaveLength(3));
    mockContext.createdSources[2]?.onended?.();
    await needleCue;

    const deckInput = graph.getDeckInputNode('a');
    const connectsTo = (
      node: (typeof mockContext.createdGainNodes)[number],
      target: unknown,
    ) => node.connect.mock.calls.some(([connectedNode]) => connectedNode === target);
    const [stylusGate, vinylLoopGain, needleCueGain] = mockContext.createdGainNodes.filter(
      (node) => connectsTo(node, deckInput),
    );
    const deckProgramGain = mockContext.createdGainNodes.find((node) => connectsTo(node, stylusGate));
    const programSourceGain = mockContext.createdGainNodes.find((node) => connectsTo(node, deckProgramGain));

    // Programme path: source -> source gain -> deck gain -> stylus gate -> channel input.
    expect(deckProgramGain?.connect).toHaveBeenCalledWith(stylusGate);
    expect(programSourceGain?.connect).toHaveBeenCalledWith(deckProgramGain);
    expect(stylusGate?.connect).toHaveBeenCalledWith(deckInput);

    // Surface loops and needle one-shots also enter the same deck channel path.
    expect(vinylLoopGain?.connect).toHaveBeenCalledWith(deckInput);
    expect(needleCueGain?.connect).toHaveBeenCalledWith(deckInput);

    engine.dispose();
    await vi.advanceTimersByTimeAsync(25);
    expect(mockContext.close).not.toHaveBeenCalled();

    graph.dispose();
    expect(mockContext.close).toHaveBeenCalledOnce();
  });

  it('plays both decks simultaneously through independent mixer channel paths', async () => {
    const graph = new MixerAudioGraph({
      audioContextFactory: () => mockContext as unknown as AudioContext,
    });
    const engineA = new AudioEngine(graph.createDeckAudioOptions('a'));
    const engineB = new AudioEngine(graph.createDeckAudioOptions('b'));
    const trackData = new Uint8Array([1, 2, 3]).buffer;

    await Promise.all([
      engineA.loadTrack(trackData.slice(0), 'deck-a.wav'),
      engineB.loadTrack(trackData.slice(0), 'deck-b.wav'),
    ]);
    // Start in a known order, then verify both transports remain active together.
    await engineA.play();
    await engineB.play();

    expect(engineA.getState().playbackState).toBe('playing');
    expect(engineB.getState().playbackState).toBe('playing');
    expect(mockContext.createdSources).toHaveLength(2);

    const programmeOutputFor = (source: MockAudioBufferSourceNode) => {
      const sourceGain = source.connect.mock.calls[0]?.[0] as {
        connect: ReturnType<typeof vi.fn>;
      };
      const deckGain = sourceGain.connect.mock.calls[0]?.[0] as {
        connect: ReturnType<typeof vi.fn>;
      };
      const stylusGate = deckGain.connect.mock.calls[0]?.[0] as {
        connect: ReturnType<typeof vi.fn>;
      };
      return stylusGate.connect.mock.calls[0]?.[0];
    };

    const [sourceA, sourceB] = mockContext.createdSources;
    expect(programmeOutputFor(sourceA!)).toBe(graph.getDeckInputNode('a'));
    expect(programmeOutputFor(sourceB!)).toBe(graph.getDeckInputNode('b'));
    expect(graph.getDeckInputNode('a')).not.toBe(graph.getDeckInputNode('b'));

    // Disposing one deck must leave the other deck and the shared context alive.
    engineA.dispose();
    expect(mockContext.close).not.toHaveBeenCalled();
    expect(engineB.getState().playbackState).toBe('playing');

    engineB.dispose();
    graph.dispose();
    expect(mockContext.close).toHaveBeenCalledOnce();
  });

});
