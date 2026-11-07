import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import type { DeckTransport } from './types';

export interface UseVinylMotionOptions {
  isPowered: boolean;
  isMotorOn: boolean;
  speedRpm: 33 | 45;
  pitch: number; // -8 to +8 percentage
  transport?: DeckTransport | undefined;
}

const TWO_PI = Math.PI * 2;

// Normalized angle delta between two radians
const normalizeDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Custom hook providing realistic vinyl physics, touch/pointer scratching,
 * auto-rotation at Technics 33/45 RPM speeds with pitch modulation, and real-time audio sync.
 */
export function useVinylMotion({
  isPowered,
  isMotorOn,
  speedRpm,
  pitch,
  transport,
}: UseVinylMotionOptions) {
  const [angle, setAngle] = useState(0);
  const [isScratching, setIsScratching] = useState(false);

  const angleRef = useRef(0);
  const anglePreviousRef = useRef(0);
  const isScratchingRef = useRef(false);
  const draggingFromRef = useRef<{ x: number; y: number } | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const timestampPreviousRef = useRef(performance.now());
  const discRef = useRef<HTMLDivElement | null>(null);
  const draggingSpeedsRef = useRef<number[]>([]);

  // Calculate rotations per second based on 33.333 or 45 RPM and pitch
  // 33.333 RPM = 33.333 / 60 = ~0.5555 rps; 45 RPM = 45 / 60 = 0.75 rps
  const baseRps = speedRpm === 33 ? 33.3333 / 60 : 45 / 60;
  const effectiveRps = baseRps * (1 + pitch / 100);
  const radsPerMs = (effectiveRps * TWO_PI) / 1000;

  const duration = transport?.duration || 0;
  const maxAngle = duration > 0 ? duration * effectiveRps * TWO_PI : Infinity;

  // Auto-rotate and physics loop
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;

      const now = performance.now();
      const dt = Math.min(100, Math.max(1, now - timestampPreviousRef.current));

      const isMotorSpinning = isPowered && isMotorOn;
      const isAudioPlaying = transport?.isPlaying;

      if (!isScratchingRef.current) {
        // If track is loaded, only auto-rotate when track is actively playing
        // If no track loaded, rotate if motor is on
        const shouldRotate = transport?.isLoaded ? isAudioPlaying : isMotorSpinning;

        if (shouldRotate) {
          const deltaAngle = radsPerMs * dt;
          let newAngle = angleRef.current + deltaAngle;
          if (maxAngle !== Infinity && newAngle > maxAngle) {
            newAngle = maxAngle;
          }
          angleRef.current = newAngle;
          setAngle(newAngle);
        }
      } else {
        // When scratching: compute instantaneous rotation velocity and direction
        const deltaAngle = angleRef.current - anglePreviousRef.current;
        const expectedAngleDelta = radsPerMs * dt;
        const instantSpeed = expectedAngleDelta > 0 ? deltaAngle / expectedAngleDelta : 0;

        draggingSpeedsRef.current.push(instantSpeed);
        if (draggingSpeedsRef.current.length > 8) {
          draggingSpeedsRef.current.shift();
        }

        const avgSpeed =
          draggingSpeedsRef.current.reduce((a, b) => a + b, 0) /
          draggingSpeedsRef.current.length;

        const isReversed = deltaAngle < 0;
        const currentSeconds = effectiveRps > 0 ? angleRef.current / (TWO_PI * effectiveRps) : 0;

        if (transport && transport.isLoaded) {
          transport.scratch(avgSpeed, isReversed, currentSeconds);
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
  }, [isPowered, isMotorOn, transport, radsPerMs, maxAngle, effectiveRps]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPowered) return;

    if (discRef.current) {
      const rect = discRef.current.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    draggingFromRef.current = { x: e.clientX, y: e.clientY };
    isScratchingRef.current = true;
    setIsScratching(true);
    draggingSpeedsRef.current = [];

    // Capture pointer
    e.currentTarget.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isScratchingRef.current || !draggingFromRef.current) return;
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
      try {
        e.currentTarget.releasePointerCapture(upEvent.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      isScratchingRef.current = false;
      setIsScratching(false);
      draggingFromRef.current = null;

      if (transport) {
        // Resume playback if motor is on and track is loaded
        const shouldResume = isMotorOn;
        transport.endScratch(shouldResume);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [isPowered, isMotorOn, transport]);

  return {
    angle,
    isScratching,
    discRef,
    onPointerDown,
  };
}
