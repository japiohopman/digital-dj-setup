import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine } from './AudioEngine';
import type { DeckTransport, AudioEngineState, AudioEngineOptions, NeedleDropSound, RecordSoundState } from './types';

/**
 * Custom React hook managing an independent AudioEngine instance for a deck.
 *
 * Keeps AudioContext, AudioBuffer and AudioBufferSourceNode completely outside
 * React component state. Exposes high-level transport state and controls.
 *
 * @param options - Optional engine configuration options, such as custom AudioContext factories for testing.
 * @returns Fully typed deck transport controls and reactive state.
 */
export function useDeckTransport(options?: AudioEngineOptions): DeckTransport {
  const engineRef = useRef<AudioEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new AudioEngine(options);
  }

  const [state, setState] = useState<AudioEngineState>(() => engineRef.current!.getState());

  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine(options);
    }
    const engine = engineRef.current;

    const unsubscribe = engine.subscribe((nextState) => {
      setState(nextState);
    });

    return () => {
      unsubscribe();
      // In development React StrictMode remounts components.
      // Dispose on final unmount.
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const loadTrack = useCallback(async (file: File) => {
    if (!engineRef.current) throw new Error('Audio engine is not available');
    await engineRef.current.loadTrack(file);
  }, []);

  const play = useCallback(async (offset?: number) => {
    if (!engineRef.current) return;
    await engineRef.current.play(offset);
  }, []);

  const getCurrentTime = useCallback(() => engineRef.current?.getState().currentTime ?? 0, []);

  const pause = useCallback((durationMs?: number) => {
    if (!engineRef.current) return;
    engineRef.current.pause(durationMs);
  }, []);

  const stop = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.stop();
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!engineRef.current) return;
    const current = engineRef.current.getState();
    if (current.playbackState === 'playing') {
      engineRef.current.pause();
    } else {
      await engineRef.current.play();
    }
  }, []);

  const scratch = useCallback((speed: number, isReversed: boolean, position: number) => {
    if (!engineRef.current) return;
    engineRef.current.scratch(speed, isReversed, position);
  }, []);

  const endScratch = useCallback((resumePlayback: boolean) => {
    if (!engineRef.current) return;
    engineRef.current.endScratch(resumePlayback);
  }, []);

  const seek = useCallback((position: number) => {
    if (!engineRef.current) return;
    engineRef.current.seek(position);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (!engineRef.current) return;
    engineRef.current.setPlaybackRate(rate);
  }, []);

  const coastDown = useCallback((durationMs?: number) => {
    if (!engineRef.current) return;
    engineRef.current.coastDown(durationMs);
  }, []);

  const cancelCoastDown = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.cancelCoastDown();
  }, []);

  const spinUp = useCallback(async (durationMs?: number) => {
    if (!engineRef.current) return;
    await engineRef.current.spinUp(durationMs);
  }, []);

  const setStylusContact = useCallback((isContact: boolean) => {
    if (!engineRef.current) return;
    engineRef.current.setStylusContact(isContact);
  }, []);

  const setRecordSoundState = useCallback(async (surfaceState: RecordSoundState) => {
    await engineRef.current?.setRecordSoundState(surfaceState);
  }, []);

  const playNeedleDropSound = useCallback((kind: NeedleDropSound) => {
    return engineRef.current?.playNeedleDropSound(kind) ?? Promise.resolve();
  }, []);

  return {
    trackName: state.trackName,
    metadata: state.metadata,
    duration: state.duration,
    currentTime: state.currentTime,
    playbackState: state.playbackState,
    isPlaying: state.playbackState === 'playing',
    isLoaded: state.playbackState !== 'idle' && state.playbackState !== 'loading',
    isStylusDown: state.isStylusDown,
    setStylusContact,
    setRecordSoundState,
    playNeedleDropSound,
    error: state.error,
    loadTrack,
    play,
    getCurrentTime,
    pause,
    stop,
    togglePlayPause,
    scratch,
    endScratch,
    seek,
    setPlaybackRate,
    coastDown,
    cancelCoastDown,
    spinUp,
  };
}
