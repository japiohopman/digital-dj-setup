/**
 * State representing current playback progress and lifecycle.
 */
export type AudioPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';

/**
 * Public snapshot of the audio engine state.
 */
export interface AudioEngineState {
  /** Name of the loaded audio track, or null if no track loaded. */
  trackName: string | null;
  /** Total duration in seconds, or 0 if not loaded. */
  duration: number;
  /** Current playback timestamp in seconds. */
  currentTime: number;
  /** Current lifecycle playback state. */
  playbackState: AudioPlaybackState;
  /** Human-readable error message, or null if healthy. */
  error: string | null;
}

/**
 * Listener callback function for engine state updates.
 */
export type AudioEngineListener = (state: AudioEngineState) => void;

/**
 * Constructor options for the audio engine.
 */
export interface AudioEngineOptions {
  /** Optional custom AudioContext factory for testing or environments with specific policies. */
  audioContextFactory?: () => AudioContext;
}

/**
 * Transport controls exposed to consumers (e.g. React hooks, UI components).
 */
export interface DeckTransport {
  trackName: string | null;
  duration: number;
  currentTime: number;
  playbackState: AudioPlaybackState;
  isPlaying: boolean;
  isLoaded: boolean;
  error: string | null;
  loadTrack: (file: File) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlayPause: () => Promise<void>;
}
