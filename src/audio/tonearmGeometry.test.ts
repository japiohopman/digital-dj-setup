import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TONEARM_CONFIG,
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
    expect(isAngleInPlayableRecord(20)).toBe(false);
    expect(isAngleInPlayableRecord(24)).toBe(true);
    expect(isAngleInPlayableRecord(35)).toBe(true);
    expect(isAngleInPlayableRecord(47)).toBe(true);
    expect(isAngleInPlayableRecord(48)).toBe(false);
  });

  it('maps playback progress to the complete arm travel and back', () => {
    expect(playbackProgressToAngle(0)).toBe(24);
    expect(angleToPlaybackProgress(24)).toBeCloseTo(0, 5);
    expect(playbackProgressToAngle(0.5)).toBe(35.5);
    expect(angleToPlaybackProgress(35.5)).toBeCloseTo(0.5, 5);
    expect(playbackProgressToAngle(1)).toBe(47);
    expect(angleToPlaybackProgress(47)).toBeCloseTo(1, 5);
    expect(angleToPlaybackProgress(0)).toBeNull();
    expect(angleToPlaybackProgress(48)).toBeNull();
  });

  it('clamps invalid playback progress safely', () => {
    expect(playbackProgressToAngle(-0.5)).toBe(24);
    expect(playbackProgressToAngle(1.5)).toBe(47);
    expect(playbackProgressToAngle(Number.NaN)).toBe(24);
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

  it('accepts an initial drop only at the outer lead-in', () => {
    expect(isAngleAtOuterLeadIn(24)).toBe(true);
    expect(isAngleAtOuterLeadIn(26)).toBe(true);
    expect(isAngleAtOuterLeadIn(27)).toBe(false);
    expect(isAngleAtOuterLeadIn(35)).toBe(false);
    expect(isAngleAtOuterLeadIn(DEFAULT_TONEARM_CONFIG.outerGrooveAngle - 1)).toBe(false);
  });

  it('distinguishes the parked cradle, Technics plinth and vinyl surface', () => {
    expect(classifyTonearmLandingSurface(0)).toBe('air');
    expect(classifyTonearmLandingSurface(16)).toBe('plinth');
    expect(classifyTonearmLandingSurface(22)).toBe('record');
    expect(classifyTonearmLandingSurface(25)).toBe('record');
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
