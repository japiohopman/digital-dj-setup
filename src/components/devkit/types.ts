import type { DeckTraceEntry } from '../../state/deckStore';
import type { DeckMachineState } from '../../state/deckMachine';

export interface DeckDiagnosticsSnapshot {
  power: DeckMachineState['power'];
  motorPhase: DeckMachineState['motorPhase'];
  tonearm: DeckMachineState['tonearm'];
  track: DeckMachineState['track'];
  transport: DeckMachineState['transport'];
  isAudible: boolean;
  trace: DeckTraceEntry[];
}
