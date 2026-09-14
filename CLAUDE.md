# Life.ai

A single person's life chronicle. Import records or receive hourly snapshots from named, write-only Connect tokens, then read them on a 24-hour daily timeline.

## Sources of truth

- Product, API contract, ownership and implementation status: [docs/08-chronicle-rewrite.md](docs/08-chronicle-rewrite.md).
- Daily GPS/health/finance views, lizheng.blog profile and AI summaries: [docs/12-daily-view.md](docs/12-daily-view.md).
- Current daily reading design, GPS/weather and record tabs: [docs/16-daily-context-and-record-tabs.md](docs/16-daily-context-and-record-tabs.md). [docs/13-story-timeline.md](docs/13-story-timeline.md) retains the 1.2.0 design and release.
- Data Management, compact Footprint storage, CLI/Skill and 1.3.0 verification: [docs/15-data-management.md](docs/15-data-management.md).
- Apple Health compact import, cross-night stories and verification: [docs/17-apple-health.md](docs/17-apple-health.md).
- Version: root `package.json`; show the same version in the sidebar and `/api/live`.
- UI contract: installed `@nocoo/basalt/ai/RECIPES.md` and `../basalt/INTEGRATION.md`. Use the published package, its providers, application chrome and tokens.
- Quality: 6DQ from nmem `af0daa0f-0a10-4b0b-b328-f2dc32137bdc` and September revision `crystal_0c9c31f7de97`.

## Invariants

- One owner and one dataset. Access authenticates the entrance; never partition records by Access subject/email.
- Vite + React + Basalt + TypeScript strict + Biome; a Cloudflare Worker serves the SPA and API, with D1 database `life`.
- No Next.js, Google OAuth, local SQLite production server, or compatibility API in the new runtime.
- Persist and compare UTC instants. An absent offset means UTC, never server/browser local time. Convert only at presentation boundaries.
- Preserve day/hour/minute/second precision. Date-only records have no invented displayed clock time.
- Footprint stores one complete compact JSON package per UTC day. Later imports replace included days completely; absent days remain. Parse the entire input before uploading, preserve all six GPS values and native segments, and compare current hashes for idempotence, including A → B → A. Maps and AI clip decoded points to the requested local-day UTC window.
- Web and CLI share the Footprint model/client. The Skill calls `bun run data:import`; an explicit `--target` must match `/api/data/target` before writes. `dev:prod` is always `production`, regardless of its local/Caddy hostname.
- Footprint uses `/data/footprint` and its dedicated Access-protected API; old `/api/imports` Footprint writes return 410. Cumulative provider statistics belong to `/data`. Keep raw exports, coordinates, tokens and private backups out of Git.
- Apple Health uses `/data/apple-health`: complete ZIP/directory only. Web Worker + IndexedDB and CLI temporary disk share the parser/client. Preserve all original attributes, child nodes, coincident samples, routes, ECG samples, CDA and export metadata. One UTC start day × dimension series; split only for bounds. Included days replace all dimensions; absent dates remain. Compare canonical hashes for A → B → A. Old `/api/imports` writes return 410.
- Health display reads prior 24 hours and following 12 hours for sleep; actual sleep belongs to its waking day, with in-bed time separate. Deduplicate overlapping sensor quantities for presentation without deleting raw observations. Workouts and overlapping Footprint use one map. ECG displays every sample in paged 5-second windows; voltage and heart-rate units stay separate. Blood pressure pairs only the same measurement time/source. Night GPS labels are evidence-based suggestions.
- Health raw dimensions load only on the record tab; waveform/route attachments load separately. Coverage excludes sleep-goal settings and Unix-epoch-day measurements, while preserving their original dates and observations. Overview identifies epoch-dated records explicitly. Content hashes for AI omit virtual Health IDs/import timestamps and use stable content ordering for coincident samples.
- Connect is write-only: a random token, SHA-256 digest at rest, plaintext shown once, revocable. It can only upsert its own UTC hour. Later writes replace that hour; future hours are valid.
- `life.worker.hexly.ai` exposes only ingestion and `/api/live`; never serve the dashboard, records, imports or token management there.
- Production verifies the Access JWT signature, issuer, audience and expiry. Never trust the presence of an Access header or asserted email alone.
- MVVM: Views render and dispatch; ViewModels contain async state and transformations without View/DOM imports; services own HTTP; models own validation, UTC and import logic.
- The daily timeline is the primary reading structure: 24 local hour ticks, body/spatial evidence on the left and narrative events on the right; mobile merges branches in time order. Daily totals, all-day records, full-day map, weather and AI belong in the right-hand metadata column. Interval bodies appear once with continuation links. Date-only events never occupy the midnight slot.
- Daily Basalt tabs separate timeline, locations and other raw records. Mount only the active tab; load the record table module on demand and render at most 50 raw rows per page. Deduplicate cross-hour copies by event ID, not timestamp, preserving coincident GPS points. Tab changes reuse cached day data; never retain hidden raw record lists in the timeline.
- GPS places use a fixed first-observation anchor with a 5/10 km radius; preserve ordered returns and native segment/gap breaks. Each hourly map uses only that hour's points. The first map of a stay expands; later maps in that same area collapse. Leaving and returning starts a new expanded arrival, even if the area appeared earlier. Moving between several areas is not a repeated stay. New days reset automatic expansion. Leaflet initializes near the viewport and is destroyed when its tab unmounts.
- Marker numbers remain centered after Leaflet CSS loads. Speed colors derive from valid adjacent UTC samples (<6 / 6–30 / ≥30 km/h), never from guessing GPX raw speed units. Preserve missing/negative raw values in the records table. Sparse or coarse-precision samples have unknown derived speed.
- Public weather and solar context uses the selected day's representative GPS place. Fetch with bounded reads, timeout and cancellation; ignore responses for old selections. Convert hourly UTC measurements and solar instants into the selected local-day window. Missing location or unavailable provider data must not invent a city or time.
- The daily view fills the content island. On wide screens, each hour's branches form responsive columns on both sides of the trunk; use available container width so sidebar collapse also frees space. Keep mobile reading order intact.
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

Version 1.5.0 was deployed on 2026-09-14, Worker version `d121a787-e9e7-429e-b299-adfb9f8bbb44`. `docs/17-apple-health.md` records the full Apple Health import, independent original-node/attachment and production-snapshot verification, unchanged replay, daily health cards and release checks. Production holds 1,841,302 Health facts across 1,413 UTC storage dates / 49 dimensions in 31,999 content rows, preserving all attachments; measured coverage is 1,412 dates. Footprint remains 670,191 points in 1,625 daily rows, with unchanged content and timestamps. Actual total remote D1 size after replay is 155,381,760 bytes. `docs/16-daily-context-and-record-tabs.md` retains 1.4.0 maps/tabs/public-context evidence, `docs/15-data-management.md` retains the 1.3.0 GPS import and release, `docs/13-story-timeline.md` retains 1.2.0 timeline design/release evidence, `docs/12-daily-view.md` retains 1.1.0 daily views/AI evidence, and `docs/08-chronicle-rewrite.md` retains the original 1.0.0 rewrite and release evidence.
