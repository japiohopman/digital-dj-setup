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
  hasRecord?: boolean | undefined;
  dispatch: (event: DeckEvent) => boolean;
  centerElementRef?: React.RefObject<HTMLElement | null> | undefined;
}

type GestureMode = 'record' | 'empty-platter';

interface AngularResume {
  startedAt: number;
  fromAngularVelocity: number;
  durationMs: number;
}

const TWO_PI = Math.PI * 2;
const normalizeDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const RESUME_DURATION_MS = 240;
const STATIONARY_POINTER_MS = 80;
// Application interaction limit: cap hand-driven catch-up speed to avoid
// extreme angular velocity from pointer events delivered in very short intervals.
const MAX_MANUAL_ANGULAR_VELOCITY = 0.02;

/** Keeps record motion at or above its zero boundary without erasing an inherited negative phase. */
export function applyRecordAngularDelta(currentAngle: number, deltaAngle: number): number {
  const nextAngle = currentAngle + deltaAngle;
  return currentAngle >= 0 ? Math.max(0, nextAngle) : nextAngle;
}

/** Bounds hand-driven angular velocity while preserving ordinary drag speeds. */
export function clampManualAngularVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0;
  return Math.max(
    -MAX_MANUAL_ANGULAR_VELOCITY,
    Math.min(MAX_MANUAL_ANGULAR_VELOCITY, velocity),
  );
}

/** Eases a manually moved surface's velocity back to the current motor speed. */
function getResumedAngularVelocity(
  targetVelocity: number,
  resume: AngularResume | null,
  now: number,
): { velocity: number; resume: AngularResume | null } {
  if (!resume) return { velocity: targetVelocity, resume: null };

  const progress = Math.min(1, Math.max(0, (now - resume.startedAt) / resume.durationMs));
  if (progress >= 1) return { velocity: targetVelocity, resume: null };

  // Smoothly bring a hand-driven surface back to the motor's current speed.
  const easedProgress = progress * progress * (3 - 2 * progress);
  return {
    velocity: resume.fromAngularVelocity +
      (targetVelocity - resume.fromAngularVelocity) * easedProgress,
    resume,
  };
}

/** Preserves the last real scratch direction when animation frames contain no pointer movement. */
export function resolveScratchDirection(deltaAngle: number, previousDirection: boolean): boolean {
  const movementEpsilon = 1e-7;
  return Math.abs(deltaAngle) > movementEpsilon ? deltaAngle < 0 : previousDirection;
}

/** Converts angular movement into a non-negative scratch speed independent of direction. */
export function calculateScratchSpeedMagnitude(deltaAngle: number, expectedAngleDelta: number): number {
  return expectedAngleDelta > 0 ? Math.abs(deltaAngle / expectedAngleDelta) : 0;
}

/**
 * Mirrors the CodePen's single-source-of-truth timecode:
 * elapsed seconds = absolute record angle / (2π × record rotations per second).
 */
export function calculateScratchTrackPosition(
  recordAngle: number,
  effectiveRps: number,
  duration: number,
): number {
  if (!Number.isFinite(recordAngle) || !Number.isFinite(effectiveRps) ||
    effectiveRps <= 0 || !Number.isFinite(duration) || duration < 0) {
    return 0;
  }
  return Math.max(0, Math.min(duration, recordAngle / (TWO_PI * effectiveRps)));
}

/**
 * Derives scratch timecode from the live transport position at pointer-down
 * plus the visible record's angular movement during this gesture.
 */
export function calculateScratchTrackPositionFromGesture(
  startPosition: number,
  currentVisualAngle: number,
  startVisualAngle: number,
  effectiveRps: number,
  duration: number,
): number {
  if (
    ![startPosition, currentVisualAngle, startVisualAngle, effectiveRps, duration].every(Number.isFinite) ||
    effectiveRps <= 0 ||
    duration < 0
  ) {
    return 0;
  }
  const angularDelta = currentVisualAngle - startVisualAngle;
  return Math.max(0, Math.min(duration,
    startPosition + angularDelta / (TWO_PI * effectiveRps)));
}

/**
 * Keeps the motor-driven platter/slipmat phase separate from the independently
 * manipulated record phase. The empty slipmat gesture is deliberately silent:
 * it never dispatches transport or scratch events.
 */
