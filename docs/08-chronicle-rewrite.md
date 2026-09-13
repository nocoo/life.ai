# Life.ai chronicle rewrite

## Product and data

Life.ai is one person's life chronicle. A day presents 24 local hour labels and a separate section for records whose time is only known to the day. Sources are imported Apple Health, GPS/footprint, Pixiu, journal JSON, and named Connect publishers. There are no user accounts or per-user partitions inside the application.

Persist and compare UTC. API timestamps normalize to ISO 8601 ending in `Z`; SQLite stores integer milliseconds. Missing offsets mean UTC. Precision is `day`, `hour`, `minute` or `second`, default `hour`. A date-only record is anchored to UTC midnight and shown without a clock time on the local date containing that anchor. Timed intervals can overlap several hours. Convert local date selection once into a half-open UTC window. DST days retain all 24 clock labels and identify missing/repeated hours.

Connect idempotency is `(connect source, UTC hour)`. Floor the request timestamp to the UTC hour. Upsert keeps record identity and replaces title/content/data. Future timestamps are valid. Import idempotency is `(source, stable external key)`; replaying a file does not duplicate records.

## Architecture

One root Bun package, Vite React SPA with Cloudflare Vite integration. `src/models/` owns shared types, UTC/precision validation, timeline projection and streaming import adapters. `src/services/`, `src/viewmodels/`, `src/views/`, `src/components/` implement MVVM. `worker/` owns HTTP, Access, Connect and D1 SQL; `worker/migrations/` owns schema. Basalt owns chrome and controls; timeline and source content remain application components.

Production: Worker `life`, D1 `life`, dashboard `life.hexly.ai`. `life.worker.hexly.ai` only serves `/api/ingest` and `/api/live`. Disable `workers.dev` and previews. Verify Access issuer/audience from `CLAUDE.md`. Tests use isolated local identity/JWKS, never production credentials.

## API contract

Success bodies: `{ data: T }`, except health. Errors: `{ error: { code: string, message: string } }` and appropriate HTTP status. Personal data and tokens use `Cache-Control: no-store`.

| Method and path | Contract |
| --- | --- |
| `GET /api/live` | Public `{ status: "ok", version, timestamp, database: "ok" }`; database failure returns 503. |
| `GET /api/session` | `{ data: { email: string \| null, subject: string, mode: "access" \| "local" } }` |
| `GET /api/sources` | `{ data: Source[] }`, includes counts and last record time. |
| `GET /api/events?start=ISO&end=ISO&source=ID&cursor=...` | Half-open UTC range; optional source/cursor; `{ data: { events: LifeEvent[], nextCursor: string \| null } }`. Page size 200; client follows cursors. Max window 32 days. Include intervals overlapping the window. |
| `POST /api/imports` | `{ source: ImportSourceId, records: ImportRecord[] }`, 1–100 records/batch; `{ data: { accepted: number } }`. Stable-key upserts. |
| `GET /api/connects` | `{ data: Connect[] }`, metadata only. |
| `POST /api/connects` | `{ name }`; 201 `{ data: { connect: Connect, token: string } }`. Token appears only here. |
| `DELETE /api/connects/:id` | Revoke, retain history; `{ data: Connect }`. Repeated revocation is idempotent. |
| `POST /api/ingest` | Bearer Connect; `{ timestamp, title, content?, data? }`; `{ data: { id, occurredAt, precision: "hour", updatedAt } }`. Cannot read/manage. |

`ImportSourceId`: `apple-health`, `footprint`, `pixiu`, `journal`. All shared types live in `src/models/types.ts`.

Input limits: name 80 chars, title 200, content 8000, per-record JSON data 32 KiB, request body 1 MiB. JSON is data, never HTML. Do not expose tokens or internal exceptions in errors.

## Rewrite coordination

Existing `main` checkout only. Collaborators do not branch, commit, deploy, install packages or format outside their files. Codex integrates and commits.

| Owner | Exclusive files |
| --- | --- |
| Codex | root tooling/config/packages, `src/models/**`, import logic, `tests/unit/models/**`, integration/E2E harness/tests, deployment, CLAUDE/README and this document |
| grok (`w3A:p2`) | `src/services/**`, `src/viewmodels/**`, `src/views/**`, `src/components/**`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `tests/unit/frontend/**`, `docs/09-basalt-ui.md` |
| pi (`w3A:p3`) | `worker/**`, `tests/worker/**`, `docs/10-worker-api.md` |

Coordinate shared-contract changes through Codex. Do not edit old `dashboard/` or `scripts/` while Codex replaces obsolete runtime paths. UI import service consumes `importFile(file, source, onBatch, onProgress, signal?)` from `src/models/import.ts`; batches contain at most 100 ImportRecords. It returns `{ processed, accepted }` and supports cancellation.

Both collaborators handed off their files after their checks. Codex owns the integrated tree and release.

