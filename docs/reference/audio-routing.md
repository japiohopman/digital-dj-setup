# Shared mixer audio routing

**Status:** Phase 1 accepted; Phase 2 implementation in progress  
**Last updated:** 2026-11-12  
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
  -> LOW shelf EQ -> MID peaking EQ -> HIGH shelf EQ
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
  -> LOW shelf EQ -> MID peaking EQ -> HIGH shelf EQ
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
- Per deck: input gain, channel gain, three BiquadFilterNodes for the channel EQ, crossfader gain and analyser.
- The per-deck analyser is post-channel, post-EQ and post-crossfader, so its meter reflects all three channel processing stages.
- The master analyser is post-master gain, so it measures the final output that reaches the AudioContext destination.
- One app-owned master gain sits after both deck paths have joined the master route. Its level affects only the combined final output.

In the Phase 0 routing baseline both gains were fixed at unity (1.0). Phase 1 added independent channel-level control and the A/B crossfader. Phase 2 adds isolated per-deck EQ and a final master output control; the exact controls are documented below.

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
- Each deck's public input is the existing graph-owned input GainNode. Its gain is explicitly kept at 1.0 (0 dB / unity) so loaded tracks, scratch playback, needle cues and record-surface loops continue into the EQ path with TRIM bypassed. No extra gain stage or trim setting is required.

## Phase 1 controls and signal measurement

