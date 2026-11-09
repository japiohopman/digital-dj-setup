import { describe, expect, it } from 'vitest';
import { SEVEN_INCH_TONEARM_CONFIG } from '../audio/tonearmGeometry';
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

  it('keeps program audio audible during power-off coast and can restore torque before coast completes', () => {
    const playing = createInitialDeckState({ trackLoaded: true, isPlaying: true });
    const needleDown = apply(playing, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(selectIsTrackAudible(needleDown)).toBe(true);

    const coasting = apply(needleDown, { type: 'POWER_TOGGLED' });
    expect(coasting.power).toBe('off');
    expect(coasting.motorPhase).toBe('coasting');
    expect(selectIsTrackAudible(coasting)).toBe(true);
    expect(selectRecordSoundState(coasting)).toBe('on-record');

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
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.tonearm).toBe('needle-down');
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(true);
  });

  it('requires the correct LP lead-in again after picking up an already-playing tonearm', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: false, position: 50,
    });
    expect(state.tonearm).toBe('lifted');
    expect(selectIsTrackAudible(state)).toBe(false);

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.hasValidNeedleDrop).toBe(true);

    state = apply(state, { type: 'ARM_PICKED_UP' });
    expect(state.hasValidNeedleDrop).toBe(false);

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 35, wasAlreadyNeedleDown: true, position: 50,
    });
    expect(state.hasValidNeedleDrop).toBe(false);
    expect(state.tonearm).toBe('lifted');
    expect(selectIsTrackAudible(state)).toBe(false);

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: true, position: 0,
    });
    expect(state.tonearm).toBe('needle-down');
    expect(state.hasValidNeedleDrop).toBe(true);
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(true);
  });

  it('resets initial-drop eligibility when the arm is lifted and requires the LP lead-in again', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.hasValidNeedleDrop).toBe(true);

    state = apply(state, { type: 'ARM_LIFTED' });
    expect(state.hasValidNeedleDrop).toBe(false);

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 36, wasAlreadyNeedleDown: false, position: 52,
    });
    expect(state.hasValidNeedleDrop).toBe(false);
    expect(state.tonearm).toBe('lifted');

    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.hasValidNeedleDrop).toBe(true);
    expect(state.tonearm).toBe('needle-down');
    expect(state.transport).toBe('playing');
  });

  it('accepts the 7-inch lead-in at 24 degrees when seven-inch geometry is selected', () => {
    const initial = createInitialDeckState({ trackLoaded: true });
    const result = transitionDeck(initial, {
      type: 'ARM_DROPPED',
      angle: 24,
      wasAlreadyNeedleDown: false,
      position: 0,
    }, SEVEN_INCH_TONEARM_CONFIG);

    expect(result.accepted).toBe(true);
    expect(result.state.hasValidNeedleDrop).toBe(true);
    expect(result.state.tonearm).toBe('needle-down');
  });

  it('resets re-drop eligibility when a new track is loaded', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    expect(state.hasValidNeedleDrop).toBe(true);
    state = apply(state, { type: 'TRACK_LOAD_REQUESTED' });
    expect(state.hasValidNeedleDrop).toBe(false);
    state = apply(state, { type: 'TRACK_LOAD_SUCCEEDED' });
    const invalidDrop = transitionDeck(state, {
      type: 'ARM_DROPPED', angle: 36, wasAlreadyNeedleDown: false, position: 52,
    });
    expect(invalidDrop.state.tonearm).toBe('lifted');
    expect(invalidDrop.state.transport).toBe('paused');
  });

  it('rejects invalid needle-drop positions without opening the stylus gate', () => {
    const state = createInitialDeckState({ trackLoaded: true });
    const result = transitionDeck(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: Number.NaN,
    });
    expect(result.accepted).toBe(true);
    expect(result.state.tonearm).toBe('lifted');
    expect(result.state.transport).toBe('paused');
    expect(selectIsTrackAudible(result.state)).toBe(false);
  });

  it('rejects keyboard cue events during a physical scratch', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'SCRATCH_STARTED' });
    const result = transitionDeck(state, { type: 'ARM_CUE', angle: 35, position: 50 });
    expect(result.accepted).toBe(false);
    expect(result.state).toEqual(state);
  });

  it('keeps the motor running when the tonearm is lifted', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'ARM_LIFTED' });
    expect(state.motorPhase).toBe('running');
    expect(state.motorSwitch).toBe('on');
    expect(state.hasValidNeedleDrop).toBe(false);
    expect(state.transport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('stopped');
  });

  it('selects the off-record loop only when the stylus lands on the Technics plinth', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED',
      angle: 5,
      wasAlreadyNeedleDown: false,
      position: 0,
      surface: 'plinth',
    });
    expect(state.tonearm).toBe('off-record');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('off-record');

    state = apply(state, { type: 'ARM_LIFTED' });
    expect(selectRecordSoundState(state)).toBe('stopped');
  });

  it('keeps the run-out loop playing after the track ends until the needle lifts', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED',
      angle: 11,
      wasAlreadyNeedleDown: false,
      position: 0,
    });
    state = apply(state, {
      type: 'ENGINE_PLAYBACK_SYNC',
      playbackState: 'stopped',
      endedNaturally: true,
    });
    expect(state.transport).toBe('ended');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('runout');

    state = apply(state, { type: 'ARM_LIFTED' });
    expect(selectRecordSoundState(state)).toBe('stopped');
  });

  it('keeps a parked arm parked while the track is loading', () => {
    let state = createInitialDeckState();
    state = apply(state, { type: 'TRACK_LOAD_REQUESTED' });
    expect(state.tonearm).toBe('parked');
    expect(state.hasRecord).toBe(false);
    expect(selectRecordSoundState(state)).toBe('stopped');
  });

  it('loading never autoplays and forces the stylus gate closed', () => {
    let state = createInitialDeckState();
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0,
    });
    state = apply(state, { type: 'TRACK_LOAD_REQUESTED' });
    state = apply(state, { type: 'TRACK_LOAD_SUCCEEDED' });
    expect(state.track).toBe('ready');
    expect(state.transport).toBe('paused');
    expect(state.tonearm).toBe('parked');
    expect(canPlayTrack(state)).toBe(true);
    expect(selectIsTrackAudible(state)).toBe(false);
  });

  it('rejects a wrong/too-fast drop and does not unmute output', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED', angle: 11, wasAlreadyNeedleDown: false, position: 0, tooFast: true,
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

  it('allows silent physical scratching with the stylus lifted and restores prior playback', () => {
    const initial = createInitialDeckState({ trackLoaded: true, isPlaying: true });
    const scratching = apply(initial, { type: 'SCRATCH_STARTED' });

    expect(scratching.transport).toBe('scratching');
    expect(scratching.scratchResumeTransport).toBe('playing');
    expect(selectIsTrackAudible(scratching)).toBe(false);
    expect(selectRecordSoundState(scratching)).toBe('stopped');

    const moved = apply(scratching, {
      type: 'SCRATCH_MOVED',
      speed: 1.25,
      reversed: true,
      position: 12,
    });
    expect(moved.transport).toBe('scratching');
    expect(selectIsTrackAudible(moved)).toBe(false);

    const ended = apply(moved, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('playing');
    expect(ended.scratchResumeTransport).toBeNull();
    expect(selectIsTrackAudible(ended)).toBe(false);
    expect(selectRecordSoundState(ended)).toBe('stopped');
  });

  it('keeps needle-down scratching audible and restores normal playback on release', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED',
      angle: 11,
      wasAlreadyNeedleDown: false,
      position: 0,
    });

    const scratching = apply(state, { type: 'SCRATCH_STARTED' });
    expect(scratching.transport).toBe('scratching');
    expect(selectIsTrackAudible(scratching)).toBe(true);
    expect(selectRecordSoundState(scratching)).toBe('on-record');

    const ended = apply(scratching, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('playing');
    expect(selectIsTrackAudible(ended)).toBe(true);
    expect(selectRecordSoundState(ended)).toBe('on-record');
  });

  it('keeps program audio muted when the arm is lifted during a scratch', () => {
    let state = createInitialDeckState({ trackLoaded: true });
    state = apply(state, {
      type: 'ARM_DROPPED',
      angle: 11,
      wasAlreadyNeedleDown: false,
      position: 0,
    });
    state = apply(state, { type: 'SCRATCH_STARTED' });
    state = apply(state, { type: 'ARM_LIFTED' });

    expect(state.transport).toBe('scratching');
    expect(state.scratchResumeTransport).toBe('playing');
    expect(selectIsTrackAudible(state)).toBe(false);
    expect(selectRecordSoundState(state)).toBe('stopped');

    const ended = apply(state, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('playing');
    expect(selectIsTrackAudible(ended)).toBe(false);
    expect(selectRecordSoundState(ended)).toBe('stopped');
  });

  it('does not turn a paused track into playback when scratch ends', () => {
    const initial = createInitialDeckState({ trackLoaded: true });
    expect(initial.transport).toBe('paused');

    const scratching = apply(initial, { type: 'SCRATCH_STARTED' });
    expect(scratching.scratchResumeTransport).toBe('paused');

    const ended = apply(scratching, { type: 'SCRATCH_ENDED' });
    expect(ended.transport).toBe('paused');
    expect(ended.scratchResumeTransport).toBeNull();
    expect(selectIsTrackAudible(ended)).toBe(false);
    expect(selectRecordSoundState(ended)).toBe('stopped');
  });

  it('rejects physical scratching without power, motor, track or record', () => {
    const blockedStates = [
      createInitialDeckState({ initiallyPowered: false, trackLoaded: true }),
      createInitialDeckState({ initiallyMotorOn: false, trackLoaded: true }),
      createInitialDeckState(),
      createInitialDeckState({ hasRecord: false, trackLoaded: true }),
    ];

    for (const state of blockedStates) {
      const result = transitionDeck(state, { type: 'SCRATCH_STARTED' });
      expect(result.accepted).toBe(false);
      expect(result.state).toEqual(state);
    }
  });

  it('rejects direct seek while a physical scratch gesture is active', () => {
    const state = apply(
      createInitialDeckState({ trackLoaded: true, isPlaying: true }),
      { type: 'SCRATCH_STARTED' },
    );
    const result = transitionDeck(state, { type: 'SEEK', position: 30 });

    expect(result.accepted).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.reason).toContain('active scratch');
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
