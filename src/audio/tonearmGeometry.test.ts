import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TONEARM_CONFIG,
  LP_INNER_GROOVE_ANGLE,
  LP_LABEL_START_ANGLE,
  LP_NEEDLE_DROP_MAX_ANGLE,
  LP_NEEDLE_DROP_MIN_ANGLE,
  LP_OUTER_GROOVE_ANGLE,
  LP_RECORD_EDGE_ANGLE,
  LP_RUNOUT_ANGLE,
  SEVEN_INCH_OUTER_GROOVE_ANGLE,
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
  it('identifies the measured LP groove, run-out and label boundaries', () => {
    expect(isAngleInPlayableRecord(0)).toBe(false);
    expect(isAngleInPlayableRecord(14.69)).toBe(false);
    expect(isAngleInPlayableRecord(14.7)).toBe(true);
    expect(isAngleInPlayableRecord(15)).toBe(true);
    expect(isAngleInPlayableRecord(22)).toBe(true);
    expect(isAngleInPlayableRecord(35)).toBe(true);
    expect(isAngleInPlayableRecord(38)).toBe(true);
    expect(isAngleInPlayableRecord(38.01)).toBe(false);
    expect(isAngleInPlayableRecord(49)).toBe(false);
  });

  it('maps the complete programme linearly across 15°–35°', () => {
    expect(playbackProgressToAngle(0)).toBe(15);
    expect(playbackProgressToAngle(0.5)).toBe(25);
    expect(playbackProgressToAngle(1)).toBe(35);
    expect(angleToPlaybackProgress(15)).toBeCloseTo(0, 5);
    expect(angleToPlaybackProgress(22)).toBeCloseTo(0.35, 5);
    expect(angleToPlaybackProgress(25)).toBeCloseTo(0.5, 5);
    expect(angleToPlaybackProgress(35)).toBeCloseTo(1, 5);
    expect(angleToPlaybackProgress(38)).toBeCloseTo(1, 5);
    expect(angleToPlaybackProgress(14.7)).toBeCloseTo(0, 5);
    expect(angleToPlaybackProgress(16.5)).toBeCloseTo(0.075, 5);
    expect(angleToPlaybackProgress(38.01)).toBeNull();
  });

  it('clamps invalid playback progress safely', () => {
    expect(playbackProgressToAngle(-0.5)).toBe(15);
    expect(playbackProgressToAngle(1.5)).toBe(35);
    expect(playbackProgressToAngle(Number.NaN)).toBe(15);
  });

  it('uses the measured 14.70°–16.50° lead-in band', () => {
    expect(SEVEN_INCH_OUTER_GROOVE_ANGLE).toBe(24);
    expect(LP_RECORD_EDGE_ANGLE).toBe(14.7);
    expect(LP_NEEDLE_DROP_MIN_ANGLE).toBe(14.7);
    expect(LP_NEEDLE_DROP_MAX_ANGLE).toBe(16.5);
    expect(LP_OUTER_GROOVE_ANGLE).toBe(15);
    expect(isAngleAtOuterLeadIn(14.7)).toBe(true);
    expect(isAngleAtOuterLeadIn(16.5)).toBe(true);
    expect(isAngleAtOuterLeadIn(16.51)).toBe(false);
    expect(isAngleAtOuterLeadIn(22)).toBe(false);
    expect(DEFAULT_TONEARM_CONFIG.needleDropMinAngle).toBe(14.7);
    expect(DEFAULT_TONEARM_CONFIG.needleDropMaxAngle).toBe(16.5);
  });

  it('uses 38° as the run-out end and label boundary', () => {
    expect(LP_INNER_GROOVE_ANGLE).toBe(35);
    expect(LP_RUNOUT_ANGLE).toBe(38);
    expect(LP_LABEL_START_ANGLE).toBe(38);
    expect(DEFAULT_TONEARM_CONFIG.maxAngle).toBe(49);
  });

  it('distinguishes plinth, vinyl, run-out and centre label', () => {
    expect(classifyTonearmLandingSurface(0)).toBe('air');
    expect(classifyTonearmLandingSurface(14)).toBe('plinth');
    expect(classifyTonearmLandingSurface(14.7)).toBe('record');
    expect(classifyTonearmLandingSurface(22)).toBe('record');
    expect(classifyTonearmLandingSurface(37.99)).toBe('record');
    expect(classifyTonearmLandingSurface(38)).toBe('label');
    expect(classifyTonearmLandingSurface(49)).toBe('label');
  });

  it('calculates the tonearm pivot from the deck dimensions in both orientations', () => {
    const portraitPivot = getTonearmPivot(800, 600);
    expect(portraitPivot.x).toBeCloseTo(672.936, 3);
    expect(portraitPivot.y).toBeCloseTo(129.595, 3);

    const battlePivot = getTonearmPivot(600, 800, true);
    expect(battlePivot).toEqual(portraitPivot);
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
