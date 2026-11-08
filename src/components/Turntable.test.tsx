import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DeckTransport } from '../audio/types';
import { Turntable } from './Turntable';

function makeTransport(overrides: Partial<DeckTransport> = {}): DeckTransport {
  return {
    isStylusDown: false,
    trackName: null,
    metadata: null,
    duration: 120,
    currentTime: 0,
    playbackState: 'idle',
    isPlaying: false,
    isLoaded: false,
    error: null,
    loadTrack: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    togglePlayPause: vi.fn().mockResolvedValue(undefined),
    scratch: vi.fn(),
    endScratch: vi.fn(),
    seek: vi.fn(),
    setPlaybackRate: vi.fn(),
    coastDown: vi.fn(),
    cancelCoastDown: vi.fn(),
    spinUp: vi.fn().mockResolvedValue(undefined),
    setStylusContact: vi.fn(),
    setRecordSoundState: vi.fn(),
    playNeedleDropSound: vi.fn(),
    ...overrides,
  };
}

function mountTurntable(transport: DeckTransport, props: { initiallyPowered?: boolean; initiallyMotorOn?: boolean } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Turntable deckLabel="DECK A" transport={transport} {...props} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Turntable deck configuration and isolation', () => {
  it('renders a powered deck with its physical motor running by default', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);
    expect(markup).toContain('class="turntable power-on motor-on has-record"');
    expect(markup).toContain('aria-label="DECK 01 Power" aria-pressed="true"');
    expect(markup).toContain('aria-label="DECK 01 Start / Stop" aria-pressed="true"');
  });

  it('keeps the motor stopped when power is off', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered={false} initiallySpinning />,
    );
    expect(markup).not.toContain('power-on');
    expect(markup).not.toContain('motor-on');
    expect(markup).toContain('disabled=""');
  });

  it('renders a powered deck with the Start/Stop switch off', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered initiallyMotorOn={false} />,
    );
    expect(markup).toContain('class="turntable power-on has-record"');
    expect(markup).toContain('aria-label="DECK 01 Start / Stop" aria-pressed="false"');
  });

  it('renders a slipmat deck without a record', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 02" initiallyHasRecord={false} initiallyHasSlipmat />,
    );
    expect(markup).toContain('has-slipmat');
    expect(markup).not.toContain('has-record');
  });

  it('isolates initial settings between deck instances', () => {
    const deckA = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" initiallyPowered initiallyMotorOn initialSpeed={33} />,
    );
    const deckB = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" initiallyPowered={false} initialSpeed={45} />,
    );
    expect(deckA).toContain('power-on motor-on');
    expect(deckA).toContain('data-speed="33"');
    expect(deckB).not.toContain('power-on');
    expect(deckB).not.toContain('motor-on');
    expect(deckB).toContain('data-speed="45"');
  });
});

