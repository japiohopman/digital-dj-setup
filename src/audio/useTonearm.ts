import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TONEARM_CONFIG,
  type TonearmConfig,
  type TonearmState,
  angleToPlaybackProgress,
  calculateArmAngleFromPointer,
  isAngleInPlayableRecord,
  playbackProgressToAngle,
} from './tonearmGeometry';

export interface UseTonearmOptions {
  /** Total duration of current loaded audio track in seconds. */
  duration: number;
  /** Current playback timestamp in seconds. */
  currentTime: number;
  /** Callback to set stylus contact audio gain. */
  onStylusContactChange: (isContact: boolean) => void;
  /** Callback to seek track to a given playback time in seconds. */
  onSeek: (timestamp: number) => void;
  /** Whether deck is in battle mode (landscape rotated -90deg). */
  isBattleMode?: boolean;
  /** Custom geometry configuration. */
  config?: TonearmConfig;
}

export interface UseTonearmReturn {
  armAngle: number;
  armState: TonearmState;
  isDragging: boolean;
  isNeedleDown: boolean;
  tonearmRef: React.RefObject<HTMLDivElement | null>;
  handlePointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  handleLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  liftArm: () => void;
  lowerArm: () => void;
  parkArm: () => void;
}

export function useTonearm({
  duration,
  currentTime,
  onStylusContactChange,
  onSeek,
  isBattleMode = false,
  config = DEFAULT_TONEARM_CONFIG,
}: UseTonearmOptions): UseTonearmReturn {
  const [armAngle, setArmAngle] = useState<number>(config.parkAngle);
  const [armState, setArmState] = useState<TonearmState>('parked');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const tonearmRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const initialArmStateOnPointerDownRef = useRef<TonearmState>('parked');
  const currentAngleRef = useRef<number>(config.parkAngle);
  const armStateRef = useRef<TonearmState>('parked');

  // Contact audio routing sync
  const setContactState = useCallback(
    (isDown: boolean) => {
      onStylusContactChange(isDown);
    },
    [onStylusContactChange]
  );

  // Groove following during active playback when needle is down
  useEffect(() => {
    if (armState !== 'needle-down' || isDragging || duration <= 0) {
      return;
    }
    const progress = Math.max(0, Math.min(1, currentTime / duration));
    const nextAngle = playbackProgressToAngle(progress, config);
    currentAngleRef.current = nextAngle;
    setArmAngle(nextAngle);
  }, [armState, isDragging, currentTime, duration, config]);

  // Clean transition to needle-down
  const lowerArm = useCallback(() => {
    const angle = currentAngleRef.current;
    if (isAngleInPlayableRecord(angle, config)) {
      armStateRef.current = 'needle-down';
      setArmState('needle-down');
      setContactState(true);

      // Cue playback position corresponding to stylus landing
      const progress = angleToPlaybackProgress(angle, config);
      if (progress !== null && duration > 0) {
        onSeek(progress * duration);
      }
    } else {
      // Landing outside playable grooves (e.g. over rest or lead-in edge)
      if (angle <= config.parkAngle + 2) {
        armStateRef.current = 'parked';
        setArmState('parked');
        currentAngleRef.current = config.parkAngle;
        setArmAngle(config.parkAngle);
      } else {
        armStateRef.current = 'lifted';
        setArmState('lifted');
      }
      setContactState(false);
    }
  }, [config, duration, onSeek, setContactState]);

  // Lift arm up
  const liftArm = useCallback(() => {
    setContactState(false);
    armStateRef.current = 'lifted';
    setArmState('lifted');
  }, [setContactState]);

  // Park arm in cradle
  const parkArm = useCallback(() => {
    setContactState(false);
    armStateRef.current = 'parked';
    setArmState('parked');
    currentAngleRef.current = config.parkAngle;
    setArmAngle(config.parkAngle);
  }, [config.parkAngle, setContactState]);

  // Clean up pointer drag state
  const finalizeDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture release is best-effort
      }

      const startPos = pointerStartPosRef.current;
      const initialArmState = initialArmStateOnPointerDownRef.current;
      activePointerIdRef.current = null;
      pointerStartPosRef.current = null;
      setIsDragging(false);

      // Check if this was a quick tap/click without dragging (distance < 5px and duration < 350ms)
      const dist = startPos
        ? Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y)
        : 999;
      const isTap = startPos && dist < 5 && Date.now() - startPos.time < 350;

      const angle = currentAngleRef.current;

      if (isTap && initialArmState === 'needle-down') {
        // User tapped the needle to lift it up (cue lift)
        armStateRef.current = 'lifted';
        setArmState('lifted');
        setContactState(false);
        return;
      }

      if (angle <= config.parkAngle + 2) {
        parkArm();
      } else if (isAngleInPlayableRecord(angle, config)) {
        // Drop stylus onto vinyl grooves
        armStateRef.current = 'needle-down';
        setArmState('needle-down');
        setContactState(true);
        const progress = angleToPlaybackProgress(angle, config);
        if (progress !== null && duration > 0) {
          onSeek(progress * duration);
        }
      } else {
        armStateRef.current = 'lifted';
        setArmState('lifted');
        setContactState(false);
      }
    },
    [config, duration, onSeek, parkArm, setContactState]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Primary pointer button only (left mouse or touch)
      if (e.button !== 0) return;
      e.stopPropagation();

      activePointerIdRef.current = e.pointerId;
      pointerStartPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
      };
      initialArmStateOnPointerDownRef.current = armStateRef.current;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture fallback
      }

      setIsDragging(true);
      liftArm();
    },
    [liftArm]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      const deckElement = e.currentTarget.closest('.turntable');
      if (!deckElement) return;

      const rect = deckElement.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      const newAngle = calculateArmAngleFromPointer(
        pointerX,
        pointerY,
        rect.width,
        rect.height,
        isBattleMode,
        config
      );

      currentAngleRef.current = newAngle;
      setArmAngle(newAngle);
    },
    [config, isBattleMode]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      finalizeDrag(e);
    },
    [finalizeDrag]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      finalizeDrag(e);
    },
    [finalizeDrag]
  );

  const handleLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      finalizeDrag(e);
    },
    [finalizeDrag]
  );

  // Keyboard accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        // Step arm inward towards record spindle
        const target = Math.min(config.maxAngle, currentAngleRef.current + 2);
        currentAngleRef.current = target;
        setArmAngle(target);
        if (armStateRef.current === 'needle-down') {
          if (isAngleInPlayableRecord(target, config)) {
            const progress = angleToPlaybackProgress(target, config);
            if (progress !== null && duration > 0) {
              onSeek(progress * duration);
            }
          } else {
            setContactState(false);
            armStateRef.current = 'lifted';
            setArmState('lifted');
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        // Step arm outward towards rest
        const target = Math.max(config.minAngle, currentAngleRef.current - 2);
        currentAngleRef.current = target;
        setArmAngle(target);
        if (target <= config.parkAngle + 1) {
          parkArm();
        } else if (armStateRef.current === 'needle-down') {
          if (isAngleInPlayableRecord(target, config)) {
            const progress = angleToPlaybackProgress(target, config);
            if (progress !== null && duration > 0) {
              onSeek(progress * duration);
            }
          } else {
            setContactState(false);
            armStateRef.current = 'lifted';
            setArmState('lifted');
          }
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        // Toggle lift / lower
        if (armStateRef.current === 'needle-down') {
          liftArm();
        } else {
          lowerArm();
        }
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        parkArm();
      }
    },
    [config, duration, liftArm, lowerArm, onSeek, parkArm, setContactState]
  );

  return {
    armAngle,
    armState,
    isDragging,
    isNeedleDown: armState === 'needle-down',
    tonearmRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    handleKeyDown,
    liftArm,
    lowerArm,
    parkArm,
  };
}
