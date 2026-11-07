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
- Do not introduce a state-management library, PWA layer or backend prematurely.

## Collaboration style

- Work from GitHub Issues, not from large untracked task lists.
- Implement one issue at a time, in one focused pull request.
- Do not start the next feature while the current PR is waiting for review, unless the user explicitly requests it.
- Keep explanations practical and brief. Prefer the next concrete action over long theoretical descriptions.
- Ask only when a product decision is genuinely blocking; otherwise make a conservative, clearly documented choice.
- Do not merge PRs without explicit user approval.

## Current roadmap

1. Issue #1 — project scaffold and agentic workflow.
2. Issue #2 — first reusable Technics-inspired turntable, visual only.
3. Issue #3 — dual-deck layout and opposing 45-degree landscape orientation.
4. Issue #4 — isolated Web Audio playback engine per deck.
5. Issue #5 — touch-first scratching and reverse transport.
6. Mixer — create a new issue only after the user chooses a mixer reference.

## Definition of done

A task is ready for review only when its issue scope and acceptance criteria are met, required checks pass, and the PR explains the changes and their validation.
