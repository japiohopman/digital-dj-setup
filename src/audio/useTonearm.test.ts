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

    // LP outer: 11, inner: 47 -> at 50% (50s) progress = 29
    rerender({ currentTime: 50, armState: 'needle-down' });
    expect(result.current.armAngle).toBeCloseTo(29, 5);
  });

  it('returns the tonearm to its cradle when a new track is loaded', () => {
    const dispatch = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ currentTime, armState }) => useTonearm({
        duration: 100,
        currentTime,
        armState,
        armInteraction: 'idle',
        dispatch,
      }),
      { initialProps: { currentTime: 50, armState: 'needle-down' as 'needle-down' | 'parked' } },
    );

    expect(result.current.armAngle).toBeCloseTo(29, 5);

    // TRACK_LOAD_REQUESTED parks the arm before replacing the record.
    rerender({ currentTime: 0, armState: 'parked' });
    expect(result.current.armAngle).toBe(0);
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

  it('does not move the arm with keyboard cues while the platter is scratching', () => {
    const dispatch = vi.fn(() => true);
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 20,
      armState: 'needle-down',
      armInteraction: 'idle',
      transportPhase: 'scratching',
      dispatch,
    }));

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowRight',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });

    expect(result.current.armAngle).toBeCloseTo(20.2, 5);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ARM_CUE' }));
  });

  it('clears an active pointer when the machine resets arm interaction', () => {
    const dispatch = vi.fn(() => true);
    const board = document.createElement('div');
    board.className = 'bd';
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
      closest: vi.fn().mockReturnValue(board),
    });
    const { result, rerender } = renderHook(
      ({ armInteraction }) => useTonearm({
        duration: 100, currentTime: 0, armState: 'lifted',
        armInteraction, dispatch,
      }),
      { initialProps: { armInteraction: 'idle' as 'idle' | 'dragging' } },
    );
    const event = {
      button: 0, pointerId: 5, isPrimary: true,
      clientX: 200, clientY: 200,
      stopPropagation: vi.fn(), currentTarget: target,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => result.current.handlePointerDown(event));
    rerender({ armInteraction: 'dragging' });
    rerender({ armInteraction: 'idle' });
    expect(target.releasePointerCapture).toHaveBeenCalledWith(5);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_PICKED_UP' });
  });

  it('aborts an active drag on lostpointercapture without cueing', () => {
    const dispatch = vi.fn(() => true);
    const target = Object.assign(document.createElement('div'), {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
      closest: vi.fn().mockReturnValue(null),
    });
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 0,
      armState: 'lifted',
      armInteraction: 'idle',
      dispatch,
    }));
    const event = {
      button: 0,
      pointerId: 77,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
      stopPropagation: vi.fn(),
      currentTarget: target,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => result.current.handlePointerDown(event));
    act(() => result.current.handleLostPointerCapture(event));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_PICKED_UP' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ARM_DRAG_CANCELLED' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ARM_DROPPED' }));
    expect(target.releasePointerCapture).toHaveBeenCalledWith(77);
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
