import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceMenu } from './WorkspaceMenu';

describe('WorkspaceMenu', () => {
  afterEach(cleanup);

  it('opens the full-screen library and closes with Escape while restoring focus', () => {
    const onTrackControlsTargetChange = vi.fn();
    render(
      <WorkspaceMenu
        onTrackControlsTargetChange={onTrackControlsTargetChange}
        onLoadBundledTrack={vi.fn(async () => undefined)}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open track library' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Track crates' })).toBeTruthy();
    expect(screen.getAllByText('BATTLE AMMO').length).toBeGreaterThan(0);
    expect(screen.getByText('Scratch Making Me Itch')).toBeTruthy();
    expect(screen.getByText('Super Duck Breaks')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(onTrackControlsTargetChange).toHaveBeenLastCalledWith(
      document.querySelector('.workspace-menu__track-loaders'),
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Track crates' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open track library' }).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('loads a bundled track only into the selected deck', async () => {
    const onLoadBundledTrack = vi.fn(async () => undefined);
    render(
      <WorkspaceMenu
        onTrackControlsTargetChange={() => undefined}
        onLoadBundledTrack={onLoadBundledTrack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open track library' }));
    fireEvent.click(screen.getByRole('button', { name: '02 DECK B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Super Duck Breaks to Deck B' }));

    expect(onLoadBundledTrack).toHaveBeenCalledWith('b', expect.objectContaining({
      id: 'super-duck-breaks',
      filename: 'super_duck_breaks.mp3',
    }));
    expect(await screen.findByText(/Super Duck Breaks loaded to Deck B/)).toBeTruthy();
  });

  it('keeps the Alt+D shortcut available for opening and closing the overlay', () => {
    render(<WorkspaceMenu onTrackControlsTargetChange={() => undefined} />);

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.getByRole('dialog', { name: 'Track crates' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.queryByRole('dialog', { name: 'Track crates' })).toBeNull();
  });
});
