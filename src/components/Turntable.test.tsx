import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { DeckTransport } from '../audio/types';
import { Turntable } from './Turntable';

describe('Turntable deck configuration and isolation', () => {
  it('renders a fully powered and spinning deck by default', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('class="turntable power-on motor-on has-slipmat"');
    expect(markup).not.toContain('has-record');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="DECK 01 Start / Stop" aria-pressed="true"');
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

    expect(markup).toContain('class="turntable power-on has-slipmat"');
    expect(markup).not.toContain('has-record');
    expect(markup).not.toContain('motor-on');
  });

  it('renders slipmat deck state without vinyl record when configured', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 02" initiallyHasRecord={false} initiallyHasSlipmat />,
    );

    expect(markup).toContain('has-slipmat');
    expect(markup).not.toContain('has-record');
  });

  it('shows the slipmat by default when no track is loaded', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('has-slipmat');
    expect(markup).not.toContain('has-record');
    expect(markup).toContain('tonearm-tube-target');
    expect(markup).toContain('data-tonearm-grip="arm"');
    expect(markup).toContain('data-tonearm-grip="cartridge"');
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
    expect(markup).toContain('aria-label="DECK 01 tonearm measurement"');
    expect(markup).toContain('aria-live="polite">0.00°</output>');
    expect(markup).toContain('aria-label="DECK 01 Capture groove start angle"');
    expect(markup).toContain('aria-label="DECK 01 Capture groove end angle"');
    expect(markup).toContain('data-testid="tonearm-reach-readout">—</output>');
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
      isStylusDown: false,
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
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />,
    );

    expect(markup).toContain('class="deck-audio-panel"');
    expect(markup).toContain('LOAD TRACK');
    expect(markup).toContain('ahhh-fresh.wav');
    expect(markup).toContain('0:45 / 3:00');
    // Center record label displays track name and duration
    expect(markup).toContain('PLAYING TRACK');
    expect(markup).toContain('DJ Qbert - ahhh-fresh.wav');
    // Platter is spinning because audio is playing
    expect(markup).toContain('motor-on');
  });

  it('renders embedded cover artwork on the rotating record when available', () => {
    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'champion-sound.flac',
      metadata: {
        title: 'Champion Sound',
        artist: 'Jaylib',
        album: 'Champion Sound',
        artworkUrl: 'blob:http://localhost:5173/mock-art-uuid',
      },
      duration: 150,
      currentTime: 30,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />,
    );

    expect(markup).toContain('class="record-artwork"');
    expect(markup).toContain('blob:http://localhost:5173/mock-art-uuid');
    expect(markup).toContain('class="artwork-center-hole"');
  });

  it('does not spin platter when track is paused even if motor button is active', () => {
    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'breakbeat.mp3',
      metadata: {
        title: 'breakbeat.mp3',
        artist: null,
        album: null,
        artworkUrl: null,
      },
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
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />,
    );

    expect(markup).toContain('class="deck-audio-panel"');
  });

  it('displays decoding error in the audio panel', () => {
    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: null,
      metadata: null,
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
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" transport={mockTransport} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Failed to decode audio: corrupted file');
  });
});

// Configure React 18/19 testing environment flag to silence act warning in vitest jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from 'react-dom/client';
import { act } from 'react';

