import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeckDiagnosticsSnapshot } from '../types';

export interface DeckStateTraceProps {
  deckLabel: string;
  snapshot: DeckDiagnosticsSnapshot;
}

/** Shows the latest per-deck state-machine decisions in a development-only portal. */
export function DeckStateTrace({ deckLabel, snapshot }: DeckStateTraceProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!portalTarget) return null;

  const summary = [
    snapshot.power.toUpperCase(),
    snapshot.motorPhase.toUpperCase(),
    snapshot.tonearm.toUpperCase(),
  ].join(' / ');

  return createPortal(
    <section
      className="deck-state-trace-panel"
      data-dev-widget="deck-state-trace"
      aria-label={deckLabel + ' state trace'}
    >
      <details className="deck-state-trace">
        <summary>{deckLabel} STATE · {summary}</summary>
        <dl>
          <div><dt>Track</dt><dd>{snapshot.track}</dd></div>
          <div><dt>Transport</dt><dd>{snapshot.transport}</dd></div>
          <div><dt>Output</dt><dd>{snapshot.isAudible ? 'AUDIBLE' : 'MUTED'}</dd></div>
        </dl>
        <ol>
          {snapshot.trace.slice(-8).map((entry, index) => (
            <li key={entry.at + '-' + index} data-accepted={entry.accepted}>
              <span>{entry.event}</span> — {entry.reason}
            </li>
          ))}
        </ol>
      </details>
    </section>,
    portalTarget,
  );
}
