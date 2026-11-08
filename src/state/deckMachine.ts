import type { AudioPlaybackState } from '../audio/types';
import {
  DEFAULT_TONEARM_CONFIG,
  isAngleAtOuterLeadIn,
  isAngleInPlayableRecord,
  type TonearmState,
} from '../audio/tonearmGeometry';

export type DeckPowerState = 'on' | 'off';
export type MotorSwitchState = 'on' | 'off';
export type MotorPhase = 'stopped' | 'spinning-up' | 'running' | 'coasting';
export type TrackPhase = 'empty' | 'loading' | 'ready' | 'error';
export type TransportPhase = 'idle' | 'paused' | 'playing' | 'scratching';
export type ScratchResumePhase = Exclude<TransportPhase, 'scratching'>;
export type ArmInteraction = 'idle' | 'dragging';

export interface DeckMachineState {
  power: DeckPowerState;
  motorSwitch: MotorSwitchState;
  motorPhase: MotorPhase;
  track: TrackPhase;
  transport: TransportPhase;
  /** Transport phase to restore after a physical scratch gesture ends. */
  scratchResumeTransport: ScratchResumePhase | null;
  tonearm: TonearmState;
  armInteraction: ArmInteraction;
  hasRecord: boolean;
  trackError: string | null;
}

export interface InitialDeckState {
  initiallyPowered?: boolean;
  initiallyMotorOn?: boolean;
  hasRecord?: boolean;
  trackLoaded?: boolean;
  isPlaying?: boolean;
}

export type DeckEvent =
  | { type: 'POWER_TOGGLED' }
  | { type: 'START_STOP_TOGGLED' }
  | { type: 'MOTOR_SPIN_UP_COMPLETED' }
  | { type: 'MOTOR_COAST_COMPLETED' }
  | { type: 'TRACK_LOAD_REQUESTED' }
  | { type: 'TRACK_LOAD_SUCCEEDED' }
  | { type: 'TRACK_LOAD_FAILED'; error: string }
  | { type: 'ARM_PICKED_UP' }
  | { type: 'ARM_DRAG_CANCELLED' }
  | {
      type: 'ARM_DROPPED';
      angle: number;
      wasAlreadyNeedleDown: boolean;
      position: number;
      tooFast?: boolean;
    }
  | { type: 'ARM_LIFTED' }
  | { type: 'ARM_PARKED' }
  | { type: 'ARM_CUE'; angle: number; position: number }
  | { type: 'SEEK'; position: number }
  | { type: 'PLAYBACK_RATE_CHANGED'; rate: number }
  | { type: 'SCRATCH_STARTED' }
  | { type: 'SCRATCH_MOVED'; speed: number; reversed: boolean; position: number }
  | { type: 'SCRATCH_ENDED' }
  | { type: 'ENGINE_PLAYBACK_SYNC'; playbackState: AudioPlaybackState };

export interface DeckTransition {
  state: DeckMachineState;
  accepted: boolean;
  reason: string;
}

export function createInitialDeckState(options: InitialDeckState = {}): DeckMachineState {
  const powered = options.initiallyPowered ?? true;
  const motorOn = options.initiallyMotorOn ?? true;
  const trackLoaded = options.trackLoaded ?? false;
  return {
    power: powered ? 'on' : 'off',
    motorSwitch: motorOn ? 'on' : 'off',
    motorPhase: powered && motorOn ? 'running' : 'stopped',
    track: trackLoaded ? 'ready' : 'empty',
    transport: options.isPlaying ? 'playing' : trackLoaded ? 'paused' : 'idle',
    scratchResumeTransport: null,
    tonearm: 'parked',
    armInteraction: 'idle',
    hasRecord: options.hasRecord ?? true,
    trackError: null,
  };
}

export function canRunMotor(state: DeckMachineState): boolean {
  return state.power === 'on' && state.motorSwitch === 'on' && state.motorPhase !== 'stopped';
}

export function canPlayTrack(state: DeckMachineState): boolean {
  return canRunMotor(state) && state.track === 'ready' && state.hasRecord;
}

export function selectIsSpinning(state: DeckMachineState): boolean {
  return state.motorPhase !== 'stopped';
}

export function selectIsTrackAudible(state: DeckMachineState): boolean {
  return canPlayTrack(state) &&
    state.tonearm === 'needle-down' &&
    (state.transport === 'playing' || state.transport === 'scratching');
}

export function selectRecordSoundState(state: DeckMachineState): 'stopped' | 'on-record' | 'off-record' {
  if (!canRunMotor(state) || !state.hasRecord || state.track !== 'ready' ||
    (state.transport !== 'playing' && state.transport !== 'scratching')) {
    return 'stopped';
  }
  return state.tonearm === 'needle-down' ? 'on-record' : 'off-record';
}

const accept = (state: DeckMachineState, reason: string): DeckTransition => ({
  state,
  accepted: true,
  reason,
});

