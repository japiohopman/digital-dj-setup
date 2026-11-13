# Agent instructions

These instructions apply to all automated and human-assisted coding work in this repository.

## Before changing code

1. Read this file and CHATGPT.md.
2. Read the linked GitHub Issue and its acceptance criteria.
3. Check the current branch and open pull requests before creating another branch.
4. Work only on the scope of the selected issue. Do not bundle future features or opportunistic refactors.
5. Before changing recurring turntable mechanics, arm geometry, rotation, groove mapping or motor behaviour, consult the technical reference index and its linked baseline. Update the reference and relevant tests in the same PR when a verified value or behaviour changes.

## Branch and pull request workflow

- Never develop directly on main.
- Use one short-lived branch per issue, for example feat/turntable-shell-2 or chore/bootstrap-workflow-1.
- Keep one active feature pull request at a time unless the user explicitly says otherwise.
- Do not create duplicate branches or duplicate pull requests.
- Open a pull request that references the issue with Closes #N.
- The user has delegated merge authority to the assistant for this repository: merge a PR when its issue scope and acceptance criteria are met, CI is green, and review finds no unresolved blocking issues. Do not ask the user to perform a merge step or request a second approval for an otherwise-ready PR. Hold the merge if any of those conditions are not met, and explain the blocker.
- Update the issue or pull request with meaningful progress, decisions and validation results.

## Quality checks

Before requesting review, run:

- npm run lint
- npm run typecheck
- npm run test
- npm run build

Use npm ci for clean installs. Keep package-lock.json committed and update it whenever dependencies change.

Add tests with each feature where practical. The initial bootstrap may have no test files yet; the test command is configured to pass until the first test is added.

## Product and architecture rules

- Design mobile-first. Desktop and landscape layouts must be intentional, not merely scaled-up or scaled-down mobile layouts.
- Keep presentational deck components separate from audio playback and timing logic.
- Keep each deck's transport state isolated.
- The current per-deck state-machine implementation uses Zustand vanilla stores. Reuse that existing, scoped model; do not add another global state library or move Web Audio nodes, buffers or pointer-frame physics into Zustand without a dedicated issue and architectural justification.
- Keep the shared app-owned MixerAudioGraph and its AudioContext lifecycle separate from individual deck disposal.
- Do not add PWA/offline support, account systems, remote track storage or streaming integrations without a dedicated issue.
- Do not build mixer features before they have a dedicated issue and agreed reference. The current two-deck mixer is tracked in Issue #17.
- Prefer native browser APIs and small dependencies. Explain any new runtime dependency in the PR.

## Assets and references

- Treat the supplied CodePen projects as visual and interaction references, not as permission to copy code or images.
- Check licenses and asset provenance before importing code, images, sounds or other third-party material.
- Avoid hotlinking external assets. Prefer original assets or properly licensed local assets.
- Preserve accessibility: semantic controls, keyboard focus states, labels and reduced-motion support for future animation work.

## Agent dispatch

- Jules dispatch is inactive for this repository from 11 November 2026. Do not add @Jules sections, send work to Jules, or assume a Jules branch will appear.
- Implement directly in the active issue branch and pull request, following the one-issue / one-PR workflow.
- Revisit this rule only if the user explicitly re-enables Jules or chooses another implementation agent.
