# Life.ai

A single person's life chronicle. Import records or receive hourly snapshots from named, write-only Connect tokens, then read them on a 24-hour daily timeline.

## Sources of truth

- Product, API contract, ownership and implementation status: [docs/08-chronicle-rewrite.md](docs/08-chronicle-rewrite.md).
- Daily GPS/health/finance views, lizheng.blog profile and AI summaries: [docs/12-daily-view.md](docs/12-daily-view.md).
- Current daily reading design and release: [docs/13-story-timeline.md](docs/13-story-timeline.md).
- Version: root `package.json`; show the same version in the sidebar and `/api/live`.
- UI contract: installed `@nocoo/basalt/ai/RECIPES.md` and `../basalt/INTEGRATION.md`. Use the published package, its providers, application chrome and tokens.
- Quality: 6DQ from nmem `af0daa0f-0a10-4b0b-b328-f2dc32137bdc` and September revision `crystal_0c9c31f7de97`.

## Invariants

- One owner and one dataset. Access authenticates the entrance; never partition records by Access subject/email.
- Vite + React + Basalt + TypeScript strict + Biome; a Cloudflare Worker serves the SPA and API, with D1 database `life`.
- No Next.js, Google OAuth, local SQLite production server, or compatibility API in the new runtime.
- Persist and compare UTC instants. An absent offset means UTC, never server/browser local time. Convert only at presentation boundaries.
- Preserve day/hour/minute/second precision. Date-only records have no invented displayed clock time.
- Connect is write-only: a random token, SHA-256 digest at rest, plaintext shown once, revocable. It can only upsert its own UTC hour. Later writes replace that hour; future hours are valid.
- `life.worker.hexly.ai` exposes only ingestion and `/api/live`; never serve the dashboard, records, imports or token management there.
- Production verifies the Access JWT signature, issuer, audience and expiry. Never trust the presence of an Access header or asserted email alone.
- MVVM: Views render and dispatch; ViewModels contain async state and transformations without View/DOM imports; services own HTTP; models own validation, UTC and import logic.
- The daily timeline is the primary reading structure: 24 local hour ticks, body/spatial evidence on the left and narrative events on the right; mobile merges branches in time order. Do not put overview/map/AI cards ahead of it. High-frequency records keep an expandable raw record list; interval bodies appear once with continuation links. Daily totals and AI belong at the end.
- AI summaries are generated manually from all records in the validated local-day UTC window. Keep the last successful summary on failure; show stale data when its input hash changes. Source filtering only changes the timeline/map/measured totals.
- Default AI uses the Workers AI binding. External keys are AES-GCM encrypted with `AI_SETTINGS_KEY`; keep that secret separate from D1 and never replace it without re-encrypting stored keys. External HTTP uses manual redirects and bounded reads.
- Session profile uses the authenticated email's SHA-256 with lizheng.blog. Missing/failed profiles fall back to session identity and initials, without changing Access authentication.
- Work on `main`, no branches/worktrees for this rewrite. Coordinating Codex owns integration and commits; collaborators touch only assigned files. Never stage all files indiscriminately.

## Environments and ports

| Purpose | Address / resource |
| --- | --- |
| Production | `https://life.hexly.ai`, Worker `life`, D1 `life` |
| Machine ingestion | `https://life.worker.hexly.ai/api/ingest` |
| Access | team `nocoo`, issuer `https://nocoo.cloudflareaccess.com` |
| Access audience | `3d1df7c70e4cb094a5bd4a1c2ec7a81aad0d5265e93f8b89424a206859269503` |
| Local dev | `https://life.dev.hexly.ai` → Caddy → `127.0.0.1:7011` |
| Local with production data | `bun run dev:prod`, same Caddy domain / 7011; remote D1 `life`; explicitly authorized by the user |
| L2 / L3 | `17011` / `27011`, each with a fresh isolated local SQLite directory |
| Optional sidecar | `37011`; integrated Vite Worker development does not need it |

Port allocation is confirmed by nmem `25b22d6b-1df5-4491-ae4d-269a556f6442`, not the older Basalt family inventory. Active Caddy config: `/opt/homebrew/etc/Caddyfile`; tracked mirror: `../workflow/caddy/Caddyfile`. Reuse the existing domain and certificate.

## Quality and release

- L1: Vitest, statements/branches/functions/lines each ≥95% on domain, ViewModels, services and Worker logic; thin Views are exercised by L3.
- G1: strict typecheck and Biome with zero warnings/errors.
- L2: real HTTP against the local Worker and SQLite, every API endpoint covered.
- L3: Playwright covers timeline, import, Connect creation/revocation, responsive chrome and auth boundaries.
- G2: gitleaks and osv-scanner, plus a production bundle/deployment dry run.
- D1 isolation: fresh per-run state and cache directories; loopback only; `_test_marker` with `env=test`; never remote bindings or production credentials for automated tests.
- AI tests use a loopback model fixture and per-run encryption key. The local test environment deliberately has no Workers AI binding, because that binding always runs remotely. Production-data development stores its encryption key only in ignored `.dev.vars.devprod`.
- Before deploy: inspect migration state, apply required migrations, validate config and bundle. After deploy: verify Access protection, public JSON health, ingestion host isolation and running production version.
- The user explicitly authorized this rewrite and production deployment. Keep docs current and report only verified outcomes.

Version 1.2.0 was deployed on 2026-09-13, Worker version `eeb96c2d-2014-4250-9945-09b2d242c81f`. `docs/13-story-timeline.md` records the current design, quality results and production verification; `docs/12-daily-view.md` retains 1.1.0 daily views/AI evidence, and `docs/08-chronicle-rewrite.md` retains the original 1.0.0 rewrite and release evidence.
