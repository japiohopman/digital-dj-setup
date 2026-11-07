import { useId, useState, type CSSProperties } from 'react';

export type TurntableSpeed = 33 | 45;

export interface TurntableProps {
  deckLabel?: string;
  modelName?: string;
  initialSpeed?: TurntableSpeed;
  initiallyPowered?: boolean;
  initiallySpinning?: boolean;
}

export function Turntable({
  deckLabel = 'DECK 01',
  modelName = 'SL-1200 SERIES',
  initialSpeed = 33,
  initiallyPowered = true,
  initiallySpinning = true,
}: TurntableProps) {
  const [isPowered, setIsPowered] = useState(initiallyPowered);
  const [isSpinning, setIsSpinning] = useState(
    initiallyPowered && initiallySpinning,
  );
  const [speed, setSpeed] = useState<TurntableSpeed>(initialSpeed);
  const [isTargetLightOn, setIsTargetLightOn] = useState(false);
  const tonearmId = useId().replaceAll(':', '');
  const tonearmMetalGradientId = `${tonearmId}-tonearm-metal`;
  const tonearmHeadGradientId = `${tonearmId}-tonearm-head`;

  const handlePowerToggle = () => {
    const nextPoweredState = !isPowered;
    setIsPowered(nextPoweredState);

    if (!nextPoweredState) {
      setIsSpinning(false);
      setIsTargetLightOn(false);
    }
  };

  const spinStyle: CSSProperties & { '--record-spin-duration': string } = {
    '--record-spin-duration': speed === 33 ? '1.8s' : '1.333s',
  };

  return (
    <section
      className={`turntable${isPowered ? ' is-powered' : ''}${isSpinning ? ' is-spinning' : ''}${isTargetLightOn ? ' has-target-light' : ''}`}
      aria-label={`${deckLabel} Technics-inspired turntable`}
      data-speed={speed}
    >
      <div className="turntable__frame">
        <div className="turntable__surface">
          <header className="turntable__identification">
            <div className="turntable__branding">
              <span className="turntable__brand">TECHNICS</span>
              <span className="turntable__model">{modelName}</span>
            </div>
            <span className="turntable__deck-label">{deckLabel}</span>
          </header>

          <div className="turntable__platter" aria-hidden="true">
            <div className="turntable__platter-rim" />
            <div className="turntable__mat" />
            <div
              className={`turntable__record${isSpinning ? ' is-spinning' : ''}`}
              style={spinStyle}
            >
              <div className="turntable__grooves" />
              <div className="turntable__label">
                <span className="turntable__label-title">SIDE A</span>
                <span className="turntable__label-subtitle">
                  {speed === 33 ? '33⅓ RPM' : '45 RPM'}
                </span>
              </div>
            </div>
            <div className="turntable__spindle" />
            <div className="turntable__strobe-ring" />
          </div>

          <svg
            className="turntable__tonearm"
            viewBox="0 0 240 360"
            role="img"
            aria-label="Tonearm and cartridge"
          >
            <defs>
              <linearGradient id={tonearmMetalGradientId} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#737b80" />
                <stop offset="0.28" stopColor="#f0f1ed" />
                <stop offset="0.58" stopColor="#aeb4b5" />
                <stop offset="1" stopColor="#555d62" />
              </linearGradient>
              <linearGradient id={tonearmHeadGradientId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#e9ece8" />
                <stop offset="1" stopColor="#737a7d" />
              </linearGradient>
            </defs>
            <ellipse cx="175" cy="54" rx="40" ry="15" fill="#000" opacity="0.25" />
            <circle cx="174" cy="48" r="32" fill="#343a3d" stroke="#858d90" strokeWidth="5" />
            <circle
              cx="174"
              cy="48"
              r="21"
              fill={`url(#${tonearmMetalGradientId})`}
              stroke="#252a2d"
              strokeWidth="3"
            />
            <circle cx="174" cy="48" r="8" fill="#262b2d" stroke="#bac0c0" strokeWidth="2" />
            <path
              d="M174 68 C170 105 117 175 62 232"
              fill="none"
              stroke="#202528"
              strokeWidth="17"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d="M174 66 C169 105 115 175 60 231"
              fill="none"
              stroke={`url(#${tonearmMetalGradientId})`}
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              d="M171 76 C165 114 112 180 59 230"
              fill="none"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.72"
            />
            <path
              d="M62 225 L35 242 L43 261 L76 245 Z"
              fill={`url(#${tonearmHeadGradientId})`}
              stroke="#444b4f"
              strokeWidth="3"
            />
            <path d="M42 244 L63 236 L74 249 L52 259 Z" fill="#272d30" stroke="#777f82" strokeWidth="2" />
            <path d="M45 257 L53 263 L49 270" fill="none" stroke="#aeb4b5" strokeWidth="3" strokeLinecap="round" />
            <path d="M49 269 L46 276" stroke="#d8dcda" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <div className="turntable__pitch-control" aria-hidden="true">
            <span className="turntable__pitch-title">PITCH</span>
            <span className="turntable__pitch-track" />
            <span className="turntable__pitch-center" />
            <span className="turntable__pitch-indicator" />
            <span className="turntable__pitch-zero">0</span>
          </div>

          <div className="turntable__target-light" aria-hidden="true">
            <span />
          </div>

          <div className="turntable__controls" role="group" aria-label="Turntable controls">
            <div className="turntable__power-control">
              <button
                className={`turntable__power-button${isPowered ? ' is-on' : ''}`}
                type="button"
                aria-label="Power"
                aria-pressed={isPowered}
                onClick={handlePowerToggle}
              >
                <span className="turntable__power-ring" />
              </button>
              <span className="turntable__control-caption">POWER</span>
            </div>

            <button
              className={`turntable__start-stop${isSpinning ? ' is-active' : ''}`}
              type="button"
              aria-pressed={isSpinning}
              disabled={!isPowered}
              onClick={() => setIsSpinning((current) => !current)}
            >
              <span className="turntable__start-stop-light" />
              <span>START / STOP</span>
            </button>

            <div className="turntable__speed-control" role="group" aria-label="Platter speed">
              <button
                className={`turntable__speed-button${speed === 33 ? ' is-selected' : ''}`}
                type="button"
                aria-label="33 and one third revolutions per minute"
                aria-pressed={speed === 33}
                disabled={!isPowered}
                onClick={() => setSpeed(33)}
              >
                33
              </button>
              <button
                className={`turntable__speed-button${speed === 45 ? ' is-selected' : ''}`}
                type="button"
                aria-label="45 revolutions per minute"
                aria-pressed={speed === 45}
                disabled={!isPowered}
                onClick={() => setSpeed(45)}
              >
                45
              </button>
            </div>

            <div className="turntable__lamp-control">
              <button
                className={`turntable__lamp-button${isTargetLightOn ? ' is-on' : ''}`}
                type="button"
                aria-label="Target light"
                aria-pressed={isTargetLightOn}
                disabled={!isPowered}
                onClick={() => setIsTargetLightOn((current) => !current)}
              >
                <span />
              </button>
              <span className="turntable__control-caption">LIGHT</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
