import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './AudioEngine';

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  startedAtOffset: number | null = null;
  isStarted = false;
  isStopped = false;

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
    return {
      duration: 120, // 2 minutes mock track
      length: 120 * 44100,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: vi.fn(),
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  });

  createBufferSource = vi.fn(() => {
    const source = new MockAudioBufferSourceNode();
    this.createdSources.push(source);
    return source as unknown as AudioBufferSourceNode;
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
});
