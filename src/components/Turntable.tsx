import { useState, useRef, useEffect, type CSSProperties, type PointerEvent, type KeyboardEvent, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import type { DeckTransport } from '../audio/types';
import { useVinylMotion } from '../audio/useVinylMotion';
import { useTonearm } from '../audio/useTonearm';
import { createDeckStore } from '../state/deckStore';
import { selectIsSpinning, selectIsTrackAudible } from '../state/deckMachine';

/**
 * Supported playback RPM speeds for the turntable deck.
 */
export type TurntableSpeed = 33 | 45;

/**
 * Configuration and initial state properties for the Turntable component.
 */
export interface TurntableProps {
  /** Optional HTML element ID. */
  id?: string;
  /** Display label for the deck (e.g. "DECK 01", "DECK A"). */
  deckLabel?: string;
  /** Turntable model branding label (defaults to "SL-1200 MK2"). */
  modelName?: string;
  /** Initial rotation speed setting in RPM (33 or 45). */
  initialSpeed?: TurntableSpeed;
  /** Whether the turntable main power switch is enabled initially. */
  initiallyPowered?: boolean;
  /** Explicit initial motor state. If omitted, falls back to initiallySpinning. */
  initiallyMotorOn?: boolean;
  /** Initial spinning state fallback if initiallyMotorOn is omitted. */
  initiallySpinning?: boolean;
  /** Whether a vinyl record is placed on the platter. */
  initiallyHasRecord?: boolean;
  /** Whether a slipmat is placed on the platter. */
  initiallyHasSlipmat?: boolean;
  /** Optional DeckTransport instance connected to the deck's audio engine. */
  transport?: DeckTransport;
  /** Whether this deck currently owns the floating tonearm calibration dev widget. */
  showTonearmMeter?: boolean;
}

/**
 * Authentic Technics SL-1200 style interactive turntable component.
 *
 * Provides realistic visual styling, spinning animations, speed selection,
 * power dial, target light toggle, and an interactive draggable pitch slider.
 */
function TonearmMeterPortal({ children }: { children: ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  return portalTarget ? createPortal(children, portalTarget) : null;
}

export function Turntable({
  id,
  transport,
  showTonearmMeter = true,
  deckLabel = 'DECK 01',
  modelName = 'SL-1200 MK2',
  initialSpeed = 33,
  initiallyPowered = true,
  initiallyMotorOn,
  initiallySpinning = true,
  initiallyHasRecord = transport?.isLoaded ?? false,
  initiallyHasSlipmat = false,
}: TurntableProps) {
  const motorActive = initiallyMotorOn !== undefined ? initiallyMotorOn : initiallySpinning;
  const [deckStore] = useState(() => createDeckStore(transport, {
    initiallyPowered,
    initiallyMotorOn: motorActive,
    hasRecord: initiallyHasRecord,
  }));
  const machine = useStore(deckStore, (state) => state.machine);
  const trace = useStore(deckStore, (state) => state.trace);
  const dispatch = useStore(deckStore, (state) => state.dispatch);
  const loadDeckTrack = useStore(deckStore, (state) => state.loadTrack);
  const isPowered = machine.power === 'on';
  const isMotorOn = machine.motorSwitch === 'on';
  const motorState = machine.motorPhase;
  const isNeedleDown = machine.tonearm === 'needle-down';
  const armState = machine.tonearm;
  const isArmDragging = machine.armInteraction === 'dragging';
  const hasRecord = machine.hasRecord;
  const hasSlipmat = !hasRecord || initiallyHasSlipmat;
  const [speed, setSpeed] = useState<TurntableSpeed>(initialSpeed);
  const [isLightOn, setIsLightOn] = useState(false);
  const [measuredGrooveStart, setMeasuredGrooveStart] = useState<number | null>(null);
  const [measuredGrooveEnd, setMeasuredGrooveEnd] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isDragOverRecord, setIsDragOverRecord] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const recordRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => deckStore.getState().dispose(), [deckStore]);

  const transportEndedNaturally = !!transport &&
    transport.playbackState === 'stopped' &&
    transport.duration > 0 &&
    transport.currentTime >= transport.duration - 0.05;

  useEffect(() => {
    if (!transport) return;
    dispatch({
      type: 'ENGINE_PLAYBACK_SYNC',
      playbackState: transport.playbackState,
      endedNaturally: transportEndedNaturally,
    });
  }, [dispatch, transport?.playbackState, transportEndedNaturally]);

  const {
    angle: vinylAngle,
    isScratching,
    discRef,
    onPointerDown: onVinylPointerDown,
  } = useVinylMotion({
    isPowered,
    isMotorOn,
    speedRpm: speed,
    pitch,
    motorState,
    transportPhase: machine.transport,
    transport,
    dispatch,
    centerElementRef: recordRef,
  });

  // Detect battle mode orientation (landscape viewport where deck is rotated -90deg)
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(orientation: landscape)');
    setIsLandscape(mql.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsLandscape(e.matches);
    };
    mql.addEventListener?.('change', handler);
    return () => {
      mql.removeEventListener?.('change', handler);
    };
  }, []);

  const {
    armAngle,
    handlePointerDown: onArmPointerDown,
    handlePointerMove: onArmPointerMove,
    handlePointerUp: onArmPointerUp,
    handlePointerCancel: onArmPointerCancel,
    handleLostPointerCapture: onArmLostPointerCapture,
    handleKeyDown: onArmKeyDown,
  } = useTonearm({
    duration: transport?.duration ?? 0,
    currentTime: transport?.currentTime ?? 0,
    armState,
    armInteraction: machine.armInteraction,
    transportPhase: machine.transport,
    dispatch,
    isBattleMode: isLandscape,
    hasRecord,
  });

  const updatePitchFromPointer = (clientY: number, clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) return;

    // Detect if element is rotated or vertical in screen space
    // In battle mode, turntable is rotated -90deg.
    // The pitch track element in screen space is horizontal!
    // rect.width will be larger than rect.height.
    const fraction =
      rect.width > rect.height
        ? (Math.max(rect.left, Math.min(rect.right, clientX)) - rect.left) / rect.width
        : (Math.max(rect.top, Math.min(rect.bottom, clientY)) - rect.top) / rect.height;

    // fraction: 0 -> +8%, 0.5 -> 0%, 1 -> -8%
    // Technics pitch: Top is +8, center is 0, bottom is -8
    const rawPitch = 8 - fraction * 16;
    // Snap to 0 within deadzone (-0.2 to +0.2)
    const snappedPitch = Math.abs(rawPitch) < 0.25 ? 0 : Math.round(rawPitch * 10) / 10;
    const clampedPitch = Math.max(-8, Math.min(8, snappedPitch));
    setPitch(clampedPitch);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePitchFromPointer(e.clientY, e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePitchFromPointer(e.clientY, e.clientX);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture might already be released
      }
      setIsDragging(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      delta = 0.5;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      delta = -0.5;
    } else if (e.key === 'Home') {
      setPitch(8);
      return;
    } else if (e.key === 'End') {
      setPitch(-8);
      return;
    } else if (e.key === 'PageUp') {
      delta = 1.0;
    } else if (e.key === 'PageDown') {
      delta = -1.0;
    } else {
      return;
    }
    e.preventDefault();
    setPitch((prev) => {
      const next = Math.max(-8, Math.min(8, Math.round((prev + delta) * 10) / 10));
      return Math.abs(next) < 0.2 ? 0 : next;
    });
  };

  const handlePowerToggle = () => {
    dispatch({ type: 'POWER_TOGGLED' });
  };

  const handleStartStopToggle = () => {
    dispatch({ type: 'START_STOP_TOGGLED' });
  };

  const handleLoadTrackFile = (file: File) => {
    if (!transport || !isPowered) return;
    void loadDeckTrack(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoadTrackFile(file);
    }
    // Clear input so selecting the same file triggers change again
    e.target.value = '';
  };

  const handleRecordDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOverRecord) {
      setIsDragOverRecord(true);
    }
  };

  const handleRecordDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverRecord(false);
  };

  const handleRecordDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverRecord(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLoadTrackFile(file);
    }
  };

  const handleOpenFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleSpeedChange = (newSpeed: TurntableSpeed) => {
    if (!isPowered) return;
    setSpeed(newSpeed);
  };

  const handleLightToggle = () => {
    if (!isPowered) return;
    setIsLightOn((prev) => !prev);
  };

  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPitch(parseFloat(e.target.value));
  };

  const handleResetPitch = () => {
    setPitch(0);
  };

  const handleCaptureGrooveStart = () => {
    setMeasuredGrooveStart(Number(armAngle.toFixed(2)));
    // Never combine a newly captured start with a stale end from another try.
    setMeasuredGrooveEnd(null);
  };

  const handleCaptureGrooveEnd = () => {
    setMeasuredGrooveEnd(Number(armAngle.toFixed(2)));
  };

  const handleClearArmMeasurement = () => {
    setMeasuredGrooveStart(null);
    setMeasuredGrooveEnd(null);
  };

  const armMeterPercent = (angle: number) => Math.max(0, Math.min(100, (angle / 49) * 100));
  const measuredGrooveReach = measuredGrooveStart !== null && measuredGrooveEnd !== null
    ? measuredGrooveEnd - measuredGrooveStart
    : null;

  const isSpinning = selectIsSpinning(machine);

  const classes = [
    'turntable',
    isPowered ? 'power-on' : '',
    isSpinning || isScratching ? 'motor-on' : '',
    hasRecord ? 'has-record' : '',
    hasSlipmat ? 'has-slipmat' : '',
    isScratching ? 'is-scratching' : '',
    motorState === 'coasting' ? 'coasting' : '',
    motorState === 'spinning-up' ? 'spinning-up' : '',
    machine.track === 'loading' ? 'track-loading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  // Direct rotation style applied from continuous physics angle
  const rotateTransformStyle: CSSProperties = {
    transform: `rotate(${vinylAngle}rad)`,
  };

  // Convert pitch (-8 to +8) to percentage along the fader slot (0% = +8, 50% = 0, 100% = -8)
  const knobPercent = ((8 - pitch) / 16) * 100;

  return (
    <div
      id={id}
      className={classes}
      role="region"
      aria-label={`${deckLabel} Technics-inspired turntable`}
      data-speed={speed}
    >
      <div className="frame" />

      <div className="table-bg" />

      {/* image that sets the base dimensions: 1256x1010 */}
      <img
        src={`${import.meta.env.BASE_URL}turntable/landscape/tt_case_and_lighting.png`}
        alt=""
        className="stub"
        width={1256}
        height={1010}
      />

      <div className="bd">
        <div className="platter" style={rotateTransformStyle} />

        <div className="slipmat-holder">
          <div className="slipmat" style={rotateTransformStyle} />
        </div>

        <div
          className={`record-holder${isDragOverRecord ? ' drag-over' : ''}`}
          ref={discRef}
          tabIndex={0}
          onPointerDown={onVinylPointerDown}
          onDragOver={handleRecordDragOver}
          onDragLeave={handleRecordDragLeave}
          onDrop={handleRecordDrop}
          onKeyDown={(e) => {
            if (!transport || !transport.isLoaded) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              dispatch({ type: 'SEEK', position: transport.currentTime + 2 });
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              dispatch({ type: 'SEEK', position: Math.max(0, transport.currentTime - 2) });
            }
          }}
          role="slider"
          aria-label={`${deckLabel} interactive vinyl record - drag to scratch or drop audio track`}
          aria-valuemin={0}
          aria-valuemax={transport?.duration || 100}
          aria-valuenow={Math.round(transport?.currentTime || 0)}
          aria-valuetext={`${formatTime(transport?.currentTime || 0)} of ${formatTime(transport?.duration || 0)}`}
        >
          <div className="record" ref={recordRef} style={rotateTransformStyle}>
            {transport?.metadata?.artworkUrl ? (
              <div
                className="record-artwork"
                style={{ backgroundImage: `url(${transport.metadata.artworkUrl})` }}
                role="img"
                aria-label={`Album art for ${transport.metadata.title}`}
              >
                <div className="artwork-center-hole" />
              </div>
            ) : (
              <div className="label">
                <span className="label-text-brand">
                  {transport?.trackName ? 'PLAYING TRACK' : 'TECHNICS'}
                </span>
                <span
                  className="label-text-side"
                  title={transport?.metadata?.title || transport?.trackName || deckLabel}
                >
                  {transport?.metadata?.artist
                    ? `${transport.metadata.artist} - ${transport.metadata.title}`
                    : transport?.metadata?.title || transport?.trackName || deckLabel}
                </span>
                <span className="label-text-speed">
                  {transport?.isLoaded
                    ? `${formatTime(transport.currentTime)} / ${formatTime(transport.duration)}`
                    : speed === 33
                      ? '33 RPM'
                      : '45 RPM'}
                </span>
              </div>
            )}
          </div>
          {isDragOverRecord && (
            <div className="record-drop-overlay" aria-hidden="true">
              <span>DROP AUDIO HERE</span>
            </div>
          )}
          <div className="record-grooves" style={rotateTransformStyle} />
        </div>

        <div className="spindle" style={rotateTransformStyle} />

        <div className="power-light" aria-hidden="true" />

        <button
          type="button"
          className="power-dial"
          aria-label={`${deckLabel} Power`}
          aria-pressed={isPowered}
          onClick={handlePowerToggle}
        />

        <button
          type="button"
          className="button start-stop"
          aria-label={`${deckLabel} Start / Stop`}
          aria-pressed={isMotorOn}
          disabled={!isPowered}
          onClick={handleStartStopToggle}
        />

        <button
          type="button"
          className={`button speed-33${speed === 33 ? ' on' : ''}`}
          aria-label={`${deckLabel} 33 RPM`}
          aria-pressed={speed === 33}
          disabled={!isPowered}
          onClick={() => handleSpeedChange(33)}
        />

        <button
          type="button"
          className={`button speed-45${speed === 45 ? ' on' : ''}`}
          aria-label={`${deckLabel} 45 RPM`}
          aria-pressed={speed === 45}
          disabled={!isPowered}
          onClick={() => handleSpeedChange(45)}
        />

        <div
          className={`light-beam${isLightOn && isPowered ? ' light-on' : ''}`}
          aria-hidden="true"
        />

        <button
          type="button"
          className="button light"
          aria-label={`${deckLabel} Target light`}
          aria-pressed={isLightOn}
          disabled={!isPowered}
          onClick={handleLightToggle}
        />

        <div
          className={`tonearm-holder ${isNeedleDown ? 'needle-down' : ''} ${isArmDragging ? 'is-dragging' : ''} arm-${armState}`}
          style={{
            transformOrigin: '54% 27%',
            transform: `rotate(${armAngle}deg)`,
          }}
        >
          <div
            className="tonearm"
            role="slider"
            tabIndex={0}
            aria-label={`${deckLabel} Tonearm and cartridge`}
            aria-valuemin={0}
            aria-valuemax={49}
            aria-valuenow={Math.round(armAngle)}
            aria-valuetext={`Tonearm ${armState}, ${Math.round(armAngle)} degrees`}
            onPointerDown={onArmPointerDown}
            onPointerMove={onArmPointerMove}
            onPointerUp={onArmPointerUp}
            onPointerCancel={onArmPointerCancel}
            onLostPointerCapture={onArmLostPointerCapture}
            onKeyDown={onArmKeyDown}
          >
            {/* Separate touch targets preserve the difference between the arm tube and cartridge. */}
            <div
              className="tonearm-tube-target"
              data-tonearm-grip="arm"
              aria-hidden="true"
            />
            <div
              className="tonearm-headshell-target"
              data-tonearm-grip="cartridge"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="model-badge" aria-hidden="true">
          <span>{modelName}</span>
        </div>

        {/* Track Loading and Audio Transport Info Bar */}
        <div className="deck-audio-panel" role="region" aria-label={`${deckLabel} audio transport`}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a"
            className="deck-file-input"
            aria-label={`${deckLabel} Select audio file`}
            tabIndex={-1}
          />

          <div className="deck-audio-controls">
            <button
              type="button"
              className="deck-load-btn"
              onClick={handleOpenFileDialog}
              disabled={!isPowered || !transport}
              aria-label={`${deckLabel} Load audio track`}
            >
              <span className="deck-load-icon" aria-hidden="true">▲</span>
              LOAD TRACK
            </button>

            {machine.track === 'loading' && (
              <span className="deck-transport-state">LOADING TRACK</span>
            )}
          </div>

          <div className="deck-audio-readout">
            {machine.track === 'loading' ? (
              <span className="deck-audio-status loading">DECODING AUDIO...</span>
            ) : machine.track === 'error' ? (
              <span className="deck-audio-status error" role="alert">{machine.trackError || transport?.error || 'Unable to load track'}</span>
            ) : transport?.error ? (
              <span className="deck-audio-status error" role="alert">{transport.error}</span>
            ) : transport?.trackName ? (
              <div className="deck-track-meta">
                <span
                  className="deck-track-name"
                  title={
                    transport.metadata?.artist
                      ? `${transport.metadata.artist} — ${transport.metadata.title}`
                      : transport.trackName
                  }
                >
                  {transport.metadata?.artist
                    ? `${transport.metadata.artist} — ${transport.metadata.title}`
                    : transport.trackName}
                </span>
                <span className="deck-track-time">
                  {formatTime(transport.currentTime)} / {formatTime(transport.duration)}
                </span>
              </div>
            ) : (
              <span className="deck-audio-status idle">NO TRACK LOADED</span>
            )}
          </div>
          <details className="deck-state-trace">
            <summary>
              DECK STATE · {machine.power.toUpperCase()} / {machine.motorPhase.toUpperCase()} / {machine.tonearm.toUpperCase()}
            </summary>
            <dl>
              <div><dt>Track</dt><dd>{machine.track}</dd></div>
              <div><dt>Transport</dt><dd>{machine.transport}</dd></div>
              <div><dt>Output</dt><dd>{selectIsTrackAudible(machine) ? 'AUDIBLE' : 'MUTED'}</dd></div>
            </dl>
            <ol>
              {trace.slice(-8).map((entry, index) => (
                <li key={`${entry.at}-${index}`} data-accepted={entry.accepted}>
                  <span>{entry.event}</span> — {entry.reason}
                </li>
              ))}
            </ol>
          </details>
        </div>

        {/* Authentic Technics Pitch Control Assembly */}
        <div className="pitch-assembly" role="group" aria-label={`${deckLabel} Pitch Control`}>
          {/* 2X / Range indicator */}
          <div className="pitch-indicator-box" aria-hidden="true">
            <div className="indicator-led" />
            <span className="indicator-label">±8</span>
          </div>

          {/* Main Fader Section */}
          <div className="pitch-fader-housing">
            <div className="pitch-adj-label" aria-hidden="true">PITCH ADJ.</div>

            <div
              className="pitch-track"
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="presentation"
            >
              <div className="pitch-track-slot" />
              <div
                className={`pitch-knob${isDragging ? ' dragging' : ''}`}
                style={{ top: `${knobPercent}%` }}
                role="slider"
                tabIndex={0}
                aria-label={`${deckLabel} pitch slider`}
                aria-valuemin={-8}
                aria-valuemax={8}
                aria-valuenow={pitch}
                aria-valuetext={`${pitch > 0 ? '+' : ''}${pitch.toFixed(1)}%`}
                onKeyDown={handleKeyDown}
              >
                <div className="pitch-knob-ridge" />
              </div>
            </div>

            {/* Scale Markings alongside the fader */}
            <div className="pitch-scale" aria-hidden="true">
              <div className="scale-row pos"><span className="scale-num">+8</span><span className="scale-tick" /></div>
              <div className="scale-row"><span className="scale-tick minor" /></div>
              <div className="scale-row"><span className="scale-num">+4</span><span className="scale-tick" /></div>
              <div className="scale-row"><span className="scale-tick minor" /></div>
              <div className="scale-row zero"><span className="scale-num">0</span><span className="scale-tick zero" /></div>
              <div className="scale-row"><span className="scale-tick minor" /></div>
              <div className="scale-row"><span className="scale-num">-4</span><span className="scale-tick" /></div>
              <div className="scale-row"><span className="scale-tick minor" /></div>
              <div className="scale-row neg"><span className="scale-num">-8</span><span className="scale-tick" /></div>
            </div>

            {/* Hidden native input for form compatibility and assistive tech */}
            <input
              type="range"
              min="-8"
              max="8"
              step="0.1"
              value={pitch}
              onChange={handlePitchChange}
              className="pitch-slider-sr"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          {/* Reset / Quartz 0% Lock Button and LED */}
          <div className="pitch-reset-group">
            <button
              type="button"
              className={`pitch-reset-btn${pitch === 0 ? ' locked' : ''}`}
              onClick={handleResetPitch}
              title="Reset pitch to 0% (Quartz Lock)"
              aria-label={`${deckLabel} Reset pitch to 0%`}
            >
              <div className="reset-led" />
              <span className="reset-label">RESET</span>
            </button>
            <div className="pitch-readout" aria-hidden="true">
              {pitch > 0 ? `+${pitch.toFixed(1)}%` : `${pitch.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </div>

      {showTonearmMeter && (
        <TonearmMeterPortal>
          <section
            className="tonearm-meter-panel"
            data-dev-widget="tonearm-angle-meter"
            aria-label={`${deckLabel} tonearm measurement`}
          >
            <div className="tonearm-meter-heading">
              <div>
                <span className="tonearm-meter-title">{deckLabel} · TONEARM DEV</span>
                <span className="tonearm-meter-subtitle">0° = arm in de rusthouder</span>
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
              aria-label={`Armhoek ${armAngle.toFixed(2)} graden op een schaal van 0 tot 49 graden`}
            >
              <div className="tonearm-meter-track" />
              {measuredGrooveStart !== null && (
                <span
                  className="tonearm-meter-marker start"
                  style={{ left: `${armMeterPercent(measuredGrooveStart)}%` }}
                  title={`Beginpunt: ${measuredGrooveStart.toFixed(2)}°`}
                />
              )}
              {measuredGrooveEnd !== null && (
                <span
                  className="tonearm-meter-marker end"
                  style={{ left: `${armMeterPercent(measuredGrooveEnd)}%` }}
                  title={`Eindpunt: ${measuredGrooveEnd.toFixed(2)}°`}
                />
              )}
              <span
                className="tonearm-meter-marker current"
                style={{ left: `${armMeterPercent(armAngle)}%` }}
              />
            </div>

            <div className="tonearm-meter-ticks" aria-hidden="true">
              {[0, 10, 20, 30, 40, 49].map((degree) => (
                <span key={degree} style={{ left: `${armMeterPercent(degree)}%` }}>{degree}°</span>
              ))}
            </div>

            <div className="tonearm-meter-readings">
              <div>
                <span>Begin groef</span>
                <output data-testid="tonearm-start-readout">
                  {measuredGrooveStart === null ? '—' : `${measuredGrooveStart.toFixed(2)}°`}
                </output>
              </div>
              <div>
                <span>Einde groef</span>
                <output data-testid="tonearm-end-readout">
                  {measuredGrooveEnd === null ? '—' : `${measuredGrooveEnd.toFixed(2)}°`}
                </output>
              </div>
              <div className="tonearm-meter-reach">
                <span>Armreach</span>
                <output data-testid="tonearm-reach-readout">
                  {measuredGrooveReach === null ? '—' : `${measuredGrooveReach.toFixed(2)}°`}
                </output>
              </div>
            </div>

            <div className="tonearm-meter-actions">
              <button
                type="button"
                className="tonearm-meter-button"
                onClick={handleCaptureGrooveStart}
                aria-label={`${deckLabel} Capture groove start angle`}
              >
                Leg beginpunt vast
              </button>
              <button
                type="button"
                className="tonearm-meter-button"
                onClick={handleCaptureGrooveEnd}
                aria-label={`${deckLabel} Capture groove end angle`}
              >
                Leg eindpunt vast
              </button>
              <button
                type="button"
                className="tonearm-meter-clear"
                onClick={handleClearArmMeasurement}
                disabled={measuredGrooveStart === null && measuredGrooveEnd === null}
              >
                Wis meting
              </button>
            </div>
          </section>
        </TonearmMeterPortal>
      )}
    </div>
  );
}
