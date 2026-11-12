import { useEffect, useRef, useState, type MouseEvent } from 'react';

import {
  MixerAudioGraph,
  type MixerDeckId,
  type MixerDeckEq,
  type MixerEqBand,
  type MixerMeterLevels,
} from '../../audio/MixerAudioGraph';
import './MixerPanel.css';

export interface MixerPanelProps {
  /** App-owned audio graph; the panel never manipulates Web Audio nodes directly. */
  audioGraph: MixerAudioGraph;
}

const METER_SEGMENTS = 12;
const METER_FLOOR_DB = -60;
const EQ_BANDS: readonly MixerEqBand[] = ['low', 'mid', 'high'];
const MIXER_DECKS: readonly MixerDeckId[] = ['a', 'b'];

const formatEqGain = (gainDb: number): string =>
  gainDb > 0 ? '+' + String(gainDb) : String(gainDb);

/** Converts a normalized RMS meter level into a display-safe decibel value. */
const toDecibels = (level: number): number =>
  level <= 0.0001 ? -60 : Math.max(-60, Math.min(0, 20 * Math.log10(level)));

/** Renders one accessible RMS meter and its matching visual segments. */
function MixerMeter({ label, level, className = '' }: {
  label: string;
  level: number;
  className?: string;
}) {
  const decibels = toDecibels(level);
  const activeSegments = Math.max(
    0,
    Math.min(METER_SEGMENTS, Math.ceil((decibels - METER_FLOOR_DB) / 4)),
  );
  const readout = decibels <= METER_FLOOR_DB ? '−∞' : String(Math.round(decibels)) + ' dB';

  return (
    <div
      className={'mixer-meter ' + className}
      role="meter"
      aria-label={label + ' signal level'}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={Math.max(-60, Math.round(decibels))}
      aria-valuetext={readout}
    >
      <span className="mixer-meter__label">{label}</span>
      <div className="mixer-meter__segments" aria-hidden="true">
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={[
              'mixer-meter__segment',
              index < activeSegments ? 'is-active' : '',
              index >= 10 ? 'is-hot' : '',
            ].filter(Boolean).join(' ')}
          />
        ))}
      </div>
      <span className="mixer-meter__readout">{readout}</span>
    </div>
  );
}

/**
 * Two-channel mixer faceplate inspired by the Vestax PMC-05 Pro III.
 *
 * Provides independent deck levels, an equal-power crossfader and live RMS
 * meters. The graph owns all audio-node changes and remains lazy until playback.
 */
