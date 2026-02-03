# Scripts

## Directory structure

```
scripts/
  import/
    applehealth/
    footprint/
    pixiu/
  verify/
```

## Import scripts

### footprint

- `scripts/import/footprint/init.ts`: Initialize the footprint database using the schema.
- `scripts/import/footprint/schema.sql`: Database schema for footprint track data.
- `scripts/import/footprint/db.ts`: Database helpers and defaults.
- `scripts/import/footprint/load-gpx.ts`: Parse a GPX file and insert track points for a given year.
- `scripts/import/footprint/aggregate.ts`: Aggregate track points into day/week/month/year tables.
- `scripts/import/footprint/cli.ts`: CLI wrapper for load/aggregate/refresh with year filtering.
- `scripts/import/footprint/refresh.ts`: Run init + refresh in one command with year filtering.
- `scripts/import/footprint/explore-gpx.ts`: Inspect GPX file structure and summary.


### applehealth

- (empty) Placeholder for Apple Health import scripts.

### pixiu

- (empty) Placeholder for Pixiu import scripts.

## Verify scripts

Place scripts here that verify source files match imported DB data.

### footprint verify

```bash
bun run scripts/verify/footprint.ts 2024 data/footprint/20260202.gpx
```

## Tests

- Tests live under `scripts/test`.
- Run unit tests with coverage: `bun run ut`.

## Import usage

Footprint example:

```bash
bun run scripts/import/footprint/init.ts
bun run scripts/import/footprint/cli.ts load 2025 data/footprint/20260202.gpx
bun run scripts/import/footprint/cli.ts agg
```

Refresh example (init + load + aggregate):

```bash
bun run scripts/import/footprint/refresh.ts 2025 data/footprint/20260202.gpx
```
