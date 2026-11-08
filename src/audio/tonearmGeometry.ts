/**
 * Tonearm geometry and angle-to-groove mapping for the Technics SL-1200MK2.
 * Pointer coordinates are measured against the visible .bd drawing area.
 */
export interface TonearmConfig {
  pivotX: number;
  pivotY: number;
  parkAngle: number;
  outerGrooveAngle: number;
  innerGrooveAngle: number;
  maxAngle: number;
  minAngle: number;
}

export const DEFAULT_TONEARM_CONFIG: TonearmConfig = {
  pivotX: 0.8412,
  pivotY: 0.2293,
  parkAngle: 0,
  outerGrooveAngle: 24,
  innerGrooveAngle: 47,
  maxAngle: 49,
  minAngle: 0,
};

export type TonearmState = 'parked' | 'lifted' | 'needle-down';

export function isAngleInPlayableRecord(angleDeg: number, config: TonearmConfig = DEFAULT_TONEARM_CONFIG): boolean {
  return Number.isFinite(angleDeg) && angleDeg >= config.outerGrooveAngle && angleDeg <= config.innerGrooveAngle;
}

export function isAngleAtOuterLeadIn(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
  tolerance = 2.5,
): boolean {
  return Number.isFinite(angleDeg) && angleDeg >= config.outerGrooveAngle &&
    angleDeg <= config.outerGrooveAngle + tolerance;
}

export function playbackProgressToAngle(progress: number, config: TonearmConfig = DEFAULT_TONEARM_CONFIG): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return config.outerGrooveAngle + value * (config.innerGrooveAngle - config.outerGrooveAngle);
}

export function angleToPlaybackProgress(angleDeg: number, config: TonearmConfig = DEFAULT_TONEARM_CONFIG): number | null {
  if (!isAngleInPlayableRecord(angleDeg, config)) return null;
  return (angleDeg - config.outerGrooveAngle) / (config.innerGrooveAngle - config.outerGrooveAngle);
}

/**
 * Convert screen coordinates to the local deck plane. The battle layout rotates
 * .bd by -90deg: localX = boxHeight - screenY; localY = screenX.
 */
export function calculateUnclampedArmAngleFromPointer(
  pointerX: number,
  pointerY: number,
  deckWidth: number,
  deckHeight: number,
  isBattleMode = false,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number {
  if (![pointerX, pointerY, deckWidth, deckHeight].every(Number.isFinite) || deckWidth <= 0 || deckHeight <= 0) {
    return config.parkAngle;
  }
  let localX = pointerX;
  let localY = pointerY;
  let localWidth = deckWidth;
  let localHeight = deckHeight;
  if (isBattleMode) {
    localX = deckHeight - pointerY;
    localY = pointerX;
    localWidth = deckHeight;
    localHeight = deckWidth;
  }
  const pivotX = config.pivotX * localWidth;
  const pivotY = config.pivotY * localHeight;
  const restX = 0.7816 * localWidth;
  const restY = 0.8976 * localHeight;
  const pointerAngle = Math.atan2(localY - pivotY, localX - pivotX);
  const restAngle = Math.atan2(restY - pivotY, restX - pivotX);
  let delta = (pointerAngle - restAngle) * (180 / Math.PI);
  while (delta < -180) delta += 360;
  while (delta > 180) delta -= 360;
  return delta;
}

export function calculateArmAngleFromPointer(
  pointerX: number,
  pointerY: number,
  deckWidth: number,
  deckHeight: number,
  isBattleMode = false,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number {
  const angle = calculateUnclampedArmAngleFromPointer(pointerX, pointerY, deckWidth, deckHeight, isBattleMode, config);
  return Math.max(config.minAngle, Math.min(config.maxAngle, angle));
}
