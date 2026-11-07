import { useState, useRef, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react';

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
}

/**
 * Authentic Technics SL-1200 style interactive turntable component.
 *
 * Provides realistic visual styling, spinning animations, speed selection,
 * power dial, target light toggle, and an interactive draggable pitch slider.
 */
export function Turntable({
  id,
  deckLabel = 'DECK 01',
  modelName = 'SL-1200 MK2',
  initialSpeed = 33,
  initiallyPowered = true,
  initiallyMotorOn,
  initiallySpinning = true,
  initiallyHasRecord = true,
  initiallyHasSlipmat = false,
}: TurntableProps) {
  const motorActive = initiallyMotorOn !== undefined ? initiallyMotorOn : initiallySpinning;
  const [isPowered, setIsPowered] = useState(initiallyPowered);
  const [isMotorOn, setIsMotorOn] = useState(initiallyPowered && motorActive);
  const [speed, setSpeed] = useState<TurntableSpeed>(initialSpeed);
  const [isLightOn, setIsLightOn] = useState(false);
  const [hasRecord] = useState(initiallyHasRecord);
  const [hasSlipmat] = useState(initiallyHasSlipmat);
  const [pitch, setPitch] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

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
    const nextPower = !isPowered;
    setIsPowered(nextPower);
    if (!nextPower) {
      setIsMotorOn(false);
      setIsLightOn(false);
    }
  };

  const handleStartStopToggle = () => {
    if (!isPowered) return;
    setIsMotorOn((prev) => !prev);
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

  const classes = [
    'turntable',
    isPowered ? 'power-on' : '',
    isMotorOn ? 'motor-on' : '',
    hasRecord ? 'has-record' : '',
    hasSlipmat ? 'has-slipmat' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const baseDuration = speed === 33 ? 1.8 : 1.3333;
  const effectiveDuration = baseDuration / (1 + pitch / 100);
  const spinStyle: CSSProperties = {
    animationDuration: `${effectiveDuration.toFixed(4)}s`,
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
        <div className="platter" style={spinStyle} />

        <div className="slipmat-holder">
          <div className="slipmat" style={spinStyle} />
        </div>

        <div className="record-holder">
          <div className="record" style={spinStyle}>
            <div className="label">
              <span className="label-text-brand">TECHNICS</span>
              <span className="label-text-side">{deckLabel}</span>
              <span className="label-text-speed">{speed === 33 ? '33 RPM' : '45 RPM'}</span>
            </div>
          </div>
          <div className="record-grooves" style={spinStyle} />
        </div>

        <div className="spindle" style={spinStyle} />

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

        <div className="tonearm-holder">
          <div className="tonearm" role="img" aria-label="Tonearm and cartridge" />
        </div>

        <div className="model-badge" aria-hidden="true">
          <span>{modelName}</span>
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
    </div>
  );
}
