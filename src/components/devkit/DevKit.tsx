import { useEffect, useRef, useState } from 'react';
import { ArmAngleMeter } from './widgets/ArmAngleMeter';
import './DevKit.css';
import './widgets/ArmAngleMeter.css';

export interface DevKitProps {
  activeDeckLabel: string;
  activeArmAngle: number;
}

const DEV_WIDGETS = [
  { id: 'arm-angle-meter', label: 'Arm angle meter' },
] as const;
type DevWidgetId = (typeof DEV_WIDGETS)[number]['id'];

/** Development-only menu for diagnostics that must stay outside product UI. */
export function DevKit({ activeDeckLabel, activeArmAngle }: DevKitProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [enabledWidgetIds, setEnabledWidgetIds] = useState<Set<DevWidgetId>>(() => new Set());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstControlRef = useRef<HTMLInputElement | null>(null);

  const setWidgetEnabled = (id: DevWidgetId, enabled: boolean) => {
    setEnabledWidgetIds((current) => {
      const next = new Set(current);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      );

      if (isTypingTarget) return;

      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'd'
      ) {
        // Edge/Chrome reserve Alt+D for the address bar in normal browser windows.
        // Alt+Shift+D is the documented fallback and also works in standalone mode.
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
    if (isOpen) firstControlRef.current?.focus();
  }, [isOpen]);

  return (
    <>
      <aside className="devkit-root" aria-label="Developer tools">
        <button
          ref={triggerRef}
          type="button"
          className="devkit-trigger"
          aria-expanded={isOpen}
          aria-controls="devkit-menu"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="devkit-trigger__light" aria-hidden="true" />
          DEVKIT
        </button>

        {isOpen && (
          <section
            id="devkit-menu"
            className="devkit-menu"
            aria-label="Developer toolkit"
          >
            <div className="devkit-menu__header">
              <strong>DEVELOPER TOOLS</strong>
              <button
                type="button"
                className="devkit-menu__close"
                aria-label="Close developer menu"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="devkit-menu__widgets">
              {DEV_WIDGETS.map((widget) => (
                <label className="devkit-widget-toggle" key={widget.id}>
                  <input
                    ref={widget.id === 'arm-angle-meter' ? firstControlRef : undefined}
                    type="checkbox"
                    checked={enabledWidgetIds.has(widget.id)}
                    onChange={(event) => setWidgetEnabled(widget.id, event.currentTarget.checked)}
                  />
                  <span>{widget.label}</span>
                </label>
              ))}
            </div>
            <p className="devkit-menu__hint">Shortcut: Alt+D · fallback: Alt+Shift+D · Esc closes</p>
          </section>
        )}
      </aside>

      <ArmAngleMeter
        deckLabel={activeDeckLabel}
        armAngle={activeArmAngle}
        isVisible={enabledWidgetIds.has('arm-angle-meter')}
      />
    </>
  );
}
