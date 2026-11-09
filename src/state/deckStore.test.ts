import { describe, expect, it, vi } from 'vitest';
import type { DeckTransport } from '../audio/types';
import { createDeckStore } from './deckStore';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeTransport(overrides: Partial<DeckTransport> = {}): DeckTransport {
  return {
    trackName: null,
    metadata: null,
    duration: 100,
    currentTime: 0,
    playbackState: 'idle',
    isPlaying: false,
    isLoaded: false,
    isStylusDown: false,
    setStylusContact: vi.fn(),
    setRecordSoundState: vi.fn(),
    playNeedleDropSound: vi.fn(),
    error: null,
    loadTrack: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    togglePlayPause: vi.fn().mockResolvedValue(undefined),
    scratch: vi.fn(),
    endScratch: vi.fn(),
    seek: vi.fn(),
    setPlaybackRate: vi.fn(),
    coastDown: vi.fn(),
    cancelCoastDown: vi.fn(),
    spinUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('per-deck Zustand adapter', () => {
  it('keeps track loading separate from playback and does not autoplay', async () => {
    const transport = makeTransport();
    const store = createDeckStore(transport);
    await store.getState().loadTrack(new File(['track'], 'track.wav', { type: 'audio/wav' }));

    expect(transport.loadTrack).toHaveBeenCalledOnce();
    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.spinUp).not.toHaveBeenCalled();
    expect(store.getState().machine.track).toBe('ready');
    expect(store.getState().machine.transport).toBe('paused');
    store.getState().dispose();
  });

  it('does not start muted audio when the motor starts before the needle is dropped', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport, { initiallyMotorOn: false, trackLoaded: true });
    store.getState().dispatch({ type: 'START_STOP_TOGGLED' });

    expect(store.getState().machine.motorPhase).toBe('spinning-up');
    expect(store.getState().machine.transport).toBe('paused');
    expect(transport.spinUp).not.toHaveBeenCalled();
    store.getState().dispose();
  });

  it('seeks to the needle drop position before starting motor spin-up', async () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport, { initiallyMotorOn: false, trackLoaded: true });
    store.getState().dispatch({ type: 'START_STOP_TOGGLED' });
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 22, wasAlreadyNeedleDown: false, position: 35,
    });

    await flushMicrotasks();
    // The arm angle is the timecode, including on the first drop.
    expect(transport.seek).toHaveBeenCalledWith(35);
    expect(transport.spinUp).toHaveBeenCalledWith(450);
    expect(vi.mocked(transport.seek).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(transport.spinUp).mock.invocationCallOrder[0] ?? Infinity,
    );
    store.getState().dispose();
  });

  it('ignores stale track-load completions and keeps the latest failure visible', async () => {
    const resolveFirst: { current?: () => void } = {};
    const rejectSecond: { current?: (error: Error) => void } = {};
    const transport = makeTransport({
      loadTrack: vi.fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst.current = resolve; }))
        .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSecond.current = reject; })),
    });
    const store = createDeckStore(transport);
    const first = store.getState().loadTrack(new File(['first'], 'first.wav'));
    const second = store.getState().loadTrack(new File(['second'], 'second.wav'));

    resolveFirst.current?.();
    await first;
    expect(store.getState().machine.track).toBe('loading');

    rejectSecond.current?.(new Error('latest file failed'));
    await second;
    expect(store.getState().machine.track).toBe('error');
    expect(store.getState().machine.trackError).toBe('latest file failed');
    store.getState().dispose();
  });

  it('plays after a valid timecoded needle drop with motor and power active', async () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 22, wasAlreadyNeedleDown: false, position: 35,
    });

    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('correct');
    expect(transport.play).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(transport.play).toHaveBeenCalledWith(35);
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    store.getState().dispose();
  });

  it('rejects a wrong needle drop without opening the stylus gate', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: false, position: 50, surface: 'record',
    });

    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('wrong');
    expect(transport.setStylusContact).not.toHaveBeenCalledWith(true);
    expect(store.getState().machine.tonearm).toBe('lifted');
    store.getState().dispose();
  });

  it('waits for the needle impact and vinyl loop before starting at the selected timecode', async () => {
    let finishCue: (() => void) | undefined;
    let finishLoop: (() => void) | undefined;
    const transport = makeTransport({
      isLoaded: true,
      playNeedleDropSound: vi.fn(() => new Promise<void>((resolve) => { finishCue = resolve; })),
      setRecordSoundState: vi.fn((state) => state === 'on-record'
        ? new Promise<void>((resolve) => { finishLoop = resolve; })
        : Promise.resolve()),
    });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 22,
      wasAlreadyNeedleDown: false,
      position: 35,
      grip: 'arm',
      surface: 'record',
    });

    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('correct');
    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');

    finishCue?.();
    await flushMicrotasks();

    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('on-record');
    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.seek).not.toHaveBeenCalled();

    finishLoop?.();
    await flushMicrotasks();

    expect(transport.seek).toHaveBeenCalledWith(35);
    expect(transport.play).toHaveBeenCalledWith(35);
    const loopStartOrder = vi.mocked(transport.setRecordSoundState!).mock.invocationCallOrder.at(-1) ?? Infinity;
    const trackStartOrder = vi.mocked(transport.play).mock.invocationCallOrder.at(-1) ?? Infinity;
    expect(loopStartOrder).toBeLessThan(trackStartOrder);
    store.getState().dispose();
  });

  it('cancels a pending needle cue when the tonearm is lifted before the cue finishes', async () => {
    let finishCue: (() => void) | undefined;
    const transport = makeTransport({
      isLoaded: true,
      playNeedleDropSound: vi.fn(() => new Promise<void>((resolve) => { finishCue = resolve; })),
    });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 25,
      wasAlreadyNeedleDown: false,
      position: 0,
      grip: 'arm',
      surface: 'record',
    });
    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('correct');
    expect(transport.play).not.toHaveBeenCalled();

    store.getState().dispatch({ type: 'ARM_LIFTED' });
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);

    finishCue?.();
    await flushMicrotasks();

    expect(transport.setRecordSoundState).not.toHaveBeenCalledWith('on-record');
    expect(transport.play).not.toHaveBeenCalled();
    store.getState().dispose();
  });

  it('does not replay the first-drop cue after lifting and placing the stylus at another groove position', async () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 15,
      wasAlreadyNeedleDown: false,
      position: 0,
      grip: 'arm',
      surface: 'record',
    });
    await flushMicrotasks();
    expect(transport.playNeedleDropSound).toHaveBeenCalledTimes(1);

    store.getState().dispatch({ type: 'ARM_LIFTED' });
    expect(store.getState().machine.hasValidNeedleDrop).toBe(false);
    expect(store.getState().machine.hasStartedCurrentRecord).toBe(true);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 22,
      wasAlreadyNeedleDown: false,
      position: 35,
      grip: 'arm',
      surface: 'record',
    });
    expect(transport.playNeedleDropSound).toHaveBeenCalledTimes(1);
    expect(transport.seek).toHaveBeenLastCalledWith(35);
    store.getState().dispose();
  });

  it('plays the wrong-drop cue before restarting at 30 seconds when the cartridge is grabbed', async () => {
    let finishCue: (() => void) | undefined;
    const transport = makeTransport({
      isLoaded: true,
      playNeedleDropSound: vi.fn(() => new Promise<void>((resolve) => { finishCue = resolve; })),
    });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 25,
      wasAlreadyNeedleDown: false,
      position: 30,
      grip: 'cartridge',
      surface: 'record',
    });

    expect(store.getState().machine.tonearm).toBe('needle-down');
    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('wrong');
    expect(transport.play).not.toHaveBeenCalled();

    finishCue?.();
    await flushMicrotasks();

    expect(transport.seek).toHaveBeenCalledWith(30);
    expect(transport.play).toHaveBeenCalledWith(30);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('on-record');
    store.getState().dispose();
  });

  it('plays the label loop only after a deliberate landing above 38°', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 40,
      wasAlreadyNeedleDown: false,
      position: 100,
      surface: 'label',
    });

    expect(store.getState().machine.tonearm).toBe('off-record');
    expect(transport.setStylusContact).not.toHaveBeenCalledWith(true);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('off-record');

    store.getState().dispatch({ type: 'ARM_LIFTED' });
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('starts the off-record loop only when the stylus physically lands on the plinth', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 14,
      wasAlreadyNeedleDown: false,
      position: 0,
      surface: 'plinth',
    });

    expect(store.getState().machine.tonearm).toBe('off-record');
    expect(transport.setStylusContact).not.toHaveBeenCalledWith(true);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('off-record');

    store.getState().dispatch({ type: 'ARM_LIFTED' });
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('mutes on arm lift but keeps the motor running and surface loops stopped', () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: true, playbackState: 'playing' });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    store.getState().dispatch({ type: 'ARM_LIFTED' });

    expect(store.getState().machine.motorPhase).toBe('running');
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('routes lifted-stylus scratch through the store without opening program audio', () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: true, playbackState: 'playing' });
    const store = createDeckStore(transport);

    expect(store.getState().machine.transport).toBe('playing');
    expect(store.getState().dispatch({ type: 'SCRATCH_STARTED' })).toBe(true);
    expect(store.getState().machine.transport).toBe('scratching');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');

    store.getState().dispatch({
      type: 'SCRATCH_MOVED',
      speed: 1.1,
      reversed: true,
      position: 18,
    });
    expect(transport.scratch).toHaveBeenCalledWith(1.1, true, 18);

    store.getState().dispatch({ type: 'SCRATCH_ENDED' });
    expect(transport.endScratch).toHaveBeenLastCalledWith(true);
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('keeps a paused track paused after a lifted-stylus scratch', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);

    expect(store.getState().machine.transport).toBe('paused');
    store.getState().dispatch({ type: 'SCRATCH_STARTED' });
    store.getState().dispatch({
      type: 'SCRATCH_MOVED',
      speed: 0.8,
      reversed: false,
      position: 9,
    });
    store.getState().dispatch({ type: 'SCRATCH_ENDED' });

    expect(store.getState().machine.transport).toBe('paused');
    expect(transport.endScratch).toHaveBeenLastCalledWith(false);
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('routes needle-down scratch through the audible program path', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 25,
      wasAlreadyNeedleDown: false,
      position: 0,
    });
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    expect(store.getState().dispatch({ type: 'SCRATCH_STARTED' })).toBe(true);

    store.getState().dispatch({
      type: 'SCRATCH_MOVED',
      speed: 0.9,
      reversed: false,
      position: 22,
    });
    expect(transport.scratch).toHaveBeenCalledWith(0.9, false, 22);

    store.getState().dispatch({ type: 'SCRATCH_ENDED' });
    expect(transport.endScratch).toHaveBeenLastCalledWith(true);
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    store.getState().dispose();
  });

  it('coasts the audio engine from machine state even when the initial transport snapshot was paused', async () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: false, playbackState: 'paused' });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 25,
      wasAlreadyNeedleDown: false,
      position: 0,
      grip: 'arm',
      surface: 'record',
    });
    await flushMicrotasks();
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.play).toHaveBeenCalledWith(0);

    store.getState().dispatch({ type: 'POWER_TOGGLED' });

    expect(store.getState().machine.motorPhase).toBe('coasting');
    expect(transport.coastDown).toHaveBeenCalledWith(1200);
    store.getState().dispose();
  });

  it('keeps program audio and vinyl crackle active through coast-down, then stops both at rest', async () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: true, playbackState: 'playing' });
    const store = createDeckStore(transport);

    store.getState().dispatch({
      type: 'ARM_DROPPED',
      angle: 25,
      wasAlreadyNeedleDown: false,
      position: 0,
      grip: 'arm',
      surface: 'record',
    });
    await flushMicrotasks();

    store.getState().dispatch({ type: 'POWER_TOGGLED' });

    expect(store.getState().machine.motorPhase).toBe('coasting');
    expect(transport.coastDown).toHaveBeenCalledWith(1200);
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('on-record');

    store.getState().dispatch({ type: 'MOTOR_COAST_COMPLETED' });

    expect(store.getState().machine.motorPhase).toBe('stopped');
    expect(transport.pause).toHaveBeenLastCalledWith(0);
    // Motor stop removes rotational surface noise, but does not disconnect
    // the cartridge from the external phono amplifier.
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('stopped');
    store.getState().dispose();
  });

  it('coasts and mutes on power-off, then restores torque when powered back during coast', () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: true, playbackState: 'playing' });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    store.getState().dispatch({ type: 'POWER_TOGGLED' });

    expect(transport.coastDown).toHaveBeenCalledWith(1200);
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    expect(store.getState().machine.motorPhase).toBe('coasting');

    store.getState().dispatch({ type: 'POWER_TOGGLED' });
    expect(transport.cancelCoastDown).toHaveBeenCalledOnce();
    expect(store.getState().machine.motorPhase).toBe('running');
    store.getState().dispose();
  });

  it('isolates controls and state for two deck stores', () => {
    const deckA = createDeckStore(makeTransport());
    const deckB = createDeckStore(makeTransport(), { initiallyPowered: false, initiallyMotorOn: false });
    deckA.getState().dispatch({ type: 'POWER_TOGGLED' });

    expect(deckA.getState().machine.power).toBe('off');
    expect(deckB.getState().machine.power).toBe('off');
    expect(deckB.getState().machine.motorPhase).toBe('stopped');
    deckA.getState().dispose();
    deckB.getState().dispose();
  });

  it('records rejected transitions in the inspectable state trace', () => {
    const store = createDeckStore(makeTransport(), { initiallyPowered: false, initiallyMotorOn: false });
    store.getState().dispatch({ type: 'START_STOP_TOGGLED' });

    expect(store.getState().trace.at(-1)?.accepted).toBe(false);
    expect(store.getState().trace.at(-1)?.reason).toContain('power is off');
    store.getState().dispose();
  });
});
