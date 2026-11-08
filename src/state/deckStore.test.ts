import { describe, expect, it, vi } from 'vitest';
import type { DeckTransport } from '../audio/types';
import { createDeckStore } from './deckStore';

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

  it('plays only after an outer-lead-in drop with motor and power active', async () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });

    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('correct');
    expect(transport.play).toHaveBeenCalledWith(0);
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(true);
    store.getState().dispose();
  });

  it('rejects a wrong needle drop without opening the stylus gate', () => {
    const transport = makeTransport({ isLoaded: true });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: false, position: 50,
    });

    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.playNeedleDropSound).toHaveBeenCalledWith('wrong');
    expect(transport.setStylusContact).not.toHaveBeenCalledWith(true);
    expect(store.getState().machine.tonearm).toBe('lifted');
    store.getState().dispose();
  });

  it('mutes on arm lift but keeps the motor running and off-record loop selected', () => {
    const transport = makeTransport({ isLoaded: true, isPlaying: true, playbackState: 'playing' });
    const store = createDeckStore(transport);
    store.getState().dispatch({
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    store.getState().dispatch({ type: 'ARM_LIFTED' });

    expect(store.getState().machine.motorPhase).toBe('running');
    expect(store.getState().machine.transport).toBe('playing');
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
    expect(transport.setRecordSoundState).toHaveBeenLastCalledWith('off-record');
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
    expect(transport.setStylusContact).toHaveBeenLastCalledWith(false);
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
