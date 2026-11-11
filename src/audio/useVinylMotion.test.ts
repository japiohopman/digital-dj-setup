import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTransport } from './types';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  applyRecordAngularDelta,
  clampManualAngularVelocity,
  calculateScratchSpeedMagnitude,
  calculateScratchTrackPosition,
  calculateScratchTrackPositionFromGesture,
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

  it('preserves inherited negative record phases but clamps reverse motion at the zero boundary', () => {
    expect(applyRecordAngularDelta(0.01, -0.02)).toBe(0);
    expect(applyRecordAngularDelta(-0.02, -0.01)).toBeCloseTo(-0.03);
    expect(applyRecordAngularDelta(-0.02, 0.03)).toBeCloseTo(0.01);
  });

  it('bounds pointer-derived release velocity without changing ordinary drag speeds', () => {
    expect(clampManualAngularVelocity(1)).toBe(0.02);
    expect(clampManualAngularVelocity(-1)).toBe(-0.02);
    expect(clampManualAngularVelocity(0.01)).toBe(0.01);
    expect(clampManualAngularVelocity(Number.NaN)).toBe(0);
  });

  it('keeps scratch speed magnitude independent from playback direction', () => {
    expect(calculateScratchSpeedMagnitude(-0.02, 0.01)).toBeCloseTo(2);
    expect(calculateScratchSpeedMagnitude(0.02, 0.01)).toBeCloseTo(2);
    expect(calculateScratchSpeedMagnitude(0, 0.01)).toBe(0);
    expect(calculateScratchSpeedMagnitude(0.02, 0)).toBe(0);
  });

  it('maps gesture-relative platter movement to timecode in both directions', () => {
    const rps = 33.3333 / 60;
    const secondsPerRotation = 2 * Math.PI * rps;
    expect(calculateScratchTrackPosition(42 * secondsPerRotation, rps, 100)).toBeCloseTo(42);
    expect(calculateScratchTrackPositionFromGesture(42, 0.5, 0, rps, 100))
      .toBeCloseTo(42 + 0.5 / secondsPerRotation);
    expect(calculateScratchTrackPositionFromGesture(42, -0.5, 0, rps, 100))
      .toBeCloseTo(42 - 0.5 / secondsPerRotation);
    expect(calculateScratchTrackPositionFromGesture(99.9, 2, 0, rps, 100)).toBe(100);
    expect(calculateScratchTrackPositionFromGesture(0.1, -2, 0, rps, 100)).toBe(0);
  });
});