describe('Turntable controls and state machine integration', () => {
  it('renders hardware controls, track metadata and an inspectable state trace', () => {
    const transport = makeTransport({
      trackName: 'ahhh-fresh.wav',
      metadata: {
        title: 'ahhh-fresh.wav',
        artist: 'DJ Qbert',
        album: 'Super Seal Breaks',
        artworkUrl: null,
      },
      duration: 180,
      currentTime: 45,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
    });
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={transport} initiallyPowered initiallyMotorOn />,
    );

    expect(markup).toContain('class="deck-audio-panel"');
    expect(markup).toContain('LOAD TRACK');
    expect(markup).toContain('ahhh-fresh.wav');
    expect(markup).toContain('0:45 / 3:00');
    expect(markup).toContain('DECK STATE');
    expect(markup).toContain('PLAYING TRACK');
    expect(markup).toContain('DJ Qbert - ahhh-fresh.wav');
    expect(markup).toContain('motor-on');
    expect(markup).not.toContain('deck-transport-actions');
    expect(markup).not.toContain('>PAUSE<');
    expect(markup).not.toContain('>STOP<');
  });

  it('keeps the platter spinning when audio is paused but the motor switch is on', () => {
    const transport = makeTransport({
      trackName: 'breakbeat.mp3',
      metadata: { title: 'breakbeat.mp3', artist: null, album: null, artworkUrl: null },
      playbackState: 'paused',
      isLoaded: true,
    });
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={transport} initiallyPowered initiallyMotorOn />,
    );
    expect(markup).toContain('motor-on');
    expect(markup).toContain('MUTED');
  });

  it('renders the Technics pitch assembly and accessibility labels', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);
    expect(markup).toContain('DECK 01 Technics-inspired turntable');
    expect(markup).toContain('class="platter"');
    expect(markup).toContain('class="record"');
    expect(markup).toContain('class="tonearm"');
    expect(markup).toContain('aria-label="DECK 01 33 RPM"');
    expect(markup).toContain('aria-label="DECK 01 45 RPM"');
    expect(markup).toContain('aria-label="DECK 01 Target light"');
    expect(markup).toContain('aria-label="DECK 01 Pitch Control"');
    expect(markup).toContain('aria-label="DECK 01 pitch slider"');
    expect(markup).toContain('aria-label="DECK 01 Reset pitch to 0%"');
    expect(markup).toContain('PITCH ADJ.');
    expect(markup).toContain('pitch-reset-btn locked');
    expect(markup).toContain('/turntable/landscape/tt_case_and_lighting.png');
  });

  it('shows embedded cover artwork when the loaded track has metadata art', () => {
    const transport = makeTransport({
      trackName: 'champion-sound.flac',
      metadata: {
        title: 'Champion Sound',
        artist: 'Jaylib',
        album: 'Champion Sound',
        artworkUrl: 'blob:http://localhost:5173/mock-art-uuid',
      },
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
    });
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={transport} initiallyPowered initiallyMotorOn />,
    );
    expect(markup).toContain('class="record-artwork"');
    expect(markup).toContain('blob:http://localhost:5173/mock-art-uuid');
    expect(markup).toContain('class="artwork-center-hole"');
  });

  it('shows the track decoding error from the state machine', () => {
    const transport = makeTransport({ error: 'Failed to decode audio: corrupted file' });
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK B" transport={transport} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Failed to decode audio: corrupted file');
  });

  it('loads a track without automatically starting playback', async () => {
    const transport = makeTransport();
    const view = mountTurntable(transport, { initiallyPowered: true, initiallyMotorOn: true });
    const fileInput = view.container.querySelector('input.deck-file-input') as HTMLInputElement;
    const file = new File(['audio-binary'], 'fresh_cut.wav', { type: 'audio/wav' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(transport.loadTrack).toHaveBeenCalledWith(file);
    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.spinUp).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('Transportpaused');
    expect(view.container.textContent).toContain('TRACK_LOAD_SUCCEEDED');
    view.unmount();
  });

  it('loads an audio file dropped onto the record without creating a second play route', async () => {
    const transport = makeTransport();
    const view = mountTurntable(transport, { initiallyPowered: true, initiallyMotorOn: true });
    const record = view.container.querySelector('.record-holder') as HTMLDivElement;
    const file = new File(['audio-binary'], 'dj_battle_tool.mp3', { type: 'audio/mp3' });
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });

    await act(async () => record.dispatchEvent(event));

    expect(transport.loadTrack).toHaveBeenCalledWith(file);
    expect(transport.play).not.toHaveBeenCalled();
    view.unmount();
  });

  it('uses the physical Start/Stop switch as the only transport stop control', () => {
    const transport = makeTransport({
      trackName: 'anthem.wav',
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
    });
    const view = mountTurntable(transport);
    expect(view.container.querySelector('.deck-transport-actions')).toBeNull();
    expect(view.container.querySelector('button[aria-label="DECK A Play"]')).toBeNull();
    expect(view.container.querySelector('button[aria-label="DECK A Pause"]')).toBeNull();
    expect(view.container.querySelector('button[aria-label="DECK A Stop"]')).toBeNull();

    const startStop = view.container.querySelector('button[aria-label="DECK A Start / Stop"]') as HTMLButtonElement;
    act(() => startStop.click());
    expect(transport.pause).toHaveBeenCalledWith(250);
    view.unmount();
  });

  it('coasts on power-off and restores torque when power returns during coast', () => {
    const transport = makeTransport({
      trackName: 'anthem.wav',
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
    });
    const view = mountTurntable(transport);
    const power = view.container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;

    act(() => power.click());
    expect(transport.coastDown).toHaveBeenCalledWith(1200);
    act(() => power.click());
    expect(transport.cancelCoastDown).toHaveBeenCalledOnce();

    view.unmount();
  });
});
