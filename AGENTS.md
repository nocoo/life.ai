# Life.ai

Single-owner life chronicle (Vite/React SPA + Cloudflare Worker + D1 `life`, `ts-worker-web`) combining imported health, GPS, finance, and write-only Connect snapshots.
Docs: [README.md](README.md) · [Docs](docs/README.md) · [Architecture](docs/08-chronicle-rewrite.md) · [Domain Contracts](docs/30-domain-contracts.md) · [Dev & Deploy](docs/07-development.md) · [Quality](docs/11-quality.md) · [Retrospective](Retrospective.md)

## Commands

Run from root with Bun 1.4.0, Node 26.x LTS (`.node-version`), strict TypeScript, Biome; no Next.js, Google OAuth, or local SQLite prod server. Local secrets live in ignored `.env*`/`.dev.vars*`.

```sh
bun install --frozen-lockfile
bun run prepare # install .husky/ hooks (verify core.hooksPath)
bun run db:migrate # local D1 migrations (.wrangler/state)
bun dev # https://life.dev.hexly.ai -> Caddy -> 127.0.0.1:7011
bun run typecheck # S1: cf-typegen + 4 strict tsconfigs
bun run lint # S2: Biome check-only, 0 warnings
bun run test:coverage # L1: Vitest v8 >=80% (4 metrics)
bun run test:l1 # L1: local pre-commit rejection proof
bun run build # B1: Vite SPA + Worker bundle
bun run test:l2 # L3: Worker HTTP + isolated SQLite
bunx playwright install chromium
bun run test:l3 # L4: Playwright E2E
bun run gate:security # G1/G2: gitleaks + OSV
bun run quality # full local suite
```

Tests need no real credentials (ephemeral RSA/encryption keys + loopback AI/context fixtures); `gate:security` needs `gitleaks` and `osv-scanner`. `data:import`, `diary:eval`, `dev:prod`, and `deploy` are operational—verify targets and authorization first; doc edits never run them.

## Invariants

- **Owner & Access**: Single owner/dataset; Access gates entry, never partitions by subject/email. Verify JWT signature, issuer, audience, expiry; `life.worker.hexly.ai` serves only ingest and `/api/live`.
- **Connect**: Write-only, revocable, hashed at rest, shown once; each token replaces only its own UTC hour (including future hours). Preserve app/ingest host separation.
- **Time & contracts**: Store/compare UTC instants at original precision; Pixiu date-only rows are UTC+8 accounting days. Read affected rules in [domain contracts](docs/30-domain-contracts.md) first.
- **Imports**: Parse complete imports before writes; included days replace their source scope, absent dates survive, identical replays preserve content/timestamps. Legacy `/api/imports` writes return 410.
- **Fidelity & privacy**: Never invent times, merge currencies, discard duplicates/raw observations, or commit private exports, coordinates, tokens, or backups.
- **CLI/Web & targets**: CLI and Web share codecs/clients; `--target` must match `/api/data/target`. `bun run dev:prod` always targets prod even via localhost/Caddy.
- **Architecture**: MVVM (`src/{models,services,viewmodels}/`, Views only render/dispatch; `worker/`, `worker/migrations/`, `tests/`) on `@nocoo/basalt`. Sync `package.json`, sidebar, and `/api/live` versions.
- **Daily UI**: Preserve 24h timeline, lazy record tabs, sleep/GPS/day semantics, named-circle/settings rules, and stable sidebar identity ([domain contracts](docs/30-domain-contracts.md)).
- **Diaries**: Keep last successful diaries on failure, stale input, or unavailable enabled sources; validate structured output against sources first. External sources/caches never mutate imports or invent evidence.
- **Secrets**: AI keys are encrypted; `AI_SETTINGS_KEY` cannot rotate without re-encryption. Preserve `AI_SETTINGS_KEY` and existing `.dev.vars.devprod`.
- **Release**: Authorized deploys run `bun run deploy` (inspect migrations, build/dry-run, migrate before code, verify Access, `/api/live`, and ingest-host isolation; [Dev & Deploy](docs/07-development.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slots and pinned `base-ci` live in `.github/workflows/quality-slots.yml` (`quality / Z1: Gate` required on `main`). Statuses: `enforced`, `planned`, `manual`, `N/A`. Raise weak enforcement; never weaken requirements.

- **L1 & static**: >=80% statements/branches/functions/lines on `src/{models,services,viewmodels}/` and `worker/` (Views excluded), `allowOnly: false` (no `.skip`/`.only`), 4 strict tsconfigs, 0-warning check-only Biome.
- **Gaps & N/A**: `L2 Runtime` is `N/A` (covered by `L3`/`L4`); `P1 Package` is `enforced` (`wrangler deploy --dry-run` against the `B1` artifact); `L3 Integration` (`test:l2`) is `enforced` while full endpoint/method proof is `planned`; `L4 E2E` runs a single Desktop Chromium core smoke suite via `setup-playwright`; `Z1` uses `nocoo/base-ci` `z1-gate` (`v2026.20`); doc evidence is `manual`.
- **Pre-commit**: Installed via `bun run prepare` (`.husky/`); check-only, never bypassed. Runs `node scripts/run-unit-coverage.mjs` → `verify-coverage-summary.mjs` → `typecheck` → `lint` on `checkout-index`.
- **Pre-push & proof**: `.husky/pre-push` runs `test:l2` + `gate:security` on worktree (stdin pushed-ref `<3min` `planned`). Replay rejection probes via `bun run test:l1`; evidence in [Quality](docs/11-quality.md).

## Resources & Isolation

| Lane          | Endpoint / State                                    | Boundary                                             |
| ------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Dev           | `life.dev.hexly.ai` → `:7011`, `.wrangler/state`    | Integrated Vite Worker (`37011` unused); align Caddy |
| Prod-data dev | `dev:prod`, same host/`:7011`, remote D1 `life`     | Prod D1; preserve server, key & `.dev.vars.devprod`  |
| L3 / L4 tests | `127.0.0.1:17011`/`27011`, `.wrangler/tests/*`      | Fresh SQLite/cache/XDG & loopback fixtures           |
| Prod / Ingest | `life.hexly.ai` / `life.worker.hexly.ai`, D1 `life` | Access `nocoo` (`wrangler.jsonc`); read-only         |

Tests reject remote bindings and Workers AI, require `_test_marker(env=test)` before migrations/cleanup, and never create remote `-test` resources or touch prod/daily-dev data.

## Retrospective

Record incidents in [Retrospective.md](Retrospective.md); promote recurring constraints to `Invariants` and deterministic guards to tests/hooks.