## Delivery checklist

- [x] Read nmem 6DQ, MVVM and current Caddy allocation.
- [x] Establish source, UTC precision, idempotency and endpoint contracts.
- [x] Replace Next.js with root Vite/Worker/Biome configuration.
- [x] Implement D1 schema, Access and write-only Connect.
- [x] Implement imports and UTC/day/hour projection.
- [x] Complete Basalt chrome and daily timeline, imports, Connect UI.
- [x] Enforce four-metric L1 95%+, G1/G2, real L2/L3 and physical isolation.
- [x] Audit, fix findings and document verification.
- [x] Check/provision D1 `life`, migrate and deploy Worker/domain bindings.
- [x] Verify deployed version, health, Access and ingestion-only hostname.

## Verification record

Verified on 2026-09-13:

- L1 aggregate: 261 tests in 21 files passed. Statements 99.08%, branches 96.55%, functions 99.39%, lines 99.13%; all four enforced thresholds exceed 95%.
- L2: 15 scenarios passed against real local Worker + SQLite, covering all 9 method/path API contracts. Includes signed JWT claims, token hashing, future hour replacement, concurrent idempotency, per-token isolation, revoke/history, import validation/atomicity/precision, UTC boundaries, 200-record pagination and machine hostname denial.
- G1: strict typecheck across web, Worker, tooling and tests passed; Biome has zero errors/warnings.
- G2: gitleaks and OSV passed against the complete reviewable tree and all 380 lockfile packages. The only allowlist is the exact public Access audience.
- Build and Wrangler dry run passed. Lazy routes reduce the initial client JavaScript from 713.52 kB to 356.27 kB (125.68 kB gzip); Worker is 66.95 kB. Temporary machine-specific registry URLs were removed without changing package versions or integrity hashes; frozen-lockfile validation passed.
- L3: all 8 scenarios passed: 24 hours, import/replay, UTC/local precision display, Connect creation/write/revoke, error recovery, responsive navigation/theme, anonymous/forged auth, and full/partial DST. Desktop light and mobile dark WCAG 2 A/AA checks passed. Access 302 login redirects are recognized as expired sessions; the browser test verifies a full reload recovers. Screenshots are generated under `test-results/l3/`.
- D1 `life` created in APAC, ID `50a1d276-d24b-4c07-82af-e14683116489`; no previous `life` database or Worker domain binding was found. The initial schema was empty; `0001_initial.sql` applied at `2026-09-13 10:14:17` UTC. No production fixtures or test marker were written.
- Added explicit `dev:prod` for the original request to use production data locally. Normal dev and automated tests remain local; tests have fresh directories, marker validation, ephemeral RSA keys and isolated Wrangler OAuth config paths.

## Production release

Version **1.0.0**, Cloudflare tag `v1.0.0`, active Worker version **`cca8e0c1-96fa-498d-8b77-538cd21fb1d2`**, deployed at `2026-09-13T10:22:12Z` with 100% traffic. Worker `life` owns both custom domains; `workers.dev` and preview URLs remain disabled.

Fourteen production read-only/denial checks passed at approximately `2026-09-13T10:19:55Z`. Both live endpoints were rechecked successfully after final packaging at `2026-09-13T10:22:53Z`:

| Check | Actual result |
| --- | --- |
| `https://life.hexly.ai/api/live` | HTTP 200, JSON `status=ok`, `version=1.0.0`, `database=ok` |
| `https://life.worker.hexly.ai/api/live` | Same healthy JSON over valid HTTPS |
| Dashboard and session API without an Access session | HTTP 302 to `nocoo.cloudflareaccess.com/cdn-cgi/access/login/life.hexly.ai` |
| Session API with a forged Access assertion | Same Access redirect; no records returned |
| Machine host `/`, session/events/connects/imports APIs, logo, GET ingest | HTTP 404 JSON; no SPA, assets or read access |
| Machine POST ingest without a token or with a nonexistent token | HTTP 401 JSON; no write |

The machine hostname's new Google Trust Services certificate finished propagating after initial TLS handshake failures. Its SAN includes `life.worker.hexly.ai`; no DNS, Access or certificate-policy workaround was needed.

Local production-data development is running on `127.0.0.1:7011`, through the existing Caddy mapping at **`https://life.dev.hexly.ai`**. `devprod` establishes a remote D1 binding. Browser checks rendered the 24-hour timeline, import and Connect pages with no JavaScript errors; health/session/sources reads passed. Production data remained empty (0 records / 0 Connects) after migration and read-only verification. Existing import files and ignored local data were preserved.

Release evidence is generated in `test-results/release/http.json` and `test-results/release/dev-production-d1.png`. Production checks verify the Access entrance and denied requests; successful signed sessions and all write/import/revoke flows are exercised against isolated local Worker + SQLite, without production credentials or test data. Interactive login with the owner's identity was not automated.
