import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceMenu } from './WorkspaceMenu';

describe('WorkspaceMenu', () => {
  afterEach(cleanup);

  it('opens the shared track-loader area and closes with Escape', () => {
    const onTrackControlsTargetChange = vi.fn();
    const { container } = render(
      <WorkspaceMenu onTrackControlsTargetChange={onTrackControlsTargetChange} />,
    );

    const trigger = screen.getByRole('button', { name: 'Open workspace tools' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(screen.getByText('TRACK LOADERS')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(onTrackControlsTargetChange).toHaveBeenLastCalledWith(
      container.querySelector('.workspace-menu__track-loaders'),
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Open workspace tools' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles from the Alt+D workspace shortcut', () => {
    render(<WorkspaceMenu onTrackControlsTargetChange={() => undefined} />);

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.getByRole('button', { name: 'Close workspace tools' }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.getByRole('button', { name: 'Open workspace tools' }).getAttribute('aria-expanded')).toBe('false');
  });
});
