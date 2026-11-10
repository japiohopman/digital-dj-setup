import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

import './WorkspaceMenu.css';

export type WorkspaceDeckId = 'a' | 'b';

export interface BattleAmmoTrack {
  readonly id: string;
  readonly title: string;
  readonly filename: string;
  readonly path: string;
}

export const BATTLE_AMMO_TRACKS = [
  {
    id: 'scratch-making-me-itch',
    title: 'Scratch Making Me Itch',
    filename: 'scratch_making_me_itch.mp3',
    path: 'sounds/battle_amo/scratch_making_me_itch.mp3',
  },
  {
    id: 'super-duck-breaks',
    title: 'Super Duck Breaks',
    filename: 'super_duck_breaks.mp3',
    path: 'sounds/battle_amo/super_duck_breaks.mp3',
  },
] as const satisfies readonly BattleAmmoTrack[];

export interface WorkspaceMenuProps {
  /** Receives the shared portal target used by each deck's existing local-file loader. */
  onTrackControlsTargetChange: (target: HTMLDivElement | null) => void;
  /** Loads one app-owned crate track into exactly the selected deck. */
  onLoadBundledTrack?: (deck: WorkspaceDeckId, track: BattleAmmoTrack) => Promise<void>;
  /** Bundled crate entries shown in the first shared library view. */
  tracks?: readonly BattleAmmoTrack[];
  children?: ReactNode;
}

