import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import type { DeckTransport } from './types';

export type TurntableMotorState = 'driven' | 'coasting' | 'spinning-up' | 'braking' | 'stopped';

export interface UseVinylMotionOptions {
  isPowered: boolean;
  isMotorOn: boolean;
  speedRpm: 33 | 45;
  pitch: number; // -8 to +8 percentage
  motorState?: TurntableMotorState | undefined;
  transport?: DeckTransport | undefined;
  centerElementRef?: React.RefObject<HTMLElement | null> | undefined;
}

const TWO_PI = Math.PI * 2;
const FREE_SPIN_DECAY_MS = 160;
const FREE_SPIN_STOP_THRESHOLD = 0.04;

/**
 * Applies bearing friction to a manually pushed platter without changing its direction.
 *
 * @param velocity - Signed speed relative to the selected nominal platter speed.
 * @param elapsedMs - Time elapsed since the previous animation frame.
 * @returns New signed speed after natural free-spin decay.
 */
export function decayFreeSpinVelocity(velocity: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return velocity;
  return velocity * Math.exp(-elapsedMs / FREE_SPIN_DECAY_MS);
}

// Normalized angle delta between two radians
const normalizeDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Keeps the most recent real scratch direction while the pointer is momentarily still.
 * A stationary animation frame has no direction and must not reset reverse playback.
 */
export function resolveScratchDirection(deltaAngle: number, previousDirection: boolean): boolean {
  const movementEpsilon = 1e-7;
  return Math.abs(deltaAngle) > movementEpsilon ? deltaAngle < 0 : previousDirection;
}

/**
 * Scratch direction is handled separately, so velocity smoothing must use magnitude.
 * Keeping this positive prevents forward and reverse samples from cancelling each other.
 */
export function calculateScratchSpeedMagnitude(deltaAngle: number, expectedAngleDelta: number): number {
  return expectedAngleDelta > 0 ? Math.abs(deltaAngle / expectedAngleDelta) : 0;
}

/**
 * Custom hook providing realistic vinyl physics, touch/pointer scratching,
 * auto-rotation at Technics 33/45 RPM speeds with pitch modulation, and real-time audio sync.
 *
 * @param options - Configuration including power, motor status, speed (33/45 RPM), pitch (-8% to +8%),
 * optional deck transport instance, and an element reference for center spindle measurement.
 * @returns Platter rotation angle, scratching state, disc element ref, and pointer-down event handler.
 */