describe('Turntable interactive controls', () => {
  it('triggers loadTrack and play on file input change', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
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
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(<Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />);
    });

    const fileInput = container.querySelector('input.deck-file-input') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    const file = new File(['audio-binary'], 'fresh_cut.wav', { type: 'audio/wav' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockTransport.loadTrack).toHaveBeenCalledWith(file);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('triggers loadTrack on drag and drop onto the record platter', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
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
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(<Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />);
    });

    const recordHolder = container.querySelector('.record-holder') as HTMLDivElement;
    expect(recordHolder).toBeDefined();

    const file = new File(['audio-binary'], 'dj_battle_tool.mp3', { type: 'audio/mp3' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [file],
      },
    });

    await act(async () => {
      recordHolder.dispatchEvent(dropEvent);
    });

    expect(mockTransport.loadTrack).toHaveBeenCalledWith(file);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('handles play, pause, and stop button clicks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'anthem.wav',
      metadata: null,
      duration: 180,
      currentTime: 20,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(<Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />);
    });

    // Platter start/stop toggles motor and playback
    const startStopBtn = container.querySelector('button[aria-label="DECK A Start / Stop"]') as HTMLButtonElement;
    expect(startStopBtn).toBeDefined();
    await act(async () => {
      startStopBtn.click();
    });
    expect(mockTransport.pause).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('power switch initiates coastDown when turned off during playback', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'anthem.wav',
      metadata: null,
      duration: 180,
      currentTime: 20,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(<Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />);
    });

    const powerDial = container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;
    expect(powerDial).toBeDefined();
    await act(async () => {
      powerDial.click();
    });

    expect(mockTransport.coastDown).toHaveBeenCalledWith(1200);

    // Power restored while still coasting: should call cancelCoastDown
    await act(async () => {
      powerDial.click();
    });
    expect(mockTransport.cancelCoastDown).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('START/STOP button acts as immediate Play/Pause with no coast-down', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'anthem.wav',
      metadata: null,
      duration: 180,
      currentTime: 20,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(<Turntable deckLabel="DECK A" transport={mockTransport} initiallyPowered initiallyMotorOn />);
    });

    const startStopBtn = container.querySelector('button[aria-label="DECK A Start / Stop"]') as HTMLButtonElement;
    expect(startStopBtn).toBeDefined();

    // Click START/STOP while playing -> immediate pause
    await act(async () => {
      startStopBtn.click();
    });

    expect(mockTransport.pause).toHaveBeenCalled();
    expect(mockTransport.coastDown).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('triggers spinUp when Power is turned ON from fully stopped state with motor active', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'spinup-deck.wav',
      metadata: null,
      duration: 180,
      currentTime: 25,
      playbackState: 'paused',
      isPlaying: false,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn().mockResolvedValue(undefined),
      setStylusContact: vi.fn(),
    };

    // Initially powered OFF, but motor active
    await act(async () => {
      root.render(
        <Turntable
          deckLabel="DECK A"
          transport={mockTransport}
          initiallyPowered={false}
          initiallyMotorOn={true}
        />,
      );
    });

    const tonearm = container.querySelector('.tonearm') as HTMLElement;
    await act(async () => {
      for (let step = 0; step < 12; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    const powerDial = container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;
    expect(powerDial).toBeDefined();

    // Valid outer-lead-in drop is queued while power is off; powering on then spins up audio.
    await act(async () => {
      powerDial.click();
    });

    // Should call spinUp(450) preserving track position
    expect(mockTransport.spinUp).toHaveBeenCalledWith(450);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('retains motor intent across full coast-down and triggers spinUp on subsequent Power ON', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'power-cycle.wav',
      metadata: null,
      duration: 200,
      currentTime: 40,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn().mockResolvedValue(undefined),
      setStylusContact: vi.fn(),
    };

    // Deck initially powered ON and motor ON
    await act(async () => {
      root.render(
        <Turntable
          deckLabel="DECK A"
          transport={mockTransport}
          initiallyPowered={true}
          initiallyMotorOn={true}
        />,
      );
    });

    const powerDial = container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;
    expect(powerDial).toBeDefined();

    const tonearm = container.querySelector('.tonearm') as HTMLElement;
    await act(async () => {
      for (let step = 0; step < 12; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    // 1. Turn power OFF -> starts coastDown
    await act(async () => {
      powerDial.click();
    });
    expect(mockTransport.coastDown).toHaveBeenCalledWith(1200);

    // 2. Advance time past the 1200ms coast duration to reach fully stopped state
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    const turntableElem = container.querySelector('.turntable');
    expect(turntableElem?.classList.contains('coasting')).toBe(false);

    // 3. Turn power ON from fully stopped -> must call spinUp(450) because motor intent was retained!
    await act(async () => {
      powerDial.click();
    });

    expect(mockTransport.spinUp).toHaveBeenCalledWith(450);
    expect(turntableElem?.classList.contains('spinning-up')).toBe(true);

    // 4. Advance 450ms -> should complete spinUp and enter driven state
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(turntableElem?.classList.contains('spinning-up')).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('does NOT trigger spinUp on Power ON if motor was explicitly disengaged before power-off', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'power-cycle-stopped.wav',
      metadata: null,
      duration: 200,
      currentTime: 40,
      playbackState: 'paused',
      isPlaying: false,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn().mockResolvedValue(undefined),
      setStylusContact: vi.fn(),
    };

    // Deck initially powered ON but motor disengaged
    await act(async () => {
      root.render(
        <Turntable
          deckLabel="DECK A"
          transport={mockTransport}
          initiallyPowered={true}
          initiallyMotorOn={false}
        />,
      );
    });

    const powerDial = container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;

    // Power OFF
    await act(async () => {
      powerDial.click();
    });

    // Advance past coast duration
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    // Power ON
    await act(async () => {
      powerDial.click();
    });

    // Should NOT call spinUp since motor was disengaged
    expect(mockTransport.spinUp).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('accelerates platter only without audio calls when Power ON from stopped with no track loaded', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: null,
      metadata: null,
      duration: 0,
      currentTime: 0,
      playbackState: 'idle',
      isPlaying: false,
      isLoaded: false,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    await act(async () => {
      root.render(
        <Turntable
          deckLabel="DECK A"
          transport={mockTransport}
          initiallyPowered={false}
          initiallyMotorOn={true}
        />,
      );
    });

    const powerDial = container.querySelector('button[aria-label="DECK A Power"]') as HTMLButtonElement;
    await act(async () => {
      powerDial.click();
    });

    // No track loaded -> spinUp audio not called, but platter enters spinning-up
    expect(mockTransport.spinUp).not.toHaveBeenCalled();
    const turntableElem = container.querySelector('.turntable');
    expect(turntableElem?.classList.contains('spinning-up')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(turntableElem?.classList.contains('spinning-up')).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('prevents stylus contact unmute when deck has no record', async () => {
    const mockTransport = {
      trackName: 'breakbeat.mp3',
      metadata: null,
      duration: 120,
      currentTime: 10,
      playbackState: 'playing' as const,
      isPlaying: true,
      isLoaded: true,
      isStylusDown: false,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Turntable
          deckLabel="DECK NO-RECORD"
          initiallyHasRecord={false}
          transport={mockTransport}
        />,
      );
    });

    const tonearm = container.querySelector('.tonearm') as HTMLElement;
    expect(tonearm).not.toBeNull();

    await act(async () => {
      for (let step = 0; step < 12; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    // The stylus reaches the outer lead-in, but a missing record keeps program audio muted.
    expect(mockTransport.setStylusContact).not.toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('unmutes program audio on a valid outer-lead-in drop when a record is present', async () => {
    const mockTransport: DeckTransport = {
      isStylusDown: false,
      trackName: 'breakbeat.mp3',
      metadata: null,
      duration: 120,
      currentTime: 10,
      playbackState: 'playing',
      isPlaying: true,
      isLoaded: true,
      error: null,
      loadTrack: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      togglePlayPause: vi.fn(),
      scratch: vi.fn(),
      endScratch: vi.fn(),
      seek: vi.fn(),
      setPlaybackRate: vi.fn(),
      coastDown: vi.fn(),
      cancelCoastDown: vi.fn(),
      spinUp: vi.fn(),
      setStylusContact: vi.fn(),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Turntable deckLabel="DECK WITH RECORD" transport={mockTransport} />);
    });

    const tonearm = container.querySelector('.tonearm') as HTMLElement;
    await act(async () => {
      for (let step = 0; step < 12; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(mockTransport.setStylusContact).toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('captures live tonearm angles and calculates the measured groove reach', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Turntable deckLabel="MEASURE" />);
    });

    const tonearm = container.querySelector('.tonearm') as HTMLElement;
    const startButton = document.body.querySelector(
      'button[aria-label="MEASURE Capture groove start angle"]',
    ) as HTMLButtonElement;
    const endButton = document.body.querySelector(
      'button[aria-label="MEASURE Capture groove end angle"]',
    ) as HTMLButtonElement;
    expect(container.querySelector('[data-dev-widget="tonearm-angle-meter"]')).toBeNull();
    expect(document.body.querySelector('[data-dev-widget="tonearm-angle-meter"]')).not.toBeNull();

    await act(async () => {
      for (let step = 0; step < 6; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
    });
    expect(document.body.querySelector('[data-testid="tonearm-angle-readout"]')?.textContent).toBe('12.00°');

    await act(async () => {
      startButton.click();
    });
    expect(document.body.querySelector('[data-testid="tonearm-start-readout"]')?.textContent).toBe('12.00°');

    await act(async () => {
      for (let step = 0; step < 5; step++) {
        tonearm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
    });
    await act(async () => {
      endButton.click();
    });

    expect(document.body.querySelector('[data-testid="tonearm-angle-readout"]')?.textContent).toBe('22.00°');
    expect(document.body.querySelector('[data-testid="tonearm-end-readout"]')?.textContent).toBe('22.00°');
    expect(document.body.querySelector('[data-testid="tonearm-reach-readout"]')?.textContent).toBe('10.00°');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
