import { useEffect, useRef, useState, type ReactNode } from 'react';

import './WorkspaceMenu.css';

export interface WorkspaceMenuProps {
  /** Receives the shared portal target used by each deck's existing track-loader panel. */
  onTrackControlsTargetChange: (target: HTMLDivElement | null) => void;
  children?: ReactNode;
}

/** One compact workspace menu for deck track loaders and development tools. */
export function WorkspaceMenu({
  onTrackControlsTargetChange,
  children,
}: WorkspaceMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    /** Handles the shared workspace shortcut without intercepting normal text entry. */
    const handleKeyDown = (event: KeyboardEvent) => {
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
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    /** Closes the popover when a pointer interaction starts outside the workspace menu. */
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, []);

  return (
    <div className="workspace-menu" ref={rootRef}>
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

      <div
        id="workspace-tools-menu"
        className="workspace-menu__popover"
        aria-label="Workspace tools"
        hidden={!isOpen}
      >
        <section className="workspace-menu__section" aria-label="Track loaders">
          <div className="workspace-menu__section-heading">
            <strong>TRACK LOADERS</strong>
            <span>DECK A / B</span>
          </div>
          <div
            className="workspace-menu__track-loaders"
            ref={onTrackControlsTargetChange}
          />
        </section>
        {children}
        <p className="workspace-menu__hint">Alt+D · Esc closes</p>
      </div>
    </div>
  );
}
