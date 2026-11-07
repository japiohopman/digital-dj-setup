import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './AudioEngine';

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
    return {
      gain: new MockAudioParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GainNode;
  });
}

describe('AudioEngine', () => {
  let mockContext: MockAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    mockContext = new MockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createEngine = (customContext?: MockAudioContext) => {
    const ctx = customContext ?? mockContext;
    return new AudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
  };

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
    await vi.advanceTimersByTimeAsync(25);
    expect(firstSource?.stop).toHaveBeenCalled();

    await engine.play();
    // A second single-use source node was created
    expect(mockContext.createdSources).toHaveLength(2);
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

  it('supports bidirectional scratching and playbackRate modulation', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'scratch-cue.wav');

    // Scratch forward with 1.5x speed
    engine.scratch(1.5, false, 12);
    expect(mockContext.createdSources).toHaveLength(1);
    const firstSource = mockContext.createdSources[0];
    expect(firstSource).toBeDefined();
    expect(firstSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(1.5, expect.any(Number));

    // Scratch backward with 2.0x speed
    engine.scratch(2.0, true, 11);
    // When switching direction to reversed buffer, a new source is started with the reversed buffer
    expect(mockContext.createdSources).toHaveLength(2);
    const secondSource = mockContext.createdSources[1];
    expect(secondSource).toBeDefined();
    expect(secondSource?.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(2.0, expect.any(Number));

    // endScratch resumes normal forward playback if requested
    // Ensure the reverse scratch source was stopped and a fresh forward source was started
    expect(secondSource?.isStopped).toBe(false);
    engine.endScratch(true);

    expect(secondSource?.isStopped).toBe(true);
    expect(mockContext.createdSources).toHaveLength(3);
    const forwardResumeSource = mockContext.createdSources[2];
    expect(forwardResumeSource).toBeDefined();
    expect(forwardResumeSource?.startedAtOffset).toBe(11);
    expect(forwardResumeSource?.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));
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

    // Advance timers by 1200ms to complete coast-down
    await vi.advanceTimersByTimeAsync(1200);

    // Audio should now be paused and source stopped
    expect(engine.getState().playbackState).toBe('paused');
    expect(source?.isStopped).toBe(true);

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

    // Advance 25ms to allow de-click timeout to execute
    await vi.advanceTimersByTimeAsync(25);
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
    const length = 1000;
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

    // Terminal sample at index length - 1 must be exactly 0
    expect(ch0[length - 1]).toBe(0);
    expect(ch1[length - 1]).toBe(0);

    // Preceding samples should ramp up
    expect(ch0[length - 2]).toBeGreaterThan(0);
    expect(ch0[length - 2]).toBeLessThan(1.0);

    engine.dispose();
  });

  it('keeps source alive during pause de-click fade and only stops it after completion', async () => {
    const engine = createEngine();
    await engine.loadTrack(new Uint8Array([1, 2]).buffer, 'fade-timing.mp3');

    await engine.play();
    const source = mockContext.createdSources[0];
    expect(source).toBeDefined();

    // Trigger pause
    engine.pause();

    // Immediately after pause call, source is NOT yet stopped or disconnected
    expect(source?.stop).not.toHaveBeenCalled();
    expect(source?.disconnect).not.toHaveBeenCalled();

    // Advance 10ms (midway through de-click fade)
    await vi.advanceTimersByTimeAsync(10);
    expect(source?.stop).not.toHaveBeenCalled();

    // Advance remaining time past the 20ms fade completion window
    await vi.advanceTimersByTimeAsync(15);
    expect(source?.stop).toHaveBeenCalled();
    expect(source?.disconnect).toHaveBeenCalled();

    engine.dispose();
  });
});