const reject = (state: DeckMachineState, reason: string): DeckTransition => ({
  state,
  accepted: false,
  reason,
});

const isFiniteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

export function transitionDeck(state: DeckMachineState, event: DeckEvent): DeckTransition {
  switch (event.type) {
    case 'POWER_TOGGLED': {
      if (state.power === 'on') {
        const canCoast = state.motorSwitch === 'on' && state.motorPhase !== 'stopped';
        return accept({
          ...state,
          power: 'off',
          motorPhase: canCoast ? 'coasting' : 'stopped',
          transport: state.transport === 'scratching' ? 'paused' : state.transport,
          scratchResumeTransport: null,
        }, canCoast ? 'Power off: motor coasts down; program output is muted' : 'Power off: motor already stopped');
      }

      if (state.motorSwitch === 'off') {
        return accept({ ...state, power: 'on', motorPhase: 'stopped' }, 'Power on: Start/Stop remains off');
      }
      if (state.motorPhase === 'coasting') {
        return accept({ ...state, power: 'on', motorPhase: 'running' }, 'Power restored during coast: motor torque restored');
      }

      const next: DeckMachineState = { ...state, power: 'on', motorPhase: 'spinning-up' };
      if (canPlayTrack(next) && next.tonearm === 'needle-down') next.transport = 'playing';
      return accept(next, 'Power on: active Start/Stop switch initiates spin-up');
    }

    case 'START_STOP_TOGGLED': {
      if (state.power === 'off') return reject(state, 'Start/Stop ignored while power is off');
      if (state.motorSwitch === 'on') {
        return accept({
          ...state,
          motorSwitch: 'off',
          motorPhase: 'stopped',
          transport: state.track === 'ready' ? 'paused' : 'idle',
          scratchResumeTransport: null,
        }, 'Start/Stop off: motor stops and transport pauses');
      }

      const next: DeckMachineState = {
        ...state,
        motorSwitch: 'on',
        motorPhase: 'spinning-up',
      };
      if (canPlayTrack(next) && next.tonearm === 'needle-down') next.transport = 'playing';
      return accept(next, 'Start/Stop on: motor begins spin-up');
    }

    case 'MOTOR_SPIN_UP_COMPLETED':
      if (state.power !== 'on' || state.motorSwitch !== 'on' || state.motorPhase !== 'spinning-up') {
        return reject(state, 'Ignored stale spin-up completion');
      }
      return accept({ ...state, motorPhase: 'running' }, 'Motor reached operating speed');

    case 'MOTOR_COAST_COMPLETED':
      if (state.power !== 'off' || state.motorPhase !== 'coasting') {
        return reject(state, 'Ignored stale coast completion');
      }
      return accept({
        ...state,
        motorPhase: 'stopped',
        transport: state.track === 'ready' ? 'paused' : 'idle',
        scratchResumeTransport: null,
      }, 'Motor coast completed');

    case 'TRACK_LOAD_REQUESTED':
      return accept({
        ...state,
        track: 'loading',
        trackError: null,
        transport: 'paused',
        scratchResumeTransport: null,
        tonearm: 'lifted',
        armInteraction: 'idle',
      }, 'Track loading: arm lifted and output muted; autoplay disabled');

    case 'TRACK_LOAD_SUCCEEDED':
      if (state.track !== 'loading') return reject(state, 'Ignored track-ready event without an active load');
      return accept({
        ...state,
        track: 'ready',
        trackError: null,
        transport: 'paused',
      }, 'Track ready: remains paused until a valid needle drop');

    case 'TRACK_LOAD_FAILED':
      if (state.track !== 'loading') return reject(state, 'Ignored track failure without an active load');
      return accept({
        ...state,
        track: 'error',
        trackError: event.error,
        transport: 'idle',
        scratchResumeTransport: null,
        tonearm: 'lifted',
        armInteraction: 'idle',
      }, 'Track load failed: deck remains muted');

    case 'ARM_PICKED_UP':
      if (state.armInteraction === 'dragging') return reject(state, 'Tonearm already has an active pointer');
      return accept({
        ...state,
        tonearm: 'lifted',
        armInteraction: 'dragging',
      }, 'Tonearm picked up: stylus gate closes; motor state is unchanged');

    case 'ARM_DRAG_CANCELLED':
      if (state.armInteraction !== 'dragging') return reject(state, 'No active tonearm drag to cancel');
      return accept({
        ...state,
        tonearm: 'lifted',
        armInteraction: 'idle',
      }, 'Tonearm drag cancelled safely; stylus remains lifted');

    case 'ARM_DROPPED': {
      const atRest = event.angle <= DEFAULT_TONEARM_CONFIG.parkAngle + 2;
      if (atRest) {
        return accept({
          ...state,
          tonearm: 'parked',
          armInteraction: 'idle',
        }, 'Tonearm returned to its cradle');
      }

      const inGroove = isAngleInPlayableRecord(event.angle);
      const validStart = event.wasAlreadyNeedleDown ||
        isAngleAtOuterLeadIn(event.angle) && !event.tooFast;
      const validDrop = state.hasRecord && inGroove && validStart && !event.tooFast;
      if (!validDrop) {
        return accept({
          ...state,
          tonearm: 'lifted',
          armInteraction: 'idle',
        }, state.hasRecord ? 'Rejected needle drop: outside the lead-in or playable groove' : 'Rejected needle drop: no record on platter');
      }

      const next: DeckMachineState = {
        ...state,
        tonearm: 'needle-down',
        armInteraction: 'idle',
      };
      if (canPlayTrack(next) && state.transport !== 'scratching') next.transport = 'playing';
      return accept(next, 'Valid needle drop: cue position accepted');
    }

    case 'ARM_LIFTED':
      return accept({
        ...state,
        tonearm: 'lifted',
        armInteraction: 'idle',
      }, 'Tonearm lifted: audio muted without changing motor state');

    case 'ARM_PARKED':
      return accept({
        ...state,
        tonearm: 'parked',
        armInteraction: 'idle',
      }, 'Tonearm parked in its cradle');

    case 'ARM_CUE':
      if (state.tonearm !== 'needle-down') return reject(state, 'Cue movement requires the stylus to be down');
      if (!isAngleInPlayableRecord(event.angle)) {
        return accept({
          ...state,
          tonearm: 'lifted',
          armInteraction: 'idle',
        }, 'Cue moved outside the playable groove: stylus lifted and muted');
      }
      if (!isFiniteNonNegative(event.position)) return reject(state, 'Ignored invalid cue position');
      {
        const next = { ...state };
        if (canPlayTrack(next) && state.transport !== 'scratching') next.transport = 'playing';
        return accept(next, 'Cue position updated from tonearm radius');
      }

    case 'SEEK':
      if (state.transport === 'scratching') {
        return reject(state, 'Seek ignored during an active scratch gesture');
      }
      if (state.track !== 'ready' || !isFiniteNonNegative(event.position)) {
        return reject(state, 'Seek ignored: track is not ready or position is invalid');
      }
      return accept(state, 'Track position updated');

    case 'PLAYBACK_RATE_CHANGED':
      if (!Number.isFinite(event.rate) || event.rate <= 0) return reject(state, 'Invalid playback rate');
      return accept(state, 'Playback rate updated');

    case 'SCRATCH_STARTED': {
      if (!canPlayTrack(state)) {
        return reject(state, 'Scratch ignored: requires power, active motor, a loaded track and a record');
      }
      if (state.transport === 'scratching') {
        return reject(state, 'Scratch ignored: a scratch gesture is already active');
      }
      const resumeTransport: ScratchResumePhase = state.transport;
      return accept({
        ...state,
        transport: 'scratching',
        scratchResumeTransport: resumeTransport,
      }, state.tonearm === 'needle-down'
        ? 'Scratch gesture started with stylus contact'
        : 'Physical scratch started with stylus lifted; program audio remains muted');
    }

    case 'SCRATCH_MOVED':
      if (state.transport !== 'scratching') return reject(state, 'Scratch movement ignored without an active scratch');
      if (!Number.isFinite(event.speed) || event.speed < 0 || !isFiniteNonNegative(event.position)) {
        return reject(state, 'Invalid scratch movement');
      }
      return accept(state, 'Scratch position updated');

    case 'SCRATCH_ENDED': {
      if (state.transport !== 'scratching') return reject(state, 'No active scratch to end');
      const next = { ...state };
      const canResume = canPlayTrack(state);
      next.transport = canResume
        ? (state.scratchResumeTransport ?? 'paused')
        : state.track === 'ready' ? 'paused' : 'idle';
      next.scratchResumeTransport = null;
      return accept(next, 'Scratch gesture ended; previous transport phase restored');
    }

    case 'ENGINE_PLAYBACK_SYNC': {
      if (state.track === 'loading') return reject(state, 'Playback sync ignored while a track is loading');
      if (event.playbackState === 'playing') {
        if (!canRunMotor(state) || !state.hasRecord || state.track !== 'ready') {
          return reject(state, 'Engine playback blocked: power, motor or track state is not ready');
        }
        if (state.transport === 'scratching') return accept(state, 'Scratch playback confirmed');
        return accept({ ...state, transport: 'playing' }, 'Engine confirms playback');
      }
      if (state.transport === 'scratching') return reject(state, 'Playback sync ignored during active scratch');
      if (event.playbackState === 'idle') {
        return accept({ ...state, transport: state.track === 'ready' ? 'paused' : 'idle' }, 'Engine is idle');
      }
      if (event.playbackState === 'loading') return reject(state, 'Engine loading is managed by the track-load event');
      return accept({
        ...state,
        transport: state.track === 'ready' ? 'paused' : 'idle',
      }, 'Engine confirms transport pause');
    }
  }
}
