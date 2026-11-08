import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTransport } from './types';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  calculateScratchSpeedMagnitude,
  resolveScratchDirection,
  useVinylMotion,
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


describe('useVinylMotion physical platter input', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts and ends a physical scratch gesture while the stylus is lifted', () => {
    const dispatch = vi.fn(() => true);
    const transport = { isLoaded: true } as unknown as DeckTransport;
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    });

    const { result, unmount } = renderHook(() => useVinylMotion({
      isPowered: true,
      isMotorOn: true,
      speedRpm: 33,
      pitch: 0,
      motorState: 'running',
      transport,
      dispatch,
    }));

    const pointerDown = {
      preventDefault: vi.fn(),
      pointerId: 7,
      clientX: 120,
      clientY: 120,
      currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => result.current.onPointerDown(pointerDown));

    expect(dispatch).toHaveBeenCalledWith({ type: 'SCRATCH_STARTED' });
    expect(result.current.isScratching).toBe(true);
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);

    const pointerUp = new Event('pointerup') as Event & { pointerId: number };
    Object.defineProperty(pointerUp, 'pointerId', { value: 7 });
    act(() => window.dispatchEvent(pointerUp));

    expect(dispatch).toHaveBeenCalledWith({ type: 'SCRATCH_ENDED' });
    expect(result.current.isScratching).toBe(false);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    unmount();
  });
});
