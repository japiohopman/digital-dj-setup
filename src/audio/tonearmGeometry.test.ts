import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TONEARM_CONFIG,
  angleToPlaybackProgress,
  calculateArmAngleFromPointer,
  isAngleInPlayableRecord,
  playbackProgressToAngle,
} from './tonearmGeometry';

describe('tonearmGeometry', () => {
  it('identifies playable record angles correctly', () => {
    expect(isAngleInPlayableRecord(0)).toBe(false);
    expect(isAngleInPlayableRecord(20)).toBe(false);
    expect(isAngleInPlayableRecord(24)).toBe(true);
    expect(isAngleInPlayableRecord(35)).toBe(true);
    expect(isAngleInPlayableRecord(47)).toBe(true);
    expect(isAngleInPlayableRecord(48)).toBe(false);
  });

  it('maps playback progress to angle and vice versa', () => {
    // 0% -> outer groove (24 deg)
    expect(playbackProgressToAngle(0)).toBe(24);
    expect(angleToPlaybackProgress(24)).toBeCloseTo(0, 5);

    // 100% -> inner groove (47 deg)
    expect(playbackProgressToAngle(1)).toBe(47);
    expect(angleToPlaybackProgress(47)).toBeCloseTo(1, 5);

    // 50% -> mid point (35.5 deg)
    expect(playbackProgressToAngle(0.5)).toBe(35.5);
    expect(angleToPlaybackProgress(35.5)).toBeCloseTo(0.5, 5);

    // Angles outside playable area return null
    expect(angleToPlaybackProgress(0)).toBeNull();
    expect(angleToPlaybackProgress(15)).toBeNull();
    expect(angleToPlaybackProgress(48)).toBeNull();
  });

  it('clamps playback progress between 0 and 1', () => {
    expect(playbackProgressToAngle(-0.5)).toBe(24);
    expect(playbackProgressToAngle(1.5)).toBe(47);
    expect(playbackProgressToAngle(NaN)).toBe(24);
  });

  it('calculates rotation angle from pointer coordinates', () => {
    const deckW = 800;
    const deckH = 600;

    // Pointer right at arm rest
    const restPxX = 0.7816 * deckW;
    const restPxY = 0.8976 * deckH;
    const angleAtRest = calculateArmAngleFromPointer(restPxX, restPxY, deckW, deckH, false);
    expect(angleAtRest).toBeCloseTo(0, 1);

    // Invalid dimensions return parkAngle
    expect(calculateArmAngleFromPointer(100, 100, 0, 0)).toBe(DEFAULT_TONEARM_CONFIG.parkAngle);
  });

  it('clamps calculated angle between min and max bounds', () => {
    const deckW = 800;
    const deckH = 600;
    // Far right pointer (negative angle) should clamp to 0 (minAngle)
    const angleRight = calculateArmAngleFromPointer(deckW * 0.99, deckH * 0.9, deckW, deckH, false);
    expect(angleRight).toBe(DEFAULT_TONEARM_CONFIG.minAngle);

    // Far left pointer should clamp to maxAngle (49 deg)
    const angleLeft = calculateArmAngleFromPointer(deckW * 0.1, deckH * 0.5, deckW, deckH, false);
    expect(angleLeft).toBe(DEFAULT_TONEARM_CONFIG.maxAngle);
  });

  it('calculates angle within deck element bounds', () => {
    const deckW = 800;
    const deckH = 600;
    const angle = calculateArmAngleFromPointer(deckW * 0.5, deckH * 0.7, deckW, deckH);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThanOrEqual(DEFAULT_TONEARM_CONFIG.maxAngle);
  });
});
