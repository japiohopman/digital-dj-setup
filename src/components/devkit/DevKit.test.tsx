import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DevKit } from './DevKit';

afterEach(() => cleanup());

describe('DevKit', () => {
  it('starts closed with the arm angle meter hidden', () => {
    render(<DevKit activeDeckLabel="DECK A" activeArmAngle={12.5} />);

    expect(screen.getByRole('button', { name: 'DEVKIT' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Developer toolkit' })).toBeNull();
    expect(screen.queryByTestId('tonearm-angle-readout')).toBeNull();
  });

  it('opens with the Alt+D shortcut and closes with Escape', () => {
    render(<DevKit activeDeckLabel="DECK A" activeArmAngle={12.5} />);

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.getByRole('region', { name: 'Developer toolkit' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Developer toolkit' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'DEVKIT' }));
  });

  it('supports Alt+Shift+D as a fallback shortcut', () => {
    render(<DevKit activeDeckLabel="DECK B" activeArmAngle={22} />);

    fireEvent.keyDown(window, { key: 'd', altKey: true, shiftKey: true });
    expect(screen.getByRole('region', { name: 'Developer toolkit' })).toBeTruthy();
  });

  it('toggles the live arm meter and keeps its measurement controls', () => {
    const { rerender } = render(<DevKit activeDeckLabel="DECK A" activeArmAngle={12} />);

    fireEvent.click(screen.getByRole('button', { name: 'DEVKIT' }));
    fireEvent.click(screen.getByLabelText('Arm angle meter'));

    expect(screen.getByTestId('tonearm-angle-readout').textContent).toBe('12.00°');
    expect(screen.getByLabelText('DECK A tonearm measurement')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Capture groove start angle' }));
    rerender(<DevKit activeDeckLabel="DECK B" activeArmAngle={22} />);
    expect(screen.getByTestId('tonearm-angle-readout').textContent).toBe('22.00°');

    fireEvent.click(screen.getByRole('button', { name: 'Capture groove end angle' }));
    expect(screen.getByTestId('tonearm-start-readout').textContent).toBe('12.00°');
    expect(screen.getByTestId('tonearm-end-readout').textContent).toBe('22.00°');
    expect(screen.getByTestId('tonearm-reach-readout').textContent).toBe('10.00°');

    fireEvent.click(screen.getByLabelText('Arm angle meter'));
    expect(screen.queryByTestId('tonearm-angle-readout')).toBeNull();

    fireEvent.click(screen.getByLabelText('Arm angle meter'));
    expect(screen.getByTestId('tonearm-start-readout').textContent).toBe('12.00°');
    expect(screen.getByTestId('tonearm-end-readout').textContent).toBe('22.00°');
  });
});
