export type MidiPortState = 'connected' | 'disconnected';
export type MidiPortConnection = 'open' | 'closed' | 'pending';
export type MidiPortType = 'input' | 'output';

export interface MidiPortLike {
  readonly id: string;
  readonly name?: string | null;
  readonly manufacturer?: string | null;
  readonly type: MidiPortType;
  readonly state: MidiPortState;
  readonly connection: MidiPortConnection;
  open(): Promise<unknown>;
  close(): Promise<unknown>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface MidiPortMapLike {
  values(): IterableIterator<MidiPortLike>;
}

export interface MidiAccessLike {
  readonly inputs: MidiPortMapLike;
  readonly outputs: MidiPortMapLike;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export type MidiAccessRequester = (options: { sysex: false }) => Promise<MidiAccessLike>;

export type MidiInspectorStatus =
  | 'idle'
  | 'requesting'
  | 'unsupported'
  | 'denied'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface MidiPortSummary {
  id: string;
  name: string;
  manufacturer: string | null;
  type: MidiPortType;
  state: MidiPortState;
  connection: MidiPortConnection;
}

export interface MidiMessageRecord {
  id: number;
  timestamp: number;
  bytes: number[];
  messageType: string;
  channel: number | null;
}

export interface MidiInspectorSnapshot {
  status: MidiInspectorStatus;
  error: string | null;
  accessGranted: boolean;
  selectedInputId: string;
  inputs: MidiPortSummary[];
  outputs: MidiPortSummary[];
  messages: MidiMessageRecord[];
}
