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
  });
});
