/**
 * Tonearm angle mapping and pointer geometry for the Technics SL-1200MK2.
 *
 * Pointer coordinates come from the rendered .bd element. The holder geometry
 * below mirrors Turntable.css, including its negative width-relative top margin.
 */
export interface TonearmConfig {
  parkAngle: number;
  /** Start of the programme timecode sweep. */
  outerGrooveAngle: number;
  /** Physical outer vinyl edge. */
  recordEdgeAngle: number;
  /** End of the programme timecode sweep. */
  innerGrooveAngle: number;
  /** End of the audible run-out groove; the arm rests here after playback. */
  runoutAngle: number;
  /** Beginning of the centre label. A deliberate landing here is off-record. */
  labelStartAngle: number;
  /** Calibrated LP lead-in band for a drop at the beginning of a record. */
  needleDropMinAngle: number;
  needleDropMaxAngle: number;
  maxAngle: number;
  minAngle: number;
}

/** Kept as a reference for future seven-inch geometry. */
export const SEVEN_INCH_OUTER_GROOVE_ANGLE = 24;

export const LP_RECORD_EDGE_ANGLE = 13.3;
export const LP_NEEDLE_DROP_MIN_ANGLE = 13.3;
export const LP_NEEDLE_DROP_MAX_ANGLE = 16.5;
export const LP_OUTER_GROOVE_ANGLE = 15;
export const LP_INNER_GROOVE_ANGLE = 35;
export const LP_RUNOUT_ANGLE = 38;
export const LP_LABEL_START_ANGLE = 38;

export const DEFAULT_TONEARM_CONFIG: TonearmConfig = {
  parkAngle: 0,
  outerGrooveAngle: LP_OUTER_GROOVE_ANGLE,
  recordEdgeAngle: LP_RECORD_EDGE_ANGLE,
  innerGrooveAngle: LP_INNER_GROOVE_ANGLE,
  runoutAngle: LP_RUNOUT_ANGLE,
  labelStartAngle: LP_LABEL_START_ANGLE,
  needleDropMinAngle: LP_NEEDLE_DROP_MIN_ANGLE,
  needleDropMaxAngle: LP_NEEDLE_DROP_MAX_ANGLE,
  maxAngle: 49,
  minAngle: 0,
};

export type TonearmState = 'parked' | 'lifted' | 'needle-down' | 'off-record';
export type TonearmGrip = 'arm' | 'cartridge';
export type TonearmLandingSurface = 'record' | 'plinth' | 'label' | 'air';

export interface TonearmPivot {
  x: number;
  y: number;
}

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
    localX = deckHeight - pointerY;
    localY = pointerX;
  }

  const pivot = getTonearmPivot(deckWidth, deckHeight, isBattleMode);
  return (Math.atan2(localY - pivot.y, localX - pivot.x) * 180) / Math.PI;
}

/** The physical groove includes the final run-out groove up to 38°. */
export function isAngleInPlayableRecord(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): boolean {
  return Number.isFinite(angleDeg) &&
    angleDeg >= config.recordEdgeAngle &&
    angleDeg <= config.runoutAngle;
}

/** The measured 14.70°–16.50° band is the LP's outer lead-in/start area. */
export function isAngleAtOuterLeadIn(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): boolean {
  return Number.isFinite(angleDeg) &&
    angleDeg >= config.needleDropMinAngle &&
    angleDeg <= config.needleDropMaxAngle;
}

/** Surface loops are selected only after a deliberate pointer release/drop. */
export function classifyTonearmLandingSurface(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): TonearmLandingSurface {
  if (!Number.isFinite(angleDeg) || angleDeg <= config.parkAngle + 2) return 'air';
  if (angleDeg < config.recordEdgeAngle) return 'plinth';
  // The shared 38° boundary belongs to run-out; the centre label begins beyond it.
  if (angleDeg > config.labelStartAngle) return 'label';
  return 'record';
}

/** Maps normalized programme time to the physical 15°–35° groove sweep. */
export function playbackProgressToAngle(
  progress: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return config.outerGrooveAngle + value * (config.innerGrooveAngle - config.outerGrooveAngle);
}

/** The lead-in clamps to track start; the 35°–38° run-out clamps to track end. */
export function angleToPlaybackProgress(
  angleDeg: number,
  config: TonearmConfig = DEFAULT_TONEARM_CONFIG,
): number | null {
  if (!isAngleInPlayableRecord(angleDeg, config)) return null;
  if (angleDeg <= config.outerGrooveAngle) return 0;
  if (angleDeg >= config.innerGrooveAngle) return 1;
  return (angleDeg - config.outerGrooveAngle) /
    (config.innerGrooveAngle - config.outerGrooveAngle);
}
