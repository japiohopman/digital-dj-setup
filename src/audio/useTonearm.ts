import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TONEARM_CONFIG,
  classifyTonearmLandingSurface,
  type TonearmConfig,
  type TonearmGrip,
  type TonearmState,
  angleToPlaybackProgress,
  calculateArmPointerBearingFromPointer,
  playbackProgressToAngle,
  unwrapAngleNear,
} from './tonearmGeometry';
import type { DeckEvent, ArmInteraction, TransportPhase } from '../state/deckMachine';

export interface UseTonearmOptions {
  duration: number;
  currentTime: number;
  armState: TonearmState;
  armInteraction: ArmInteraction;
  transportPhase?: TransportPhase;
  dispatch: (event: DeckEvent) => boolean;
  hasRecord?: boolean;
  isBattleMode?: boolean;
  config?: TonearmConfig;
}

export interface UseTonearmReturn {
  armAngle: number;
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

interface PointerStart {
  x: number;
  y: number;
  time: number;
  grabOffset: number;
  lastPointerBearing: number;
  wasAlreadyNeedleDown: boolean;
  grip: TonearmGrip;
}

export function useTonearm({
  duration,
  currentTime,
  armState,
  armInteraction,
  transportPhase = 'idle',
  dispatch,
  isBattleMode = false,
  config = DEFAULT_TONEARM_CONFIG,
}: UseTonearmOptions): UseTonearmReturn {
  const [armAngle, setArmAngle] = useState(config.parkAngle);
  const tonearmRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const activePointerElementRef = useRef<HTMLElement | null>(null);
  const currentAngleRef = useRef(config.parkAngle);
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const wasDraggingRef = useRef(false);

  const isDragging = armInteraction === 'dragging';
  const isNeedleDown = armState === 'needle-down';

  const setArmPosition = useCallback((angle: number) => {
    const next = Math.max(config.minAngle, Math.min(config.maxAngle, angle));
    currentAngleRef.current = next;
    setArmAngle(next);
    return next;
  }, [config.maxAngle, config.minAngle]);

  useEffect(() => {
    if (armInteraction === 'dragging' || activePointerIdRef.current === null) return;
    const pointerId = activePointerIdRef.current;
    const element = activePointerElementRef.current;
    activePointerIdRef.current = null;
    pointerStartRef.current = null;
    activePointerElementRef.current = null;
    try {
      if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
      // The machine may reset the interaction during a track change or motor stop.
    }
  }, [armInteraction]);

  useEffect(() => {
    if (armInteraction === 'dragging' || isDragging) {
      wasDraggingRef.current = true;
      return;
    }

    // Preserve the exact physical drop angle until the transport publishes its
    // new playhead. Syncing stale currentTime here used to snap the arm back.
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      lastPlaybackTimeRef.current = currentTime;
      if (transportPhase === 'ended' && armState === 'needle-down') {
        setArmPosition(config.runoutAngle);
      }
      return;
    }

    if (armState === 'parked') {
      lastPlaybackTimeRef.current = currentTime;
      setArmPosition(config.parkAngle);
      return;
    }

    if (armState !== 'needle-down' || duration <= 0) {
      lastPlaybackTimeRef.current = currentTime;
      return;
    }

    if (transportPhase === 'ended') {
      lastPlaybackTimeRef.current = currentTime;
      setArmPosition(config.runoutAngle);
      return;
    }

    const hasFreshPlaybackTime =
      lastPlaybackTimeRef.current === null || currentTime !== lastPlaybackTimeRef.current;
    lastPlaybackTimeRef.current = currentTime;
    if (!hasFreshPlaybackTime) return;

    const progress = Math.max(0, Math.min(1, currentTime / duration));
    setArmPosition(playbackProgressToAngle(progress, config));
  }, [
    armState,
    armInteraction,
    isDragging,
    currentTime,
    duration,
    transportPhase,
    config,
    setArmPosition,
  ]);

  const getCuePosition = useCallback((angle: number) => {
    const progress = angleToPlaybackProgress(angle, config);
    return progress !== null && duration > 0
      ? progress * duration
      : Math.max(0, Math.min(duration, currentTime));
  }, [config, currentTime, duration]);

  const liftArm = useCallback(() => {
    dispatch({ type: 'ARM_LIFTED' });
  }, [dispatch]);

  const parkArm = useCallback(() => {
    setArmPosition(config.parkAngle);
    dispatch({ type: 'ARM_PARKED' });
  }, [config.parkAngle, dispatch, setArmPosition]);

  const landAtCurrentPosition = useCallback((
    wasAlreadyNeedleDown: boolean,
    tooFast = false,
    grip: TonearmGrip = 'arm',
  ) => {
    const angle = currentAngleRef.current;
    const surface = classifyTonearmLandingSurface(angle, config);
    const groovePosition = getCuePosition(angle);
    // Touching the cartridge itself represents a deliberately imprecise
    // physical drop: play the wrong-placement cue and land 30s into the track.
    const position = grip === 'cartridge' && surface === 'record' && duration > 0
      ? Math.min(30, duration)
      : groovePosition;
    dispatch({
      type: 'ARM_DROPPED',
      angle,
      wasAlreadyNeedleDown,
      position,
      tooFast,
      grip,
      surface,
    });
  }, [config, dispatch, duration, getCuePosition]);

