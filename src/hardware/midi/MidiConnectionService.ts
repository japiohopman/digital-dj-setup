import type {
  MidiAccessLike,
  MidiAccessRequester,
  MidiInspectorSnapshot,
  MidiMessageRecord,
  MidiPortLike,
  MidiPortSummary,
} from './types';

const MAX_RECENT_MESSAGES = 40;

function getBrowserRequester(): MidiAccessRequester | null {
  if (typeof navigator === 'undefined') return null;

  const midiNavigator = navigator as unknown as {
    requestMIDIAccess?: MidiAccessRequester;
  };
  const request = midiNavigator.requestMIDIAccess;
  return request ? request.bind(navigator) : null;
}

function summarizePort(port: MidiPortLike): MidiPortSummary {
  return {
    id: port.id,
    name: port.name?.trim() || 'Unnamed MIDI port',
    manufacturer: port.manufacturer?.trim() || null,
    type: port.type,
    state: port.state,
    connection: port.connection,
  };
}

function messageTypeFor(statusByte: number): string {
  if (statusByte < 0x80) return 'Data';
  if (statusByte >= 0xf0) return 'System';

  switch (statusByte & 0xf0) {
    case 0x80: return 'Note Off';
    case 0x90: return 'Note On';
    case 0xa0: return 'Polyphonic Aftertouch';
    case 0xb0: return 'Control Change';
    case 0xc0: return 'Program Change';
    case 0xd0: return 'Channel Pressure';
    case 0xe0: return 'Pitch Bend';
    default: return 'Unknown';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The browser could not open MIDI access. Check the browser permission and try again.';
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
  );
}

interface MidiMessageEventLike extends Event {
  data?: ArrayLike<number> | null;
  receivedTime?: number;
}

/**
 * Owns only the browser MIDI permission, port and raw-message lifecycle.
 * It deliberately has no dependency on deck state, Web Audio or mixer code.
 */
export class MidiConnectionService {
  private access: MidiAccessLike | null = null;
  private activeInput: MidiPortLike | null = null;
  private readonly listeners = new Set<() => void>();
  private messageSequence = 0;
  private connectionSequence = 0;
  private accessRequestSequence = 0;

  private snapshot: MidiInspectorSnapshot = {
    status: 'idle',
    error: null,
    accessGranted: false,
    selectedInputId: '',
    inputs: [],
    outputs: [],
    messages: [],
  };

  private readonly onAccessStateChange: EventListener = () => {
    this.refreshPorts();
    this.reconcileSelectedInput();
  };

  private readonly onMidiMessage: EventListener = (event) => {
    this.recordMessage(event as MidiMessageEventLike);
  };

  constructor(
    private readonly requestMIDIAccess: MidiAccessRequester | null = getBrowserRequester(),
  ) {}

  getSnapshot = (): MidiInspectorSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Must be called only from the inspector's explicit user action. */
  requestAccess = async (): Promise<void> => {
    if (!this.requestMIDIAccess) {
      this.update({ status: 'unsupported', error: 'Web MIDI is not available in this browser. Use desktop Chrome or Edge over HTTPS.' });
      return;
    }

    const requestSequence = ++this.accessRequestSequence;
    this.update({ status: 'requesting', error: null });
    try {
      const access = await this.requestMIDIAccess({ sysex: false });
      if (requestSequence !== this.accessRequestSequence) return;
      this.access = access;
      this.access.addEventListener('statechange', this.onAccessStateChange);
      this.refreshPorts();
      this.update({ status: 'ready', accessGranted: true, error: null });
    } catch (error) {
      if (requestSequence !== this.accessRequestSequence) return;
      this.update({
        status: isPermissionError(error) ? 'denied' : 'error',
        accessGranted: false,
        error: isPermissionError(error)
          ? 'MIDI permission was denied. Allow MIDI access in the browser and try again.'
          : errorMessage(error),
      });
    }
  };

