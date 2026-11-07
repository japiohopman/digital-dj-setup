import { describe, expect, it } from 'vitest';

import {
  calculateScratchSpeedMagnitude,
  resolveScratchDirection,
} from './useVinylMotion';

describe('vinyl scratch motion helpers', () => {
  it('keeps reverse playback selected during stationary animation frames', () => {
    let isReversed = resolveScratchDirection(-0.03, false);

    expect(isReversed).toBe(true);

    // requestAnimationFrame continues while the pointer has not moved.
    for (let frame = 0; frame < 5; frame++) {
      isReversed = resolveScratchDirection(0, isReversed);
    }

    expect(isReversed).toBe(true);

    // Tiny floating-point movement noise must not flip the source to forward.
    expect(resolveScratchDirection(1e-8, isReversed)).toBe(true);

    // Only actual movement in the opposite direction changes the source.
    expect(resolveScratchDirection(0.04, isReversed)).toBe(false);
  });

  it('keeps scratch speed magnitude independent from playback direction', () => {
    expect(calculateScratchSpeedMagnitude(-0.02, 0.01)).toBeCloseTo(2);
    expect(calculateScratchSpeedMagnitude(0.02, 0.01)).toBeCloseTo(2);
    expect(calculateScratchSpeedMagnitude(0, 0.01)).toBe(0);
    expect(calculateScratchSpeedMagnitude(0.02, 0)).toBe(0);
  });
});
