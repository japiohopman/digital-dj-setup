import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { DeckTransport } from '../audio/types';
import { Turntable } from './Turntable';

describe('Turntable deck configuration and isolation', () => {
  it('renders a fully powered and spinning deck by default', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('class="turntable power-on motor-on has-record"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('disabled=""');
  });

  it('renders unpowered state with controls disabled', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered={false} initiallySpinning />,
    );

    // Motor should not be on if unpowered
    expect(markup).not.toContain('power-on');
    expect(markup).not.toContain('motor-on');
    // Interactive buttons disabled
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('disabled=""');
  });

  it('renders powered deck with motor stopped', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered initiallyMotorOn={false} />,
    );

    expect(markup).toContain('class="turntable power-on has-record"');
    expect(markup).not.toContain('motor-on');
  });

  it('renders slipmat deck state without vinyl record when configured', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 02" initiallyHasRecord={false} initiallyHasSlipmat />,
    );

    expect(markup).toContain('has-slipmat');
    expect(markup).not.toContain('has-record');
  });

  it('isolates initial configuration between independent deck instances', () => {
    const deckAMarkup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" initiallyPowered initiallyMotorOn initialSpeed={33} />,
    );
    const deckBMarkup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" initiallyPowered={false} initialSpeed={45} />,
    );

    expect(deckAMarkup).toContain('DECK A');
    expect(deckAMarkup).toContain('power-on motor-on');
    expect(deckAMarkup).toContain('data-speed="33"');

    expect(deckBMarkup).toContain('DECK B');
    expect(deckBMarkup).not.toContain('power-on');
    expect(deckBMarkup).not.toContain('motor-on');
    expect(deckBMarkup).toContain('data-speed="45"');
  });
});

describe('Turntable static markup', () => {
  it('renders the main hardware elements and accessible controls', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('DECK 01 Technics-inspired turntable');
    expect(markup).toContain('class="platter"');
    expect(markup).toContain('class="record"');
    expect(markup).toContain('class="tonearm"');
    expect(markup).toContain('aria-label="DECK 01 Power"');
    expect(markup).toContain('aria-label="DECK 01 Start / Stop"');
    expect(markup).toContain('aria-label="DECK 01 33 RPM"');
    expect(markup).toContain('aria-label="DECK 01 45 RPM"');
    expect(markup).toContain('aria-label="DECK 01 Target light"');
    expect(markup).toContain('aria-label="DECK 01 Pitch Control"');
    expect(markup).toContain('aria-label="DECK 01 pitch slider"');
    expect(markup).toContain('aria-label="DECK 01 Reset pitch to 0%"');
    expect(markup).toContain('class="pitch-track"');
    expect(markup).toContain('class="pitch-knob"');
    expect(markup).toContain('/turntable/landscape/tt_case_and_lighting.png');
  });

  it('renders realistic pitch assembly with scale markers and 0.0% quartz lock', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK A" />);

    expect(markup).toContain('PITCH ADJ.');
    expect(markup).toContain('+8');
    expect(markup).toContain('-8');
    expect(markup).toContain('RESET');
    expect(markup).toContain('0.0%');
    expect(markup).toContain('pitch-reset-btn locked');
  });

  it('supports a reusable deck label, model and initial speed', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" modelName="SL-1210 MK2" initialSpeed={45} />,
    );

    expect(markup).toContain('DECK B');
    expect(markup).toContain('SL-1210 MK2');
    expect(markup).toContain('data-speed="45"');
    expect(markup).toContain('45 RPM');
  });

  it('does not start the platter when the deck is initially powered off', () => {
    const markup = renderToStaticMarkup(
      <Turntable initiallyPowered={false} initiallySpinning />,
    );

    expect(markup).not.toContain('motor-on');
    expect(markup).toContain('disabled=""');
  });

  it('renders track transport controls and metadata when transport is provided', () => {
    const mockTransport: DeckTransport = {
      trackName: 'ahhh-fresh.wav',
      duration: 180,
      currentTime: 45,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />,
    );

    expect(markup).toContain('class="deck-audio-panel"');
    expect(markup).toContain('LOAD TRACK');
    expect(markup).toContain('ahhh-fresh.wav');
    expect(markup).toContain('0:45 / 3:00');
    expect(markup).toContain('PAUSE');
    expect(markup).toContain('STOP');
    // Platter is spinning because audio is playing
    expect(markup).toContain('motor-on');
  });

  it('does not spin platter when track is paused even if motor button is active', () => {
    const mockTransport: DeckTransport = {
      trackName: 'breakbeat.mp3',
      duration: 120,
      currentTime: 10,
      playbackState: 'paused',
      isPlaying: false,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />,
    );

    // Motor class should not be present because track is loaded but paused
    expect(markup).not.toContain('motor-on');
    expect(markup).toContain('PLAY');
  });

  it('displays decoding error in the audio panel', () => {
    const mockTransport: DeckTransport = {
      trackName: null,
      duration: 0,
      currentTime: 0,
      playbackState: 'idle',
      isPlaying: false,
      isLoaded: false,
      error: 'Failed to decode audio: corrupted file',
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" transport={mockTransport} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Failed to decode audio: corrupted file');
  });
});
