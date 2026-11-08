import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTonearm } from './useTonearm';

describe('useTonearm', () => {
  it('initializes in parked state at 0 degrees', () => {
    const dispatch = vi.fn(() => true);

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 0,
        armState: 'parked',
        armInteraction: 'idle',
        dispatch,
      })
    );

    expect(result.current.armAngle).toBe(0);
    expect(result.current.isNeedleDown).toBe(false);
  });

  it('updates angle when following playback progress while needle is down', () => {
    const dispatch = vi.fn(() => true);

    const { result, rerender } = renderHook(
      ({ currentTime, armState }) =>
        useTonearm({
          duration: 100,
          currentTime,
          armState,
          armInteraction: 'idle',
          dispatch,
        }),
      { initialProps: { currentTime: 0, armState: 'needle-down' as const } }
    );

    // outer: 24, inner: 47 -> at 50% (50s) progress = 35.5
    rerender({ currentTime: 50, armState: 'needle-down' });
    expect(result.current.armAngle).toBe(35.5);
  });

  it('dispatches ARM_LIFTED and ARM_PARKED on lift and park', () => {
    const dispatch = vi.fn(() => true);

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 10,
        armState: 'needle-down',
        armInteraction: 'idle',
        dispatch,
      })
    );

    act(() => {
      result.current.liftArm();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_LIFTED' });

    act(() => {
      result.current.parkArm();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_PARKED' });
    expect(result.current.armAngle).toBe(0);
  });

  it('dispatches ARM_DROPPED on lowerArm', () => {
    const dispatch = vi.fn(() => true);

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 0,
        armState: 'lifted',
        armInteraction: 'idle',
        dispatch,
      })
    );

    act(() => {
      result.current.lowerArm();
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ARM_DROPPED',
      })
    );
  });

  it('handles pointer cancel and lostpointercapture gracefully by dispatching ARM_DRAG_CANCELLED', () => {
    const dispatch = vi.fn(() => true);

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 0,
        armState: 'lifted',
        armInteraction: 'dragging',
        dispatch,
      })
    );

    const mockEvent = {
      button: 0,
      pointerId: 42,
      isPrimary: true,
      stopPropagation: vi.fn(),
      currentTarget: {
        setPointerCapture: vi.fn(),
        hasPointerCapture: vi.fn().mockReturnValue(true),
        releasePointerCapture: vi.fn(),
        closest: vi.fn(),
      },
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.handlePointerDown(mockEvent);
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_PICKED_UP' });

    act(() => {
      result.current.handlePointerCancel(mockEvent);
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_DRAG_CANCELLED' });
  });
});