export function MixerPanel({ audioGraph }: MixerPanelProps) {
  const [channelLevels, setChannelLevels] = useState<Record<MixerDeckId, number>>({
    a: audioGraph.getChannelLevel('a'),
    b: audioGraph.getChannelLevel('b'),
  });
  const [crossfaderPercent, setCrossfaderPercent] = useState(
    Math.round(audioGraph.getCrossfaderPosition() * 100),
  );
  const [cutLagPercent, setCutLagPercent] = useState(
    Math.round(audioGraph.getCrossfaderCutLag() * 100),
  );
  const [meterLevels, setMeterLevels] = useState<MixerMeterLevels>(
    () => audioGraph.getMeterLevels(),
  );
  const [deckEq, setDeckEq] = useState<Record<MixerDeckId, MixerDeckEq>>({
    a: audioGraph.getDeckEq('a'),
    b: audioGraph.getDeckEq('b'),
  });
  const [masterLevelPercent, setMasterLevelPercent] = useState(
    Math.round(audioGraph.getMasterLevel() * 100),
  );
  const [isEqOpen, setIsEqOpen] = useState(false);
  const eqTriggerRef = useRef<HTMLButtonElement | null>(null);
  const eqCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const eqDialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const next = audioGraph.getMeterLevels();
      const meterNoiseFloor = 0.002;
      setMeterLevels((current) => {
        const changed = Math.abs(current.a - next.a) >= meterNoiseFloor ||
          Math.abs(current.b - next.b) >= meterNoiseFloor ||
          Math.abs(current.master - next.master) >= meterNoiseFloor;
        return changed ? next : current;
      });
    }, 80);
    return () => window.clearInterval(intervalId);
  }, [audioGraph]);

  useEffect(() => {
    if (!isEqOpen) return;

    eqCloseButtonRef.current?.focus();

    /** Keeps keyboard focus inside the EQ panel and supports Escape to close. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsEqOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = eqDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])',
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
      eqTriggerRef.current?.focus();
    };
  }, [isEqOpen]);

  /** Updates one channel EQ band without touching deck transport or tonearm state. */
  const updateDeckEq = (deckId: MixerDeckId, band: MixerEqBand, gainDb: number) => {
    const nextGain = Math.max(-12, Math.min(12, gainDb));
    setDeckEq((current) => ({
      ...current,
      [deckId]: { ...current[deckId], [band]: nextGain },
    }));
    audioGraph.setDeckEq(deckId, band, nextGain);
  };

  /** Resets only the selected deck's equalizer to a flat response. */
  const resetDeckEq = (deckId: MixerDeckId) => {
    setDeckEq((current) => ({
      ...current,
      [deckId]: { low: 0, mid: 0, high: 0 },
    }));
    EQ_BANDS.forEach((band) => audioGraph.setDeckEq(deckId, band, 0));
  };

  /** Changes the final output gain; it does not alter either deck's channel state. */
  const updateMasterLevel = (percent: number) => {
    const nextPercent = Math.max(0, Math.min(100, percent));
    setMasterLevelPercent(nextPercent);
    audioGraph.setMasterLevel(nextPercent / 100);
  };

  /** Closes the EQ panel only when the user clicks its backdrop. */
  const handleEqOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setIsEqOpen(false);
  };

  /** Updates one deck's mixer gain without changing its transport state. */
  const updateChannelLevel = (deckId: MixerDeckId, percent: number) => {
    const level = Math.max(0, Math.min(100, percent)) / 100;
    setChannelLevels((current) => ({ ...current, [deckId]: level }));
    audioGraph.setChannelLevel(deckId, level);
  };

  /** Updates the A-to-B crossfader position in the shared audio graph. */
  const updateCrossfader = (percent: number) => {
    const nextPercent = Math.max(0, Math.min(100, percent));
    setCrossfaderPercent(nextPercent);
    audioGraph.setCrossfaderPosition(nextPercent / 100);
  };

  /** Sets the symmetric silent travel zone at the two ends of the crossfader. */
  const updateCutLag = (percent: number) => {
    const nextPercent = Math.max(0, Math.min(100, percent));
    setCutLagPercent(nextPercent);
    audioGraph.setCrossfaderCutLag(nextPercent / 100);
  };

  const crossfaderValueText = crossfaderPercent === 0
    ? 'Hard left, Deck A only'
    : crossfaderPercent === 100
      ? 'Hard right, Deck B only'
      : crossfaderPercent === 50
        ? 'Center, both Deck A and Deck B'
        : String(crossfaderPercent) + '% from Deck A to Deck B';

  const cutLagValueText = cutLagPercent === 0
    ? 'Minimum cut lag; audio starts as soon as the fader leaves either end'
    : String(cutLagPercent) + '% cut lag; symmetric muted zones for the incoming deck at both ends';

  return (
    <section className="mixer-panel" id="mixer-panel" aria-label="Digital DJ mixer">
      <header className="mixer-panel__header" role="group" aria-label="Mixer rotary controls">
        <div className="mixer-cut-control mixer-cut-control--header">
          <label className="mixer-cut-control__label" htmlFor="mixer-cut-lag">CUT-IN</label>
          <div className="mixer-cut-control__dial">
            <input
              id="mixer-cut-lag"
              className="mixer-cut-control__input"
              type="range"
              min="0"
              max="100"
              step="1"
              value={cutLagPercent}
              onChange={(event) => updateCutLag(Number(event.target.value))}
              aria-label="Crossfader cut lag"
              aria-valuetext={cutLagValueText}
            />
            <span className="mixer-cut-control__face" aria-hidden="true">
              <i style={{ transform: `rotate(${cutLagPercent * 2.7 - 135}deg)` }} />
            </span>
          </div>
          <output htmlFor="mixer-cut-lag">
            {cutLagPercent === 0 ? 'MIN' : String(cutLagPercent) + '%'}
          </output>
        </div>

        <div className="mixer-cut-control mixer-cut-control--header mixer-master-control">
          <label className="mixer-cut-control__label" htmlFor="mixer-master-level">MASTER</label>
          <div className="mixer-cut-control__dial">
            <input
              id="mixer-master-level"
              className="mixer-cut-control__input"
              type="range"
              min="0"
              max="100"
              step="1"
              value={masterLevelPercent}
              onChange={(event) => updateMasterLevel(Number(event.target.value))}
              aria-label="Master output level"
              aria-valuetext={String(masterLevelPercent) + '% of maximum output'}
            />
            <span className="mixer-cut-control__face" aria-hidden="true">
              <i style={{ transform: `rotate(${masterLevelPercent * 2.7 - 135}deg)` }} />
            </span>
          </div>
          <output htmlFor="mixer-master-level">{masterLevelPercent}%</output>
        </div>

        <div className="mixer-eq-trigger-control">
          <span className="mixer-cut-control__label">CHANNEL EQ</span>
          <button
            ref={eqTriggerRef}
            type="button"
            className="mixer-eq-trigger"
            aria-haspopup="dialog"
            aria-expanded={isEqOpen}
            aria-controls="mixer-eq-dialog"
            onClick={() => setIsEqOpen(true)}
          >
            EQ
          </button>
        </div>
      </header>

      <div className="mixer-panel__faceplate">
        <div className="mixer-panel__channels">
          <section className="mixer-channel mixer-channel--a" aria-label="Deck A channel">
            <div className="mixer-channel__identity">
              <span className="mixer-channel__number">01</span>
              <strong>DECK A</strong>
            </div>
            <label className="mixer-channel__fader">
              <span className="mixer-channel__fader-label">LEVEL</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(channelLevels.a * 100)}
                onChange={(event) => updateChannelLevel('a', Number(event.target.value))}
                aria-label="Deck A channel level"
                aria-orientation="vertical"
              />
              <span className="mixer-channel__value">{Math.round(channelLevels.a * 100)}%</span>
            </label>
          </section>

          <section className="mixer-meter-bridge" aria-label="Live signal meters">
            <div className="mixer-meter-bridge__meters">
              <MixerMeter label="A" level={meterLevels.a} className="mixer-meter--a" />
              <MixerMeter label="MASTER" level={meterLevels.master} className="mixer-meter--master" />
              <MixerMeter label="B" level={meterLevels.b} className="mixer-meter--b" />
            </div>
          </section>

          <section className="mixer-channel mixer-channel--b" aria-label="Deck B channel">
            <div className="mixer-channel__identity">
              <span className="mixer-channel__number">02</span>
              <strong>DECK B</strong>
            </div>
            <label className="mixer-channel__fader">
              <span className="mixer-channel__fader-label">LEVEL</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(channelLevels.b * 100)}
                onChange={(event) => updateChannelLevel('b', Number(event.target.value))}
                aria-label="Deck B channel level"
                aria-orientation="vertical"
              />
              <span className="mixer-channel__value">{Math.round(channelLevels.b * 100)}%</span>
            </label>
          </section>
        </div>

        <section className="mixer-crossfader" aria-label="Crossfader controls">
          <div className="mixer-crossfader__heading">
            <span aria-hidden="true">CROSS FADER</span>
            <output htmlFor="mixer-crossfader">
              {crossfaderPercent === 50 ? 'CENTER' : String(crossfaderPercent) + '%'}
            </output>
          </div>
          <div className="mixer-crossfader__ends" aria-hidden="true">
            <span>A</span>
            <span>B</span>
          </div>
          <input
            id="mixer-crossfader"
            type="range"
            min="0"
            max="100"
            step="1"
            value={crossfaderPercent}
            onChange={(event) => updateCrossfader(Number(event.target.value))}
            aria-label="Crossfader position"
            aria-valuetext={crossfaderValueText}
          />
          <div className="mixer-crossfader__scale" aria-hidden="true">
            {Array.from({ length: 11 }, (_, index) => <i key={index} />)}
          </div>
        </section>
      </div>

      {isEqOpen && (
        <div className="mixer-eq-overlay" onClick={handleEqOverlayClick}>
          <section
            id="mixer-eq-dialog"
            className="mixer-eq-dialog"
            ref={eqDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mixer-eq-title"
          >
            <header className="mixer-eq-dialog__header">
              <div>
                <span className="mixer-eq-dialog__eyebrow">CHANNEL PROCESSING</span>
                <h2 id="mixer-eq-title">Three-band EQ</h2>
              </div>
              <button
                ref={eqCloseButtonRef}
                type="button"
                className="mixer-eq-dialog__close"
                onClick={() => setIsEqOpen(false)}
                aria-label="Close equalizer panel"
              >
                ×
              </button>
            </header>

            <div className="mixer-eq-dialog__decks">
              {MIXER_DECKS.map((deckId) => (
                <section
                  key={deckId}
                  className={'mixer-eq-deck mixer-eq-deck--' + deckId}
                  aria-label={'Deck ' + deckId.toUpperCase() + ' equalizer'}
                >
                  <header className="mixer-eq-deck__header">
                    <div>
                      <span className="mixer-eq-deck__number">{deckId === 'a' ? '01' : '02'}</span>
                      <strong>DECK {deckId.toUpperCase()}</strong>
                    </div>
                    <button
                      type="button"
                      className="mixer-eq-deck__reset"
                      onClick={() => resetDeckEq(deckId)}
                      aria-label={'Reset Deck ' + deckId.toUpperCase() + ' EQ'}
                    >
                      RESET
                    </button>
                  </header>
                  <div className="mixer-eq-deck__bands">
                    {EQ_BANDS.map((band) => {
                      const gainDb = deckEq[deckId][band];
                      const valueText = formatEqGain(gainDb);
                      return (
                        <label className="mixer-eq-band" key={band}>
                          <span className="mixer-eq-band__label">{band.toUpperCase()}</span>
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="1"
                            value={gainDb}
                            onChange={(event) => updateDeckEq(deckId, band, Number(event.target.value))}
                            aria-label={'Deck ' + deckId.toUpperCase() + ' ' + band.toUpperCase() + ' EQ'}
                            aria-valuetext={valueText + ' decibels'}
                          />
                          <output>{valueText} dB</output>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="mixer-eq-dialog__note">
              0 dB is flat. Negative values cut; positive values boost. Each deck is adjusted independently.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}