import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine } from './AudioEngine';
import type { DeckTransport, AudioEngineState, AudioEngineOptions } from './types';

/**
 * Custom React hook managing an independent AudioEngine instance for a deck.
 *
 * Keeps AudioContext, AudioBuffer and AudioBufferSourceNode completely outside
 * React component state. Exposes high-level transport state and controls.
 */
export function useDeckTransport(options?: AudioEngineOptions): DeckTransport {
  const engineRef = useRef<AudioEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new AudioEngine(options);
  }

  const [state, setState] = useState<AudioEngineState>(() => engineRef.current!.getState());

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const unsubscribe = engine.subscribe((nextState) => {
      setState(nextState);
    });

    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const loadTrack = useCallback(async (file: File) => {
    if (!engineRef.current) return;
    try {
      await engineRef.current.loadTrack(file);
    } catch {
      // Error is set in engine state and propagated via subscriber
    }
  }, []);

  const play = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.play();
  }, []);

  const pause = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.pause();
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

  return {
    trackName: state.trackName,
    duration: state.duration,
    currentTime: state.currentTime,
    playbackState: state.playbackState,
    isPlaying: state.playbackState === 'playing',
    isLoaded: state.playbackState !== 'idle' && state.playbackState !== 'loading',
    error: state.error,
    loadTrack,
    play,
    pause,
    stop,
    togglePlayPause,
    scratch,
    endScratch,
    seek,
  };
}
