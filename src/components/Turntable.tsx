import { useState, type CSSProperties } from 'react';

export type TurntableSpeed = 33 | 45;

export interface TurntableProps {
  id?: string;
  deckLabel?: string;
  modelName?: string;
  initialSpeed?: TurntableSpeed;
  initiallyPowered?: boolean;
  initiallyMotorOn?: boolean;
  initiallySpinning?: boolean;
  initiallyHasRecord?: boolean;
  initiallyHasSlipmat?: boolean;
}

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

  const classes = [
    'turntable',
    isPowered ? 'power-on' : '',
    isMotorOn ? 'motor-on' : '',
    hasRecord ? 'has-record' : '',
    hasSlipmat ? 'has-slipmat' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const spinStyle: CSSProperties = {
    animationDuration: speed === 33 ? '1.8s' : '1.333s',
  };

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
        src="/turntable/landscape/tt_case_and_lighting.png"
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
      </div>
    </div>
  );
}
