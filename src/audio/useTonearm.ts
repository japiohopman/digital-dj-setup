import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TONEARM_CONFIG,
  type TonearmConfig,
  type TonearmState,
  angleToPlaybackProgress,
  calculateUnclampedArmAngleFromPointer,
  isAngleAtOuterLeadIn,
  isAngleInPlayableRecord,
  playbackProgressToAngle,
} from './tonearmGeometry';

export interface UseTonearmOptions {
  duration: number;
  currentTime: number;
  onStylusContactChange: (isContact: boolean) => void;
  onSeek: (timestamp: number) => void;
  onNeedleDropSound?: (kind: 'correct' | 'wrong') => void;
  hasRecord?: boolean;
  isBattleMode?: boolean;
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

interface PointerStart {
  x: number;
  y: number;
  time: number;
  grabOffset: number;
}

export function useTonearm({
  duration,
  currentTime,
  onStylusContactChange,
  onSeek,
  onNeedleDropSound,
  hasRecord = true,
  isBattleMode = false,
  config = DEFAULT_TONEARM_CONFIG,
}: UseTonearmOptions): UseTonearmReturn {
  const [armAngle, setArmAngle] = useState(config.parkAngle);
  const [armState, setArmState] = useState<TonearmState>('parked');
  const [isDragging, setIsDragging] = useState(false);
  const tonearmRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const initialArmStateRef = useRef<TonearmState>('parked');
  const currentAngleRef = useRef(config.parkAngle);
  const armStateRef = useRef<TonearmState>('parked');

  const setContactState = useCallback((down: boolean) => {
    onStylusContactChange(down && hasRecord);
  }, [hasRecord, onStylusContactChange]);

  const setArmPosition = useCallback((angle: number) => {
    const next = Math.max(config.minAngle, Math.min(config.maxAngle, angle));
    currentAngleRef.current = next;
    setArmAngle(next);
    return next;
  }, [config.maxAngle, config.minAngle]);

  useEffect(() => {
    if (armState !== 'needle-down' || isDragging || duration <= 0) return;
    const progress = Math.max(0, Math.min(1, currentTime / duration));
    setArmPosition(playbackProgressToAngle(progress, config));
  }, [armState, isDragging, currentTime, duration, config, setArmPosition]);

  const liftArm = useCallback(() => {
    setContactState(false);
    armStateRef.current = 'lifted';
    setArmState('lifted');
  }, [setContactState]);

  const parkArm = useCallback(() => {
    setContactState(false);
    armStateRef.current = 'parked';
    setArmState('parked');
    setArmPosition(config.parkAngle);
  }, [config.parkAngle, setContactState, setArmPosition]);

  const landAtCurrentPosition = useCallback((wasAlreadyOnRecord: boolean) => {
    const angle = currentAngleRef.current;
    const inGroove = hasRecord && isAngleInPlayableRecord(angle, config);
    const validInitialDrop = isAngleAtOuterLeadIn(angle, config);

    if (inGroove && (wasAlreadyOnRecord || validInitialDrop)) {
      armStateRef.current = 'needle-down';
      setArmState('needle-down');
      setContactState(true);
      if (!wasAlreadyOnRecord) onNeedleDropSound?.('correct');
      const progress = angleToPlaybackProgress(angle, config);
      if (progress !== null && duration > 0) onSeek(progress * duration);
      return true;
    }

    setContactState(false);
    armStateRef.current = angle <= config.parkAngle + 2 ? 'parked' : 'lifted';
    setArmState(armStateRef.current);
    if (armStateRef.current === 'parked') setArmPosition(config.parkAngle);
    else if (hasRecord) onNeedleDropSound?.('wrong');
    return false;
  }, [config, duration, hasRecord, onNeedleDropSound, onSeek, setContactState, setArmPosition]);

  const lowerArm = useCallback(() => {
    if (armStateRef.current === 'needle-down') return;
    landAtCurrentPosition(false);
  }, [landAtCurrentPosition]);

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
    const wasAlreadyOnRecord = initialArmStateRef.current === 'needle-down';
    const distance = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : Infinity;
    const elapsed = start ? Math.max(1, Date.now() - start.time) : 1;
    const speed = distance / elapsed;
    const isTap = start !== null && distance < 5 && elapsed < 350;

    // Clear ownership before releasePointerCapture can emit lostpointercapture.
    activePointerIdRef.current = null;
    pointerStartRef.current = null;
    setIsDragging(false);
    releaseCapture(e);

    if (isTap && wasAlreadyOnRecord) {
      liftArm();
      return;
    }
    if (!wasAlreadyOnRecord && speed > 1.8 && currentAngleRef.current > config.parkAngle + 2) {
      setContactState(false);
      armStateRef.current = 'lifted';
      setArmState('lifted');
      onNeedleDropSound?.('wrong');
      return;
    }
    if (currentAngleRef.current <= config.parkAngle + 2) {
      parkArm();
      return;
    }
    landAtCurrentPosition(wasAlreadyOnRecord);
  }, [config.parkAngle, landAtCurrentPosition, liftArm, onNeedleDropSound, parkArm, releaseCapture, setContactState]);

  const abortDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    pointerStartRef.current = null;
    setIsDragging(false);
    releaseCapture(e);
    setContactState(false);
    armStateRef.current = 'lifted';
    setArmState('lifted');
  }, [releaseCapture, setContactState]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || activePointerIdRef.current !== null || e.isPrimary === false) return;
    e.stopPropagation();
    const point = getBoardPoint(e);
    let grabOffset = 0;
    if (point) {
      const pointerAngle = calculateUnclampedArmAngleFromPointer(
        point.x, point.y, point.width, point.height, isBattleMode, config,
      );
      // Keep the original touch point attached to the headshell during drag.
      grabOffset = pointerAngle - currentAngleRef.current;
    }

    activePointerIdRef.current = e.pointerId;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), grabOffset };
    initialArmStateRef.current = armStateRef.current;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Continue tracking the active pointer if capture is unavailable.
    }
    setIsDragging(true);
    liftArm();
  }, [config, getBoardPoint, isBattleMode, liftArm]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const point = getBoardPoint(e);
    if (!point) return;
    const pointerAngle = calculateUnclampedArmAngleFromPointer(
      point.x, point.y, point.width, point.height, isBattleMode, config,
    );
    setArmPosition(pointerAngle - (pointerStartRef.current?.grabOffset ?? 0));
  }, [config, getBoardPoint, isBattleMode, setArmPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => finalizeDrag(e), [finalizeDrag]);
  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => abortDrag(e), [abortDrag]);
  const handleLostPointerCapture = useCallback((e: React.PointerEvent<HTMLElement>) => abortDrag(e), [abortDrag]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const target = setArmPosition(currentAngleRef.current + 2);
      if (armStateRef.current !== 'needle-down' && target > config.parkAngle + 2) {
        armStateRef.current = 'lifted';
        setArmState('lifted');
      }
      if (armStateRef.current === 'needle-down') {
        const progress = angleToPlaybackProgress(target, config);
        if (progress !== null && duration > 0) onSeek(progress * duration);
        else liftArm();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const target = setArmPosition(currentAngleRef.current - 2);
      if (target <= config.parkAngle + 1) parkArm();
      else if (armStateRef.current === 'needle-down') {
        const progress = angleToPlaybackProgress(target, config);
        if (progress !== null && duration > 0) onSeek(progress * duration);
        else liftArm();
      } else {
        armStateRef.current = 'lifted';
        setArmState('lifted');
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (armStateRef.current === 'needle-down') liftArm();
      else lowerArm();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      parkArm();
    }
  }, [config, duration, liftArm, lowerArm, onSeek, parkArm, setArmPosition]);

  return {
    armAngle, armState, isDragging, isNeedleDown: armState === 'needle-down',
    tonearmRef, handlePointerDown, handlePointerMove, handlePointerUp,
    handlePointerCancel, handleLostPointerCapture, handleKeyDown, liftArm, lowerArm, parkArm,
  };
}
