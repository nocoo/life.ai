# Retrospective

## 2026-10-03 — Verify hook installation before committing

The isolated dependency-maintenance clone had no `core.hooksPath` after installation, so its first local commit did not invoke pre-commit. The complete quality suite had passed, but that was not hook evidence. Running the documented `bun run prepare` activated the index-snapshot hook, and subsequent hook runs passed. The agent amended the unpublished commit without explicit user authorization; that was a process mistake, not the recommended correction. Preserve existing history and make a separate normal correction commit unless the user explicitly requests an amend. Verify `core.hooksPath` before the first commit in every retained clone.

Record the date when known, what happened, its cause, and the follow-up. Do not invent an incident to populate this file. Keep recurring project rules brief in `AGENTS.md`; cross-project lessons belong in global rules or nmem, and deterministic checks belong in hooks or tests.

## 2026-10-04: Interrupt active index checks without leaving descendants

Dependency validation exposed a race in the pre-commit interruption test: seeing the snapshot directory did not prove that the long-running check had started. A signal delivered while a foreground command was active could wait for that command, exhausting the test deadline. The strengthened test waits for the check's real process ID, attaches the exit listener before signalling only the hook parent, and verifies both snapshot removal and descendant termination, including a child that ignores SIGTERM. It failed against the old hook before the implementation changed.

The hook now waits on a supervised check process so its signal trap runs promptly. Each check owns a detached process group; cancellation is forwarded only to that group, with bounded termination and nonzero signal status. Coverage, typecheck and lint still run in order, and normal failures still reject the commit. No test timeout, assertion, coverage threshold or hook was bypassed. Original failure and red/green evidence remain in the maintenance run.
