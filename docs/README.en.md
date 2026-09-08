<p align="center">
  <img src="../assets/brand/icon-rounded.png" alt="Life.ai" width="128" height="128" />
</p>

<h1 align="center">Life.ai</h1>

<p align="center">View health records, location history, and spending along one timeline.</p>

<p align="center"><a href="../README.md">简体中文</a></p>

## What it does

Life.ai converts exports from Apple Health, footprint, and Pixiu bookkeeping into local SQLite databases. Its web dashboard presents health metrics, routes, and finances by day, month, and year, helping you compare activity, places, and spending over the same period.

Data comes from manually imported files; the app does not automatically connect to health or bookkeeping accounts. The dashboard reads one shared set of databases on its host. Login restricts access, but does not create separate datasets for each user.

## Features

- Import Apple Health XML, ECG CSV, and workout-route GPX, including health records, workouts, and activity summaries.
- Import footprint GPX and produce daily, weekly, monthly, and yearly route aggregates.
- Import Pixiu CSV and aggregate income and expenses by day, month, and year.
- Combine health, activity, routes, and transactions in the day view; inspect trends, distributions, and calendar heatmaps in month and year views.
- View locations with Leaflet / Carto or Google Maps, inspect raw records, and check storage statistics.
- Sign in with Google and switch map providers and interface themes.

## Usage

Deploy the application and import your files as described below. After signing in, select a date or switch to a month or year view. The repository contains no personal source files or databases.

Importers read files by format and year. Annual footprint and Pixiu refreshes replace that year's records. Apple Health also clears the selected year, or all corresponding data when no year is given. Keep the original exports before importing again; see the [data documentation](00-overview.md).

## Development

Requires Bun and Node.js ≥ 22; `.node-version` selects Node 22. Install root and dashboard dependencies separately:

```bash
git clone https://github.com/nocoo/life.ai.git
cd life.ai
bun install --frozen-lockfile
bun install --cwd dashboard --frozen-lockfile
mkdir -p db
bun run db:init
bun run scripts/import/applehealth/init.ts
bun run scripts/import/pixiu/init.ts
```

Configure `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `ALLOWED_EMAILS` in `dashboard/.env.local`. The local Google OAuth callback is `http://localhost:7011/api/auth/callback/google`. `ALLOWED_EMAILS` is a comma-separated allowlist; when empty, any account that completes Google sign-in can access the same dataset.

Optional `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` enables Google Maps; the default Carto map does not require it. Databases default to the root `db/` directory. Set `APPLEHEALTH_DB_PATH`, `FOOTPRINT_DB_PATH`, and `PIXIU_DB_PATH` to use other absolute paths.

Replace the example year and file paths with your exports:

```bash
bun run db:refresh 2025 /path/to/footprint.gpx
bun run scripts/import/applehealth/cli.ts load 2025 /path/to/export.xml
bun run scripts/import/pixiu/refresh.ts 2025 /path/to/pixiu.csv
bun run dev
```

The dashboard is available at `http://localhost:7011`. See the [script guide](04-scripts.md) for ECG, workout-route, and import-verification commands. Run data scripts from the repository root and dashboard scripts from `dashboard/`; database paths depend on this directory relationship.

```bash
bun run lint
bun run typecheck
bun run --cwd dashboard build
bun run --cwd dashboard start
```

The Dashboard uses `better-sqlite3` under Node.js. After installation, check an in-memory database from the repository root; a result of `1` confirms that the driver loads:

```bash
node -e 'const db = new (require("./dashboard/node_modules/better-sqlite3"))(":memory:"); console.log(db.prepare("SELECT 1").pluck().get()); db.close()'
```

The locked package includes native binaries for common platforms and needs no automatic installation script. If this check fails, use the [local development guide](07-development.md#english) to identify the missing module and build this dependency only when necessary.

## Tests

| Test layer | Run from the repository root |
| --- | --- |
| Import and verification script unit tests | `bun --bun vitest run` |
| Dashboard unit and component tests | `bun run --cwd dashboard ut` |
| Dashboard API integration tests | `bun run test:l2` |
| Browser smoke test | `bun run test:e2e:bdd` |

Script tests use Bun SQLite and isolated fixtures. API tests use mocked dependencies and need no personal database. Before browser tests, run `bunx playwright install chromium` inside `dashboard/`. Tests start a server on port `27011` and check the login page without a real Google sign-in.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?logo=leaflet&logoColor=white)

| Area | Implementation |
| --- | --- |
| Data processing | TypeScript, Bun, SQLite |
| Dashboard | Next.js, React, Tailwind CSS, Zustand, Recharts |
| Maps and authentication | Leaflet / Carto, Google Maps, Auth.js / Google OAuth |
| Database drivers and testing | bun:sqlite, better-sqlite3, Vitest, Testing Library, Playwright |

## Documentation

- [Overview and data structures](00-overview.md)
- [Import and verification scripts](04-scripts.md)
- [Apple Health format](01-data-structure-apple-health.md)
- [footprint format](02-data-structure-footprint.md)
- [Pixiu format](03-data-structure-pixiu.md)
- [Brand assets](../assets/brand/README.md)

## License

[MIT](../LICENSE) © 2026 Zheng Li
