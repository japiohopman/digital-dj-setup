import { useState } from 'react';

import { ArmAngleMeter } from './widgets/ArmAngleMeter';
import { DeckStateTrace } from './widgets/DeckStateTrace';
import type { DeckDiagnosticsSnapshot } from './types';
import './DevKit.css';
import './widgets/ArmAngleMeter.css';
import './widgets/DeckStateTrace.css';

export interface DevKitProps {
  activeDeckLabel: string;
  activeArmAngle: number;
  activeDeckDiagnostics?: DeckDiagnosticsSnapshot | undefined;
}

const DEV_WIDGETS = [
  { id: 'arm-angle-meter', label: 'Arm angle meter' },
  { id: 'deck-state-trace', label: 'Deck state trace' },
] as const;
type DevWidgetId = (typeof DEV_WIDGETS)[number]['id'];

/** Renders developer diagnostics as a section inside the shared workspace tools menu. */
export function DevKit({
  activeDeckLabel,
  activeArmAngle,
  activeDeckDiagnostics,
}: DevKitProps) {
  const [enabledWidgetIds, setEnabledWidgetIds] = useState<Set<DevWidgetId>>(() => new Set());

  /** Adds or removes one diagnostic overlay without changing deck state. */
  const setWidgetEnabled = (id: DevWidgetId, enabled: boolean) => {
    setEnabledWidgetIds((current) => {
      const next = new Set(current);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <aside className="devkit-root" aria-label="Developer tools">
      <section className="devkit-menu devkit-menu--embedded" aria-label="Developer toolkit">
        <div className="devkit-menu__header">
          <strong>DEVKIT</strong>
          <span>DIAGNOSTICS</span>
        </div>
        <div className="devkit-menu__widgets">
          {DEV_WIDGETS.map((widget) => (
            <label className="devkit-widget-toggle" key={widget.id}>
              <input
                type="checkbox"
                checked={enabledWidgetIds.has(widget.id)}
                onChange={(event) => setWidgetEnabled(widget.id, event.currentTarget.checked)}
              />
              <span>{widget.label}</span>
            </label>
          ))}
        </div>
      </section>

      <ArmAngleMeter
        deckLabel={activeDeckLabel}
        armAngle={activeArmAngle}
        isVisible={enabledWidgetIds.has('arm-angle-meter')}
      />
      {enabledWidgetIds.has('deck-state-trace') && activeDeckDiagnostics && (
        <DeckStateTrace deckLabel={activeDeckLabel} snapshot={activeDeckDiagnostics} />
      )}
    </aside>
  );
}
