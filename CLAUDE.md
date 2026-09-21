# Life.ai

A single person's life chronicle combining imported health, GPS, finance and write-only Connect snapshots.
Profile: ts-worker-web.
Direction: [chronicle architecture](docs/08-chronicle-rewrite.md), [domain contracts](docs/30-domain-contracts.md).

## Sources of Truth

This handbook is the contract; hooks, CI and config enforce it. Raise weaker enforcement rather than reducing requirements. Frameworks must not rewrite it.

| Fact | Where |
| --- | --- |
| Human docs | [README.md](README.md), [docs/README.md](docs/README.md) |
| Detailed invariants | [domain/source/UI map](docs/30-domain-contracts.md); read the affected source contract before editing |
| Version | Root `package.json`; same version in sidebar and `/api/live` |
| Enforcement | `.husky/`, CI, `vitest.config.ts`, `scripts/run-tests.ts` |
| Environment | Ignored `.env*`/`.dev.vars*`; preserve `AI_SETTINGS_KEY` and existing `.dev.vars.devprod` |
| Accidents | [Retrospective.md](Retrospective.md) |

## Project Invariants

- One owner/dataset: Access authenticates the entrance, never partitions records by subject/email. Verify JWT signature, issuer, audience and expiry; ingest host exposes only ingestion and `/api/live`.
- UTC storage/comparison and original precision are mandatory. Pixiu date-only values are UTC+8 accounting days; Footprint/Health day replacement and all source-preservation/hash/idempotence rules remain in [domain contracts](docs/30-domain-contracts.md).
- Parse complete imports before writes; included days replace their whole source scope, absent dates survive. Never invent times, merge currencies, discard duplicates/raw observations, or commit private exports/coordinates/tokens/backups.
- CLI and Web share codecs/clients; explicit import `--target` must match `/api/data/target`. `dev:prod` remains production even through localhost/Caddy. Old provider writes through `/api/imports` return 410.
- Connect tokens are write-only, revocable, hashed at rest and shown once; each can replace only its own UTC hour, including future hours. Preserve host separation.
- Preserve the 24-hour timeline, lazy active record tabs, precise sleep/GPS/day semantics, named-circle/settings rules and stable sidebar identity. Use published Basalt and MVVM; full UI and caching rules are in the linked contract.
- Keep last successful diaries on failure/stale input; new structured output validates against sources before replacing saved content. AI keys are encrypted; `AI_SETTINGS_KEY` cannot rotate without re-encryption. External sources/cache invalidation never change imported records or manufacture evidence.

## Stack / Layout

| Component | Choice |
| --- | --- |
| Runtime | One Vite/React SPA + Cloudflare Worker; D1 `life` |
| Tooling | Bun 1.4.0, Node 22.20.x/24.x/26+, strict TypeScript, Biome |
| Model/state | `src/models/`, `src/services/`, `src/viewmodels/`; Views only render/dispatch |
| API/tests | `worker/`, `worker/migrations/`, `tests/unit/`, `tests/worker/`, `tests/http/`, `tests/browser/` |

The current runtime has no Next.js, Google OAuth or local SQLite production server. Node 23/25 are unsupported by the current Vitest toolchain.

## Commands

Run from root. Lifecycle hooks are installed explicitly by `prepare` under the repository install policy.

```sh
bun install --frozen-lockfile
bun run prepare
bun run db:migrate
bun dev
bun run typecheck
bun run lint
bun run build
bun run test:coverage
bun run test:l2
bunx playwright install chromium
bun run test:l3
bun run gate:security
bun run quality
```

Normal local tests need no real Access, model or source credentials: the harness creates signing/encryption keys, a loopback AI fixture and public-context fixtures. G2 requires OSV and gitleaks. `data:import`/`diary:eval` and `dev:prod` are operational tools; verify their targets and authorization before running them.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1. Status: `enforced`, `planned`, `manual`, `N/A`. No `.skip`/`.only`; L1 statements/branches/functions/lines each ≥95%.

| Piece | Requirement and current reality | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Four metrics ≥95% for models/services/ViewModels/Worker | enforced | Vitest config, pre-commit and quality CI |
| L2 | Real HTTP + SQLite for every endpoint/method | planned | Push hook/CI run `tests/http/api.ts`; complete endpoint/method inventory proof remains required |
| L3 | Import, timeline, Connect, responsive/auth journeys | enforced | CI l3 → Playwright guarded by LIFE_TEST_URL/state |
| G1 | Four type configurations and zero-warning/error Biome | enforced | `typecheck`/`lint`, pre-commit/CI |
| G2 | OSV and gitleaks, missing binary fails | enforced | `scripts/security.ts`, pre-push and dedicated CI |
| D1 | Fresh SQLite/cache, credentials stripped, local guards and marker | enforced | `run-tests.ts`, `local-db.ts`, `verify-test-bindings.ts` |
| Build | Vite bundle | enforced | Quality CI and `quality` |
| Docs | Provider/diary/UI evidence preserved | manual | [domain contracts](docs/30-domain-contracts.md) |

Current pre-commit runs L1/G1 against a temporary Git index snapshot (coverage, typecheck, then lint). pre-push runs L2/G2 on the working tree, and the security snapshot includes the reviewable working tree. Required follow-up: stdin pushed-ref checks <3min. Hooks must remain check-only; never bypass commit or branch-push checks.

## Resources / Isolation

| Purpose | Ports / resource | Isolation |
| --- | --- | --- |
| Dev | `https://life.dev.hexly.ai` → Caddy → 7011 | `.wrangler/state`; one integrated Vite Worker |
| Production-data dev | `bun run dev:prod`, same host/7011 | Remote production D1; keep existing server/key intact |
| L2 / L3 | 17011 / 27011 | Per-run `.wrangler/tests/l2-*` / `l3-*` SQLite/cache |
| Production / ingest | `life.hexly.ai` / `life.worker.hexly.ai` | D1 `life`, Access team `nocoo`; exact audience in Wrangler |

Optional sidecar 37011 is reserved, not needed by Vite. Keep Caddy and workflow mirror aligned. Tests reject remote bindings and use `_test_marker(env=test)` before migrations/cleanup, fresh XDG directories and loopback fixtures; no Workers AI binding because it runs remotely. Never create remote `-test` resources or touch production/daily-dev data in tests.

## Operations / Release

Authorized deployment uses `bun run deploy`: inspect migrations, build/dry-run, migrate before dependent code, then verify Access, public health/version and ingest-host isolation. Detailed historical releases are in [domain contracts](docs/30-domain-contracts.md). Documentation normalization does not run a deployment, import or diary regeneration.

## Retrospective

Store accident narratives in [Retrospective.md](Retrospective.md); recurring rules stay brief here, cross-project lessons in global rules/nmem, deterministic safeguards in tests/hooks.

- Preserve source content/timestamps on identical import replay and preserve saved diaries when any enabled source is unavailable.
