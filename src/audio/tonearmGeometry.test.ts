import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TONEARM_CONFIG,
  LP_OUTER_GROOVE_ANGLE,
  LP_RECORD_EDGE_ANGLE,
  LP_TONEARM_CONFIG,
  SEVEN_INCH_OUTER_GROOVE_ANGLE,
  SEVEN_INCH_RECORD_EDGE_ANGLE,
  SEVEN_INCH_TONEARM_CONFIG,
  getTonearmConfig,
  angleToPlaybackProgress,
  classifyTonearmLandingSurface,
  calculateArmPointerBearingFromPointer,
  getTonearmPivot,
  isAngleAtOuterLeadIn,
  isAngleInPlayableRecord,
  playbackProgressToAngle,
  unwrapAngleNear,
} from './tonearmGeometry';

describe('tonearmGeometry', () => {
  it('identifies the playable groove range', () => {
    expect(isAngleInPlayableRecord(0)).toBe(false);
    expect(isAngleInPlayableRecord(10.9)).toBe(false);
    expect(isAngleInPlayableRecord(11)).toBe(true);
    expect(isAngleInPlayableRecord(20)).toBe(true);
    expect(isAngleInPlayableRecord(22.5)).toBe(true);
    expect(isAngleInPlayableRecord(LP_OUTER_GROOVE_ANGLE)).toBe(true);
    expect(isAngleInPlayableRecord(24)).toBe(true);
    expect(isAngleInPlayableRecord(35)).toBe(true);
    expect(isAngleInPlayableRecord(47)).toBe(true);
    expect(isAngleInPlayableRecord(48)).toBe(false);
  });

  it('maps playback progress to the complete arm travel and back', () => {
    expect(playbackProgressToAngle(0)).toBe(LP_OUTER_GROOVE_ANGLE);
    expect(angleToPlaybackProgress(LP_OUTER_GROOVE_ANGLE)).toBeCloseTo(0, 5);
    expect(playbackProgressToAngle(0.5)).toBeCloseTo(29, 5);
    expect(angleToPlaybackProgress(29)).toBeCloseTo(0.5, 5);
    expect(playbackProgressToAngle(1)).toBe(47);
    expect(angleToPlaybackProgress(47)).toBeCloseTo(1, 5);
    expect(angleToPlaybackProgress(0)).toBeNull();
    expect(angleToPlaybackProgress(48)).toBeNull();
  });

  it('clamps invalid playback progress safely', () => {
    expect(playbackProgressToAngle(-0.5)).toBe(LP_OUTER_GROOVE_ANGLE);
    expect(playbackProgressToAngle(1.5)).toBe(47);
    expect(playbackProgressToAngle(Number.NaN)).toBe(LP_OUTER_GROOVE_ANGLE);
  });

  it('calculates the pivot from the rendered holder CSS geometry', () => {
    const pivot = getTonearmPivot(800, 600);
    expect(pivot.x).toBeCloseTo((1 - 0.0275 - 0.2855 + 0.2855 * 0.54) * 800, 5);
    // CSS margin-top:-4% is relative to the .bd width, not its height.
    expect(pivot.y).toBeCloseTo(-0.04 * 800 + 0.9975 * 0.27 * 600, 5);
    expect(getTonearmPivot(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('uses the touch point as the angular reference without jumping', () => {
    const pivot = getTonearmPivot(800, 600);
    const radius = 140;
    const initialBearing = 116;
    const movedBearing = 140;
    const pointAt = (degrees: number) => ({
      x: pivot.x + Math.cos((degrees * Math.PI) / 180) * radius,
      y: pivot.y + Math.sin((degrees * Math.PI) / 180) * radius,
    });
    const start = pointAt(initialBearing);
    const moved = pointAt(movedBearing);
    const startBearing = calculateArmPointerBearingFromPointer(start.x, start.y, 800, 600);
    const nextBearing = calculateArmPointerBearingFromPointer(moved.x, moved.y, 800, 600);
    const grabOffset = startBearing - 12;
    expect(startBearing - grabOffset).toBeCloseTo(12, 5);
    expect(nextBearing - grabOffset).toBeCloseTo(36, 5);
  });

  it('maps rotated -90 degree landscape pointer coordinates to the same local bearing', () => {
    const pivot = getTonearmPivot(800, 600);
    const localX = pivot.x + 120 * Math.cos((130 * Math.PI) / 180);
    const localY = pivot.y + 120 * Math.sin((130 * Math.PI) / 180);
    // Forward transform for rotate(-90deg): screenX=localY, screenY=width-localX.
    const screenX = localY;
    const screenY = 800 - localX;
    const portraitBearing = calculateArmPointerBearingFromPointer(localX, localY, 800, 600, false);
    const landscapeBearing = calculateArmPointerBearingFromPointer(screenX, screenY, 600, 800, true);
    expect(landscapeBearing).toBeCloseTo(portraitBearing, 5);
  });

  it('uses 11 degrees for LP and preserves 24 degrees for seven-inch records', () => {
    expect(LP_OUTER_GROOVE_ANGLE).toBe(11);
    expect(LP_RECORD_EDGE_ANGLE).toBe(8.5);
    expect(DEFAULT_TONEARM_CONFIG).toBe(LP_TONEARM_CONFIG);
    expect(DEFAULT_TONEARM_CONFIG.outerGrooveAngle).toBe(11);
    expect(DEFAULT_TONEARM_CONFIG.recordEdgeAngle).toBe(8.5);
    expect(isAngleAtOuterLeadIn(11)).toBe(true);
    expect(isAngleAtOuterLeadIn(13.5)).toBe(true);
    expect(isAngleAtOuterLeadIn(13.5001)).toBe(false);

    expect(SEVEN_INCH_OUTER_GROOVE_ANGLE).toBe(24);
    expect(SEVEN_INCH_RECORD_EDGE_ANGLE).toBe(21.5);
    expect(SEVEN_INCH_TONEARM_CONFIG.outerGrooveAngle).toBe(24);
    expect(SEVEN_INCH_TONEARM_CONFIG.recordEdgeAngle).toBe(21.5);
    expect(getTonearmConfig('7-inch')).toBe(SEVEN_INCH_TONEARM_CONFIG);
    expect(isAngleAtOuterLeadIn(24, SEVEN_INCH_TONEARM_CONFIG)).toBe(true);
    expect(isAngleAtOuterLeadIn(26.5, SEVEN_INCH_TONEARM_CONFIG)).toBe(true);
    expect(isAngleAtOuterLeadIn(26.5001, SEVEN_INCH_TONEARM_CONFIG)).toBe(false);
    expect(getTonearmConfig('lp')).toBe(LP_TONEARM_CONFIG);
  });

  it('classifies the physical vinyl edge separately for LP and seven-inch records', () => {
    expect(classifyTonearmLandingSurface(0)).toBe('air');
    expect(classifyTonearmLandingSurface(8.49)).toBe('plinth');
    expect(classifyTonearmLandingSurface(8.5)).toBe('record');
    expect(classifyTonearmLandingSurface(16)).toBe('record');
    expect(classifyTonearmLandingSurface(21.49)).toBe('record');
    expect(classifyTonearmLandingSurface(21.5)).toBe('record');

    expect(classifyTonearmLandingSurface(16, SEVEN_INCH_TONEARM_CONFIG)).toBe('plinth');
    expect(classifyTonearmLandingSurface(21.49, SEVEN_INCH_TONEARM_CONFIG)).toBe('plinth');
    expect(classifyTonearmLandingSurface(21.5, SEVEN_INCH_TONEARM_CONFIG)).toBe('record');
  });

  it('unwraps pointer bearings continuously across the 180 degree boundary', () => {
    expect(unwrapAngleNear(-179, 179)).toBe(181);
    expect(unwrapAngleNear(179, -179)).toBe(-181);
    expect(unwrapAngleNear(35, 34)).toBe(35);
  });

  it('returns a safe bearing for invalid dimensions', () => {
    expect(calculateArmPointerBearingFromPointer(100, 100, 0, 0)).toBe(0);
  });
});
