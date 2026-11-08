/**
 * Tonearm geometry and angle-to-groove mapping for the Technics SL-1200MK2 component.
 *
 * All coordinates are relative to the turntable deck container (width W, height H, aspect ratio ~ 792/594 ≈ 1.333).
 *
 * In Turntable.css:
 * - Tonearm holder: right: 2.75%, top: -4.0%, width: 28.55%, height: 99.75%
 * - Gimbal pivot: transform-origin is 54% width, 27% height inside the holder.
 *   Deck coords (%):
 *     holderLeft = 100 - 2.75 - 28.55 = 68.70%
 *     holderTop  = -4.00%
 *     pivotX     = 68.70 + 28.55 * 0.54 = 84.117%
 *     pivotY     = -4.00 + 99.75 * 0.27 = 22.9325%
 *
 * - Stylus tip at 0 deg (parked on arm rest):
 *   Inside holder: (105px / 317px = 33.12% width, 783px / 833px = 94.00% height)
 *   Deck coords (%):
 *     tipX0 = 68.70 + 28.55 * 0.3312 = 78.156%
 *     tipY0 = -4.00 + 99.75 * 0.9400 = 89.765%
 *
 * Platter / Record center (spindle):
 * - Record: left: 8.35%, width: 66.20% -> center X = 8.35 + 33.10 = 41.45%
 *           top:  6.30%, height: 87.994% -> center Y = 6.30 + 43.997 = 50.30%
 *
 * Angular range of motion (in degrees, rotating counter-clockwise from arm rest towards record spindle):
 * - Parked / rest position: 0°
 * - Outer groove contact (lead-in): ~24.0° (distance to spindle ≈ 34% record radius in Y-units)
 * - Inner groove contact (run-out): ~47.0° (distance to spindle ≈ 13% record radius in Y-units)
 * - Maximum swing limit: 49.0°
 */

export interface TonearmConfig {
  /** Gimbal pivot X as fraction of deck width (0..1) */
  pivotX: number;
  /** Gimbal pivot Y as fraction of deck height (0..1) */
  pivotY: number;
  /** Arm rest angle in degrees (0) */
  parkAngle: number;
  /** Lead-in outer groove angle in degrees */
  outerGrooveAngle: number;
  /** Lead-out inner groove angle in degrees */
  innerGrooveAngle: number;
  /** Maximum safe counter-clockwise swing */
  maxAngle: number;
  /** Minimum swing (rest) */
  minAngle: number;
}

export const DEFAULT_TONEARM_CONFIG: TonearmConfig = {
  pivotX: 0.8412,
  pivotY: 0.2293,
  parkAngle: 0.0,
  outerGrooveAngle: 24.0,
  innerGrooveAngle: 47.0,
  maxAngle: 49.0,
  minAngle: 0.0,
};

export type TonearmState = 'parked' | 'lifted' | 'needle-down';

/**
 * Checks if a given arm angle (in degrees) is within the playable vinyl groove range.
 */
export function isAngleInPlayableRecord(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG
): boolean {
  return angleDeg >= config.outerGrooveAngle && angleDeg <= config.innerGrooveAngle;
}

/**
 * Maps audio playback progress (0.0 = start, 1.0 = end) to tonearm rotation angle (degrees).
 */
export function playbackProgressToAngle(
  progress: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG
): number {
  const clampedProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return config.outerGrooveAngle + clampedProgress * (config.innerGrooveAngle - config.outerGrooveAngle);
}

/**
 * Maps a tonearm rotation angle (degrees) to playback cue progress (0.0 = outer groove, 1.0 = inner groove).
 * Returns null if the angle is not within the playable record range.
 */
export function angleToPlaybackProgress(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG
): number | null {
  if (!isAngleInPlayableRecord(angleDeg, config)) {
    return null;
  }
  return (angleDeg - config.outerGrooveAngle) / (config.innerGrooveAngle - config.outerGrooveAngle);
}

/**
 * Calculates tonearm rotation angle from pointer coordinates relative to the turntable deck element.
 *
 * @param pointerX Pointer X coordinate relative to turntable bounding box
 * @param pointerY Pointer Y coordinate relative to turntable bounding box
 * @param deckWidth Turntable element bounding box width
 * @param deckHeight Turntable element bounding box height
 * @param isBattleMode Whether the deck is rotated 90deg counter-clockwise in landscape
 * @param config Tonearm geometry configuration
 */
export function calculateArmAngleFromPointer(
  pointerX: number,
  pointerY: number,
  deckWidth: number,
  deckHeight: number,
  isBattleMode: boolean = false,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG
): number {
  if (deckWidth <= 0 || deckHeight <= 0) {
    return config.parkAngle;
  }

  let px = pointerX;
  let py = pointerY;
  let w = deckWidth;
  let h = deckHeight;

  if (isBattleMode) {
    const screenX = pointerX;
    const screenY = pointerY;
    px = screenY;
    py = deckWidth - screenX;
    w = deckHeight;
    h = deckWidth;
  }

  // Pivot position in pixels
  const pivotPxX = config.pivotX * w;
  const pivotPxY = config.pivotY * h;

  // Vector from pivot to pointer in unrotated deck coordinates
  const dx = px - pivotPxX;
  const dy = py - pivotPxY;

  const currentAngleRad = Math.atan2(dy, dx);
  // Reference vector for 0° rotation (rest position tip dx ≈ -0.06 * W, dy ≈ +0.67 * H)
  const restDx = (0.7816 - config.pivotX) * w;
  const restDy = (0.8976 - config.pivotY) * h;
  const restAngleRad = Math.atan2(restDy, restDx);

  let deltaDeg = (currentAngleRad - restAngleRad) * (180 / Math.PI);

  // Normalize deltaDeg around [ -180, 180 ]
  while (deltaDeg < -180) deltaDeg += 360;
  while (deltaDeg > 180) deltaDeg -= 360;

  // Clamp within bounds [minAngle, maxAngle]
  return Math.max(config.minAngle, Math.min(config.maxAngle, deltaDeg));
}
