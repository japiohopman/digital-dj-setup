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
      getMeterLevels: vi.fn(() => ({ a: 0, b: 0, master: 0 })),
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

  it('exposes three real signal meters with accessible decibel readouts', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getCrossfaderCutLag: vi.fn(() => 0),
      getMeterLevels: vi.fn(() => ({ a: 0.25, b: 0.5, master: 0.75 })),
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
});