- `MixerAudioGraph.setChannelLevel(deckId, value)` controls each channel gain independently from 0 (silent) to 1 (unity). Values are retained before the AudioContext is created and applied when a deck path is first built.
- `MixerAudioGraph.setCrossfaderPosition(value)` controls the A/B blend from 0 (A) to 1 (B). The equal-power cosine/sine response and 18 ms gain ramp are **app simulation choices**, not verified specifications of the PMC-05 Pro III hardware. Each deck is approximately -3 dB at centre.
- `MixerAudioGraph.setCrossfaderCutLag(value)` controls the symmetric cut-lag width from 0 (minimum gap) to 1 (maximum configured gap). The app maps that normalized setting to a maximum 15% muted travel zone for the incoming deck at each end. This 15% range is an **app simulation choice**, not a Vestax specification. The centre remains at equal-power balance.
- The Vestax PMC-05 Pro IV manual describes **C.F. CUT CONTROL** as adjusting cut-lag width: the muted cut-lag gap at each fader end. Its hardware has separate left and right controls; this app deliberately uses one shared dial so both sides stay matched. See the [PMC-05 Pro IV manual](https://imagescdn.juno.co.uk/manual/404904-01U.pdf) and [AlphaTheta's explanation of crossfader curve vs cut lag](https://pioneer-support.zendesk.com/hc/en-us/articles/12185566369561-I-don-t-like-the-cut-of-the-crossfader-Can-I-adjust-it).
- CUT-IN and crossfader curve are separate behaviours: CUT-IN changes how far the fader travels before the incoming deck begins to open; the existing equal-power curve determines the gain transition after cut-in. The dial does not yet expose a separate sharp/scratch curve control.
- `MixerAudioGraph.getMeterLevels()` reads RMS time-domain samples from the post-channel/post-EQ/post-crossfader Deck A and Deck B analysers and the post-master analyser. It returns normalized levels and never creates or resumes an AudioContext.
- `MixerPanel` owns presentation state for the channel faders, crossfader, CUT-IN, master output and both deck EQ banks. It sends all parameter changes through the graph API and polls the real meter readings; it does not access Web Audio nodes directly.
- In portrait, the mixer is a dedicated third view rather than a narrow strip between decks. In landscape, the mixer follows the user's Figma composition: narrow centre column, both decks full-size and still rotated -90°. The centre mixer is shorter than the decks and anchored low, leaving a reserved headroom area above it.
- The landscape layout uses zero intentional gaps between each deck and the mixer, with only device safe-area insets around the outside. The decks can therefore use as much of the phone width as possible without shrinking their touch controls.
- The turntable's full artwork/composition wrapper is scaled uniformly by 1.14 in landscape to compensate for the built-in empty canvas around the source Technics PNG. This is an app layout calibration, not an asset edit: the stub image, frame, platter, slipmat, record, arm and hardware controls all scale together. Deck slots allow this artwork to extend behind the centre mixer, which is layered above it; only the overall viewport clips the enlarged decks.
- The reserved headroom contains one compact **TOOLS** toggle. Its popover hosts both existing deck track-loader/status panels and the development-only DevKit controls. The loader panels are portalled into this shared menu instead of occupying the outer flank of each rotated deck. The menu stays mounted but hidden when closed so diagnostic widget settings are retained.
- The supplied Figma frame 41:36 is the authoritative overall composition reference; the PMC-05 Pro III is a secondary control-grouping and material reference. The dark upper strip contains two channel banks, each with a non-interactive TRIM / BYPASS placeholder above its independent LOW / MID / HIGH EQ stack, plus a far-right utility column with MASTER above CUT-IN. The six EQ controls are always visible directly on the mixer faceplate; there is no EQ modal or overlay. On every layout, the TRIM placeholder sits above the three functional rotary controls, which are stacked vertically in LOW / MID / HIGH order, directly above the matching channel fader. The placeholder is clearly non-interactive and indicates unity bypass; it does not change the input signal. Each EQ row shows its band label, rotary control and current dB value. The aluminium faceplate places the three real signal meters in a central bridge **between** the two vertical Deck A / Deck B level faders. The A/B/MASTER meters are enlarged to approximately the visible travel height of the channel faders. The lower horizontal crossfader remains compact at the bottom centre; its larger hit area stays touch-friendly. Large title/status copy and the decorative footer are omitted. Non-functional mic, effects, cue/monitor and input-selector controls remain out of scope.

## Phase 1 acceptance — 11 November 2026

Phase 1 is accepted after the user's real-device tests. The crossfader A / centre / B behaviour, independent channel mute, symmetric CUT-IN, A/B/MASTER meters, concurrent platter and mixer input, and independent simultaneous scratching on both decks all passed. See Issue #17 for the recorded device results.

## Phase 2 — EQ and master output

- Each deck has one independent three-band channel EQ, applied after its channel-level gain and before its crossfader gain. Programme audio, scratch/reverse playback, needle cues and vinyl/off-record layers all enter this same channel path, so no audible deck layer bypasses EQ.
- The LOW band is a low-shelf filter at 250 Hz; MID is a peaking filter at 1,000 Hz with Q 0.8; HIGH is a high-shelf filter at 10,000 Hz. These centre frequencies and the Q value are documented **app design choices**, not claims about the PMC-05 Pro III.
- Every band starts at 0 dB (flat) and supports a continuous -12 dB to +12 dB cut/boost range in 1 dB UI steps. AudioParam changes use the same short 18 ms ramp strategy as the existing fader controls to reduce abrupt transitions.
- `MixerAudioGraph.setDeckEq(deckId, band, gainDb)` changes one band on exactly one deck. Its settings are retained before AudioContext creation and applied when that deck's path is built.
- The dark upper strip presents all six EQ controls directly on the faceplate: three independent rotary controls for Deck A and three for Deck B. Each group has a per-deck RESET button that returns only that deck's three bands to 0 dB. Controls are side by side in portrait/wider layouts and vertically stacked in the narrow mobile landscape mixer. The controls are real, labelled range inputs styled as rotary knobs; no separate EQ button, dialog or overlay is used.
- The MASTER rotary is a final output level from 0 (silent) to 100% (unity). The value is retained before audio starts. It changes only the app-owned master gain, which is after both deck paths and before the master analyser / destination. It does not change either channel gain, crossfader, motor, record, transport or tonearm state.
- A/B meters remain post-EQ and post-crossfader. The MASTER meter remains post-master-level, so it responds to the actual final output.
- The master level does not add gain above unity; this avoids introducing an additional boost stage that could make clipping easier.

The Phase 2 audio graph is implemented in PR #37, the always-visible faceplate EQ layout in PR #38, and the vertical EQ layout in PR #39. The user has confirmed on a real phone that the six EQ controls respond and audibly work. The per-deck input remains at unity with TRIM bypassed; the TRIM faceplate position is only a non-interactive placeholder, not a gain control. External LINE / PHONO hardware inputs and a functional TRIM gain stage remain out of scope until separately agreed.
