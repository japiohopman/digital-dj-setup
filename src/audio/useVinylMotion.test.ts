import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTransport } from './types';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  calculateScratchSpeedMagnitude,
  calculateScratchTrackPosition,
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

  it('keeps scratch position relative to the track position at gesture start', () => {
    const rps = 33.3333 / 60;
    const radiansForTenSeconds = 10 * 2 * Math.PI * rps;
    expect(calculateScratchTrackPosition(42, radiansForTenSeconds, rps, 100)).toBeCloseTo(52);
    expect(calculateScratchTrackPosition(42, -radiansForTenSeconds, rps, 100)).toBeCloseTo(32);
    expect(calculateScratchTrackPosition(98, radiansForTenSeconds, rps, 100)).toBe(100);
    expect(calculateScratchTrackPosition(2, -radiansForTenSeconds, rps, 100)).toBe(0);
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
      transportPhase: 'playing',
      transport,
      dispatch,
    }));

    const pointerDown = {
      button: 0,
      isPrimary: true,
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

  it('ignores secondary-button platter presses before preventing the browser default', () => {
    const dispatch = vi.fn(() => true);
    const { result } = renderHook(() => useVinylMotion({
      isPowered: true,
      isMotorOn: true,
      speedRpm: 33,
      pitch: 0,
      motorState: 'running',
      transportPhase: 'playing',
      transport: { isLoaded: true } as unknown as DeckTransport,
      dispatch,
    }));
    const preventDefault = vi.fn();
    const event = {
      button: 2,
      isPrimary: false,
      preventDefault,
      pointerId: 8,
      clientX: 10,
      clientY: 10,
      currentTarget: document.createElement('div'),
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => result.current.onPointerDown(event));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SCRATCH_STARTED' });
  });

  it('cancels local pointer ownership when the machine ends scratching externally', () => {
    const dispatch = vi.fn(() => true);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });
    const { result, rerender, unmount } = renderHook(
      ({ transportPhase }) => useVinylMotion({
        isPowered: true,
        isMotorOn: true,
        speedRpm: 33,
        pitch: 0,
        motorState: 'running',
        transportPhase,
        transport: { isLoaded: true, currentTime: 12, duration: 100 } as unknown as DeckTransport,
        dispatch,
      }),
      { initialProps: { transportPhase: 'playing' as const } },
    );
    const event = {
      button: 0,
      isPrimary: true,
      preventDefault: vi.fn(),
      pointerId: 9,
      clientX: 80,
      clientY: 80,
      currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => result.current.onPointerDown(event));
    expect(result.current.isScratching).toBe(true);
    rerender({ transportPhase: 'paused' });
    expect(result.current.isScratching).toBe(false);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(dispatch.mock.calls.filter(([entry]) => (entry as { type: string }).type === 'SCRATCH_ENDED')).toHaveLength(0);
    unmount();
  });
});
