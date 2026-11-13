import { describe, expect, it, vi } from 'vitest';

import { MidiConnectionService } from './MidiConnectionService';
import type { MidiAccessLike, MidiPortLike } from './types';

class FakePort implements MidiPortLike {
  readonly listeners = new Map<string, Set<EventListener>>();
  state: 'connected' | 'disconnected' = 'connected';
  connection: 'open' | 'closed' | 'pending' = 'closed';

  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: 'input' | 'output',
    readonly manufacturer: string | null = 'Pioneer DJ',
  ) {}

  async open(): Promise<void> {
    if (this.state === 'disconnected') throw new Error('Port is disconnected');
    this.connection = 'open';
  }

  async close(): Promise<void> {
    this.connection = 'closed';
  }

  addEventListener(type: string, listener: EventListener): void {
    const callbacks = this.listeners.get(type) ?? new Set<EventListener>();
    callbacks.add(listener);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  emitMessage(bytes: number[], receivedTime = 123.4): void {
    const event = Object.assign(new Event('midimessage'), {
      data: new Uint8Array(bytes),
      receivedTime,
    });
    this.emit('midimessage', event);
  }

  setState(state: 'connected' | 'disconnected'): void {
    this.state = state;
  }
}

class FakeAccess implements MidiAccessLike {
  readonly listeners = new Set<EventListener>();

  constructor(
    readonly inputs: { values: () => IterableIterator<MidiPortLike> },
    readonly outputs: { values: () => IterableIterator<MidiPortLike> },
  ) {}

  addEventListener(_type: string, listener: EventListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: EventListener): void {
    this.listeners.delete(listener);
  }

  emitStateChange(): void {
    const event = new Event('statechange');
    this.listeners.forEach((listener) => listener(event));
  }
}

function mapOf(ports: MidiPortLike[]) {
  return { values: () => ports[Symbol.iterator]() };
}

describe('MidiConnectionService', () => {
  it('reports unsupported browsers without requesting permission or throwing', async () => {
    const service = new MidiConnectionService(null);

    await service.requestAccess();

    expect(service.getSnapshot().status).toBe('unsupported');
    expect(service.getSnapshot().accessGranted).toBe(false);
  });

  it('requests standard MIDI access without SysEx and enumerates inputs and outputs', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    const output = new FakePort('rev1-out', 'DDJ-REV1', 'output');
    const access = new FakeAccess(mapOf([input]), mapOf([output]));
    const request = vi.fn(async () => access);
    const service = new MidiConnectionService(request);

    await service.requestAccess();

    expect(request).toHaveBeenCalledWith({ sysex: false });
    expect(service.getSnapshot().status).toBe('ready');
    expect(service.getSnapshot().inputs.map((port) => port.id)).toEqual(['rev1-in']);
    expect(service.getSnapshot().outputs.map((port) => port.id)).toEqual(['rev1-out']);
    expect(access.listeners.size).toBe(1);
  });

  it('reports a denied browser permission with a recoverable explanation', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const service = new MidiConnectionService(async () => { throw denied; });

    await service.requestAccess();

    expect(service.getSnapshot().status).toBe('denied');
    expect(service.getSnapshot().error).toContain('permission was denied');
  });

  it('refreshes the live device list after a controller is connected', async () => {
    const inputs: MidiPortLike[] = [];
    const access = new FakeAccess(mapOf(inputs), mapOf([]));
    const service = new MidiConnectionService(async () => access);

    await service.requestAccess();
    expect(service.getSnapshot().inputs).toHaveLength(0);

    inputs.push(new FakePort('rev1-in', 'DDJ-REV1', 'input'));
    service.refreshPorts();

    expect(service.getSnapshot().inputs).toHaveLength(1);
    expect(service.getSnapshot().inputs[0]?.name).toBe('DDJ-REV1');
  });

  it('opens the explicitly selected input and records raw bytes, type, channel and timestamp', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    const access = new FakeAccess(mapOf([input]), mapOf([]));
    const service = new MidiConnectionService(async () => access);
    await service.requestAccess();

    await service.selectInput('rev1-in');
    input.emitMessage([0xb2, 0x10, 0x7f], 456.7);

    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe('connected');
    expect(snapshot.selectedInputId).toBe('rev1-in');
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]).toMatchObject({
      bytes: [0xb2, 0x10, 0x7f],
      messageType: 'Control Change',
      channel: 3,
      timestamp: 456.7,
    });
  });

  it('bounds the message history to the most recent forty messages', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    const service = new MidiConnectionService(async () => (
      new FakeAccess(mapOf([input]), mapOf([]))
    ));
    await service.requestAccess();
    await service.selectInput('rev1-in');

    for (let index = 0; index < 45; index += 1) {
      input.emitMessage([0x90, index, 0x7f], index);
    }

    expect(service.getSnapshot().messages).toHaveLength(40);
    expect(service.getSnapshot().messages[0]?.bytes[1]).toBe(44);
  });

  it('recovers when a selected input disconnects and reconnects', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    const access = new FakeAccess(mapOf([input]), mapOf([]));
    const service = new MidiConnectionService(async () => access);
    await service.requestAccess();
    await service.selectInput('rev1-in');
    expect(service.getSnapshot().status).toBe('connected');

    input.setState('disconnected');
    access.emitStateChange();
    expect(service.getSnapshot().status).toBe('disconnected');
    expect(input.listeners.get('midimessage')?.size ?? 0).toBe(0);

    input.setState('connected');
    access.emitStateChange();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getSnapshot().status).toBe('connected');
    expect(input.listeners.get('midimessage')?.size).toBe(1);
  });

  it('removes access and message listeners on dispose', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    const access = new FakeAccess(mapOf([input]), mapOf([]));
    const service = new MidiConnectionService(async () => access);
    await service.requestAccess();
    await service.selectInput('rev1-in');

    service.dispose();

    expect(access.listeners.size).toBe(0);
    expect(input.listeners.get('midimessage')?.size ?? 0).toBe(0);
    expect(input.connection).toBe('closed');
  });

  it('leaves the service in an error state if opening a device fails', async () => {
    const input = new FakePort('rev1-in', 'DDJ-REV1', 'input');
    vi.spyOn(input, 'open').mockRejectedValue(new Error('USB connection lost'));
    const service = new MidiConnectionService(async () => (
      new FakeAccess(mapOf([input]), mapOf([]))
    ));
    await service.requestAccess();

    await service.selectInput('rev1-in');

    expect(service.getSnapshot().status).toBe('error');
    expect(service.getSnapshot().error).toContain('USB connection lost');
  });
});
