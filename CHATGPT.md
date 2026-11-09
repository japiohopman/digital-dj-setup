# Digital DJ Setup — ChatGPT project guide

## Project direction

Build a mobile-first digital DJ workspace inspired by classic Technics decks and DMC/battle-style setups.

Primary references:

- https://codepen.io/dmsr/pen/EKJmEm — Technics-inspired dual deck and overall turntable presentation.
- https://codepen.io/pimskie/pen/bGjMdxV — vinyl scratching interaction and playback response.

Use references to understand the intended look and feel. Do not copy their source or assets without checking license and provenance.

The mixer reference has not been selected yet. Keep mixer design and implementation out of scope until the user supplies a reference and a dedicated issue is created.

## Technical direction

- React + TypeScript + Vite.
- Mobile-first responsive CSS.
- Keep UI components separate from audio-engine code.
- Prefer browser-native APIs and a small dependency footprint.
- Do not introduce a PWA layer or backend prematurely.
- Issue #14 is an explicit exception to the small-dependency default: use Zustand vanilla with one guarded state machine/store per deck as the single source of truth for power, motor, track, transport and tonearm transitions.
- Keep transition logic pure and typed. Use derived selectors for spinning, program-audio audibility and record-surface sound state; reject invalid transitions instead of creating contradictory combinations.
- UI components and interaction hooks must dispatch typed deck events. They must not call transport play/pause/stop/seek/scratch/stylus-contact commands directly; keep those side effects inside the per-deck Zustand adapter.
- Keep Web Audio objects inside AudioEngine. Keep pointer ownership, coordinates and animation-frame physics local to interaction hooks, never in Zustand.

## Reference-first research (token-efficient)

- Before external research or re-deriving known behaviour, read [docs/reference/README.md](docs/reference/README.md).
- Use [docs/reference/turntable-baseline.md](docs/reference/turntable-baseline.md) for current arm rotation, pivot geometry, groove mapping, SL-1200MK2 facts and simulation timings.
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

## Current roadmap

1. Issue #1 — project scaffold and agentic workflow.
2. Issue #2 — first reusable Technics-inspired turntable, visual only.
3. Issue #3 — dual-deck DMC layout; in landscape both decks rotate 90° counterclockwise (a quarter turn) in the same direction.
4. Issue #4 — isolated Web Audio playback engine per deck.
5. Issue #5 — touch-first scratching and reverse transport.
6. Mixer — create a new issue only after the user chooses a mixer reference.

## Definition of done

A task is ready to merge when its issue scope and acceptance criteria are met, required checks pass, and review identifies no unresolved blocking issues. Update the issue and close it after a successful merge.
