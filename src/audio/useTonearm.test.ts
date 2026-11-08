import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeckEvent, ArmInteraction } from '../state/deckMachine';
import type { TonearmState } from './tonearmGeometry';
import { useTonearm } from './useTonearm';

interface HookProps {
  currentTime: number;
  armState: TonearmState;
  armInteraction: ArmInteraction;
}

const createDispatch = () => vi.fn(() => true);

describe('useTonearm state-machine integration', () => {
  it('starts parked and visually follows no playback until the machine reports needle contact', () => {
    const dispatch = createDispatch();
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 0,
      armState: 'parked',
      armInteraction: 'idle',
      dispatch,
    }));

    expect(result.current.armAngle).toBe(0);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isNeedleDown).toBe(false);
  });

  it('follows playback position only while the machine says the needle is down', () => {
    const dispatch = createDispatch();
    const { result, rerender } = renderHook(
      (props: HookProps) => useTonearm({
        duration: 100,
        ...props,
        dispatch,
      }),
      { initialProps: { currentTime: 0, armState: 'needle-down', armInteraction: 'idle' } },
    );

    rerender({ currentTime: 50, armState: 'needle-down', armInteraction: 'idle' });
    expect(result.current.armAngle).toBe(35.5);
    rerender({ currentTime: 75, armState: 'lifted', armInteraction: 'idle' });
    expect(result.current.armAngle).toBe(35.5);
  });

  it('routes keyboard lifting and parking through typed deck events', () => {
    const dispatch = createDispatch();
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 0,
      armState: 'needle-down',
      armInteraction: 'idle',
      dispatch,
    }));

    act(() => result.current.liftArm());
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'ARM_LIFTED' });

    act(() => result.current.parkArm());
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'ARM_PARKED' });
    expect(result.current.armAngle).toBe(0);
  });

  it('sends a typed initial-drop event with the outer-lead-in position', () => {
    const dispatch = createDispatch();
    const { result } = renderHook(() => useTonearm({
      duration: 100,
      currentTime: 12,
      armState: 'lifted',
      armInteraction: 'idle',
      dispatch,
    }));

    act(() => {
      for (let index = 0; index < 12; index++) {
        result.current.handleKeyDown({
          key: 'ArrowRight',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>);
      }
      result.current.lowerArm();
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'ARM_DROPPED',
      angle: 24,
      wasAlreadyNeedleDown: false,
      position: 0,
      tooFast: false,
    });
  });

  it('cancels pointer drags through the machine without leaving a pointer owner behind', () => {
    const dispatch = createDispatch();
    const props = {
      duration: 100,
      currentTime: 0,
      armState: 'parked' as TonearmState,
      armInteraction: 'idle' as ArmInteraction,
      dispatch,
    };
    const { result, rerender } = renderHook(
      (current: typeof props) => useTonearm(current),
      { initialProps: props },
    );

    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
      closest: vi.fn().mockReturnValue(null),
    };
    const pointerEvent = {
      button: 0,
      pointerId: 42,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
      stopPropagation: vi.fn(),
      currentTarget: target,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => result.current.handlePointerDown(pointerEvent));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'ARM_PICKED_UP' });
    expect(target.setPointerCapture).toHaveBeenCalledWith(42);

    rerender({ ...props, armState: 'lifted', armInteraction: 'dragging' });
    expect(result.current.isDragging).toBe(true);
    act(() => result.current.handlePointerCancel(pointerEvent));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'ARM_DRAG_CANCELLED' });

    rerender({ ...props, armState: 'lifted', armInteraction: 'idle' });
    expect(result.current.isDragging).toBe(false);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(42);
  });
});
