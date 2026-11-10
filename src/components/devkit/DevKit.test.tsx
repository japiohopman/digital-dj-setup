import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DevKit } from './DevKit';

afterEach(() => cleanup());

describe('DevKit', () => {
  it('renders diagnostic options as an embedded workspace-menu section', () => {
    render(<DevKit activeDeckLabel="DECK A" activeArmAngle={12.5} />);

    expect(screen.getByRole('region', { name: 'Developer toolkit' })).toBeTruthy();
    expect(screen.getByText('DEVKIT')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Arm angle meter' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Deck state trace' })).toBeTruthy();
    expect(screen.queryByTestId('tonearm-angle-readout')).toBeNull();
  });

  it('toggles the live arm meter and retains its measurement controls', () => {
    const { rerender } = render(<DevKit activeDeckLabel="DECK A" activeArmAngle={12} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Arm angle meter' }));

    expect(screen.getByTestId('tonearm-angle-readout').textContent).toBe('12.00°');
    expect(screen.getByLabelText('DECK A tonearm measurement')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Capture groove start angle' }));
    rerender(<DevKit activeDeckLabel="DECK B" activeArmAngle={22} />);
    expect(screen.getByTestId('tonearm-angle-readout').textContent).toBe('22.00°');

    fireEvent.click(screen.getByRole('button', { name: 'Capture groove end angle' }));
    expect(screen.getByTestId('tonearm-start-readout').textContent).toBe('12.00°');
    expect(screen.getByTestId('tonearm-end-readout').textContent).toBe('22.00°');
    expect(screen.getByTestId('tonearm-reach-readout').textContent).toBe('10.00°');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Arm angle meter' }));
    expect(screen.queryByTestId('tonearm-angle-readout')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Arm angle meter' }));
    expect(screen.getByTestId('tonearm-start-readout').textContent).toBe('12.00°');
    expect(screen.getByTestId('tonearm-end-readout').textContent).toBe('22.00°');
  });

  it('shows the active deck state trace only when its widget toggle is enabled', () => {
    const snapshot = {
      power: 'on' as const,
      motorPhase: 'running' as const,
      tonearm: 'needle-down' as const,
      track: 'ready' as const,
      transport: 'playing' as const,
      isAudible: true,
      trace: [{
        at: 1,
        event: 'ARM_DROPPED' as const,
        accepted: true,
        reason: 'valid lead-in drop',
      }],
    };

    render(<DevKit activeDeckLabel="DECK B" activeArmAngle={18} activeDeckDiagnostics={snapshot} />);

    expect(document.body.querySelector('[data-dev-widget="deck-state-trace"]')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deck state trace' }));

    expect(screen.getByRole('region', { name: 'DECK B state trace' })).toBeTruthy();
    fireEvent.click(screen.getByText(/DECK B STATE/));
    expect(document.body.querySelector('[data-dev-widget="deck-state-trace"]')?.textContent).toContain('valid lead-in drop');
  });
});
