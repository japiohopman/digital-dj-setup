/**
 * Tonearm angle mapping and pointer geometry for the Technics SL-1200MK2.
 *
 * Pointer coordinates come from the rendered .bd element. The holder geometry
 * below mirrors Turntable.css, including its negative width-relative top margin.
 */

export interface TonearmConfig {
  parkAngle: number;
  /** Beginning of the playable groove for the selected record format. */
  outerGrooveAngle: number;
  /** Physical outer edge of the vinyl; angles below this land on the plinth. */
  recordEdgeAngle: number;
  innerGrooveAngle: number;
  maxAngle: number;
  minAngle: number;
}

/**
 * Keep the current 24° start as the reference for future seven-inch support.
 * A standard LP begins farther out; its current target is halfway between
 * the 7-inch lead-in point and the existing vinyl/plinth boundary (21.5°).
 */
export const SEVEN_INCH_OUTER_GROOVE_ANGLE = 24;
export const LP_RECORD_EDGE_ANGLE = SEVEN_INCH_OUTER_GROOVE_ANGLE - 2.5;
export const LP_OUTER_GROOVE_ANGLE =
  (SEVEN_INCH_OUTER_GROOVE_ANGLE + LP_RECORD_EDGE_ANGLE) / 2;

export const DEFAULT_TONEARM_CONFIG: TonearmConfig = {
  parkAngle: 0,
  outerGrooveAngle: LP_OUTER_GROOVE_ANGLE,
  recordEdgeAngle: LP_RECORD_EDGE_ANGLE,
  innerGrooveAngle: 47,
  maxAngle: 49,
  minAngle: 0,
};

export type TonearmState = 'parked' | 'lifted' | 'needle-down' | 'off-record';
export type TonearmGrip = 'arm' | 'cartridge';
export type TonearmLandingSurface = 'record' | 'plinth' | 'air';

export interface TonearmPivot {
  x: number;
  y: number;
}

/**
 * Returns the pivot in local .bd pixels using the actual CSS holder dimensions:
 * right margin 2.75%, width 28.55%, top margin -4% (CSS vertical percentages
 * are relative to the containing block width), height 99.75%, origin 54% 27%.
 *
 * In the -90 degree battle layout, getBoundingClientRect() returns swapped
 * dimensions; width/height are restored before calculating the pivot.
 */
export function getTonearmPivot(
  deckWidth: number,
  deckHeight: number,
  isBattleMode = false,
): TonearmPivot {
  if (
    !Number.isFinite(deckWidth) ||
    !Number.isFinite(deckHeight) ||
    deckWidth <= 0 ||
    deckHeight <= 0
  ) {
    return { x: 0, y: 0 };
  }

  const localWidth = isBattleMode ? deckHeight : deckWidth;
  const localHeight = isBattleMode ? deckWidth : deckHeight;

  const holderLeft = 1 - 0.0275 - 0.2855;
  const holderTopPixels = -0.04 * localWidth;
  const holderWidth = 0.2855 * localWidth;
  const holderHeight = 0.9975 * localHeight;

  return {
    x: holderLeft * localWidth + holderWidth * 0.54,
    y: holderTopPixels + holderHeight * 0.27,
  };
}

/**
 * Returns the pointer's absolute bearing around the visual gimbal pivot.
 *
 * The hook stores the difference between this bearing and the current arm
 * angle on pointerdown. That grab offset keeps the finger attached to the
 * exact headshell point that was touched (not to the stylus tip), preventing
 * the arm from jumping when the user moves it.
 */
export function unwrapAngleNear(angle: number, reference: number): number {
  if (!Number.isFinite(angle) || !Number.isFinite(reference)) return reference;
  let unwrapped = angle;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (unwrapped - reference < -180) unwrapped += 360;
  return unwrapped;
}

export function calculateArmPointerBearingFromPointer(
  pointerX: number,
  pointerY: number,
  deckWidth: number,
  deckHeight: number,
  isBattleMode = false,
): number {
  if (
    ![pointerX, pointerY, deckWidth, deckHeight].every(Number.isFinite) ||
    deckWidth <= 0 ||
    deckHeight <= 0
  ) {
    return 0;
  }

  let localX = pointerX;
  let localY = pointerY;
  if (isBattleMode) {
    // Inverse of the enclosing deck's CSS rotate(-90deg).
    localX = deckHeight - pointerY;
    localY = pointerX;
  }

  const pivot = getTonearmPivot(deckWidth, deckHeight, isBattleMode);
  return (Math.atan2(localY - pivot.y, localX - pivot.x) * 180) / Math.PI;
}

export function isAngleInPlayableRecord(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): boolean {
  return (
    Number.isFinite(angleDeg) &&
    angleDeg >= config.outerGrooveAngle &&
    angleDeg <= config.innerGrooveAngle
  );
}

export function isAngleAtOuterLeadIn(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
  tolerance = 2.5,
): boolean {
  return (
    Number.isFinite(angleDeg) &&
    angleDeg >= config.outerGrooveAngle &&
    angleDeg <= config.outerGrooveAngle + tolerance
  );
}

/**
 * Coarse physical landing classification for the stylus tip.
 * The short range between the arm rest and the outer record edge is the
 * Technics plinth; once the arm reaches the outer edge it is over vinyl.
 * Groove validity remains a separate check from physical surface contact.
 */
export function classifyTonearmLandingSurface(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): TonearmLandingSurface {
  if (!Number.isFinite(angleDeg) || angleDeg <= config.parkAngle + 2) return 'air';
  return angleDeg < config.recordEdgeAngle ? 'plinth' : 'record';
}

export function playbackProgressToAngle(
  progress: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return config.outerGrooveAngle + value * (config.innerGrooveAngle - config.outerGrooveAngle);
}

export function angleToPlaybackProgress(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number | null {
  if (!isAngleInPlayableRecord(angleDeg, config)) return null;
  return (angleDeg - config.outerGrooveAngle) / (config.innerGrooveAngle - config.outerGrooveAngle);
}