export function useVinylMotion({
  isPowered,
  isMotorOn,
  speedRpm,
  pitch,
  motorState,
  transport,
  centerElementRef,
}: UseVinylMotionOptions) {
  const [angle, setAngle] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const [isFreeSpinning, setIsFreeSpinning] = useState(false);

  const angleRef = useRef(0);
  const anglePreviousRef = useRef(0);
  const isScratchingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const draggingFromRef = useRef<{ x: number; y: number } | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const timestampPreviousRef = useRef(performance.now());
  const discRef = useRef<HTMLDivElement | null>(null);
  const draggingSpeedsRef = useRef<number[]>([]);
  const lastScratchDirectionRef = useRef(false);
  const freeSpinVelocityRef = useRef(0);

  // Calculate rotations per second based on 33.333 or 45 RPM and pitch
  // 33.333 RPM = 33.333 / 60 = ~0.5555 rps; 45 RPM = 45 / 60 = 0.75 rps
  const baseRps = speedRpm === 33 ? 33.3333 / 60 : 45 / 60;
  const effectiveRps = baseRps * (1 + pitch / 100);
  const radsPerMs = (effectiveRps * TWO_PI) / 1000;

  // The base reference speed is standard Technics 33⅓ RPM
  // Effective playback rate multiplier relative to standard 33⅓ RPM
  const effectivePlaybackRate = (speedRpm === 45 ? 45 / 33.3333 : 1.0) * (1 + pitch / 100);

  // Synchronize audio engine playback rate when speed or pitch changes
  useEffect(() => {
    if (transport?.setPlaybackRate) {
      transport.setPlaybackRate(effectivePlaybackRate);
    }
  }, [transport, effectivePlaybackRate]);

  const duration = transport?.duration || 0;
  const maxAngle = duration > 0 ? duration * effectiveRps * TWO_PI : Infinity;

  // Detect prefers-reduced-motion
  const prefersReducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mediaQuery.matches;

    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mediaQuery.addEventListener?.('change', handler);
    return () => {
      mediaQuery.removeEventListener?.('change', handler);
    };
  }, []);

  // Synchronize platter visual position from transport current time on jumps (seek, stop, load, replay)
  const lastTransportTimeRef = useRef(transport?.currentTime ?? 0);
  useEffect(() => {
    if (!transport || isScratchingRef.current) return;
    const currentTime = transport.currentTime;
    const prevTime = lastTransportTimeRef.current;
    lastTransportTimeRef.current = currentTime;

    // If time jumps backwards or by more than 1.5 seconds, re-align platter angle with track time
    if (currentTime === 0 || Math.abs(currentTime - prevTime) > 1.5) {
      const targetAngle = currentTime * effectiveRps * TWO_PI;
      angleRef.current = targetAngle;
      setAngle(targetAngle);
    }
  }, [transport?.currentTime, effectiveRps, transport]);

  // Auto-rotate and physics loop with coast-down and spin-up support
  const coastProgressRef = useRef<{ start: number; duration: number } | null>(null);
  const spinUpProgressRef = useRef<{ start: number; duration: number } | null>(null);
  const brakeProgressRef = useRef<{ start: number; duration: number } | null>(null);

  useEffect(() => {
    if (motorState === 'coasting') {
      coastProgressRef.current = { start: performance.now(), duration: 1200 };
    } else {
      coastProgressRef.current = null;
    }

    if (motorState === 'spinning-up') {
      spinUpProgressRef.current = { start: performance.now(), duration: 450 };
    } else {
      spinUpProgressRef.current = null;
    }

    if (motorState === 'braking') {
      brakeProgressRef.current = { start: performance.now(), duration: 250 };
    } else {
      brakeProgressRef.current = null;
    }
  }, [motorState]);

  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;

      const now = performance.now();
      const dt = Math.min(100, Math.max(1, now - timestampPreviousRef.current));

      const isCoasting = motorState === 'coasting' && coastProgressRef.current !== null;
      let coastFactor = 1.0;
      if (isCoasting) {
        const elapsed = now - coastProgressRef.current!.start;
        const progress = Math.min(1, Math.max(0, elapsed / coastProgressRef.current!.duration));
        coastFactor = 1 - progress; // Linear decay 1 -> 0
      }

      const isSpinningUp = motorState === 'spinning-up' && spinUpProgressRef.current !== null;
      let spinUpFactor = 1.0;
      if (isSpinningUp) {
        const elapsed = now - spinUpProgressRef.current!.start;
        const progress = Math.min(1, Math.max(0, elapsed / spinUpProgressRef.current!.duration));
        // Linear acceleration 0.2 -> 1.0
        spinUpFactor = 0.2 + 0.8 * progress;
      }

      const isBraking = motorState === 'braking' && brakeProgressRef.current !== null;
      let brakeFactor = 1.0;
      if (isBraking) {
        const elapsed = now - brakeProgressRef.current!.start;
        const progress = Math.min(1, Math.max(0, elapsed / brakeProgressRef.current!.duration));
        brakeFactor = 1 - progress;
      }

      const isMotorSpinning = isPowered && isMotorOn;
      const isAudioPlaying = transport?.isPlaying;

      if (isScratchingRef.current) {
        // While a finger is down, the platter position is controlled directly by its movement.
        const deltaAngle = angleRef.current - anglePreviousRef.current;
        const expectedAngleDelta = radsPerMs * dt;
        const instantSpeed = calculateScratchSpeedMagnitude(deltaAngle, expectedAngleDelta);

        draggingSpeedsRef.current.push(instantSpeed);
        if (draggingSpeedsRef.current.length > 8) {
          draggingSpeedsRef.current.shift();
        }

        const avgSpeed =
          draggingSpeedsRef.current.reduce((a, b) => a + b, 0) /
          draggingSpeedsRef.current.length;

        const isReversed = resolveScratchDirection(deltaAngle, lastScratchDirectionRef.current);
        lastScratchDirectionRef.current = isReversed;
        const currentSeconds = effectiveRps > 0 ? angleRef.current / (TWO_PI * effectiveRps) : 0;

        if (transport && transport.isLoaded) {
          transport.scratch(avgSpeed, isReversed, currentSeconds);
        }
      } else if (Math.abs(freeSpinVelocityRef.current) > FREE_SPIN_STOP_THRESHOLD) {
        // With the motor off, a hand push keeps the platter moving briefly under bearing friction.
        const signedVelocity = freeSpinVelocityRef.current;
        const previousAngle = angleRef.current;
        let nextAngle = previousAngle + radsPerMs * dt * signedVelocity;
        if (maxAngle !== Infinity) {
          nextAngle = Math.max(0, Math.min(maxAngle, nextAngle));
        }

        const actualDelta = nextAngle - previousAngle;
        angleRef.current = nextAngle;
        if (actualDelta !== 0) {
          setAngle(nextAngle);
          if (transport && transport.isLoaded) {
            const currentSeconds = effectiveRps > 0 ? nextAngle / (TWO_PI * effectiveRps) : 0;
            transport.scratch(Math.abs(signedVelocity), signedVelocity < 0, currentSeconds);
          }
        }

        freeSpinVelocityRef.current = decayFreeSpinVelocity(signedVelocity, dt);
        if (
          Math.abs(freeSpinVelocityRef.current) <= FREE_SPIN_STOP_THRESHOLD ||
          actualDelta === 0
        ) {
          freeSpinVelocityRef.current = 0;
          setIsFreeSpinning(false);
          if (transport && transport.isLoaded) {
            transport.endScratch(false);
          }
        }
      } else {
        // Powered rotation, motor coast-down, spin-up, and the short mechanical Pause brake
        // all move the audio-linked platter through their own speed curves.
        const shouldRotate = isBraking
          ? brakeFactor > 0.001
          : isCoasting
            ? coastFactor > 0.001
            : isSpinningUp
              ? true
              : transport?.isLoaded
                ? isAudioPlaying
                : isMotorSpinning;

        // Respect prefers-reduced-motion: skip continuous visual rotation while keeping audio functional.
        if (shouldRotate && !prefersReducedMotionRef.current) {
          const speedMod = isBraking
            ? brakeFactor
            : isCoasting
              ? coastFactor
              : isSpinningUp
                ? spinUpFactor
                : 1.0;
          const deltaAngle = radsPerMs * dt * speedMod;
          let newAngle = angleRef.current + deltaAngle;
          if (maxAngle !== Infinity && newAngle > maxAngle) {
            newAngle = maxAngle;
          }
          angleRef.current = newAngle;
          setAngle(newAngle);
        }
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
  }, [isPowered, isMotorOn, motorState, transport, radsPerMs, maxAngle, effectiveRps]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // The platter remains freely hand-operable with the power dial off.
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
      // Ignore additional pointers on the same deck
      return;
    }

    // Measure scratch center from the spindle / actual record disc if provided,
    // otherwise fallback to discRef
    const centerTarget = centerElementRef?.current ?? discRef.current;
    if (centerTarget) {
      const rect = centerTarget.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    activePointerIdRef.current = e.pointerId;
    draggingFromRef.current = { x: e.clientX, y: e.clientY };
    isScratchingRef.current = true;
    setIsScratching(true);
    draggingSpeedsRef.current = [];
    lastScratchDirectionRef.current = false;
    freeSpinVelocityRef.current = 0;
    setIsFreeSpinning(false);

    // Capture pointer
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore in tests
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        !isScratchingRef.current ||
        !draggingFromRef.current ||
        moveEvent.pointerId !== activePointerIdRef.current
      ) {
        return;
      }
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

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== activePointerIdRef.current) {
        return;
      }

      try {
        e.currentTarget.releasePointerCapture(upEvent.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      activePointerIdRef.current = null;
      isScratchingRef.current = false;
      setIsScratching(false);
      draggingFromRef.current = null;

      const shouldResumeMotor = isPowered && isMotorOn;
      if (transport && transport.isLoaded) {
        if (shouldResumeMotor) {
          // A powered motor takes over at its nominal speed when the hand is released.
          freeSpinVelocityRef.current = 0;
          setIsFreeSpinning(false);
          transport.endScratch(true);
        } else {
          // With the motor off, preserve the last measured hand velocity and let the
          // platter glide to rest rather than snapping to a stop on pointer release.
          const movingSamples = draggingSpeedsRef.current.filter(
            (sample) => sample > FREE_SPIN_STOP_THRESHOLD,
          );
          const releaseSpeed = movingSamples.length > 0
            ? movingSamples.slice(-4).reduce((sum, value) => sum + value, 0) /
              Math.min(4, movingSamples.length)
            : 0;
          const signedReleaseSpeed = lastScratchDirectionRef.current
            ? -releaseSpeed
            : releaseSpeed;

          if (Math.abs(signedReleaseSpeed) > FREE_SPIN_STOP_THRESHOLD) {
            freeSpinVelocityRef.current = signedReleaseSpeed;
            setIsFreeSpinning(true);
          } else {
            freeSpinVelocityRef.current = 0;
            setIsFreeSpinning(false);
            transport.endScratch(false);
          }
        }
      } else {
        const movingSamples = draggingSpeedsRef.current.filter(
          (sample) => sample > FREE_SPIN_STOP_THRESHOLD,
        );
        const releaseSpeed = movingSamples.length > 0
          ? movingSamples.slice(-4).reduce((sum, value) => sum + value, 0) /
            Math.min(4, movingSamples.length)
          : 0;
        const signedReleaseSpeed = lastScratchDirectionRef.current ? -releaseSpeed : releaseSpeed;
        freeSpinVelocityRef.current = shouldResumeMotor ? 0 : signedReleaseSpeed;
        setIsFreeSpinning(Math.abs(freeSpinVelocityRef.current) > FREE_SPIN_STOP_THRESHOLD);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [isPowered, isMotorOn, transport, centerElementRef]);

  return {
    angle,
    isScratching,
    isFreeSpinning,
    discRef,
    onPointerDown,
  };
}
