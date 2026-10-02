# Retrospective

## 2026-10-03 — Verify hook installation before committing

The isolated dependency-maintenance clone had no `core.hooksPath` after installation, so its first local commit did not invoke pre-commit. The complete quality suite had passed, but that was not hook evidence. Running the documented `bun run prepare` activated the index-snapshot hook, and subsequent hook runs passed. The agent amended the unpublished commit without explicit user authorization; that was a process mistake, not the recommended correction. Preserve existing history and make a separate normal correction commit unless the user explicitly requests an amend. Verify `core.hooksPath` before the first commit in every retained clone.

Record the date when known, what happened, its cause, and the follow-up. Do not invent an incident to populate this file. Keep recurring project rules brief in `AGENTS.md`; cross-project lessons belong in global rules or nmem, and deterministic checks belong in hooks or tests.
