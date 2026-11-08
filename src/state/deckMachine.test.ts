import { describe, expect, it } from 'vitest';
import {
  canPlayTrack,
  createInitialDeckState,
  selectIsSpinning,
  selectIsTrackAudible,
  selectRecordSoundState,
  transitionDeck,
  type DeckEvent,
} from './deckMachine';

function apply(state: ReturnType<typeof createInitialDeckState>, event: DeckEvent) {
  const result = transitionDeck(state, event);
  expect(result.accepted, result.reason).toBe(true);
  return result.state;
}

describe('deck state machine', () => {
  it('starts with power and motor independent from track playback', () => {
    const state = createInitialDeckState();
    expect(state.power).toBe('on');
    expect(state.motorSwitch).toBe('on');
    expect(state.motorPhase).toBe('running');
    expect(state.track).toBe('empty');
    expect(state.transport).toBe('idle');
    expect(selectIsSpinning(state)).toBe(true);
    expect(selectIsTrackAudible(state)).toBe(false);
  });

  it('rejects Start/Stop while power is off', () => {
    const state = createInitialDeckState({ initiallyPowered: false, initiallyMotorOn: false });
    const result = transitionDeck(state, { type: 'START_STOP_TOGGLED' });
    expect(result.accepted).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.reason).toContain('power is off');
  });

  it('coasts silently on power-off and can restore torque before coast completes', () => {
    const playing = createInitialDeckState({ trackLoaded: true, isPlaying: true });
    const needleDown = apply(playing, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(selectIsTrackAudible(needleDown)).toBe(true);

    const coasting = apply(needleDown, { type: 'POWER_TOGGLED' });
    expect(coasting.power).toBe('off');
    expect(coasting.motorPhase).toBe('coasting');
    expect(selectIsTrackAudible(coasting)).toBe(false);
    expect(selectRecordSoundState(coasting)).toBe('stopped');

    const restored = apply(coasting, { type: 'POWER_TOGGLED' });
    expect(restored.power).toBe('on');
    expect(restored.motorPhase).toBe('running');
    expect(restored.transport).toBe('playing');
    expect(selectIsTrackAudible(restored)).toBe(true);
  });

  it('starts the motor without playing until a ready track has a valid needle drop', () => {
    let state = createInitialDeckState({ initiallyMotorOn: false, trackLoaded: true });
    state = apply(state, { type: 'START_STOP_TOGGLED' });
    expect(state.motorPhase).toBe('spinning-up');
    expect(state.transport).toBe('paused');

    state = apply(state, { type: 'MOTOR_SPIN_UP_COMPLETED' });
    expect(state.motorPhase).toBe('running');
    expect(state.transport).toBe('paused');

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.tonearm).toBe('needle-down');
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(true);
  });

  it('rejects an initial drop outside the outer lead-in but accepts a valid re-drop', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: false, position: 50,
    });
    expect(state.tonearm).toBe('lifted');
    expect(selectIsTrackAudible(state)).toBe(false);

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'ARM_PICKED_UP' });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: true, position: 50,
    });
    expect(state.tonearm).toBe('needle-down');
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(true);
  });

  it('keeps the motor running when the tonearm is lifted', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'ARM_LIFTED' });
    expect(state.motorPhase).toBe('running');
    expect(state.motorSwitch).toBe('on');
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('off-record');
  });

  it('loading never autoplays and forces the stylus gate closed', () => {
    let state = createInitialDeckState();
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'TRACK_LOAD_REQUESTED' });
    state = apply(state, { type: 'TRACK_LOAD_SUCCEEDED' });
    expect(state.track).toBe('ready');
    expect(state.transport).toBe('paused');
    expect(state.tonearm).toBe('lifted');
    expect(canPlayTrack(state)).toBe(true);
    expect(selectIsTrackAudible(state)).toBe(false);
  });

  it('rejects a wrong/too-fast drop and does not unmute output', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0, tooFast: true,
    });
    expect(state.tonearm).toBe('lifted');
    expect(selectIsTrackAudible(state)).toBe(false);
  });

  it('lifts and parks after pointer cancellation without changing the motor', () => {
    let state = createInitialDeckState();
    state = apply(state, { type: 'ARM_PICKED_UP' });
    state = apply(state, { type: 'ARM_DRAG_CANCELLED' });
    expect(state.armInteraction).toBe('idle');
    expect(state.tonearm).toBe('lifted');
    expect(state.motorPhase).toBe('running');
    state = apply(state, { type: 'ARM_PARKED' });
    expect(state.tonearm).toBe('parked');
  });

  it('allows physical scratching with the stylus lifted while keeping program audio muted', () => {
    const state = createInitialDeckState({ trackLoaded: true });
    const scratching = apply(state, { type: 'SCRATCH_STARTED' });

    expect(scratching.transport).toBe('scratching');
    expect(scratching.tonearm).toBe('parked');
    expect(selectIsTrackAudible(scratching)).toBe(false);
    expect(selectRecordSoundState(scratching)).toBe('off-record');

    const ended = apply(scratching, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('paused');
    expect(selectIsTrackAudible(ended)).toBe(false);
  });

  it('keeps scratching audible through the stylus when the needle is down', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    const scratching = apply(state, { type: 'SCRATCH_STARTED' });

    expect(scratching.transport).toBe('scratching');
    expect(selectIsTrackAudible(scratching)).toBe(true);
    const ended = apply(scratching, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('playing');
  });


  it('ends scratch back into normal muted playback when the arm is lifted', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 25, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'SCRATCH_STARTED' });
    state = apply(state, { type: 'ARM_PICKED_UP' });
    expect(state.transport).toBe('playing');
    expect(state.tonearm).toBe('lifted');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('off-record');
  });

  it('keeps the two decks independent', () => {
    const deckA = createInitialDeckState();
    const deckB = createInitialDeckState({ initiallyPowered: false, initiallyMotorOn: false });
    const changedA = apply(deckA, { type: 'POWER_TOGGLED' });
    expect(changedA.power).toBe('off');
    expect(deckB.power).toBe('off');
    expect(deckB.motorPhase).toBe('stopped');
  });
});
