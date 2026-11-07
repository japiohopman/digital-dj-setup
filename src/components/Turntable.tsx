import { useId, useState, type CSSProperties } from 'react';

export type TurntableSpeed = 33 | 45;

export interface TurntableProps {
  deckLabel?: string;
  modelName?: string;
  initialSpeed?: TurntableSpeed;
  initiallyPowered?: boolean;
  initiallySpinning?: boolean;
}

const PLATTER_CENTER = { x: 174, y: 176 };

export function Turntable({
  deckLabel = 'DECK 01',
  modelName = 'SL-1200 MK2',
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
  const artworkId = useId().replaceAll(':', '');
  const metalGradientId = `${artworkId}-metal`;
  const platterGradientId = `${artworkId}-platter`;
  const armGradientId = `${artworkId}-arm`;
  const vinylGradientId = `${artworkId}-vinyl`;
  const labelGradientId = `${artworkId}-label`;
  const metalTextureId = `${artworkId}-texture`;

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

  const strobeDots = Array.from({ length: 120 }, (_, index) => {
    const angle = (index / 120) * Math.PI * 2;
    const radius = 149;
    const x = PLATTER_CENTER.x + Math.cos(angle) * radius;
    const y = PLATTER_CENTER.y + Math.sin(angle) * radius;

    return (
      <circle
        key={index}
        cx={x}
        cy={y}
        r={index % 5 === 0 ? 1.55 : 1.05}
        fill={index % 5 === 0 ? '#f0f2ec' : '#717a7c'}
        opacity={index % 5 === 0 ? 0.96 : 0.76}
      />
    );
  });

  const platterTicks = Array.from({ length: 60 }, (_, index) => (
    <path
      key={index}
      d="M174 18 v5"
      transform={`rotate(${index * 6} 174 176)`}
      stroke={index % 5 === 0 ? '#e1e4df' : '#656d70'}
      strokeWidth={index % 5 === 0 ? 1.4 : 0.8}
      opacity="0.8"
    />
  ));

  return (
    <section
      className={`turntable${isPowered ? ' is-powered' : ''}${isSpinning ? ' is-spinning' : ''}${isTargetLightOn ? ' has-target-light' : ''}`}
      aria-label={`${deckLabel} Technics ${modelName} turntable`}
      data-speed={speed}
    >
      <div className="turntable__frame">
        <svg
          className="turntable__artwork"
          viewBox="0 0 453 353"
          role="img"
          aria-label="Top view of a Technics SL-1200 MK2 with platter, Tonearm and cartridge, S-shaped arm, counterweight, headshell, pitch fader and physical controls"
        >
          <defs>
            <linearGradient id={metalGradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f1f2ee" />
              <stop offset="0.12" stopColor="#cbd0cd" />
              <stop offset="0.34" stopColor="#969e9f" />
              <stop offset="0.55" stopColor="#d7dad5" />
              <stop offset="0.78" stopColor="#a2a9a8" />
              <stop offset="1" stopColor="#6e7779" />
            </linearGradient>
            <linearGradient id={platterGradientId} x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#f1f2ee" />
              <stop offset="0.16" stopColor="#777f82" />
              <stop offset="0.42" stopColor="#d9ddda" />
              <stop offset="0.68" stopColor="#6b7477" />
              <stop offset="1" stopColor="#bfc5c1" />
            </linearGradient>
            <linearGradient id={armGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#565e62" />
              <stop offset="0.2" stopColor="#e9ece8" />
              <stop offset="0.43" stopColor="#8c9598" />
              <stop offset="0.62" stopColor="#f7f8f3" />
              <stop offset="0.82" stopColor="#899194" />
              <stop offset="1" stopColor="#454d51" />
            </linearGradient>
            <radialGradient id={vinylGradientId} cx="34%" cy="26%" r="82%">
              <stop offset="0" stopColor="#353a3b" />
              <stop offset="0.42" stopColor="#0d1011" />
              <stop offset="0.8" stopColor="#1c2122" />
              <stop offset="1" stopColor="#050708" />
            </radialGradient>
            <radialGradient id={labelGradientId} cx="32%" cy="25%" r="85%">
              <stop offset="0" stopColor="#f4ead0" />
              <stop offset="0.58" stopColor="#d0bd91" />
              <stop offset="1" stopColor="#9f8a62" />
            </radialGradient>
            <pattern id={metalTextureId} width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0 1 H5 M0 4 H5" stroke="#fff" strokeOpacity="0.1" strokeWidth="0.45" />
              <path d="M0 2.5 H5" stroke="#596164" strokeOpacity="0.11" strokeWidth="0.45" />
            </pattern>
          </defs>

          {/* Die-cast cabinet and rubber isolation base */}
          <rect x="3" y="5" width="447" height="343" rx="12" fill="#080a0b" opacity="0.72" />
          <rect x="2.5" y="2.5" width="448" height="347" rx="12" fill={`url(#${metalGradientId})`} stroke="#eef0eb" strokeWidth="1.5" />
          <rect x="7" y="7" width="439" height="338" rx="9" fill="#252b2d" stroke="#555e61" strokeWidth="1.2" />
          <rect x="10" y="9" width="433" height="333" rx="7" fill={`url(#${metalGradientId})`} stroke="#e2e5df" strokeWidth="1" />
          <rect x="10" y="9" width="433" height="333" rx="7" fill={`url(#${metalTextureId})`} opacity="0.55" />

          {/* Machined platter well */}
          <circle className="turntable__platter" cx="174" cy="176" r="164" fill="#202629" stroke="#596265" strokeWidth="2" />
          <circle cx="174" cy="176" r="160" fill={`url(#${platterGradientId})`} stroke="#f5f6f0" strokeWidth="1.4" />
          <circle cx="174" cy="176" r="155" fill="#242a2c" stroke="#5f686b" strokeWidth="1.4" />
          <circle cx="174" cy="176" r="151.5" fill={`url(#${platterGradientId})`} stroke="#252b2d" strokeWidth="1.3" />
          <circle cx="174" cy="176" r="146.5" fill="#303739" stroke="#e0e4de" strokeWidth="1" />
          <g className="turntable__strobe-dots" aria-hidden="true">{strobeDots}</g>
          <g aria-hidden="true">{platterTicks}</g>
          <circle cx="174" cy="176" r="141" fill="#5d6669" stroke="#22282a" strokeWidth="2" />
          <circle cx="174" cy="176" r="137" fill="#141819" stroke="#d2d6d1" strokeWidth="1.2" />
          <circle cx="174" cy="176" r="133" fill="#090c0d" stroke="#434b4e" strokeWidth="1.2" />

          {/* Rubber mat and vinyl record */}
          <circle cx="174" cy="176" r="129" fill="#171c1d" stroke="#050707" strokeWidth="2" />
          <circle cx="174" cy="176" r="125.5" fill="none" stroke="#485053" strokeWidth="0.8" />
          <g className={`turntable__record${isSpinning ? ' is-spinning' : ''}`} style={spinStyle}>
            <circle cx="174" cy="176" r="121" fill={`url(#${vinylGradientId})`} stroke="#050607" strokeWidth="1.3" />
            <circle cx="174" cy="176" r="116" fill="none" stroke="#394143" strokeWidth="0.7" opacity="0.72" />
            <circle cx="174" cy="176" r="108" fill="none" stroke="#555d5f" strokeWidth="0.55" opacity="0.52" />
            <circle cx="174" cy="176" r="99" fill="none" stroke="#303739" strokeWidth="0.65" />
            <circle cx="174" cy="176" r="89" fill="none" stroke="#454d4f" strokeWidth="0.55" opacity="0.58" />
            <circle cx="174" cy="176" r="79" fill="none" stroke="#303638" strokeWidth="0.7" />
            <circle cx="174" cy="176" r="69" fill="none" stroke="#51595a" strokeWidth="0.45" opacity="0.56" />
            <circle cx="174" cy="176" r="61" fill="none" stroke="#333a3b" strokeWidth="0.65" />
            <circle cx="174" cy="176" r="34" fill={`url(#${labelGradientId})`} stroke="#5a4e39" strokeWidth="1.8" />
            <circle cx="174" cy="176" r="29" fill="none" stroke="#f5ecd4" strokeWidth="0.8" opacity="0.85" />
            <text x="174" y="171" textAnchor="middle" fill="#30291f" fontSize="9" fontWeight="900" letterSpacing="1.6">TECHNICS</text>
            <text x="174" y="183" textAnchor="middle" fill="#53442c" fontSize="5.7" fontWeight="800" letterSpacing="1.2">{speed === 33 ? '33⅓ RPM' : '45 RPM'}</text>
          </g>
          <circle cx="174" cy="176" r="4.2" fill="#dfe3dd" stroke="#343b3d" strokeWidth="1" />
          <circle cx="174" cy="176" r="1.25" fill="#343b3d" />

          {/* Tonearm assembly: gimbal, counterweight and S-shaped arm */}
          <ellipse cx="371" cy="81" rx="45" ry="39" fill="#252b2d" opacity="0.28" />
          <circle cx="365" cy="80" r="36" fill="#31383b" stroke="#747e81" strokeWidth="2.5" />
          <circle cx="365" cy="80" r="29" fill="#121718" stroke="#aab1af" strokeWidth="2" />
          <circle cx="365" cy="80" r="23" fill="#535d60" stroke="#1a2022" strokeWidth="2" />
          <circle cx="365" cy="80" r="16" fill="#c0c6c1" stroke="#555e61" strokeWidth="2" />
          <circle cx="365" cy="80" r="8" fill="#333b3e" stroke="#edf0e8" strokeWidth="1.5" />

          {/* Rear counterweight cylinder and fine adjustment scale */}
          <path d="M377 62 C390 55 405 56 416 64 L418 78 C408 85 391 86 378 79 Z" fill="#252c2f" stroke="#8e9798" strokeWidth="1.5" />
          <path d="M383 61 L415 62 L416 77 L382 77 Z" fill={`url(#${armGradientId})`} stroke="#303739" strokeWidth="1" />
          <path d="M390 62 V77 M395 62 V77 M400 62 V77 M405 62 V77 M410 62 V77" stroke="#323a3c" strokeWidth="0.7" opacity="0.75" />
          <ellipse cx="416" cy="69.5" rx="4.5" ry="8" fill="#aeb6b3" stroke="#272e30" strokeWidth="1.2" />

          {/* Anti-skate control dial */}
          <circle cx="397" cy="111" r="13" fill="#171d1f" stroke="#9ba3a1" strokeWidth="1.5" />
          <circle cx="397" cy="111" r="9" fill="#6c7577" stroke="#242b2d" strokeWidth="1" />
          <path d="M397 104 V108 M397 114 V118 M390 111 H394 M400 111 H404" stroke="#dce0d9" strokeWidth="0.9" />
          <circle cx="397" cy="111" r="2" fill="#272e30" />

          {/* S-shaped polished arm tube with dark underside and highlight */}
          <path d="M361 93 C347 96 344 108 349 121 C356 140 337 151 319 169 C301 187 287 205 270 227"
            fill="none" stroke="#242a2c" strokeWidth="13" strokeLinecap="round" opacity="0.72" />
          <path d="M360 91 C346 95 343 108 348 121 C355 139 336 151 318 168 C300 186 286 204 269 226"
            fill="none" stroke={`url(#${armGradientId})`} strokeWidth="8.2" strokeLinecap="round" />
          <path d="M358 92 C347 97 347 109 352 121 C358 139 338 154 320 171 C303 188 289 207 272 225"
            fill="none" stroke="#fff" strokeWidth="1.45" strokeLinecap="round" opacity="0.76" />

          {/* Headshell, cartridge and stylus */}
          <path d="M269 217 L288 228 L272 254 L251 243 Z" fill="#292f31" stroke="#121718" strokeWidth="2" />
          <path d="M268 217 L286 228 L271 248 L254 239 Z" fill={`url(#${armGradientId})`} stroke="#e2e6df" strokeWidth="1" />
          <path d="M257 239 L274 246 L267 257 L250 250 Z" fill="#1e2527" stroke="#8e9798" strokeWidth="1.3" />
          <path d="M253 248 L268 254 L263 263 L248 257 Z" fill="#4d5659" stroke="#d2d7d0" strokeWidth="0.8" />
          <path d="M251 256 L257 260 L254 270" fill="none" stroke="#dce0d8" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M254 269 L251 277" stroke="#fff1c8" strokeWidth="1" strokeLinecap="round" />

          {/* Cueing rest and arm clip */}
          <path d="M339 129 L348 124 L353 130 L344 136 Z" fill="#d2d7d0" stroke="#515a5d" strokeWidth="1" />
          <rect x="344" y="127" width="13" height="5" rx="2" transform="rotate(-31 344 127)" fill="#343c3f" stroke="#aab2af" strokeWidth="0.8" />

          {/* Pitch fader track and graduated markings */}
          <rect x="421" y="130" width="12" height="126" rx="5" fill="#171d1f" stroke="#737d80" strokeWidth="1.2" />
          <rect x="424" y="137" width="6" height="112" rx="2.5" fill="#080b0c" stroke="#9ca5a4" strokeWidth="0.65" />
          {Array.from({ length: 17 }, (_, index) => (
            <path
              key={index}
              d={`M${414 - (index % 4 === 0 ? 0 : 3)} ${140 + index * 6.2} H${419}`}
              stroke={index === 8 ? '#d7a24e' : '#454e51'}
              strokeWidth={index === 8 ? 1.5 : 0.8}
            />
          ))}
          <rect x="419" y="183" width="16" height="17" rx="2.5" fill={`url(#${metalGradientId})`} stroke="#343c3f" strokeWidth="1.2" />
          <rect x="422" y="186" width="10" height="11" rx="1.5" fill="#d8dcd5" stroke="#747e80" strokeWidth="0.7" />
          <text x="421" y="125" textAnchor="middle" fill="#30383b" fontSize="5.5" fontWeight="800" letterSpacing="0.8">PITCH</text>
          <text x="420" y="266" textAnchor="middle" fill="#343c3e" fontSize="5.5" fontWeight="700">0</text>

          {/* Target-light pop-up socket */}
          <circle cx="397" cy="297" r="15" fill="#50595c" stroke="#252c2e" strokeWidth="2" />
          <circle cx="397" cy="297" r="10" fill="#151b1d" stroke="#bbc2bd" strokeWidth="1" />
          <circle cx="397" cy="297" r="4" fill={isTargetLightOn ? '#fff0c5' : '#626c6e'} />
          {isTargetLightOn && <circle cx="397" cy="297" r="11" fill="#ffe2a1" opacity="0.22" />}

          {/* Branding, model engraving and mechanical fasteners */}
          <text x="314" y="323" fill="#333b3e" fontSize="12" fontWeight="900" letterSpacing="2.2">TECHNICS</text>
          <text x="316" y="331" fill="#4a5355" fontSize="4.7" fontWeight="700" letterSpacing="0.65">QUARTZ DIRECT DRIVE TURNTABLE SYSTEM</text>
          <text x="420" y="323" textAnchor="end" fill="#454e50" fontSize="6.2" fontWeight="800">SL-1200MK2</text>
          <text x="27" y="326" fill="#4c5557" fontSize="5.8" fontWeight="800" letterSpacing="1.1">{deckLabel}</text>
          {[[17, 17], [436, 17], [17, 335], [436, 335]].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="3.2" fill="#7c8587" stroke="#3a4244" strokeWidth="0.8" />
              <path d={`M${x - 1.6} ${y} H${x + 1.6}`} stroke="#303739" strokeWidth="0.65" />
            </g>
          ))}
        </svg>

        {/* Functional controls remain HTML buttons for keyboard and screen-reader access. */}
        <button
          className={`turntable__power-button${isPowered ? ' is-on' : ''}`}
          type="button"
          aria-label="Power"
          aria-pressed={isPowered}
          onClick={handlePowerToggle}
        >
          <span className="turntable__power-mark" />
        </button>

        <button
          className={`turntable__start-stop${isSpinning ? ' is-active' : ''}`}
          type="button"
          aria-label={isSpinning ? 'Stop platter' : 'Start platter'}
          aria-pressed={isSpinning}
          disabled={!isPowered}
          onClick={() => setIsSpinning((current) => !current)}
        >
          <span className="turntable__start-stop-light" />
          <span className="turntable__start-stop-label">START / STOP</span>
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

        <button
          className={`turntable__target-light-button${isTargetLightOn ? ' is-on' : ''}`}
          type="button"
          aria-label="Target light"
          aria-pressed={isTargetLightOn}
          disabled={!isPowered}
          onClick={() => setIsTargetLightOn((current) => !current)}
        >
          <span />
        </button>

      </div>
    </section>
  );
}
