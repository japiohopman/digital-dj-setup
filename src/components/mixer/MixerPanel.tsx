import { useEffect, useState } from 'react';

import './MixerPanel.css';

import {
  MixerAudioGraph,
  type MixerDeckId,
  type MixerMeterLevels,
} from '../../audio/MixerAudioGraph';

export interface MixerPanelProps {
  /** App-owned audio graph; the panel never manipulates Web Audio nodes directly. */
  audioGraph: MixerAudioGraph;
}

const METER_SEGMENTS = 12;
const METER_FLOOR_DB = -48;

const toDecibels = (level: number): number =>
  level <= 0.0001 ? -60 : Math.max(-60, Math.min(0, 20 * Math.log10(level)));

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
  const [meterLevels, setMeterLevels] = useState<MixerMeterLevels>(
    () => audioGraph.getMeterLevels(),
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMeterLevels(audioGraph.getMeterLevels());
    }, 80);
    return () => window.clearInterval(intervalId);
  }, [audioGraph]);

  const updateChannelLevel = (deckId: MixerDeckId, percent: number) => {
    const level = Math.max(0, Math.min(100, percent)) / 100;
    setChannelLevels((current) => ({ ...current, [deckId]: level }));
    audioGraph.setChannelLevel(deckId, level);
  };

  const updateCrossfader = (percent: number) => {
    const nextPercent = Math.max(0, Math.min(100, percent));
    setCrossfaderPercent(nextPercent);
    audioGraph.setCrossfaderPosition(nextPercent / 100);
  };

  return (
    <section className="mixer-panel" id="mixer-panel" aria-label="Digital DJ mixer">
      <header className="mixer-panel__header">
        <div>
          <p className="mixer-panel__eyebrow">TWO CHANNEL MIXER</p>
          <h2>MASTER CONTROL</h2>
        </div>
        <span className="mixer-panel__power"><i aria-hidden="true" /> AUDIO ROUTING</span>
      </header>

      <div className="mixer-panel__faceplate">
        <div className="mixer-panel__column-headings" aria-hidden="true">
          <span>PGM 1 / DECK A</span>
          <span>OUTPUT LEVEL</span>
          <span>PGM 2 / DECK B</span>
        </div>

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
            <div className="mixer-meter-bridge__title">INPUT LEVEL</div>
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
            <span>CROSS FADER</span>
            <output htmlFor="mixer-crossfader">{crossfaderPercent === 50 ? 'CENTER' : String(crossfaderPercent) + '%'}</output>
          </div>
          <div className="mixer-crossfader__ends" aria-hidden="true">
            <span>1 / A</span>
            <span>2 / B</span>
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
          />
          <div className="mixer-crossfader__scale" aria-hidden="true">
            {Array.from({ length: 11 }, (_, index) => <i key={index} />)}
          </div>
        </section>

        <footer className="mixer-panel__footer">
          <span>PMC-05 / DIGITAL EDITION</span>
          <span>DUAL DECK · EQUAL POWER</span>
        </footer>
      </div>
    </section>
  );
}
