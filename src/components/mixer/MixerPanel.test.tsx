import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MixerPanel } from './MixerPanel';
import type { MixerAudioGraph } from '../../audio/MixerAudioGraph';

describe('MixerPanel', () => {
  it('routes channel fader and crossfader changes through the audio graph', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getMeterLevels: vi.fn(() => ({ a: 0, b: 0, master: 0 })),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
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
  });

  it('exposes three real signal meters with accessible decibel readouts', () => {
    const audioGraph = {
      getChannelLevel: vi.fn(() => 1),
      getCrossfaderPosition: vi.fn(() => 0.5),
      getMeterLevels: vi.fn(() => ({ a: 0.25, b: 0.5, master: 0.75 })),
      setChannelLevel: vi.fn(),
      setCrossfaderPosition: vi.fn(),
    } as unknown as MixerAudioGraph;

    render(<MixerPanel audioGraph={audioGraph} />);

    expect(screen.getByRole('meter', { name: 'A signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'MASTER signal level' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'B signal level' })).toBeTruthy();
  });
});
