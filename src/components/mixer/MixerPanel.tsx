import { useEffect, useState } from 'react';

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

/** A real, accessible range control styled as a compact rotary mixer knob. */
function MixerRotary({
  id,
  label,
  accessibleName,
  value,
  min,
  max,
  step,
  valueText,
  formatValue,
  onChange,
  className,
}: {
  id: string;
  label: string;
  accessibleName: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
  className: string;
}) {
  const progress = (value - min) / (max - min);
  const angle = -135 + progress * 270;

  return (
    <div className={'mixer-rotary ' + className}>
      <label className="mixer-rotary__label" htmlFor={id}>{label}</label>
      <div className="mixer-rotary__dial">
        <input
          id={id}
          className="mixer-rotary__input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={accessibleName}
          aria-valuetext={valueText}
        />
        <span className="mixer-rotary__face" aria-hidden="true">
          <i style={{ transform: 'rotate(' + angle + 'deg)' }} />
        </span>
      </div>
      <output className="mixer-rotary__value" htmlFor={id}>{formatValue(value)}</output>
    </div>
  );
}

/** Shows the optional TRIM position as a fixed unity/bypass placeholder, not a control. */
function MixerTrimPlaceholder({ deckId }: { deckId: MixerDeckId }) {
  return (
    <div
      className="mixer-rotary mixer-rotary--eq mixer-rotary--trim-placeholder"
      role="img"
      aria-label={'Deck ' + deckId.toUpperCase() + ' TRIM bypassed; input passes at unity gain'}
      title="TRIM is bypassed. Deck input passes through at unity gain (0 dB)."
    >
      <span className="mixer-rotary__label">TRIM</span>
      <span className="mixer-rotary__dial" aria-hidden="true">
        <span className="mixer-rotary__face">
          <i />
        </span>
      </span>
      <span className="mixer-rotary__value" aria-hidden="true">BYPASS</span>
    </div>
  );
}

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
 * Each deck has its own three-band rotary EQ above its channel fader. The
 * central bridge contains the live A / MASTER / B meters; master and CUT-IN
 * are stacked in the far-right utility column. The graph owns all audio nodes.
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

  /** Updates the symmetric silent travel zone at the two ends of the crossfader. */
  const updateCutLag = (percent: number) => {
    const nextPercent = Math.max(0, Math.min(100, percent));
    setCutLagPercent(nextPercent);
    audioGraph.setCrossfaderCutLag(nextPercent / 100);
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
      <header className="mixer-panel__header" aria-label="Mixer channel and utility controls">
        {MIXER_DECKS.map((deckId) => (
          <section
            key={deckId}
            className={'mixer-eq-bank mixer-eq-bank--' + deckId}
            aria-label={'Deck ' + deckId.toUpperCase() + ' equalizer controls'}
          >
            <div className="mixer-eq-bank__heading">
              <span><i>{deckId === 'a' ? '01' : '02'}</i> DECK {deckId.toUpperCase()}</span>
              <button
                type="button"
                className="mixer-eq-bank__reset"
                onClick={() => resetDeckEq(deckId)}
                aria-label={'Reset Deck ' + deckId.toUpperCase() + ' EQ'}
              >
                RESET
              </button>
            </div>
            <div className="mixer-eq-bank__controls mixer-eq-bank__controls--vertical">
              <MixerTrimPlaceholder deckId={deckId} />
              {EQ_BANDS.map((band) => {
                const gainDb = deckEq[deckId][band];
                const formattedGain = formatEqGain(gainDb);
                return (
                  <MixerRotary
                    key={band}
                    id={'mixer-eq-' + deckId + '-' + band}
                    label={band.toUpperCase()}
                    accessibleName={'Deck ' + deckId.toUpperCase() + ' ' + band.toUpperCase() + ' EQ'}
                    value={gainDb}
                    min={-12}
                    max={12}
                    step={1}
                    valueText={formattedGain + ' decibels'}
                    formatValue={formatEqGain}
                    onChange={(value) => updateDeckEq(deckId, band, value)}
                    className="mixer-rotary--eq"
                  />
                );
              })}
            </div>
          </section>
        ))}

        <section className="mixer-utility" aria-label="Master and crossfader utility controls">
          <MixerRotary
            id="mixer-master-level"
            label="MASTER"
            accessibleName="Master output level"
            value={masterLevelPercent}
            min={0}
            max={100}
            step={1}
            valueText={String(masterLevelPercent) + '% of maximum output'}
            formatValue={(value) => String(value) + '%'}
            onChange={updateMasterLevel}
            className="mixer-rotary--utility mixer-rotary--master"
          />
          <MixerRotary
            id="mixer-cut-lag"
            label="CUT-IN"
            accessibleName="Crossfader cut lag"
            value={cutLagPercent}
            min={0}
            max={100}
            step={1}
            valueText={cutLagValueText}
            formatValue={(value) => value === 0 ? 'MIN' : String(value) + '%'}
            onChange={updateCutLag}
            className="mixer-rotary--utility mixer-rotary--cut-in"
          />
        </section>
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
    </section>
  );
}