export function useVinylMotion({
  isPowered,
  isMotorOn,
  speedRpm,
  pitch,
  motorState,
  transportPhase,
  transport,
  hasRecord = transport?.isLoaded ?? false,
  dispatch,
  centerElementRef,
}: UseVinylMotionOptions) {
  const [platterAngle, setPlatterAngle] = useState(0);
  const [angle, setAngle] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const [isPlatterDragging, setIsPlatterDragging] = useState(false);

  const platterAngleRef = useRef(0);
  const recordAngleRef = useRef(0);
  const recordAnglePreviousRef = useRef(0);
  const isScratchingRef = useRef(false);
  const isPlatterDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const activeGestureModeRef = useRef<GestureMode | null>(null);
  const scratchReleasePositionRef = useRef<number | null>(null);
  const draggingFromRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerAngleRef = useRef(0);
  const lastPointerMoveAtRef = useRef(0);
  const manualAngularVelocityRef = useRef(0);
  const cleanupGestureRef = useRef<((dispatchEnd: boolean, updateState?: boolean) => void) | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const timestampPreviousRef = useRef(performance.now());
  const discRef = useRef<HTMLDivElement | null>(null);
  const slipmatRef = useRef<HTMLDivElement | null>(null);
  const draggingSpeedsRef = useRef<number[]>([]);
  const lastScratchDirectionRef = useRef(false);
  const scratchStartPositionRef = useRef(0);
  const scratchStartVisualAngleRef = useRef(0);
  const platterResumeRef = useRef<AngularResume | null>(null);
  const recordResumeRef = useRef<AngularResume | null>(null);
  const hadRecordRef = useRef(hasRecord);
  const lastTransportTimeRef = useRef(transport?.currentTime ?? 0);

  const baseRps = speedRpm === 33 ? 33.3333 / 60 : 45 / 60;
  const effectiveRps = baseRps * (1 + pitch / 100);
  const radsPerMs = (effectiveRps * TWO_PI) / 1000;
  const effectivePlaybackRate = (speedRpm === 45 ? 45 / 33.3333 : 1.0) * (1 + pitch / 100);

  useEffect(() => {
    dispatch({ type: 'PLAYBACK_RATE_CHANGED', rate: effectivePlaybackRate });
  }, [dispatch, effectivePlaybackRate]);

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

  // A newly loaded record is placed at the platter's current phase. The platter
  // itself is never reset by loading/unloading a track.
  useEffect(() => {
    if (hasRecord && !hadRecordRef.current) {
      if (activeGestureModeRef.current === 'empty-platter') {
        cleanupGestureRef.current?.(false);
      }
      recordAngleRef.current = platterAngleRef.current;
      recordAnglePreviousRef.current = recordAngleRef.current;
      recordResumeRef.current = null;
      setAngle(recordAngleRef.current);
      lastTransportTimeRef.current = transport?.currentTime ?? 0;
    } else if (!hasRecord) {
      recordAngleRef.current = platterAngleRef.current;
      recordAnglePreviousRef.current = recordAngleRef.current;
      recordResumeRef.current = null;
    }
    hadRecordRef.current = hasRecord;
  }, [hasRecord]);

  useEffect(() => {
    if (!transport || !hasRecord) return;
    const currentTime = transport.currentTime;
    const previousTime = lastTransportTimeRef.current;
    lastTransportTimeRef.current = currentTime;

    // Keep the baseline moving with scratch-driven transport updates. They are
    // not external seeks and must never reposition the independent record layer.
    if (isScratchingRef.current) return;

    // The final SCRATCH_MOVED is dispatched as the pointer is released. Ignore
    // that one expected transport update even though the local gesture has ended.
    const releasedPosition = scratchReleasePositionRef.current;
    if (releasedPosition !== null) {
      const matchesScratchRelease = Math.abs(currentTime - releasedPosition) <= 0.1;
      const isExternalSeek = currentTime === 0 && previousTime > 0 ||
        Math.abs(currentTime - previousTime) > 1.5;
      if (matchesScratchRelease) {
        scratchReleasePositionRef.current = null;
        return;
      }
      if (!isExternalSeek) return;
      scratchReleasePositionRef.current = null;
    }

    const resetToStart = currentTime === 0 && previousTime > 0;
    const jumpedToAnotherPosition = Math.abs(currentTime - previousTime) > 1.5;
    if (resetToStart || jumpedToAnotherPosition) {
      // Cue/seek changes may reposition the record artwork, but must never
      // change the independent platter/slipmat motor phase.
      const targetAngle = currentTime * effectiveRps * TWO_PI;
      if (Math.abs(recordAngleRef.current - targetAngle) > 0.0001) {
        recordAngleRef.current = targetAngle;
        recordAnglePreviousRef.current = targetAngle;
        setAngle(targetAngle);
      }
    }
  }, [transport?.currentTime, effectiveRps, hasRecord]);

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

      const motorFactor = isCoasting
        ? (coastFactor > 0.001 ? coastFactor : 0)
        : isSpinningUp || motorState === 'running' ? spinUpFactor : 0;
      const targetMotorVelocity = prefersReducedMotionRef.current ? 0 : radsPerMs * motorFactor;

      const platterMotion = getResumedAngularVelocity(targetMotorVelocity, platterResumeRef.current, now);
      platterResumeRef.current = platterMotion.resume;
      if (!isPlatterDraggingRef.current && Math.abs(platterMotion.velocity) > 0.000001) {
        platterAngleRef.current += platterMotion.velocity * dt;
        setPlatterAngle(platterAngleRef.current);
      }

      if (!hasRecord) {
        // With no vinyl, there is no independent record layer. Keep its phase
        // ready to align with the platter when a record is loaded.
        recordAngleRef.current = platterAngleRef.current;
        recordAnglePreviousRef.current = recordAngleRef.current;
      } else if (!isScratchingRef.current) {
        const recordMotion = getResumedAngularVelocity(targetMotorVelocity, recordResumeRef.current, now);
        recordResumeRef.current = recordMotion.resume;
        if (Math.abs(recordMotion.velocity) > 0.000001) {
          recordAngleRef.current = applyRecordAngularDelta(
            recordAngleRef.current,
            recordMotion.velocity * dt,
          );
          setAngle(recordAngleRef.current);
        }
      } else {
        const deltaAngle = recordAngleRef.current - recordAnglePreviousRef.current;
        const expectedAngleDelta = radsPerMs * dt;
        const instantSpeed = calculateScratchSpeedMagnitude(deltaAngle, expectedAngleDelta);
        draggingSpeedsRef.current.push(instantSpeed);
        if (draggingSpeedsRef.current.length > 8) draggingSpeedsRef.current.shift();

        const averageSpeed = draggingSpeedsRef.current.reduce((a, b) => a + b, 0) /
          Math.max(1, draggingSpeedsRef.current.length);
        const reversed = resolveScratchDirection(deltaAngle, lastScratchDirectionRef.current);
        lastScratchDirectionRef.current = reversed;
        const currentSeconds = calculateScratchTrackPositionFromGesture(
          scratchStartPositionRef.current,
          recordAngleRef.current,
          scratchStartVisualAngleRef.current,
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

      recordAnglePreviousRef.current = recordAngleRef.current;
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
  }, [motorState, dispatch, radsPerMs, effectiveRps, transport?.duration, hasRecord]);

  const startGesture = useCallback((e: ReactPointerEvent<HTMLDivElement>, mode: GestureMode) => {
    // Each deck owns its own active pointer; allow non-primary touches so a second finger can control the other deck.
    if (e.button !== 0) return;
    if (activePointerIdRef.current !== null) return;

    if (mode === 'record') {
      if (!hasRecord || !isPowered || !isMotorOn || !transport?.isLoaded) return;
      if (!dispatch({ type: 'SCRATCH_STARTED' })) return;

      // Anchor audio timecode independently from both visible rotation phases.
      const duration = transport.duration;
      const livePosition = transport.getCurrentTime?.() ?? transport.currentTime;
      const startPosition = Number.isFinite(duration)
        ? Math.max(0, Math.min(duration, livePosition))
        : 0;
      scratchStartPositionRef.current = startPosition;
      scratchStartVisualAngleRef.current = recordAngleRef.current;
      recordAnglePreviousRef.current = recordAngleRef.current;
      recordResumeRef.current = null;
    } else {
      if (hasRecord) return;
      platterResumeRef.current = null;
    }

    e.preventDefault();

    const centerTarget = mode === 'record'
      ? (centerElementRef?.current ?? discRef.current)
      : slipmatRef.current;
    if (centerTarget) {
      const rect = centerTarget.getBoundingClientRect();
      centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    const pointerAngle = Math.atan2(e.clientY - centerRef.current.y, e.clientX - centerRef.current.x);
    activePointerIdRef.current = e.pointerId;
    activeGestureModeRef.current = mode;
    if (mode === 'record') scratchReleasePositionRef.current = null;
    draggingFromRef.current = { x: e.clientX, y: e.clientY };
    lastPointerAngleRef.current = pointerAngle;
    lastPointerMoveAtRef.current = performance.now();
    manualAngularVelocityRef.current = 0;

    if (mode === 'record') {
      isScratchingRef.current = true;
      setIsScratching(true);
      draggingSpeedsRef.current = [];
      lastScratchDirectionRef.current = false;

      // Freeze the engine at the same timecode immediately, even if this is a
      // quick tap that ends before the next animation-frame callback.
      dispatch({
        type: 'SCRATCH_MOVED',
        speed: 0,
        reversed: false,
        position: scratchStartPositionRef.current,
      });
    } else {
      isPlatterDraggingRef.current = true;
      setIsPlatterDragging(true);
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can be unavailable in test environments.
    }

    const updatePointerPosition = (clientX: number, clientY: number) => {
      const current = { x: clientX, y: clientY };
      const currentAngle = Math.atan2(current.y - centerRef.current.y, current.x - centerRef.current.x);
      const rotationDelta = -normalizeDelta(lastPointerAngleRef.current, currentAngle);
      const now = performance.now();
      const elapsed = Math.max(1, now - lastPointerMoveAtRef.current);

      if (Math.abs(rotationDelta) > 1e-8) {
        if (mode === 'record') {
          const nextAngle = applyRecordAngularDelta(recordAngleRef.current, rotationDelta);
          manualAngularVelocityRef.current = clampManualAngularVelocity(
            (nextAngle - recordAngleRef.current) / elapsed,
          );
          recordAngleRef.current = nextAngle;
          setAngle(recordAngleRef.current);
        } else {
          manualAngularVelocityRef.current = clampManualAngularVelocity(rotationDelta / elapsed);
          platterAngleRef.current += rotationDelta;
          recordAngleRef.current = platterAngleRef.current;
          recordAnglePreviousRef.current = recordAngleRef.current;
          setPlatterAngle(platterAngleRef.current);
        }
      } else {
        manualAngularVelocityRef.current = 0;
      }

      lastPointerAngleRef.current = currentAngle;
      lastPointerMoveAtRef.current = now;
      draggingFromRef.current = current;
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        !draggingFromRef.current ||
        moveEvent.pointerId !== activePointerIdRef.current
      ) return;
      moveEvent.preventDefault();
      updatePointerPosition(moveEvent.clientX, moveEvent.clientY);
    };

    const upPointerId = e.pointerId;
    const pointerTarget = e.currentTarget;
    const finishGesture = (dispatchEnd: boolean, updateState = true) => {
      if (activePointerIdRef.current !== upPointerId) return;

      try {
        if (
          typeof pointerTarget.hasPointerCapture !== 'function' ||
          pointerTarget.hasPointerCapture(upPointerId)
        ) {
          pointerTarget.releasePointerCapture(upPointerId);
        }
      } catch {
        // The pointer may already have been released or capture lost.
      }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      activePointerIdRef.current = null;
      activeGestureModeRef.current = null;
      draggingFromRef.current = null;
      cleanupGestureRef.current = null;

      if (mode === 'record') {
        isScratchingRef.current = false;
        if (updateState) setIsScratching(false);
      } else {
        isPlatterDraggingRef.current = false;
        if (updateState) setIsPlatterDragging(false);
        recordAngleRef.current = platterAngleRef.current;
        recordAnglePreviousRef.current = recordAngleRef.current;
      }

      if (dispatchEnd && mode === 'record') {
        // Include the last pointer position even when pointerup lands between
        // animation frames; endScratch resumes at the visible record timecode.
        const releasePosition = calculateScratchTrackPositionFromGesture(
          scratchStartPositionRef.current,
          recordAngleRef.current,
          scratchStartVisualAngleRef.current,
          effectiveRps,
          transport?.duration ?? 0,
        );
        scratchReleasePositionRef.current = releasePosition;
        dispatch({
          type: 'SCRATCH_MOVED',
          speed: 0,
          reversed: lastScratchDirectionRef.current,
          position: releasePosition,
        });
        dispatch({ type: 'SCRATCH_ENDED' });
      }

      if (updateState) {
        const now = performance.now();
        const elapsedSinceMove = now - lastPointerMoveAtRef.current;
        const fromAngularVelocity = elapsedSinceMove > STATIONARY_POINTER_MS
          ? 0
          : clampManualAngularVelocity(manualAngularVelocityRef.current);
        const resume: AngularResume = {
          startedAt: now,
          fromAngularVelocity,
          durationMs: RESUME_DURATION_MS,
        };
        if (mode === 'record') recordResumeRef.current = resume;
        else platterResumeRef.current = resume;
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== activePointerIdRef.current) return;
      if (Number.isFinite(upEvent.clientX) && Number.isFinite(upEvent.clientY)) {
        updatePointerPosition(upEvent.clientX, upEvent.clientY);
      }
      finishGesture(true);
    };

    cleanupGestureRef.current = finishGesture;
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [centerElementRef, dispatch, effectiveRps, hasRecord, isMotorOn, isPowered, transport]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => startGesture(e, 'record'),
    [startGesture],
  );
  const onEmptyPlatterPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => startGesture(e, 'empty-platter'),
    [startGesture],
  );

  useEffect(() => {
    if (transportPhase !== 'scratching' && isScratchingRef.current) {
      cleanupGestureRef.current?.(false);
    }
  }, [transportPhase]);

  useEffect(() => () => {
    cleanupGestureRef.current?.(false, false);
  }, []);

  return {
    // Keep angle as a compatibility alias for existing tests/consumers.
    angle,
    recordAngle: angle,
    platterAngle,
    isScratching,
    isPlatterDragging,
    discRef,
    slipmatRef,
    onPointerDown,
    onEmptyPlatterPointerDown,
  };
}
