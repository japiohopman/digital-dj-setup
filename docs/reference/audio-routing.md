# Shared mixer audio routing

**Status:** Phase 1 implementation in progress  
**Last updated:** 2026-11-10  
**Scope:** two independent Technics-inspired decks routed through one app-owned mixer graph.

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

In the Phase 0 routing baseline both gains were fixed at unity (1.0). Phase 1 now adds independent channel-level control and the A/B crossfader; the current gain behaviour and meter API are documented below.

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

## Phase 1 controls and signal measurement

- `MixerAudioGraph.setChannelLevel(deckId, value)` controls each channel gain independently from 0 (silent) to 1 (unity). Values are retained before the AudioContext is created and applied when a deck path is first built.
- `MixerAudioGraph.setCrossfaderPosition(value)` controls the A/B blend from 0 (A) to 1 (B). The equal-power cosine/sine response and 18 ms gain ramp are **app simulation choices**, not verified specifications of the PMC-05 Pro III hardware. Each deck is approximately -3 dB at centre.
- `MixerAudioGraph.setCrossfaderCutLag(value)` controls the symmetric cut-lag width from 0 (minimum gap) to 1 (maximum configured gap). The app maps that normalized setting to a maximum 15% muted travel zone for the incoming deck at each end. This 15% range is an **app simulation choice**, not a Vestax specification. The centre remains at equal-power balance.
- The Vestax PMC-05 Pro IV manual describes **C.F. CUT CONTROL** as adjusting cut-lag width: the muted cut-lag gap at each fader end. Its hardware has separate left and right controls; this app deliberately uses one shared dial so both sides stay matched. See the [PMC-05 Pro IV manual](https://imagescdn.juno.co.uk/manual/404904-01U.pdf) and [AlphaTheta's explanation of crossfader curve vs cut lag](https://pioneer-support.zendesk.com/hc/en-us/articles/12185566369561-I-don-t-like-the-cut-of-the-crossfader-Can-I-adjust-it).
- CUT-IN and crossfader curve are separate behaviours: CUT-IN changes how far the fader travels before the incoming deck begins to open; the existing equal-power curve determines the gain transition after cut-in. The dial does not yet expose a separate sharp/scratch curve control.
- `MixerAudioGraph.getMeterLevels()` reads RMS time-domain samples from the post-channel/post-crossfader Deck A and Deck B analysers and the post-master analyser. It returns normalized levels and never creates or resumes an AudioContext.
- `MixerPanel` owns only presentation state. It sends fader values to the graph API and polls the real meter readings; it does not access Web Audio nodes directly.
- In portrait, the mixer is a dedicated third view rather than a narrow strip between decks. In landscape, the mixer follows the user's Figma composition: narrow centre column, both decks full-size and still rotated -90°. The centre mixer is shorter than the decks and anchored low, leaving a reserved headroom area above it.
- The landscape layout uses zero intentional gaps between each deck and the mixer, with only device safe-area insets around the outside. The decks can therefore use as much of the phone width as possible without shrinking their touch controls.
- The reserved headroom contains one compact **TOOLS** toggle. Its popover hosts both existing deck track-loader/status panels and the development-only DevKit controls. The loader panels are portalled into this shared menu instead of occupying the outer flank of each rotated deck. The menu stays mounted but hidden when closed so diagnostic widget settings are retained.
- The supplied Figma frame 41:36 is the authoritative composition reference; the PMC-05 Pro III is a secondary visual/material reference only. The dark upper strip contains working rotary/utility controls (currently CUT-IN). The aluminium faceplate places the three real signal meters in a central bridge **between** the two vertical Deck A / Deck B level faders. The lower horizontal crossfader uses the same normalized travel length as either channel fader; its larger hit area remains touch-friendly even though the visible travel is compact. Large title/status copy and the decorative footer are omitted. Non-functional mic, effects, cue/monitor, EQ and input-selector controls remain out of scope.

## Phase 1 verification still required

1. Listen to the equal-power centre behaviour with two simultaneous decks and adjust/document the curve if the real-device test calls for it.
2. Verify each channel fader at minimum silences only its deck without changing transport, platter motor or tonearm state.
3. Verify crossfader hard-left, centre and hard-right behaviour, plus both post-fader channel meters and the combined master meter.
4. Test portrait Mixer view and landscape central mixer on a real phone, and retain the CI screenshots for desktop and both mobile orientations.
5. Test minimum and maximum CUT-IN settings from both fader ends, confirming the symmetric silent zones and that neither deck's transport, motor or tonearm state changes.
