# Digital DJ Setup — ChatGPT project guide

## Project direction

Build and maintain a mobile-first digital DJ workspace inspired by classic Technics decks and DMC/battle-style setups.

Primary design and interaction references:

- https://codepen.io/dmsr/pen/EKJmEm — Technics-inspired dual deck and overall turntable presentation.
- https://codepen.io/pimskie/pen/bGjMdxV — vinyl scratching interaction and playback response.

Use references to understand the intended look and feel. Do not copy their source or assets without checking license and provenance.

The authoritative mixer composition is the user's Figma prototype frame 41:36: two full-size -90° decks left/right with virtually no intentional gap or padding between each deck and the central mixer; a narrow centre mixer anchored low; a dark upper control strip for working rotary/utility knobs; three real signal meters in the centre between the two vertical channel-level faders; and a compact horizontal crossfader at the bottom. The crossfader's visible travel length must match the level-fader travel length, while its touch target remains usable. The deliberate headroom above the centre mixer contains one compact TOOLS toggle. Its single popover hosts both deck track loaders/status panels and, in development, the DevKit controls; never put the load bars on the outer sides of the rotated decks or restore a fixed bottom-corner DevKit button. Small visual controls must retain practical touch hit areas on phones. The supplied Vestax PMC-05 Pro III image in docs/manual_examples/visuals/vestax_pmc-pro.jpg is a secondary visual/material reference (black upper controls and brushed-aluminium faceplate), not the source of the overall layout. The older PCV-275 image in docs/manual_examples/manual/vestax_pro_look.jpeg is supplementary only; control notes are in docs/manual_examples/vestax.txt. The simplified two-deck mixer is implemented; remaining device acceptance and future refinements are tracked in Issue #17.

## Technical direction

- React + TypeScript + Vite.
- Keep the visual deck component separate from the audio engine.
- Each deck has its own guarded Zustand vanilla state machine/store, transport hook and AudioEngine instance.
- App owns one lazy shared AudioContext through MixerAudioGraph. Deck A and Deck B connect to distinct channel paths inside that graph; disposing one deck must not close the shared context.
- Keep Web Audio nodes and buffers inside AudioEngine / MixerAudioGraph. UI controls dispatch typed deck events or call the graph's public mixer API; they must not manipulate audio nodes directly.
- Keep pointer ownership, coordinates and high-frequency animation-frame physics local to interaction hooks, never in Zustand.
- Prefer native browser APIs and a small dependency footprint.
- The installable PWA shell is tracked in Issue #19: use native manifest/service-worker APIs, cache application resources and bundled app-owned crate/sound assets, and never cache user-selected audio. Do not add a remote audio store or backend.
- The two-deck mixer is a focused application mixer, not a full physical-console emulator. Its current controls and audio path are documented in docs/reference/audio-routing.md.

## Reference-first research (token-efficient)

- Before external research or re-deriving known behaviour, read docs/reference/README.md.
- Use docs/reference/turntable-baseline.md for current arm rotation, pivot geometry, groove mapping, SL-1200MK2 facts and simulation timings.
- Use docs/reference/audio-routing.md for shared AudioContext ownership, channel routing, analyser placement and app-specific mixer choices.
- Use docs/reference/pwa-shell.md for PWA cache boundaries and real-device installation checks.
- Do not search again for facts already documented and sourced unless a source is disputed, the hardware/version changes, or the implementation question needs new evidence.
- When a new verified fact or calibration is found, add it once to the reference and link to it from the issue. Keep issue bodies focused on task scope and acceptance criteria.
- Clearly label manufacturer facts, app calibration and simulation choices; never silently convert a simulation value into a hardware specification.

## Collaboration style

- Work from GitHub Issues, not from large untracked task lists.
- Implement one issue at a time, in one focused pull request.
- Do not start the next feature while the current PR is waiting for review, unless the user explicitly requests it.
- Keep explanations practical and brief. Prefer the next concrete action over long theoretical descriptions.
- Ask only when a product decision is genuinely blocking; otherwise make a conservative, clearly documented choice.
- The user has delegated merge authority to the assistant for this repository. Merge a PR once its scope and acceptance criteria are met, CI is green and the review finds no unresolved blockers. Do not ask the user to click Merge or repeat approval for a PR that meets those conditions.

## Current project order

The agreed near-term order is:

1. Issue #16 — document the current app, user workflows, architecture and development workflow.
2. Issue #26 — refine independent continuous platter/slipmat behaviour.
3. Issue #17 — complete the remaining real-device mixer acceptance and assess the next mixer refinements.
4. Issue #19 — complete the PWA deployment setup and real-device installation/offline acceptance.
5. Issue #30 — begin optional Pioneer DDJ-REV1 Web MIDI discovery and integration only after the preceding work is complete, unless the user explicitly reprioritizes.

The two-deck foundation and initial audio engine are established; the interactive tonearm/state-machine architecture and first shared mixer implementation are in place. Do not describe remaining hardware, real-device or acceptance work as completed simply because a CI build passes.

## Definition of done

A task is ready to merge when its issue scope and acceptance criteria are met, required checks pass, and review identifies no unresolved blocking issues. Update the issue and close it after a successful merge.
