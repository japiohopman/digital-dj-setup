import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MixerPanel } from './MixerPanel';
import type { MixerAudioGraph } from '../../audio/MixerAudioGraph';

const createAudioGraph = (meterLevels = { a: 0, b: 0, master: 0 }) => ({
  getChannelLevel: vi.fn(() => 1),
  getCrossfaderPosition: vi.fn(() => 0.5),
  getCrossfaderCutLag: vi.fn(() => 0),
  getDeckEq: vi.fn(() => ({ low: 0, mid: 0, high: 0 })),
  getMasterLevel: vi.fn(() => 1),
  getMeterLevels: vi.fn(() => meterLevels),
  setDeckEq: vi.fn(),
  setMasterLevel: vi.fn(),
  setChannelLevel: vi.fn(),
  setCrossfaderPosition: vi.fn(),
  setCrossfaderCutLag: vi.fn(),
}) as unknown as MixerAudioGraph;

describe('MixerPanel', () => {
  afterEach(cleanup);

  it('routes channel fader and crossfader changes through the audio graph', () => {
    const audioGraph = createAudioGraph();
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

    const cutIn = screen.getByRole('slider', { name: 'Crossfader cut lag' });
    fireEvent.change(cutIn, { target: { value: '35' } });
    expect(audioGraph.setCrossfaderCutLag).toHaveBeenCalledWith(0.35);
    expect(screen.getByRole('slider', { name: 'Crossfader position' }).getAttribute('aria-valuetext'))
      .toBe('Center, both Deck A and Deck B');
  });

  it('routes master output changes to the final gain control', () => {
    const audioGraph = createAudioGraph();
    render(<MixerPanel audioGraph={audioGraph} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Master output level' }), {
      target: { value: '65' },
    });
    expect(audioGraph.setMasterLevel).toHaveBeenCalledWith(0.65);
    expect(audioGraph.setChannelLevel).not.toHaveBeenCalled();
  });

  it('renders six independent rotary EQ controls directly in the faceplate', () => {
    const audioGraph = createAudioGraph();
    render(<MixerPanel audioGraph={audioGraph} />);

    const deckABank = document.querySelector('.mixer-eq-bank--a');
    const deckBBank = document.querySelector('.mixer-eq-bank--b');
    expect(deckABank?.querySelectorAll('input[type="range"]')).toHaveLength(3);
    expect(deckBBank?.querySelectorAll('input[type="range"]')).toHaveLength(3);
    expect(deckABank?.querySelector('.mixer-eq-bank__controls--vertical')).toBeTruthy();
    expect(deckBBank?.querySelector('.mixer-eq-bank__controls--vertical')).toBeTruthy();

    expect(screen.getByRole('img', {
      name: 'Deck A TRIM bypassed; input passes at unity gain',
    })).toBeTruthy();
    expect(screen.getByRole('img', {
      name: 'Deck B TRIM bypassed; input passes at unity gain',
    })).toBeTruthy();
    expect(deckABank?.querySelector('.mixer-rotary--trim-placeholder input')).toBeNull();
    expect(deckBBank?.querySelector('.mixer-rotary--trim-placeholder input')).toBeNull();

    for (const name of [
      'Deck A LOW EQ',
      'Deck A MID EQ',
      'Deck A HIGH EQ',
      'Deck B LOW EQ',
      'Deck B MID EQ',
      'Deck B HIGH EQ',
    ]) {
      expect(screen.getByRole('slider', { name })).toBeTruthy();
    }

    expect(screen.queryByRole('button', { name: 'EQ' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('routes each EQ band independently and resets only the selected deck', () => {
    const audioGraph = createAudioGraph();
    render(<MixerPanel audioGraph={audioGraph} />);

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
  });

  it('stacks MASTER above CUT-IN in the right utility column', () => {
    const audioGraph = createAudioGraph();
    render(<MixerPanel audioGraph={audioGraph} />);

    const utility = document.querySelector('.mixer-utility');
    const controls = utility?.querySelectorAll('.mixer-rotary');
    expect(controls).toHaveLength(2);
    expect(controls?.item(0)?.classList.contains('mixer-rotary--master')).toBe(true);
    expect(controls?.item(1)?.classList.contains('mixer-rotary--cut-in')).toBe(true);
  });

  it('exposes three real, full-height signal meters between the channel faders', () => {
    const audioGraph = createAudioGraph({ a: 0.25, b: 0.5, master: 0.75 });
    render(<MixerPanel audioGraph={audioGraph} />);

    expect(screen.getByRole('meter', { name: 'A signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'MASTER signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'B signal level' })).toBeTruthy();

    const channelLayout = document.querySelector('.mixer-panel__channels');
    expect(channelLayout?.children.item(0)?.querySelector('[aria-label="Deck A channel level"]')).toBeTruthy();
    expect(channelLayout?.children.item(1)?.querySelector('[aria-label="MASTER signal level"]')).toBeTruthy();
    expect(channelLayout?.children.item(2)?.querySelector('[aria-label="Deck B channel level"]')).toBeTruthy();
    expect(document.querySelector('.mixer-meter-bridge__meters')).toBeTruthy();
  });

  it('keeps quiet finite signals consistent across meter readout and ARIA values', () => {
    const audioGraph = createAudioGraph({ a: 0.002, b: 0.25, master: 0.25 });
    render(<MixerPanel audioGraph={audioGraph} />);

    const quietMeter = screen.getByRole('meter', { name: 'A signal level' });
    expect(quietMeter.getAttribute('aria-valuenow')).toBe('-54');
    expect(quietMeter.getAttribute('aria-valuetext')).toBe('-54 dB');
    expect(quietMeter.textContent).toContain('-54 dB');
  });
});