/** One shared, full-screen crate browser above the live DJ workspace. */
export function WorkspaceMenu({
  onTrackControlsTargetChange,
  onLoadBundledTrack,
  tracks = BATTLE_AMMO_TRACKS,
  children,
}: WorkspaceMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [targetDeck, setTargetDeck] = useState<WorkspaceDeckId>('a');
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    /** Keeps keyboard focus inside the library while it is open. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    /** Keeps the workspace shortcut available without intercepting ordinary text entry. */
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      );

      if (isTypingTarget) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setIsOpen(false);
  };

  const handleLoadTrack = async (track: BattleAmmoTrack) => {
    if (!onLoadBundledTrack) {
      setLoadError('The deck loader is not connected yet. Close the library and try again.');
      return;
    }

    setLoadingTrackId(track.id);
    setLoadError(null);
    setLoadMessage(null);
    try {
      await onLoadBundledTrack(targetDeck, track);
      setLoadMessage(track.title + ' loaded to Deck ' + targetDeck.toUpperCase() + '. Ready at the start; playback has not started.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The track could not be loaded.');
    } finally {
      setLoadingTrackId(null);
    }
  };

  const overlayMarkup = (
        <div
          id="workspace-tools-menu"
          className="workspace-menu__popover"
          hidden={!isOpen}
          onClick={handleOverlayClick}
        >
        <section
          className="workspace-menu__dialog"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-library-title"
        >
          <header className="workspace-menu__header">
            <div className="workspace-menu__brand">
              <span className="workspace-menu__eyebrow">DIGITAL DJ SETUP / RECORD LIBRARY</span>
              <h2 id="workspace-library-title">Track crates</h2>
              <p>Pick a record. Choose a deck. Drop the needle when you're ready.</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="workspace-menu__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close track library"
            >
              <span aria-hidden="true">×</span>
              <span>CLOSE</span>
            </button>
          </header>

          <div className="workspace-menu__body">
            <aside className="workspace-menu__sidebar" aria-label="Crate collection">
              <span className="workspace-menu__section-label">YOUR CRATES</span>
              <div className="workspace-menu__crate-card" aria-current="true">
                <span className="workspace-menu__crate-art" aria-hidden="true">
                  <span>BA</span>
                  <i />
                </span>
                <span className="workspace-menu__crate-copy">
                  <strong>BATTLE AMMO</strong>
                  <small>{tracks.length.toString().padStart(2, '0')} TRACKS · STARTER CRATE</small>
                </span>
                <span className="workspace-menu__crate-chevron" aria-hidden="true">›</span>
              </div>
              <p className="workspace-menu__sidebar-note">
                More crates can live here as the library grows.
              </p>
            </aside>

            <main className="workspace-menu__main">
              <div className="workspace-menu__crate-heading">
                <div>
                  <span className="workspace-menu__section-label">BATTLE SERIES / VOLUME 01</span>
                  <h3>BATTLE AMMO</h3>
                  <p>Scratch tools, breaks and battle-ready sounds.</p>
                </div>
                <span className="workspace-menu__track-count">{tracks.length.toString().padStart(2, '0')} CUTS</span>
              </div>

              <div className="workspace-menu__target-row">
                <span className="workspace-menu__section-label">LOAD TO DECK</span>
                <div className="workspace-menu__deck-target" role="group" aria-label="Choose target deck">
                  <button
                    type="button"
                    aria-pressed={targetDeck === 'a'}
                    onClick={() => setTargetDeck('a')}
                  >
                    <span>01</span> DECK A
                  </button>
                  <button
                    type="button"
                    aria-pressed={targetDeck === 'b'}
                    onClick={() => setTargetDeck('b')}
                  >
                    <span>02</span> DECK B
                  </button>
                </div>
              </div>

              <div className="workspace-menu__track-list" aria-label="Battle Ammo tracks">
                {tracks.map((track, index) => (
                  <article className="workspace-menu__track-row" key={track.id}>
                    <span className="workspace-menu__track-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="workspace-menu__record-icon" aria-hidden="true">◉</span>
                    <span className="workspace-menu__track-info">
                      <strong>{track.title}</strong>
                      <small>{track.filename} <span aria-hidden="true">·</span> MP3</small>
                    </span>
                    <button
                      type="button"
                      className="workspace-menu__load-button"
                      onClick={() => void handleLoadTrack(track)}
                      disabled={loadingTrackId !== null}
                      aria-label={'Load ' + track.title + ' to Deck ' + targetDeck.toUpperCase()}
                    >
                      {loadingTrackId === track.id ? 'LOADING…' : 'LOAD TO ' + targetDeck.toUpperCase()}
                    </button>
                  </article>
                ))}
              </div>

              <div className="workspace-menu__load-feedback" role="status" aria-live="polite">
                {loadError || loadMessage || 'Tracks are loaded stopped at the start. Nothing plays until you press start.'}
              </div>

              <section className="workspace-menu__local-section" aria-labelledby="workspace-local-title">
                <div className="workspace-menu__local-heading">
                  <div>
                    <span className="workspace-menu__section-label">YOUR OWN MUSIC</span>
                    <h4 id="workspace-local-title">Load from device</h4>
                  </div>
                  <span>LOCAL FILES · NOT UPLOADED</span>
                </div>
                <div
                  className="workspace-menu__track-loaders"
                  ref={onTrackControlsTargetChange}
                />
              </section>

              {children && <div className="workspace-menu__utilities">{children}</div>}
            </main>
          </div>
          <footer className="workspace-menu__footer">
            <span>◎ BATTLE AMMO · BUILT-IN STARTER CRATE</span>
            <span>ALT + D TOGGLE <i aria-hidden="true">·</i> ESC TO CLOSE</span>
          </footer>
        </section>
        </div>
  );

  return (
    <div className="workspace-menu">
      <button
        ref={triggerRef}
        type="button"
        className="workspace-menu__trigger"
        aria-label={isOpen ? 'Close workspace tools' : 'Open workspace tools'}
        aria-expanded={isOpen}
        aria-controls="workspace-tools-menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="workspace-menu__trigger-icon" aria-hidden="true">☰</span>
        <span>TOOLS</span>
        <span className="workspace-menu__trigger-caret" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>

      {portalTarget ? createPortal(overlayMarkup, portalTarget) : overlayMarkup}
    </div>
  );
}
