# Agent and contributor workflow

## Start with the project guidance

Before changing code:

1. Read [AGENTS.md](../../AGENTS.md).
2. Read [CHATGPT.md](../../CHATGPT.md).
3. Read the [app overview](../app/overview.md) and the task-specific documents from the [agent index](../agent-index.md).
4. Open the selected GitHub Issue and read its acceptance criteria.
5. Inspect the current branch and open pull requests before creating a new branch.

The current source and tests define implemented behaviour. Do not implement from an issue title, screenshot or old note without checking the current code.

## One issue, one branch, one pull request

- Work from an existing, agreed GitHub Issue. Issues are planning and acceptance records, not a place to dispatch active implementation work.
- Create one short-lived feature or documentation branch from the current main branch. Never commit directly to main.
- Keep the change limited to one issue. Do not bundle unrelated fixes or opportunistic refactors.
- Keep one active feature pull request at a time unless the user explicitly reprioritizes.
- Open one pull request that references its issue using **Closes #N**.
- Update the issue or pull request with meaningful decisions, implementation notes and validation results.

## Implementation and review

- Prefer native browser APIs and a small dependency footprint. Explain any new runtime or build dependency in the pull request.
- Add tests alongside behaviour changes. For recurring hardware facts, geometry or calibration, update the reference document and relevant tests with the implementation.
- Include screenshots for visual changes and record the device / browser / viewport for real-device acceptance.
- Let CI and code review complete. Fix blocking findings, resolve review threads only when the underlying point has been addressed, and do not merge while checks are red or blocking review is unresolved.
- The repository has delegated merge authority for this project: merge only when the issue scope and acceptance criteria are met, CI is green and review has no unresolved blockers.

## Jules dispatch

When Jules is used, put the implementation request in a clearly labelled **@Jules** section in the pull request body. Do not use an issue comment as the active Jules dispatch channel.

## Keep documentation maintainable

- Link to the canonical document rather than copying the same rule into several files.
- Label behaviour as implemented, planned, not verified on real hardware or out of scope as appropriate.
- Keep issue bodies focused on one change and its acceptance criteria; put reusable technical facts in the technical reference documents.
