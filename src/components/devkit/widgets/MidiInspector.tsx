import { useEffect, useState } from 'react';

import { MidiConnectionService } from '../../../hardware/midi/MidiConnectionService';
import type { MidiInspectorStatus, MidiMessageRecord } from '../../../hardware/midi/types';

import './MidiInspector.css';

const STATUS_LABELS: Record<MidiInspectorStatus, string> = {
  idle: 'NOT CONNECTED',
  requesting: 'REQUESTING BROWSER PERMISSION',
  unsupported: 'WEB MIDI UNAVAILABLE',
  denied: 'PERMISSION DENIED',
  ready: 'MIDI ACCESS READY',
  connecting: 'OPENING INPUT PORT',
  connected: 'INPUT CONNECTED',
  disconnected: 'INPUT DISCONNECTED',
  error: 'MIDI ERROR',
};

function formatBytes(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function formatTimestamp(message: MidiMessageRecord): string {
  return `${message.timestamp.toFixed(1)} ms`;
}

/** Read-only raw MIDI monitor. It never dispatches messages to the DJ workspace. */
export function MidiInspector() {
  const [service] = useState(() => new MidiConnectionService());
  const [snapshot, setSnapshot] = useState(service.getSnapshot);

  useEffect(() => {
    const unsubscribe = service.subscribe(() => setSnapshot(service.getSnapshot()));
    setSnapshot(service.getSnapshot());
    return () => {
      unsubscribe();
      service.dispose();
    };
  }, [service]);

  return (
    <section className="midi-inspector" aria-label="MIDI inspector">
      <header className="midi-inspector__header">
        <div>
          <strong>MIDI INSPECTOR</strong>
          <span>RAW INPUT · PHASE 0</span>
        </div>
        <span className={`midi-inspector__status is-${snapshot.status}`} role="status">
          {STATUS_LABELS[snapshot.status]}
        </span>
      </header>

      {!snapshot.accessGranted && (
        <div className="midi-inspector__permission">
          <p>Request browser MIDI permission to inspect the connected controller. Nothing is mapped to deck or mixer actions.</p>
          <button
            type="button"
            onClick={() => void service.requestAccess()}
            disabled={snapshot.status === 'requesting'}
          >
            {snapshot.status === 'requesting' ? 'REQUESTING…' : 'REQUEST MIDI ACCESS'}
          </button>
        </div>
      )}

      {snapshot.error && <p className="midi-inspector__error" role="alert">{snapshot.error}</p>}

      {snapshot.accessGranted && (
        <>
          <label className="midi-inspector__select">
            <span>INPUT PORT</span>
            <select
              value={snapshot.selectedInputId}
              onChange={(event) => void service.selectInput(event.currentTarget.value)}
            >
              <option value="">Choose a MIDI input…</option>
              {snapshot.inputs.map((port) => (
                <option value={port.id} key={port.id} disabled={port.state !== 'connected'}>
                  {[port.manufacturer, port.name].filter(Boolean).join(' — ')}
                  {` · ID ${port.id}`}
                  {port.state === 'disconnected' ? ' (disconnected)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="midi-inspector__ports">
            <span>INPUTS {snapshot.inputs.length}</span>
            <span>OUTPUTS {snapshot.outputs.length}</span>
          </div>
          {snapshot.outputs.length > 0 && (
            <ul className="midi-inspector__outputs" aria-label="Available MIDI outputs">
              {snapshot.outputs.map((port) => (
                <li key={port.id}>
                  {port.manufacturer ? `${port.manufacturer} — ` : ''}{port.name} · ID {port.id}
                </li>
              ))}
            </ul>
          )}

          <div className="midi-inspector__capture-heading">
            <strong>INCOMING MESSAGES</strong>
            <span>{snapshot.messages.length} / 40</span>
          </div>
          {snapshot.messages.length === 0 ? (
            <p className="midi-inspector__empty">
              {snapshot.status === 'connected'
                ? 'Move one physical control on the DDJ-REV1 to capture its MIDI message.'
                : 'Select a connected input port to start listening.'}
            </p>
          ) : (
            <ol className="midi-inspector__messages" aria-label="Recent MIDI messages">
              {snapshot.messages.map((message) => (
                <li key={message.id}>
                  <time>{formatTimestamp(message)}</time>
                  <code>{formatBytes(message.bytes)}</code>
                  <span>{message.messageType}{message.channel === null ? '' : ` · CH ${message.channel}`}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="midi-inspector__note">Raw inspection only. No transport, scratching, tonearm or mixer controls are triggered.</p>
        </>
      )}
    </section>
  );
}
