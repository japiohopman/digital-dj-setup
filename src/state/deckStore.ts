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
  let trackLoadRequestId = 0;
  let lastSoundState: RecordSoundState | null = null;
  let needleDropSequence = 0;

  const clearSpinTimer = () => {
    if (spinTimer !== null) clearTimeout(spinTimer);
    spinTimer = null;
  };
  const clearCoastTimer = () => {
    if (coastTimer !== null) clearTimeout(coastTimer);
    coastTimer = null;
  };
  const syncAudioGates = (state: DeckMachineState, deferRecordLoop = false) => {
    transport?.setStylusContact(selectIsTrackAudible(state));
    // The needle impact plays before the music and vinyl crackle. Keep both
    // record layers stopped until the one-shot cue reports that it has ended.
    const soundState = deferRecordLoop ? 'stopped' : selectRecordSoundState(state);
    if (soundState !== lastSoundState) {
      transport?.setRecordSoundState?.(soundState);
      lastSoundState = soundState;
    }
  };

  const store = createStore<DeckStoreState>((set, get) => {
    const startSpinUp = (state: DeckMachineState) => {
      clearSpinTimer();
      if (state.track === 'ready' && state.transport === 'playing' && canRunMotor(state)) {
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
      } else if (previous.transport === 'playing') {
        // The state machine is authoritative; transport.isPlaying is only a render snapshot.
        transport?.coastDown(COAST_DOWN_MS);
      }
      coastTimer = setTimeout(() => {
        get().dispatch({ type: 'MOTOR_COAST_COMPLETED' });
      }, COAST_DOWN_MS);
    };

    const sequenceNeedleDrop = (kind: 'correct' | 'wrong', position: number) => {
      const sequence = ++needleDropSequence;
      void (async () => {
        await transport?.playNeedleDropSound?.(kind);
        if (sequence !== needleDropSequence) return;

        const current = get().machine;
        if (current.track !== 'ready' || current.tonearm !== 'needle-down') return;

        // Seek only after the one-shot has finished. This also replaces a
        // still-running, muted source after the user lifted and re-dropped the
        // needle, so a cartridge drop really starts at its 30s offset.
        transport?.seek(position);
        if (current.transport === 'playing' && canRunMotor(current)) {
          transport?.setRecordSoundState?.('on-record');
          lastSoundState = 'on-record';
          if (current.motorPhase === 'spinning-up') {
            startSpinUp(current);
          } else if (transport?.playbackState !== 'playing') {
            void transport?.play(position);
          }
        }
      })();
    };

    const performTransitionEffects = (
      previous: DeckMachineState,
      next: DeckMachineState,
      event: DeckEvent,
    ) => {
      const isFirstCorrectDrop = event.type === 'ARM_DROPPED' &&
        next.tonearm === 'needle-down' &&
        !previous.hasValidNeedleDrop &&
        !event.wasAlreadyNeedleDown &&
        event.grip !== 'cartridge' &&
        !event.tooFast;
      const isWrongNeedleDrop = event.type === 'ARM_DROPPED' &&
        next.tonearm === 'needle-down' &&
        (event.grip === 'cartridge' || event.tooFast === true);
      if (!isHighFrequencyEvent(event)) {
        syncAudioGates(next, isFirstCorrectDrop || isWrongNeedleDrop);
      }

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
          if (previous.transport === 'scratching') break;
          if (next.tonearm === 'needle-down') {
            const wrongDrop = event.grip === 'cartridge' || event.tooFast === true;
            const firstDrop = !previous.hasValidNeedleDrop && !event.wasAlreadyNeedleDown;
            if (wrongDrop) {
              sequenceNeedleDrop('wrong', event.position);
            } else if (firstDrop) {
              // The correct lead-in sound must finish before the MP3/WAV and
              // vinyl crackle start together from the beginning of the track.
              sequenceNeedleDrop('correct', 0);
            } else if (previous.transport === 'playing') {
              transport?.seek(event.position);
            } else if (next.transport === 'playing') {
              if (next.motorPhase === 'spinning-up') {
                transport?.seek(event.position);
                startSpinUp(next);
              } else void transport?.play(event.position);
            } else {
              transport?.seek(event.position);
            }
          } else if (event.surface === 'record' && next.hasRecord) {
            // A drop on vinyl but outside the playable groove is a wrong
            // needle placement, not an off-record plinth landing.
            void transport?.playNeedleDropSound?.('wrong');
          }
          break;

        case 'ARM_CUE':
          if (previous.transport === 'scratching') break;
          if (next.tonearm === 'needle-down') {
            if (previous.transport === 'playing') transport?.seek(event.position);
            else if (next.transport === 'playing') {
              if (next.motorPhase === 'spinning-up') {
                transport?.seek(event.position);
                startSpinUp(next);
              } else void transport?.play(event.position);
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
          if (
            event.type === 'TRACK_LOAD_REQUESTED' ||
            (previous.tonearm === 'needle-down' && result.state.tonearm !== 'needle-down')
          ) {
            needleDropSequence++;
          }
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
        const requestId = ++trackLoadRequestId;
        get().dispatch({ type: 'TRACK_LOAD_REQUESTED' });
        if (!transport) {
          if (requestId === trackLoadRequestId) {
            get().dispatch({ type: 'TRACK_LOAD_FAILED', error: 'No audio transport is connected' });
          }
          return;
        }
        try {
          await transport.loadTrack(file);
          if (requestId !== trackLoadRequestId) return;
          get().dispatch({ type: 'TRACK_LOAD_SUCCEEDED' });
        } catch (error) {
          if (requestId !== trackLoadRequestId) return;
          const message = error instanceof Error ? error.message : 'Unable to load audio track';
          get().dispatch({ type: 'TRACK_LOAD_FAILED', error: message });
        }
      },
      dispose: () => {
        clearSpinTimer();
        clearCoastTimer();
        if (get().machine.transport === 'scratching') transport?.endScratch(false);
        transport?.setStylusContact(false);
        transport?.setRecordSoundState?.('stopped');
      },
    };
  });

  return store;
}
