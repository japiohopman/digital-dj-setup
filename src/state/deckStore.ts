import { createStore, type StoreApi } from 'zustand/vanilla';
import type { DeckTransport, RecordSoundState } from '../audio/types';
import {
  canRunMotor,
  createInitialDeckState,
  selectIsTrackAudible,
  selectRecordSoundState,
  transitionDeck,
  type DeckEvent,
  type DeckMachineState,
  type InitialDeckState,
} from './deckMachine';

export interface DeckTraceEntry {
  at: number;
  event: DeckEvent['type'];
  accepted: boolean;
  reason: string;
}

export interface DeckStoreState {
  machine: DeckMachineState;
  trace: DeckTraceEntry[];
  dispatch: (event: DeckEvent) => boolean;
  loadTrack: (file: File) => Promise<void>;
  dispose: () => void;
}

export type DeckStore = StoreApi<DeckStoreState>;

const SPIN_UP_MS = 450;
const COAST_DOWN_MS = 1200;
const TRACE_LIMIT = 16;

const isHighFrequencyEvent = (event: DeckEvent) =>
  event.type === 'SCRATCH_MOVED' || event.type === 'SEEK' || event.type === 'PLAYBACK_RATE_CHANGED';

export function createDeckStore(
  transport: DeckTransport | undefined,
  initial: InitialDeckState = {},
): DeckStore {
  const initialMachine = createInitialDeckState({
    ...initial,
    ...(transport?.isLoaded !== undefined || initial.trackLoaded !== undefined
      ? { trackLoaded: transport?.isLoaded ?? initial.trackLoaded }
      : {}),
    ...(transport?.isPlaying !== undefined || initial.isPlaying !== undefined
      ? { isPlaying: transport?.isPlaying ?? initial.isPlaying }
      : {}),
  });
  if (transport?.error) {
    initialMachine.track = 'error';
    initialMachine.trackError = transport.error;
    initialMachine.transport = 'idle';
  }

  let spinTimer: ReturnType<typeof setTimeout> | null = null;
  let coastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSoundState: RecordSoundState | null = null;

  const clearSpinTimer = () => {
    if (spinTimer !== null) clearTimeout(spinTimer);
    spinTimer = null;
  };
  const clearCoastTimer = () => {
    if (coastTimer !== null) clearTimeout(coastTimer);
    coastTimer = null;
  };
  const syncAudioGates = (state: DeckMachineState) => {
    const soundState = selectRecordSoundState(state);
    transport?.setStylusContact(selectIsTrackAudible(state));
    if (soundState !== lastSoundState) {
      transport?.setRecordSoundState?.(soundState);
      lastSoundState = soundState;
    }
  };

  const store = createStore<DeckStoreState>((set, get) => {
    const startSpinUp = (state: DeckMachineState) => {
      clearSpinTimer();
      if ((state.track === 'ready' || transport?.isLoaded) && canRunMotor(state)) {
        void transport?.spinUp(SPIN_UP_MS);
      }
      spinTimer = setTimeout(() => {
        get().dispatch({ type: 'MOTOR_SPIN_UP_COMPLETED' });
      }, SPIN_UP_MS);
    };

    const startCoastDown = (previous: DeckMachineState) => {
      clearSpinTimer();
      clearCoastTimer();
      if (previous.transport === 'scratching') {
        transport?.endScratch(false);
      } else if (previous.transport === 'playing' && transport?.isPlaying) {
        transport.coastDown(COAST_DOWN_MS);
      }
      coastTimer = setTimeout(() => {
        get().dispatch({ type: 'MOTOR_COAST_COMPLETED' });
      }, COAST_DOWN_MS);
    };

    const performTransitionEffects = (
      previous: DeckMachineState,
      next: DeckMachineState,
      event: DeckEvent,
    ) => {
      if (!isHighFrequencyEvent(event)) syncAudioGates(next);

      switch (event.type) {
        case 'POWER_TOGGLED':
          if (previous.power === 'on' && next.power === 'off') {
            if (next.motorPhase === 'coasting') {
              startCoastDown(previous);
            } else {
              clearSpinTimer();
              clearCoastTimer();
              if (previous.transport === 'scratching') transport?.endScratch(false);
              else if (previous.transport === 'playing') transport?.pause(0);
            }
          } else if (previous.power === 'off' && next.power === 'on') {
            if (previous.motorPhase === 'coasting') {
              clearCoastTimer();
              transport?.cancelCoastDown();
            } else if (next.motorPhase === 'spinning-up') {
              startSpinUp(next);
            }
          }
          break;

        case 'START_STOP_TOGGLED':
          if (next.motorSwitch === 'on') {
            startSpinUp(next);
          } else {
            clearSpinTimer();
            clearCoastTimer();
            if (previous.transport === 'scratching') transport?.endScratch(false);
            else transport?.pause(250);
          }
          break;

        case 'MOTOR_COAST_COMPLETED':
          if (previous.transport === 'scratching') transport?.endScratch(false);
          else if (previous.transport === 'playing') transport?.pause(0);
          clearCoastTimer();
          break;

        case 'TRACK_LOAD_REQUESTED':
          if (previous.transport === 'scratching') transport?.endScratch(false);
          else transport?.pause(0);
          break;

        case 'ARM_DROPPED':
          if (next.tonearm === 'needle-down') {
            if (!event.wasAlreadyNeedleDown) transport?.playNeedleDropSound?.('correct');
            if (previous.transport === 'playing') {
              transport?.seek(event.position);
            } else if (next.transport === 'playing') {
              if (next.motorPhase === 'spinning-up') startSpinUp(next);
              else void transport?.play(event.position);
            } else {
              transport?.seek(event.position);
            }
          } else if (event.angle > 2 && next.hasRecord) {
            transport?.playNeedleDropSound?.('wrong');
          }
          break;

        case 'ARM_CUE':
          if (next.tonearm === 'needle-down') {
            if (previous.transport === 'playing') transport?.seek(event.position);
            else if (next.transport === 'playing') {
              if (next.motorPhase === 'spinning-up') startSpinUp(next);
              else void transport?.play(event.position);
            } else transport?.seek(event.position);
          }
          break;

        case 'SEEK':
          transport?.seek(event.position);
          break;

        case 'PLAYBACK_RATE_CHANGED':
          transport?.setPlaybackRate(event.rate);
          break;

        case 'SCRATCH_MOVED':
          if (next.transport === 'scratching') {
            transport?.scratch(event.speed, event.reversed, event.position);
          }
          break;

        case 'SCRATCH_ENDED':
          transport?.endScratch(next.transport === 'playing');
          break;

        default:
          break;
      }
    };

    return {
      machine: initialMachine,
      trace: [],
      dispatch: (event) => {
        const previous = get().machine;
        const result = transitionDeck(previous, event);
        if (result.accepted) {
          set({ machine: result.state });
          if (!isHighFrequencyEvent(event)) {
            set({
              trace: [...get().trace, {
                at: Date.now(),
                event: event.type,
                accepted: true,
                reason: result.reason,
              }].slice(-TRACE_LIMIT),
            });
          }
          performTransitionEffects(previous, result.state, event);
        } else {
          if (!isHighFrequencyEvent(event)) {
            set({
              trace: [...get().trace, {
                at: Date.now(),
                event: event.type,
                accepted: false,
                reason: result.reason,
              }].slice(-TRACE_LIMIT),
            });
          }
          if (event.type === 'ENGINE_PLAYBACK_SYNC' && event.playbackState === 'playing') {
            transport?.pause(0);
          }
        }
        return result.accepted;
      },
      loadTrack: async (file) => {
        get().dispatch({ type: 'TRACK_LOAD_REQUESTED' });
        if (!transport) {
          get().dispatch({ type: 'TRACK_LOAD_FAILED', error: 'No audio transport is connected' });
          return;
        }
        try {
          await transport.loadTrack(file);
          get().dispatch({ type: 'TRACK_LOAD_SUCCEEDED' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load audio track';
          get().dispatch({ type: 'TRACK_LOAD_FAILED', error: message });
        }
      },
      dispose: () => {
        clearSpinTimer();
        clearCoastTimer();
        transport?.setStylusContact(false);
        transport?.setRecordSoundState?.('stopped');
      },
    };
  });

  return store;
}
