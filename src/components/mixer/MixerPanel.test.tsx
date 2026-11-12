import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MixerPanel } from './MixerPanel';
import type { MixerAudioGraph } from '../../audio/MixerAudioGraph';

describe('MixerPanel', () => {
  afterEach(cleanup);
  it('routes channel fader and crossfader changes through the audio graph', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
      getMasterLevel: vi.fn(() => 1),
      getMeterLevels: vi.fn(() => ({ a: 0, b: 0, master: 0 })),
      setDeckEq: vi.fn(),
      setMasterLevel: vi.fn(),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
      setCrossfaderCutLag: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Deck A channel level' }), {
      target: { value: '65' },
    });
    expect(audioGraph.setChannelLevel).toHaveBeenCalledWith('a', 0.65);

    fireEvent.change(screen.getByRole('slider', { name: 'Deck B channel level' }), {
      target: { value: '40' },
    });
    expect(audioGraph.setChannelLevel).toHaveBeenCalledWith('b', 0.4);

    fireEvent.change(screen.getByRole('slider', { name: 'Crossfader position' }), {
      target: { value: '20' },
    });
    expect(audioGraph.setCrossfaderPosition).toHaveBeenCalledWith(0.2);
    fireEvent.change(screen.getByRole('slider', { name: 'Crossfader position' }), {
      target: { value: '50' },
    });

    const rotaryControls = screen.getByRole('group', { name: 'Mixer rotary controls' });
    const cutIn = within(rotaryControls).getByRole('slider', { name: 'Crossfader cut lag' });
    fireEvent.change(cutIn, {
      target: { value: '35' },
    });
    expect(audioGraph.setCrossfaderCutLag).toHaveBeenCalledWith(0.35);
    expect(
      screen.getByRole('slider', { name: 'Crossfader position' }).getAttribute('aria-valuetext'),
    ).toBe('Center, both Deck A and Deck B');
  });

  it('routes master output changes to the final gain control', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
      getMasterLevel: vi.fn(() => 1),
      getMeterLevels: vi.fn(() => ({ a: 0, b: 0, master: 0 })),
      setDeckEq: vi.fn(),
      setMasterLevel: vi.fn(),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
      setCrossfaderCutLag: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Master output level' }), {
      target: { value: '65' },
    });
    expect(audioGraph.setMasterLevel).toHaveBeenCalledWith(0.65);
    expect(audioGraph.setChannelLevel).not.toHaveBeenCalled();
  });

  it('opens the EQ panel, adjusts each deck independently and restores focus on Escape', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
      getMasterLevel: vi.fn(() => 1),
      getMeterLevels: vi.fn(() => ({ a: 0, b: 0, master: 0 })),
      setDeckEq: vi.fn(),
      setMasterLevel: vi.fn(),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
      setCrossfaderCutLag: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    const trigger = screen.getByRole('button', { name: 'EQ' });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Three-band EQ' })).toBeTruthy();

    fireEvent.change(screen.getByRole('slider', { name: 'Deck A LOW EQ' }), {
      target: { value: '-6' },
    });
    expect(audioGraph.setDeckEq).toHaveBeenCalledWith('a', 'low', -6);

    fireEvent.change(screen.getByRole('slider', { name: 'Deck B HIGH EQ' }), {
      target: { value: '5' },
    });
    expect(audioGraph.setDeckEq).toHaveBeenCalledWith('b', 'high', 5);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Deck A EQ' }));
    expect(audioGraph.setDeckEq).toHaveBeenCalledWith('a', 'low', 0);
    expect(audioGraph.setDeckEq).toHaveBeenCalledWith('a', 'mid', 0);
    expect(audioGraph.setDeckEq).toHaveBeenCalledWith('a', 'high', 0);
    expect(audioGraph.setDeckEq).not.toHaveBeenCalledWith('b', 'high', 0);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Three-band EQ' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('exposes three real signal meters with accessible decibel readouts', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
      getMasterLevel: vi.fn(() => 1),
      getMeterLevels: vi.fn(() => ({ a: 0.25, b: 0.5, master: 0.75 })),
      setDeckEq: vi.fn(),
      setMasterLevel: vi.fn(),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
      setCrossfaderCutLag: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    expect(screen.getByRole('meter', { name: 'A signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'MASTER signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'B signal level' })).toBeTruthy();

    const channelLayout = document.querySelector('.mixer-panel__channels');
    expect(channelLayout?.children.item(0)?.querySelector('[aria-label="Deck A channel level"]')).toBeTruthy();
    expect(channelLayout?.children.item(1)?.querySelector('[aria-label="MASTER signal level"]')).toBeTruthy();
    expect(channelLayout?.children.item(2)?.querySelector('[aria-label="Deck B channel level"]')).toBeTruthy();
  });

  it('keeps quiet finite signals consistent across meter readout and ARIA values', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
      getMasterLevel: vi.fn(() => 1),
      getMeterLevels: vi.fn(() => ({ a: 0.002, b: 0.25, master: 0.25 })),
      setDeckEq: vi.fn(),
      setMasterLevel: vi.fn(),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
      setCrossfaderCutLag: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    const quietMeter = screen.getByRole('meter', { name: 'A signal level' });
    expect(quietMeter.getAttribute('aria-valuenow')).toBe('-54');
    expect(quietMeter.getAttribute('aria-valuetext')).toBe('-54 dB');
    expect(quietMeter.textContent).toContain('-54 dB');
  });
});
