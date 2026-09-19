<p align="center"><img src="../assets/brand/icon-rounded.png" width="128" alt="Life.ai logo" /></p>
<h1 align="center">Life.ai</h1>
<p align="center">One person's life chronicle, bringing health, routes, finances and pushed records into each day.</p>
<p align="center"><a href="https://life.hexly.ai">Website</a> · <a href="../README.md">简体中文</a></p>

## What it does

Life.ai is a single-user life log for revisiting health, GPS, finances and diaries through a web timeline. Cloudflare Access protects the entrance; a Worker and D1 hold one shared dataset. Imports and external sources preserve evidence and original time precision.

## Features

- **Daily timeline**: browse 24 hours in the device timezone and filter by date and source. Storage and comparisons use UTC while preserving date, hour, minute and second precision; date-only records appear in an all-day note. Generic offset-free input is UTC; Pixiu dates represent UTC+8 accounting days.
- **Health and location**: overnight sleep belongs to the waking day, with stages and evidence-based location hints. View walking, stairs, heart rate, complete paginated ECGs, blood pressure and workout routes. GPS points form 5 / 10 km regions with hourly maps: the first arrival expands, repeated regions collapse, and a return or date change restores automatic expansion. Points are colored by speed.
- **Weather and diaries**: daily reference locations supply weather and local sunrise/sunset; successful solar calculations are cached permanently in D1. Generate diaries from daily sources or rewrite with feedback. Failures preserve the previous text; changed data prompts an update. Workers AI is the default, with other models configurable.
- **On-demand records**: timeline, location, finance and other tabs share date/source filters. Raw tables show up to 50 rows per page; health dimensions, routes and ECG attachments load on demand and remain cached. The side panel groups daily routes, weather, totals, finances and diaries; sidebar identity comes from lizheng.blog.
- **Overview and imports**: compare coverage days, record counts, stored rows, body sizes and monthly charts across sources; the Footprint coverage calendar opens daily maps. Complete parsing and validation precede writes. Included days replace their entire source scope, absent dates survive, and identical reimports neither add copies nor change content timestamps.
- **Personal context**: name circular map areas for timeline, location tables and sleep records, and set habitual sleep hours with a timezone. Diaries convert observations into that timezone before comparison, leave missing evidence blank and offer a rewrite after settings change.
- **External sources**: Connect receives pushed snapshots, Gecko supplies computer activity and Firefly supplies public articles. GitHub retrieves daily commits and PR actions. PATs are encrypted and never displayed after saving; complete results, including empty days, are permanently cached by account/date/timezone. Commit coverage is limited to default branches indexed by GitHub search.

## Usage

Open [life.hexly.ai](https://life.hexly.ai) through Cloudflare Access. Every authorized identity accesses the same person's dataset.

Choose a source under Data Management:

| Source | Input and storage |
| --- | --- |
| Footprint | Complete GPX; all points are compacted by UTC day, replacing each included day |
| Apple Health | Complete export ZIP or extracted directory; lossless UTC day × dimension storage preserves original attributes, nested metadata, observations from multiple devices, workout GPX, ECG CSV and CDA; all dimensions of an included day are replaced together |
| Pixiu | One or more original CSV files; all nine columns, duplicates, zero amounts and multiple currencies survive; replacement uses UTC+8 accounting days, with expenses/income separated from transfers/repayments |

Settings groups general preferences, AI, Connect and diary import. Diaries accept JSON / NDJSON; ordinary JSON is limited to 10 MiB. Cancelling keeps completed batches.

Use the shared CLI or the `life-data-import` skill locally. Below, `--dry-run` validates only, while `--target production` writes production data:

```sh
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json
bun run data:import --provider apple-health --file /path/to/export.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json
bun run data:import --provider pixiu --file /path/to/pixiu --dry-run --json
bun run data:import --provider pixiu --file /path/to/pixiu --target production --json
```

The production main domain uses `cloudflared` for the current user's Access credentials. With `dev:prod`, append `--base-url https://life.dev.hexly.ai` but still select `production`; the CLI checks the actual binding.

Create a named, write-only token in Connect; plaintext is shown once. Send Bearer-authenticated requests to `https://life.worker.hexly.ai/api/ingest`. A token can replace only its own content for a UTC hour, including future hours. Revocation retains historical data. Public `GET /api/live` returns version and database status.

## Development

Requires Bun 1.4 and Node.js 22.20.x, 24.x or 26+; Node 23 / 25 are unsupported by the current test tools.

```sh
bun install --frozen-lockfile
bun run prepare
bun run db:migrate
bun dev
```

```sh
bun run typecheck
bun run lint
bun run build
```

Open https://life.dev.hexly.ai through Caddy at `127.0.0.1:7011`. The default uses local SQLite without Google OAuth. `bun run dev:prod` uses the same address with production D1, requires Wrangler authentication, and writes production data through imports and Connect. Preserve the existing `AI_SETTINGS_KEY` and local configuration; keep credentials, databases and private exports out of Git.

## Tests

```sh
bun run test:coverage
bun run test:l2
bunx playwright install chromium
bun run test:l3
```

Vitest runs unit tests. HTTP and browser tests use ports 17011 / 27011 with fresh SQLite, caches and test keys per run. Real Access, model and source credentials are unnecessary.

## Stack

| Technology | Role |
| --- | --- |
| React · Vite · Basalt | Web interface |
| TypeScript · Bun · Biome | Types, scripts and static checks |
| Cloudflare Workers · D1 | API, Access validation and storage |
| Workers AI · AI SDK | Diary generation and model integration |
| Leaflet · Recharts | Maps and statistics |
| Vitest · Playwright | Unit, HTTP and browser tests |

`src/models/`, `src/services/` and `src/viewmodels/` own domain logic, HTTP and state. Views render and dispatch actions; `worker/` owns the API and database.

## Documentation

- [Documentation index](README.md)
- [Architecture and rollout](08-chronicle-rewrite.md)
- [Daily view and AI](12-daily-view.md)
- [Data management and Footprint](15-data-management.md)
- [Timeline and record tabs](16-daily-context-and-record-tabs.md)
- [Apple Health](17-apple-health.md)
- [Pixiu imports](22-pixiu-daily-import.md)
- [General settings](24-general-settings.md)
- [Daily GitHub activity](27-github.md)
- [Domain contracts and operations](30-domain-contracts.md)

## License

[MIT](../LICENSE) © 2026 Zheng Li