  /** Selects one physical input port. An empty ID safely releases the current input. */
  selectInput = async (inputId: string): Promise<void> => {
    this.connectionSequence += 1;
    const sequence = this.connectionSequence;
    this.detachActiveInput();

    if (!inputId) {
      this.update({
        selectedInputId: '',
        status: this.access ? 'ready' : 'idle',
        messages: [],
        error: null,
      });
      return;
    }

    if (!this.access) {
      this.update({ status: 'error', error: 'Request MIDI access before selecting a port.' });
      return;
    }

    const input = Array.from(this.access.inputs.values()).find((port) => port.id === inputId);
    if (!input) {
      this.update({
        selectedInputId: inputId,
        status: 'disconnected',
        messages: [],
        error: 'That MIDI input is no longer available. Reconnect it or choose another port.',
      });
      return;
    }

    if (input.state !== 'connected') {
      this.update({
        selectedInputId: inputId,
        status: 'disconnected',
        messages: [],
        error: 'The selected MIDI input is disconnected. Reconnect the controller and try again.',
      });
      return;
    }

    this.update({
      selectedInputId: inputId,
      status: 'connecting',
      messages: [],
      error: null,
    });

    try {
      await input.open();
      if (sequence !== this.connectionSequence || this.snapshot.selectedInputId !== inputId) {
        void input.close().catch(() => undefined);
        return;
      }

      input.addEventListener('midimessage', this.onMidiMessage);
      this.activeInput = input;
      this.update({ status: 'connected', error: null });
    } catch (error) {
      if (sequence !== this.connectionSequence) return;
      this.update({
        status: 'error',
        error: `Could not open ${input.name || 'the selected MIDI input'}: ${errorMessage(error)}`,
      });
    }
  };

  /** Remove all device listeners and close the selected port without affecting the app. */
  dispose = (): void => {
    this.connectionSequence += 1;
    this.accessRequestSequence += 1;
    this.detachActiveInput();
    this.access?.removeEventListener('statechange', this.onAccessStateChange);
    this.access = null;
    this.listeners.clear();
  };

  refreshPorts(): void {
    if (!this.access) return;
    this.update({
      inputs: Array.from(this.access.inputs.values(), summarizePort),
      outputs: Array.from(this.access.outputs.values(), summarizePort),
      accessGranted: true,
    });
  }

  private reconcileSelectedInput(): void {
    if (!this.access || !this.snapshot.selectedInputId) return;

    const selected = Array.from(this.access.inputs.values()).find(
      (port) => port.id === this.snapshot.selectedInputId,
    );

    if (!selected || selected.state === 'disconnected') {
      this.connectionSequence += 1;
      this.detachActiveInput();
      this.update({
        status: 'disconnected',
        error: 'The selected MIDI input disconnected. Reconnect it to resume inspection.',
      });
      return;
    }

    if (
      this.activeInput?.id === selected.id &&
      selected.connection === 'open'
    ) return;
    if (this.snapshot.status === 'connecting') return;
    void this.selectInput(selected.id);
  }

  private detachActiveInput(): void {
    if (!this.activeInput) return;
    const input = this.activeInput;
    this.activeInput = null;
    input.removeEventListener('midimessage', this.onMidiMessage);
    void input.close().catch(() => undefined);
  }

  private recordMessage(event: MidiMessageEventLike): void {
    if (!event.data || event.data.length === 0) return;

    const bytes = Array.from(event.data, (byte) => Number(byte) & 0xff);
    const statusByte = bytes[0] ?? 0;
    const record: MidiMessageRecord = {
      id: ++this.messageSequence,
      timestamp: typeof event.receivedTime === 'number' ? event.receivedTime : event.timeStamp,
      bytes,
      messageType: messageTypeFor(statusByte),
      channel: statusByte >= 0x80 && statusByte < 0xf0
        ? (statusByte & 0x0f) + 1
        : null,
    };

    this.update({
      messages: [record, ...this.snapshot.messages].slice(0, MAX_RECENT_MESSAGES),
    });
  }

  private update(patch: Partial<MidiInspectorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
