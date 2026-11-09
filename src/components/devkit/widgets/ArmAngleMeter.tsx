import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ArmAngleMeterProps {
  deckLabel: string;
  armAngle: number;
}

/** Renders live tonearm calibration in a body portal, outside the deck layout. */
export function ArmAngleMeter({ deckLabel, armAngle }: ArmAngleMeterProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [measuredGrooveStart, setMeasuredGrooveStart] = useState<number | null>(null);
  const [measuredGrooveEnd, setMeasuredGrooveEnd] = useState<number | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const armMeterPercent = (angle: number) => Math.max(0, Math.min(100, (angle / 49) * 100));
  const measuredGrooveReach = measuredGrooveStart !== null && measuredGrooveEnd !== null
    ? measuredGrooveEnd - measuredGrooveStart
    : null;

  if (!portalTarget) return null;

  return createPortal(
    <section
      className="tonearm-meter-panel"
      data-dev-widget="tonearm-angle-meter"
      aria-label={deckLabel + ' tonearm measurement'}
    >
      <div className="tonearm-meter-heading">
        <div>
          <span className="tonearm-meter-title">{deckLabel} · TONEARM DEV</span>
          <span className="tonearm-meter-subtitle">0° = arm in the rest cradle</span>
        </div>
        <output
          className="tonearm-meter-live"
          data-testid="tonearm-angle-readout"
          aria-label="Current tonearm angle"
          aria-live="polite"
        >
          {armAngle.toFixed(2)}°
        </output>
      </div>

      <div
        className="tonearm-meter-scale"
        role="img"
        aria-label={'Arm angle ' + armAngle.toFixed(2) + ' degrees on a scale from 0 to 49 degrees'}
      >
        <div className="tonearm-meter-track" />
        {measuredGrooveStart !== null && (
          <span
            className="tonearm-meter-marker start"
            style={{ left: armMeterPercent(measuredGrooveStart) + '%' }}
            title={'Beginpunt: ' + measuredGrooveStart.toFixed(2) + '°'}
          />
        )}
        {measuredGrooveEnd !== null && (
          <span
            className="tonearm-meter-marker end"
            style={{ left: armMeterPercent(measuredGrooveEnd) + '%' }}
            title={'Eindpunt: ' + measuredGrooveEnd.toFixed(2) + '°'}
          />
        )}
        <span
          className="tonearm-meter-marker current"
          style={{ left: armMeterPercent(armAngle) + '%' }}
        />
      </div>

      <div className="tonearm-meter-ticks" aria-hidden="true">
        {[0, 10, 20, 30, 40, 49].map((degree) => (
          <span key={degree} style={{ left: armMeterPercent(degree) + '%' }}>{degree}°</span>
        ))}
      </div>

      <div className="tonearm-meter-readings">
        <div>
          <span>Groove start</span>
          <output data-testid="tonearm-start-readout">
            {measuredGrooveStart === null ? '—' : measuredGrooveStart.toFixed(2) + '°'}
          </output>
        </div>
        <div>
          <span>Groove end</span>
          <output data-testid="tonearm-end-readout">
            {measuredGrooveEnd === null ? '—' : measuredGrooveEnd.toFixed(2) + '°'}
          </output>
        </div>
        <div className="tonearm-meter-reach">
          <span>Arm reach</span>
          <output data-testid="tonearm-reach-readout">
            {measuredGrooveReach === null ? '—' : measuredGrooveReach.toFixed(2) + '°'}
          </output>
        </div>
      </div>

      <div className="tonearm-meter-actions">
        <button
          type="button"
          className="tonearm-meter-button"
          onClick={() => {
            setMeasuredGrooveStart(Number(armAngle.toFixed(2)));
            setMeasuredGrooveEnd(null);
          }}
          aria-label="Capture groove start angle"
        >
          Capture groove start angle
        </button>
        <button
          type="button"
          className="tonearm-meter-button"
          onClick={() => setMeasuredGrooveEnd(Number(armAngle.toFixed(2)))}
          aria-label="Capture groove end angle"
        >
          Capture groove end angle
        </button>
        <button
          type="button"
          className="tonearm-meter-clear"
          onClick={() => {
            setMeasuredGrooveStart(null);
            setMeasuredGrooveEnd(null);
          }}
          aria-label="Clear measurement"
          disabled={measuredGrooveStart === null && measuredGrooveEnd === null}
        >
          Clear measurement
        </button>
      </div>
    </section>,
    portalTarget,
  );
}