describe('useVinylMotion transport and phase regression', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reinterpret the final scratch position as an external seek after release', () => {
    let latestScratchPosition = 25;
    const dispatch = vi.fn((event: { type: string; position?: number }) => {
      if (event.type === 'SCRATCH_MOVED' && typeof event.position === 'number') {
        latestScratchPosition = event.position;
      }
      return true;
    });
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0, top: 0, width: 100, height: 100,
        right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
      })),
    });

    const { result, rerender, unmount } = renderHook(
      ({ currentTime }) => useVinylMotion({
        isPowered: true,
        isMotorOn: true,
        speedRpm: 33,
        pitch: 0,
        motorState: 'running',
        transportPhase: 'playing',
        transport: {
          isLoaded: true,
          duration: 120,
          currentTime,
          getCurrentTime: () => currentTime,
        } as unknown as DeckTransport,
        hasRecord: true,
        dispatch,
      }),
      { initialProps: { currentTime: 25 } },
    );
    result.current.discRef.current = target;

    const pointerDown = {
      button: 0, isPrimary: true, preventDefault: vi.fn(),
      pointerId: 31, clientX: 75, clientY: 50, currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;
    act(() => result.current.onPointerDown(pointerDown));
    expect(result.current.isScratching).toBe(true);

    const pointerMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerMove, {
      pointerId: { value: 31 },
      clientX: { value: 50 },
      clientY: { value: 75 },
    });
    act(() => window.dispatchEvent(pointerMove));
    const recordAngleAtRelease = result.current.angle;

    // A large transport-time update during the active scratch is not a seek.
    rerender({ currentTime: 45 });
    expect(result.current.angle).toBe(recordAngleAtRelease);

    const pointerUp = new Event('pointerup') as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerUp, {
      pointerId: { value: 31 },
      clientX: { value: 50 },
      clientY: { value: 75 },
    });
    act(() => window.dispatchEvent(pointerUp));
    expect(result.current.isScratching).toBe(false);

    // The final pointer-up position is dispatched after the local scratch ref
    // is cleared. Its transport update must not replace the visual record angle.
    rerender({ currentTime: latestScratchPosition });
    expect(result.current.angle).toBe(recordAngleAtRelease);

    unmount();
  });

  it('ends an empty-slipmat gesture when a record is loaded mid-gesture', () => {
    const dispatch = vi.fn(() => true);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0, top: 0, width: 100, height: 100,
        right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
      })),
    });
    const { result, rerender, unmount } = renderHook(
      ({ hasRecord }) => useVinylMotion({
        isPowered: true,
        isMotorOn: true,
        speedRpm: 33,
        pitch: 0,
        motorState: 'running',
        transportPhase: 'idle',
        transport: { isLoaded: true, duration: 120, currentTime: 0 } as unknown as DeckTransport,
        hasRecord,
        dispatch,
      }),
      { initialProps: { hasRecord: false } },
    );
    result.current.slipmatRef.current = target;

    const pointerDown = {
      button: 0, isPrimary: true, preventDefault: vi.fn(),
      pointerId: 32, clientX: 75, clientY: 50, currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;
    act(() => result.current.onEmptyPlatterPointerDown(pointerDown));

    const pointerMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerMove, {
      pointerId: { value: 32 }, clientX: { value: 50 }, clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(pointerMove));
    const phaseAtLoad = result.current.platterAngle;
    expect(result.current.isPlatterDragging).toBe(true);

    rerender({ hasRecord: true });
    expect(result.current.isPlatterDragging).toBe(false);
    expect(result.current.angle).toBeCloseTo(phaseAtLoad);

    const laterMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(laterMove, {
      pointerId: { value: 32 }, clientX: { value: 25 }, clientY: { value: 50 },
    });
    act(() => window.dispatchEvent(laterMove));
    expect(result.current.platterAngle).toBe(phaseAtLoad);
    expect(result.current.angle).toBeCloseTo(phaseAtLoad);

    unmount();
  });

  it('preserves a negative platter phase when a record is loaded and scratched in reverse', () => {
    const dispatch = vi.fn(() => true);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0, top: 0, width: 100, height: 100,
        right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
      })),
    });
    const transport = {
      isLoaded: true,
      duration: 120,
      currentTime: 0,
      getCurrentTime: () => 0,
    } as unknown as DeckTransport;
    const { result, rerender, unmount } = renderHook(
      ({ hasRecord }) => useVinylMotion({
        isPowered: true,
        isMotorOn: true,
        speedRpm: 33,
        pitch: 0,
        motorState: 'running',
        transportPhase: 'idle',
        transport,
        hasRecord,
        dispatch,
      }),
      { initialProps: { hasRecord: false } },
    );
    result.current.slipmatRef.current = target;

    const emptyDown = {
      button: 0, isPrimary: true, preventDefault: vi.fn(),
      pointerId: 33, clientX: 75, clientY: 50, currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;
    act(() => result.current.onEmptyPlatterPointerDown(emptyDown));
    const emptyMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(emptyMove, {
      pointerId: { value: 33 }, clientX: { value: 50 }, clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(emptyMove));
    const negativePlatterPhase = result.current.platterAngle;
    expect(negativePlatterPhase).toBeLessThan(0);

    const emptyUp = new Event('pointerup') as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(emptyUp, {
      pointerId: { value: 33 }, clientX: { value: 50 }, clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(emptyUp));
    rerender({ hasRecord: true });
    expect(result.current.angle).toBeCloseTo(negativePlatterPhase);

    result.current.discRef.current = target;
    const recordDown = {
      button: 0, isPrimary: true, preventDefault: vi.fn(),
      pointerId: 34, clientX: 75, clientY: 50, currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;
    act(() => result.current.onPointerDown(recordDown));
    const recordMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(recordMove, {
      pointerId: { value: 34 }, clientX: { value: 50 }, clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(recordMove));
    expect(result.current.angle).toBeLessThan(negativePlatterPhase);

    unmount();
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
    (pointerDown as unknown as { currentTarget: HTMLDivElement | null }).currentTarget = null;

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

  it('anchors scratch timecode to the live playhead without jumping the visible platter on pointer down', () => {
    const dispatch = vi.fn(() => true);
    const transport = {
      isLoaded: true,
      duration: 100,
      currentTime: 0,
      getCurrentTime: vi.fn(() => 42),
    } as unknown as DeckTransport;
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

    const event = {
      button: 0,
      isPrimary: true,
      preventDefault: vi.fn(),
      pointerId: 10,
      clientX: 120,
      clientY: 120,
      currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => result.current.onPointerDown(event));

    expect(transport.getCurrentTime).toHaveBeenCalledTimes(1);
    expect(result.current.angle).toBe(0);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SCRATCH_STARTED' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SCRATCH_MOVED',
      speed: 0,
      reversed: false,
      position: 42,
    });

    const pointerUp = new Event('pointerup') as Event & { pointerId: number };
    Object.defineProperty(pointerUp, 'pointerId', { value: 10 });
    act(() => window.dispatchEvent(pointerUp));
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

  it('lets an empty slipmat be held, pushed and pulled without dispatching scratch audio', () => {
    const dispatch = vi.fn(() => true);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0, top: 0, width: 100, height: 100,
        right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
      })),
    });
    const { result, unmount } = renderHook(() => useVinylMotion({
      isPowered: true,
      isMotorOn: true,
      speedRpm: 33,
      pitch: 0,
      motorState: 'running',
      transportPhase: 'idle',
      hasRecord: false,
      dispatch,
    }));
    result.current.slipmatRef.current = target;

    const pointerDown = {
      button: 0,
      isPrimary: true,
      preventDefault: vi.fn(),
      pointerId: 11,
      clientX: 75,
      clientY: 50,
      currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => result.current.onEmptyPlatterPointerDown(pointerDown));
    expect(result.current.isPlatterDragging).toBe(true);

    const pointerMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerMove, {
      pointerId: { value: 11 },
      clientX: { value: 50 },
      clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(pointerMove));

    expect(result.current.platterAngle).toBeCloseTo(-Math.PI / 2);
    expect(result.current.angle).toBe(0);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SCRATCH_STARTED' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SCRATCH_MOVED' }));

    const pointerUp = new Event('pointerup') as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerUp, {
      pointerId: { value: 11 },
      clientX: { value: 50 },
      clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(pointerUp));

    expect(result.current.isPlatterDragging).toBe(false);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SCRATCH_ENDED' });
    unmount();
  });

  it('keeps platter phase continuous when a record is loaded and unloaded', () => {
    vi.useFakeTimers();
    const frames: Array<{ id: number; callback: FrameRequestCallback }> = [];
    let nextFrameId = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.push({ id, callback });
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      const index = frames.findIndex((frame) => frame.id === id);
      if (index >= 0) frames.splice(index, 1);
    }));

    const dispatch = vi.fn(() => true);
    const transport = {
      isLoaded: false,
      duration: 120,
      currentTime: 0,
    } as unknown as DeckTransport;
    const { result, rerender, unmount } = renderHook(
      ({ hasRecord }) => useVinylMotion({
        isPowered: true,
        isMotorOn: true,
        speedRpm: 33,
        pitch: 0,
        motorState: 'running',
        transportPhase: 'idle',
        transport,
        hasRecord,
        dispatch,
      }),
      { initialProps: { hasRecord: false } },
    );

    const stepFrame = () => {
      act(() => {
        vi.advanceTimersByTime(16);
        const frame = frames.shift();
        expect(frame).toBeDefined();
        frame?.callback(performance.now());
      });
    };

    stepFrame();
    const phaseBeforeLoad = result.current.platterAngle;
    expect(phaseBeforeLoad).toBeGreaterThan(0);

    rerender({ hasRecord: true });
    expect(result.current.platterAngle).toBe(phaseBeforeLoad);
    expect(result.current.angle).toBeCloseTo(phaseBeforeLoad);

    rerender({ hasRecord: false });
    expect(result.current.platterAngle).toBe(phaseBeforeLoad);
    stepFrame();
    expect(result.current.platterAngle).toBeGreaterThan(phaseBeforeLoad);

    unmount();
    vi.useRealTimers();
  });

  it('keeps the motor-driven platter moving while a loaded record is independently scratched', () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    const dispatch = vi.fn(() => true);
    const transport = {
      isLoaded: true,
      duration: 100,
      currentTime: 0,
      getCurrentTime: vi.fn(() => 0),
    } as unknown as DeckTransport;
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0, top: 0, width: 100, height: 100,
        right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
      })),
    });
    const { result, unmount } = renderHook(() => useVinylMotion({
      isPowered: true,
      isMotorOn: true,
      speedRpm: 33,
      pitch: 0,
      motorState: 'running',
      transportPhase: 'playing',
      transport,
      hasRecord: true,
      dispatch,
    }));
    result.current.discRef.current = target;

    const stepFrame = () => {
      act(() => {
        vi.advanceTimersByTime(16);
        const callback = frames.shift();
        expect(callback).toBeDefined();
        callback?.(performance.now());
      });
    };

    stepFrame();
    const platterBeforeScratch = result.current.platterAngle;
    const recordBeforeScratch = result.current.angle;

    const pointerDown = {
      button: 0,
      isPrimary: true,
      preventDefault: vi.fn(),
      pointerId: 12,
      clientX: 75,
      clientY: 50,
      currentTarget: target,
    } as unknown as ReactPointerEvent<HTMLDivElement>;
    act(() => result.current.onPointerDown(pointerDown));
    expect(result.current.isScratching).toBe(true);

    stepFrame();
    expect(result.current.platterAngle).toBeGreaterThan(platterBeforeScratch);
    expect(result.current.angle).toBe(recordBeforeScratch);

    const pointerMove = new Event('pointermove', { cancelable: true }) as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerMove, {
      pointerId: { value: 12 },
      clientX: { value: 50 },
      clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(pointerMove));
    const recordAfterScratchMove = result.current.angle;
    expect(recordAfterScratchMove).not.toBe(recordBeforeScratch);
    stepFrame();

    expect(result.current.platterAngle).toBeGreaterThan(platterBeforeScratch);
    expect(result.current.angle).toBe(recordAfterScratchMove);
    expect(result.current.isScratching).toBe(true);

    const pointerUp = new Event('pointerup') as Event & {
      pointerId: number; clientX: number; clientY: number;
    };
    Object.defineProperties(pointerUp, {
      pointerId: { value: 12 },
      clientX: { value: 50 },
      clientY: { value: 25 },
    });
    act(() => window.dispatchEvent(pointerUp));
    expect(result.current.isScratching).toBe(false);

    unmount();
    vi.useRealTimers();
  });

  it('cancels local pointer ownership when the machine ends scratching externally', () => {
    const dispatch = vi.fn((event: { type: string }) => event.type !== 'BLOCKED');
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
      { initialProps: { transportPhase: 'playing' as 'playing' | 'paused' } },
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
