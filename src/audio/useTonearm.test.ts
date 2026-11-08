import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTonearm } from './useTonearm';

describe('useTonearm', () => {
  it('initializes in parked state at 0 degrees with stylus muted', () => {
    const onStylusContactChange = vi.fn();
    const onSeek = vi.fn();

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 0,
        onStylusContactChange,
        onSeek,
      })
    );

    expect(result.current.armState).toBe('parked');
    expect(result.current.armAngle).toBe(0);
    expect(result.current.isNeedleDown).toBe(false);
  });

  it('updates angle when following playback progress while needle is down', () => {
    const onStylusContactChange = vi.fn();
    const onSeek = vi.fn();

    const { result, rerender } = renderHook(
      ({ currentTime }) =>
        useTonearm({
          duration: 100,
          currentTime,
          onStylusContactChange,
          onSeek,
        }),
      { initialProps: { currentTime: 0 } }
    );

    // Step to outer groove (24 deg) via keyboard
    act(() => {
      for (let i = 0; i < 12; i++) {
        result.current.handleKeyDown({
          key: 'ArrowRight',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>);
      }
    });

    act(() => {
      result.current.lowerArm();
    });

    expect(result.current.armState).toBe('needle-down');
    expect(result.current.isNeedleDown).toBe(true);
    expect(onStylusContactChange).toHaveBeenCalledWith(true);

    // Advance playback time to 50s (50% progress)
    rerender({ currentTime: 50 });
    // outer: 24, inner: 47 -> 50% = 35.5
    expect(result.current.armAngle).toBe(35.5);
  });

  it('allows lifting and parking the tonearm with smooth muting', () => {
    const onStylusContactChange = vi.fn();
    const onSeek = vi.fn();

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 10,
        onStylusContactChange,
        onSeek,
      })
    );

    // Move to 24 deg and drop needle
    act(() => {
      for (let i = 0; i < 12; i++) {
        result.current.handleKeyDown({
          key: 'ArrowRight',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>);
      }
      result.current.lowerArm();
    });

    expect(result.current.isNeedleDown).toBe(true);

    // Lift needle
    act(() => {
      result.current.liftArm();
    });
    expect(result.current.armState).toBe('lifted');
    expect(result.current.isNeedleDown).toBe(false);
    expect(onStylusContactChange).toHaveBeenLastCalledWith(false);

    // Park arm
    act(() => {
      result.current.parkArm();
    });
    expect(result.current.armState).toBe('parked');
    expect(result.current.armAngle).toBe(0);
    expect(onStylusContactChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the finger attached to the headshell while dragging to the outer lead-in', () => {
    const onStylusContactChange = vi.fn();
    const onNeedleDropSound = vi.fn();
    const onSeek = vi.fn();
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 0,
      onStylusContactChange,
      onNeedleDropSound,
      onSeek,
    }));

    const board = document.createElement('div');
    board.className = 'bd';
    const armTarget = document.createElement('div');
    board.appendChild(armTarget);
    document.body.appendChild(board);

    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);

    Object.assign(armTarget, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    const pivotX = (1 - 0.0275 - 0.2855 + 0.2855 * 0.54) * 800;
    const pivotY = -0.04 * 800 + 0.9975 * 0.27 * 600;
    const pointAt = (degrees: number) => ({
      x: pivotX + Math.cos((degrees * Math.PI) / 180) * 140 + 100,
      y: pivotY + Math.sin((degrees * Math.PI) / 180) * 140 + 50,
    });
    const start = pointAt(116);
    const outerLeadIn = pointAt(140);
    const eventAt = (point: { x: number; y: number }) => ({
      button: 0,
      pointerId: 7,
      isPrimary: true,
      clientX: point.x,
      clientY: point.y,
      stopPropagation: vi.fn(),
      currentTarget: armTarget,
    }) as unknown as React.PointerEvent<HTMLElement>;

    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    act(() => {
      result.current.handlePointerDown(eventAt(start));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.handlePointerMove(eventAt(outerLeadIn));
    });
    expect(result.current.armAngle).toBeCloseTo(24, 3);

    act(() => {
      result.current.handlePointerUp(eventAt(outerLeadIn));
    });

    expect(result.current.armState).toBe('needle-down');
    expect(onStylusContactChange).toHaveBeenLastCalledWith(true);
    expect(onNeedleDropSound).toHaveBeenLastCalledWith('correct');
    expect(onSeek).toHaveBeenCalledWith(0);

    now.mockRestore();
    board.remove();
  });

  it('rejects an initial needle drop away from the outer lead-in', () => {
    const onStylusContactChange = vi.fn();
    const onNeedleDropSound = vi.fn();
    const onSeek = vi.fn();
    const { result } = renderHook(() => useTonearm({
      duration: 100, currentTime: 0, onStylusContactChange, onNeedleDropSound, onSeek,
    }));

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.handleKeyDown({
          key: 'ArrowRight', preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>);
      }
      result.current.lowerArm();
    });

    expect(result.current.armAngle).toBe(30);
    expect(result.current.armState).toBe('lifted');
    expect(onStylusContactChange).toHaveBeenLastCalledWith(false);
    expect(onNeedleDropSound).toHaveBeenLastCalledWith('wrong');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('handles pointer cancel and lostpointercapture gracefully without stuck state', () => {
    const onStylusContactChange = vi.fn();
    const onSeek = vi.fn();

    const { result } = renderHook(() =>
      useTonearm({
        duration: 100,
        currentTime: 0,
        onStylusContactChange,
        onSeek,
      })
    );

    const mockEvent = {
      button: 0,
      pointerId: 42,
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
    expect(result.current.isDragging).toBe(true);
    expect(result.current.armState).toBe('lifted');

    act(() => {
      result.current.handlePointerCancel(mockEvent);
    });
    expect(result.current.isDragging).toBe(false);
    expect(result.current.armState).toBe('lifted');
    expect(onStylusContactChange).toHaveBeenLastCalledWith(false);

    const secondPointer = { ...mockEvent, pointerId: 43 } as React.PointerEvent<HTMLElement>;
    act(() => {
      result.current.handlePointerDown(secondPointer);
      result.current.handleLostPointerCapture(secondPointer);
    });
    expect(result.current.isDragging).toBe(false);
    expect(result.current.armState).toBe('lifted');
    expect(onSeek).not.toHaveBeenCalled();
  });
});
