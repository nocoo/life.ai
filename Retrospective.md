# Retrospective

## 2026-10-03 — Verify hook installation before committing

The isolated dependency-maintenance clone had no `core.hooksPath` after installation, so its first local commit did not invoke pre-commit. The complete quality suite had passed, but that was not hook evidence. Ran the documented `bun run prepare`, then amended the unpublished commit normally with the index-snapshot hook active. Verify `core.hooksPath` before the first commit in every retained clone.


No accident narratives have been recorded in this log yet.

Record the date when known, what happened, its cause, and the follow-up. Do not invent an incident to populate this file. Keep recurring project rules brief in `AGENTS.md`; cross-project lessons belong in global rules or nmem, and deterministic checks belong in hooks or tests.
