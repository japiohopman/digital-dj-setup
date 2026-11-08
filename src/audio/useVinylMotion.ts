import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import type { DeckTransport } from './types';
import type { DeckEvent, MotorPhase, TransportPhase } from '../state/deckMachine';

export interface UseVinylMotionOptions {
  isPowered: boolean;
  isMotorOn: boolean;
  speedRpm: 33 | 45;
  pitch: number;
  motorState: MotorPhase;
  transportPhase: TransportPhase;
  transport?: DeckTransport | undefined;
  dispatch: (event: DeckEvent) => boolean;
  centerElementRef?: React.RefObject<HTMLElement | null> | undefined;
}

const TWO_PI = Math.PI * 2;
const normalizeDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function resolveScratchDirection(deltaAngle: number, previousDirection: boolean): boolean {
  const movementEpsilon = 1e-7;
  return Math.abs(deltaAngle) > movementEpsilon ? deltaAngle < 0 : previousDirection;
}

export function calculateScratchSpeedMagnitude(deltaAngle: number, expectedAngleDelta: number): number {
  return expectedAngleDelta > 0 ? Math.abs(deltaAngle / expectedAngleDelta) : 0;
}

export function calculateScratchTrackPosition(
  startPosition: number,
  accumulatedAngle: number,
  effectiveRps: number,
  duration: number,
): number {
  if (!Number.isFinite(startPosition) || !Number.isFinite(accumulatedAngle) ||
    !Number.isFinite(effectiveRps) || effectiveRps <= 0 || !Number.isFinite(duration) || duration < 0) {
    return 0;
  }
  const position = startPosition + accumulatedAngle / (TWO_PI * effectiveRps);
  return Math.max(0, Math.min(duration, position));
}

/**
 * Platter rendering and pointer physics stay local to this hook.
 * Every playback-affecting action is emitted as a typed deck event.
 */