  const lowerArm = useCallback(() => {
    if (armState === 'needle-down' || isDragging) return;
    landAtCurrentPosition(false);
  }, [armState, isDragging, landAtCurrentPosition]);

  const getBoardPoint = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const board = e.currentTarget.closest('.bd');
    if (!(board instanceof HTMLElement)) return null;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height };
  }, []);

  const releaseCapture = useCallback((e: React.PointerEvent<HTMLElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The browser may already have released capture.
    }
  }, []);

  const finalizeDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const start = pointerStartRef.current;
    const wasAlreadyNeedleDown = start?.wasAlreadyNeedleDown ?? false;
    const distance = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : Infinity;
    const elapsed = start ? Math.max(1, Date.now() - start.time) : 1;
    const speed = distance / elapsed;
    const isTap = start !== null && distance < 5 && elapsed < 350;

    // Clear pointer ownership before releasePointerCapture can emit lostpointercapture.
    activePointerIdRef.current = null;
    pointerStartRef.current = null;
    activePointerElementRef.current = null;
    releaseCapture(e);

    if (isTap && wasAlreadyNeedleDown) {
      dispatch({ type: 'ARM_LIFTED' });
      return;
    }

    const tooFast = !wasAlreadyNeedleDown &&
      speed > 1.8 &&
      currentAngleRef.current > config.parkAngle + 2;

    if (currentAngleRef.current <= config.parkAngle + 2) {
      parkArm();
      return;
    }
    landAtCurrentPosition(wasAlreadyNeedleDown, tooFast, start?.grip ?? 'arm');
  }, [config.parkAngle, dispatch, landAtCurrentPosition, parkArm, releaseCapture]);

  const abortDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    pointerStartRef.current = null;
    activePointerElementRef.current = null;
    releaseCapture(e);
    dispatch({ type: 'ARM_DRAG_CANCELLED' });
  }, [dispatch, releaseCapture]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || activePointerIdRef.current !== null || e.isPrimary === false) return;
    e.stopPropagation();
    if (!dispatch({ type: 'ARM_PICKED_UP' })) return;

    const point = getBoardPoint(e);
    const gripTarget = e.target instanceof Element
      ? e.target.closest<HTMLElement>('[data-tonearm-grip]')
      : null;
    const grip: TonearmGrip = gripTarget?.dataset.tonearmGrip === 'cartridge'
      ? 'cartridge'
      : 'arm';
    let grabOffset = 0;
    if (point) {
      const pointerAngle = calculateArmPointerBearingFromPointer(
        point.x, point.y, point.width, point.height, isBattleMode,
      );
      // Keep the original touch point attached to the headshell during drag.
      grabOffset = pointerAngle - currentAngleRef.current;
    }

    activePointerIdRef.current = e.pointerId;
    activePointerElementRef.current = e.currentTarget;
    const initialPointerBearing = point
      ? calculateArmPointerBearingFromPointer(point.x, point.y, point.width, point.height, isBattleMode)
      : currentAngleRef.current + grabOffset;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      grabOffset,
      lastPointerBearing: initialPointerBearing,
      wasAlreadyNeedleDown: armState === 'needle-down',
      grip,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Continue tracking the active pointer if capture is unavailable.
    }
  }, [armState, dispatch, getBoardPoint, isBattleMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const point = getBoardPoint(e);
    if (!point) return;
    const start = pointerStartRef.current;
    if (!start) return;
    const rawPointerAngle = calculateArmPointerBearingFromPointer(
      point.x, point.y, point.width, point.height, isBattleMode,
    );
    const pointerAngle = unwrapAngleNear(rawPointerAngle, start.lastPointerBearing);
    start.lastPointerBearing = pointerAngle;
    setArmPosition(pointerAngle - start.grabOffset);
  }, [getBoardPoint, isBattleMode, setArmPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => finalizeDrag(e), [finalizeDrag]);
  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => abortDrag(e), [abortDrag]);
  const handleLostPointerCapture = useCallback((e: React.PointerEvent<HTMLElement>) => abortDrag(e), [abortDrag]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const isCueKey = e.key === 'ArrowRight' || e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (transportPhase === 'scratching' && isCueKey) {
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const target = setArmPosition(currentAngleRef.current + 2);
      if (armState === 'needle-down') {
        const progress = angleToPlaybackProgress(target, config);
        if (progress !== null && duration > 0) {
          dispatch({ type: 'ARM_CUE', angle: target, position: progress * duration });
        } else {
          liftArm();
        }
      } else if (target > config.parkAngle + 2) {
        dispatch({ type: 'ARM_LIFTED' });
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const target = setArmPosition(currentAngleRef.current - 2);
      if (target <= config.parkAngle + 1) parkArm();
      else if (armState === 'needle-down') {
        const progress = angleToPlaybackProgress(target, config);
        if (progress !== null && duration > 0) {
          dispatch({ type: 'ARM_CUE', angle: target, position: progress * duration });
        } else {
          liftArm();
        }
      } else {
        dispatch({ type: 'ARM_LIFTED' });
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (armState === 'needle-down') liftArm();
      else lowerArm();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      parkArm();
    }
  }, [armState, config, dispatch, duration, liftArm, lowerArm, parkArm, setArmPosition, transportPhase]);

  return {
    armAngle,
    isDragging,
    isNeedleDown,
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
