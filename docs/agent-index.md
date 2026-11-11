# Agent index

Use this page to find the smallest set of project guidance and technical references needed for a task.

## Always read first

1. [Repository agent instructions](../AGENTS.md) — mandatory coding, branch and validation rules.
2. [ChatGPT project guide](../CHATGPT.md) — product direction, collaboration decisions and current priorities.
3. [Repository README](../README.md) — setup, technology and top-level project information.
4. [App overview](app/overview.md) — what the product does and what is currently in or out of scope.

Before editing, inspect the selected GitHub Issue, current branch, and open pull requests. Work on one issue at a time.

## Task-to-reference map

| Task | Read before changing |
|---|---|
| Turntable visuals or controls | [User workflows](app/user-workflows.md), [Responsive layouts](app/responsive-layouts.md), `src/components/Turntable.tsx` and `src/components/Turntable.css` |
| Tonearm geometry, groove mapping or mechanical behaviour | [Technical reference index](reference/README.md), [Turntable baseline](reference/turntable-baseline.md), `src/audio/tonearmGeometry.ts` and its tests |
| Scratch, reverse, platter motion or pointer interaction | [Audio and deck model](app/audio-and-deck-model.md), `src/audio/useVinylMotion.ts`, `src/audio/useTonearm.ts` and their tests |
| Deck transitions or transport lifecycle | [Audio and deck model](app/audio-and-deck-model.md), `src/state/deckMachine.ts`, `src/state/deckStore.ts` and their tests |
| Audio loading, playback or sound effects | [Audio and deck model](app/audio-and-deck-model.md), `src/audio/AudioEngine.ts` and `src/audio/types.ts` |
| Mixer controls, shared routing or meters | [Shared mixer audio routing](reference/audio-routing.md), `src/audio/MixerAudioGraph.ts`, `src/components/mixer/MixerPanel.tsx` and their tests |
| Track crate, local audio picker or workspace menu | [User workflows](app/user-workflows.md), `src/components/workspace/WorkspaceMenu.tsx`, `src/components/Turntable.tsx` and their tests |
| PWA install, caching or offline behaviour | [PWA shell guide](reference/pwa-shell.md), `src/pwa/` and `public/manifest.webmanifest` |
| Visual or layout changes | [Responsive layouts](app/responsive-layouts.md), the relevant component CSS and [Testing and validation](development/testing-and-validation.md) |
| Project workflow, CI or pull-request guidance | [Agent workflow](development/agent-workflow.md), [Testing and validation](development/testing-and-validation.md), `AGENTS.md` and `CHATGPT.md` |

## Source-of-truth rules

- Source code and tests define what is implemented. Do not describe planned work as complete.
- Distinguish manufacturer facts, observed behaviour, app calibration and simulation choices.
- Update the relevant reference when a verified recurring value or behaviour changes.
- Keep issue bodies focused on the change and acceptance criteria. Put reusable technical facts in the reference documents and link to them.
- Do not create a second architecture description that conflicts with the existing technical references.