export function useVinylMotion({
  isPowered,
  isMotorOn,
  speedRpm,
  pitch,
  motorState,
  transportPhase,
  transport,
  dispatch,
  centerElementRef,
}: UseVinylMotionOptions) {
  const [angle, setAngle] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const angleRef = useRef(0);
  const anglePreviousRef = useRef(0);
  const isScratchingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const draggingFromRef = useRef<{ x: number; y: number } | null>(null);
  const scratchStartAngleRef = useRef(0);
  const scratchStartPositionRef = useRef(0);
  const cleanupScratchRef = useRef<((dispatchEnd: boolean, updateState?: boolean) => void) | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const timestampPreviousRef = useRef(performance.now());
  const discRef = useRef<HTMLDivElement | null>(null);
  const draggingSpeedsRef = useRef<number[]>([]);
  const lastScratchDirectionRef = useRef(false);

  const baseRps = speedRpm === 33 ? 33.3333 / 60 : 45 / 60;
  const effectiveRps = baseRps * (1 + pitch / 100);
  const radsPerMs = (effectiveRps * TWO_PI) / 1000;
  const effectivePlaybackRate = (speedRpm === 45 ? 45 / 33.3333 : 1.0) * (1 + pitch / 100);

  useEffect(() => {
    dispatch({ type: 'PLAYBACK_RATE_CHANGED', rate: effectivePlaybackRate });
  }, [dispatch, effectivePlaybackRate]);

  // A running platter keeps rotating even after the loaded track reaches its end.

  const prefersReducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  const lastTransportTimeRef = useRef(transport?.currentTime ?? 0);
  useEffect(() => {
    if (!transport || isScratchingRef.current) return;
    const currentTime = transport.currentTime;
    const previousTime = lastTransportTimeRef.current;
    lastTransportTimeRef.current = currentTime;
    if (currentTime === 0 || Math.abs(currentTime - previousTime) > 1.5) {
      const targetAngle = currentTime * effectiveRps * TWO_PI;
      angleRef.current = targetAngle;
      setAngle(targetAngle);
    }
  }, [transport?.currentTime, effectiveRps, transport]);

  const coastProgressRef = useRef<{ start: number; duration: number } | null>(null);
  const spinUpProgressRef = useRef<{ start: number; duration: number } | null>(null);

  useEffect(() => {
    if (motorState === 'coasting') coastProgressRef.current = { start: performance.now(), duration: 1200 };
    else coastProgressRef.current = null;

    if (motorState === 'spinning-up') spinUpProgressRef.current = { start: performance.now(), duration: 450 };
    else spinUpProgressRef.current = null;
  }, [motorState]);

  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      const now = performance.now();
      const dt = Math.min(100, Math.max(1, now - timestampPreviousRef.current));

      const isCoasting = motorState === 'coasting' && coastProgressRef.current !== null;
      let coastFactor = 1;
      if (isCoasting) {
        const elapsed = now - coastProgressRef.current!.start;
        const progress = Math.min(1, Math.max(0, elapsed / coastProgressRef.current!.duration));
        coastFactor = 1 - progress;
      }

      const isSpinningUp = motorState === 'spinning-up' && spinUpProgressRef.current !== null;
      let spinUpFactor = 1;
      if (isSpinningUp) {
        const elapsed = now - spinUpProgressRef.current!.start;
        const progress = Math.min(1, Math.max(0, elapsed / spinUpProgressRef.current!.duration));
        spinUpFactor = 0.2 + 0.8 * progress;
      }

      if (!isScratchingRef.current) {
        const shouldRotate = isCoasting
          ? coastFactor > 0.001
          : isSpinningUp || motorState === 'running';

        if (shouldRotate && !prefersReducedMotionRef.current) {
          const speedMod = isCoasting ? coastFactor : isSpinningUp ? spinUpFactor : 1;
          const newAngle = angleRef.current + radsPerMs * dt * speedMod;
          angleRef.current = newAngle;
          setAngle(newAngle);
        }
      } else {
        const deltaAngle = angleRef.current - anglePreviousRef.current;
        const expectedAngleDelta = radsPerMs * dt;
        const instantSpeed = calculateScratchSpeedMagnitude(deltaAngle, expectedAngleDelta);
        draggingSpeedsRef.current.push(instantSpeed);
        if (draggingSpeedsRef.current.length > 8) draggingSpeedsRef.current.shift();

        const averageSpeed = draggingSpeedsRef.current.reduce((a, b) => a + b, 0) /
          Math.max(1, draggingSpeedsRef.current.length);
        const reversed = resolveScratchDirection(deltaAngle, lastScratchDirectionRef.current);
        lastScratchDirectionRef.current = reversed;
        const scratchAngleDelta = angleRef.current - scratchStartAngleRef.current;
        const currentSeconds = calculateScratchTrackPosition(
          scratchStartPositionRef.current,
          scratchAngleDelta,
          effectiveRps,
          transport?.duration ?? 0,
        );

        dispatch({
          type: 'SCRATCH_MOVED',
          speed: averageSpeed,
          reversed,
          position: currentSeconds,
        });
      }

      anglePreviousRef.current = angleRef.current;
      timestampPreviousRef.current = now;
      rafIdRef.current = requestAnimationFrame(loop);
    };

    timestampPreviousRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [motorState, dispatch, radsPerMs, effectiveRps]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    if (!isPowered || !isMotorOn || !transport?.isLoaded) return;
    e.preventDefault();
    if (activePointerIdRef.current !== null) return;
    if (!dispatch({ type: 'SCRATCH_STARTED' })) return;

    const centerTarget = centerElementRef?.current ?? discRef.current;
    if (centerTarget) {
      const rect = centerTarget.getBoundingClientRect();
      centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    activePointerIdRef.current = e.pointerId;
    draggingFromRef.current = { x: e.clientX, y: e.clientY };
    scratchStartAngleRef.current = angleRef.current;
    const duration = transport.duration;
    scratchStartPositionRef.current = Number.isFinite(duration)
      ? Math.max(0, Math.min(duration, transport.currentTime))
      : 0;
    anglePreviousRef.current = angleRef.current;
    isScratchingRef.current = true;
    setIsScratching(true);
    draggingSpeedsRef.current = [];
    lastScratchDirectionRef.current = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can be unavailable in test environments.
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        !isScratchingRef.current ||
        !draggingFromRef.current ||
        moveEvent.pointerId !== activePointerIdRef.current
      ) return;
      moveEvent.preventDefault();

      const current = { x: moveEvent.clientX, y: moveEvent.clientY };
      const center = centerRef.current;
      const angleCurrent = Math.atan2(current.y - center.y, current.x - center.x);
      const angleFrom = Math.atan2(
        draggingFromRef.current.y - center.y,
        draggingFromRef.current.x - center.x,
      );
      const delta = normalizeDelta(angleFrom, angleCurrent);
      const nextAngle = Math.max(0, angleRef.current - delta);
      angleRef.current = nextAngle;
      setAngle(nextAngle);
      draggingFromRef.current = current;
    };

    const upPointerId = e.pointerId;
    const finishGesture = (dispatchEnd: boolean, updateState = true) => {
      if (activePointerIdRef.current !== upPointerId) return;
      try {
        if (e.currentTarget.hasPointerCapture(upPointerId)) {
          e.currentTarget.releasePointerCapture(upPointerId);
        }
      } catch {
        // The pointer may already have been released or capture lost.
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      activePointerIdRef.current = null;
      isScratchingRef.current = false;
      if (updateState) setIsScratching(false);
      draggingFromRef.current = null;
      cleanupScratchRef.current = null;
      if (dispatchEnd) dispatch({ type: 'SCRATCH_ENDED' });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== activePointerIdRef.current) return;
      finishGesture(true);
    };
    cleanupScratchRef.current = finishGesture;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [centerElementRef, dispatch, isMotorOn, isPowered, transport]);

  useEffect(() => {
    if (transportPhase !== 'scratching' && isScratchingRef.current) {
      cleanupScratchRef.current?.(false);
    }
  }, [transportPhase]);

  useEffect(() => () => {
    cleanupScratchRef.current?.(false, false);
  }, []);

  return { angle, isScratching, discRef, onPointerDown };
}
