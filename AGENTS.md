# Agent instructions

These instructions apply to all automated and human-assisted coding work in this repository.

## Before changing code

1. Read this file and `CHATGPT.md`.
2. Read the linked GitHub Issue and its acceptance criteria.
3. Check the current branch and open pull requests before creating another branch.
4. Work only on the scope of the selected issue. Do not bundle future features or opportunistic refactors.
5. Before changing recurring turntable mechanics, arm geometry, rotation, groove mapping or motor behaviour, consult the [technical reference index](docs/reference/README.md) and its linked baseline. Update the reference and relevant tests in the same PR when a verified value or behaviour changes.

## Branch and pull request workflow

- Never develop directly on `main`.
- Use one short-lived branch per issue, for example `feat/turntable-shell-2` or `chore/bootstrap-workflow-1`.
- Keep one active feature pull request at a time unless the user explicitly says otherwise.
- Do not create duplicate branches or duplicate pull requests.
- Open a pull request that references the issue and includes `Closes #N`.
- The user has delegated merge authority to the assistant for this repository: merge a PR when its issue scope and acceptance criteria are met, CI is green, and review finds no unresolved blocking issues. Do not ask the user to perform a merge step or request a second approval for an otherwise-ready PR. Hold the merge if any of those conditions are not met, and explain the blocker.
- Update the issue or pull request with meaningful progress, decisions and validation results.

## Quality checks

Before requesting review, run:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Use `npm ci` for clean installs. Keep `package-lock.json` committed and update it whenever dependencies change.

Add tests with each feature where practical. The initial bootstrap may have no test files yet; the test command is configured to pass until the first test is added.

## Product and architecture rules

- Design mobile-first. Desktop and landscape layouts must be intentional, not merely scaled-up or scaled-down mobile layouts.
- Keep presentational deck components separate from audio playback and timing logic.
- Keep each deck's transport state isolated.
- Do not add a global state-management library until a concrete requirement justifies it.
- Do not add PWA/offline support, account systems, remote track storage or streaming integrations without a dedicated issue.
- Do not build mixer features before they have a dedicated issue and agreed reference.
- Prefer native browser APIs and small dependencies. Explain any new runtime dependency in the PR.

## Assets and references

- Treat the supplied CodePen projects as visual and interaction references, not as permission to copy code or images.
- Check licenses and asset provenance before importing code, images, sounds or other third-party material.
- Avoid hotlinking external assets. Prefer original assets or properly licensed local assets.
- Preserve accessibility: semantic controls, keyboard focus states, labels and reduced-motion support for future animation work.

## Agent dispatch

If Jules is used, dispatch implementation work in a clearly labelled `@Jules` section in the pull request body. Issues are for planning and tracking; do not use an issue comment as a Jules dispatch channel.
