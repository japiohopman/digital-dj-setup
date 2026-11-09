# Shared mixer audio routing

**Status:** Phase 0 implementation baseline  
**Last updated:** 2026-11-09  
**Scope:** two independent Technics-inspired decks routed through one app-owned output graph.

## Ownership

- `App` owns one `MixerAudioGraph`.
- `MixerAudioGraph` lazily creates and owns the one shared `AudioContext`, the Deck A and Deck B channel paths, both channel analysers, and the master output/analyser.
- Each `useDeckTransport` still creates its own `AudioEngine`. Each engine owns its own decoded track buffers, source nodes, playhead, scratch/reverse state and transport lifecycle.
- Each engine receives an `audioContextProvider` and an `outputNodeProvider` from the graph. Both providers share the same context but return distinct channel input nodes.
- A deck engine is not allowed to close the shared context when it is disposed. Only the app-owned graph closes the context during app teardown.

## Signal paths

Programme playback and scratch/reverse audio:

```text
AudioBufferSource
  -> per-source gain / de-click ramp
  -> deck programme gain
  -> stylus-contact gain
  -> deck channel input
  -> channel level gain
  -> crossfader gain
  -> deck analyser
  -> master gain
  -> master analyser
  -> AudioContext.destination
```

Needle-drop one-shots and record-surface loops use their own source/gain nodes but enter through the same deck channel input:

```text
Needle cue or vinyl/off-record loop source
  -> layer gain
  -> deck channel input
  -> channel level gain
  -> crossfader gain
  -> deck analyser
  -> master gain
  -> master analyser
  -> AudioContext.destination
```

This is deliberate: stylus contact controls programme audio, but record/needle interaction sounds must remain audible at the correct physical transitions. All layers still pass through the channel and crossfader path so no sound can bypass mixer levels later.

## Phase 0 graph

`src/audio/MixerAudioGraph.ts` creates these nodes lazily:

- One master gain and one master analyser.
- Per deck: input gain, channel gain, crossfader gain and analyser.
- The per-deck analyser is post-channel and post-crossfader, so later meters can show the actual signal after those controls.
- The master analyser is post-master gain, so it can measure the final output.

In Phase 0 the channel gain and crossfader gain both remain at unity (1.0). There are no mixer controls yet. Phase 1 will introduce their control logic after this routing has been proved.

## Lifecycle and browser policy

- Constructing the graph or calling `createDeckAudioOptions()` does not create an AudioContext.
- The context is created only when a user action causes a deck engine to load/play a track or play a record sound. This preserves the browser's user-gesture/autoplay policy.
- Both deck options call the same graph-owned context provider.
- Disposing one deck stops only that deck's sources and buffers; it does not close the shared context or stop the other deck.
- App teardown calls `MixerAudioGraph.dispose()` to close the shared context. The graph can lazily create a new context if React StrictMode remounts the app in development.

## Tests and proof

- `src/audio/MixerAudioGraph.test.ts` verifies lazy creation, a single shared context, distinct deck input paths, per-deck/master analyser topology and app-owner-only context disposal.
- `src/audio/AudioEngine.test.ts` verifies programme audio, vinyl loops and needle one-shots all connect to the injected deck input, and disposing the engine leaves the shared context alive.
- The application instantiates one graph and passes separate Deck A and Deck B options into their independent `useDeckTransport` hooks.

## Phase 1 constraints

1. Add channel fader and crossfader actions to the graph; do not wire UI directly to Web Audio nodes.
2. Keep every deck sound layer upstream of the channel fader and crossfader.
3. Decide and document the centre crossfader curve after listening tests. The Phase 0 graph deliberately does not pick a curve.
4. Add real-device checks with both decks playing simultaneously, each deck independently muted/faded, and both channel meters plus the master meter observed.
