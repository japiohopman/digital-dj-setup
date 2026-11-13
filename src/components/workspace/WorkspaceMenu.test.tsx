import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceMenu } from './WorkspaceMenu';

describe('WorkspaceMenu', () => {
  afterEach(cleanup);

  it('uses the registered album crate SVG in the overlay trigger', () => {
    render(<WorkspaceMenu onTrackControlsTargetChange={() => undefined} />);

    const trigger = screen.getByRole('button', { name: 'Open workspace tools' });
    const icon = trigger.querySelector('img.workspace-menu__trigger-icon');

    expect(icon?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}icons/UI/album_crate.svg`);
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.textContent).not.toContain('☰');
  });

  it('opens the full-screen library and closes with Escape while restoring focus', () => {
    const onTrackControlsTargetChange = vi.fn();
    render(
      <WorkspaceMenu
        onTrackControlsTargetChange={onTrackControlsTargetChange}
        onLoadBundledTrack={vi.fn(async () => undefined)}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open workspace tools' });
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
    expect(screen.getByRole('button', { name: 'Open workspace tools' }).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('shows deck choices under the selected track and loads it only into the chosen deck', async () => {
    const onLoadBundledTrack = vi.fn(async () => undefined);
    render(
      <WorkspaceMenu
        onTrackControlsTargetChange={() => undefined}
        onLoadBundledTrack={onLoadBundledTrack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace tools' }));

    expect(screen.queryByRole('group', { name: 'Choose target deck' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Load Super Duck Breaks to a deck' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose a deck for Super Duck Breaks' }));
    expect(screen.getByRole('group', { name: 'Load Super Duck Breaks to a deck' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load Super Duck Breaks to Deck B' }));
    expect(onLoadBundledTrack).toHaveBeenNthCalledWith(1, 'b', expect.objectContaining({
      id: 'super-duck-breaks',
      filename: 'super_duck_breaks.mp3',
    }));
    expect(await screen.findByText(/Super Duck Breaks loaded to Deck B/)).toBeTruthy();

    // The same expanded track remains available for loading into the other deck.
    fireEvent.click(screen.getByRole('button', { name: 'Load Super Duck Breaks to Deck A' }));
    expect(onLoadBundledTrack).toHaveBeenNthCalledWith(2, 'a', expect.objectContaining({
      id: 'super-duck-breaks',
      filename: 'super_duck_breaks.mp3',
    }));
    expect(await screen.findByText(/Super Duck Breaks loaded to Deck A/)).toBeTruthy();
  });

  it('moves the inline deck choice to the track that was selected', () => {
    render(
      <WorkspaceMenu
        onTrackControlsTargetChange={() => undefined}
        onLoadBundledTrack={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose a deck for Scratch Making Me Itch' }));

    expect(screen.getByRole('group', { name: 'Load Scratch Making Me Itch to a deck' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Choose a deck for Super Duck Breaks' }));

    expect(screen.queryByRole('group', { name: 'Load Scratch Making Me Itch to a deck' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Load Super Duck Breaks to a deck' })).toBeTruthy();
  });

  it('keeps the Alt+D shortcut available for opening and closing the overlay', () => {
    render(<WorkspaceMenu onTrackControlsTargetChange={() => undefined} />);

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.getByRole('dialog', { name: 'Track crates' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'd', altKey: true });
    expect(screen.queryByRole('dialog', { name: 'Track crates' })).toBeNull();
  });
});
