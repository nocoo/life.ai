---
name: life-data-import
description: Import Footprint GPX, complete Apple Health ZIP/directory exports, or Pixiu accounting CSV files/directories into Life.ai from the local machine, or validate without writes. Shares the dashboard codec and idempotent API.
metadata:
  short-description: Import and verify Life GPS, health and accounting data
---

# Life data import

Run from the Life repository, currently `/Users/nocoo/workspace/personal/life.ai`.
Use `bun run data:import`; do not recreate the parser or issue direct SQL inserts.
The implementation and API contracts are in `docs/15-data-management.md` (GPS), `docs/17-apple-health.md` (health), and `docs/22-pixiu-daily-import.md` (Pixiu).

```sh
# Pixiu: all original nine-column CSV fields, one complete UTC+8 accounting day per row.
bun run data:import --provider pixiu --file /path/to/貔貅记账 --dry-run --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --target production --json

# Apple Health: preserve the main XML records, nested metadata, ECG, routes and CDA.
bun run data:import --provider apple-health --file /path/to/导出.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json

# Parse the complete file and report counts, range and bytes without writes.
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json

# Import directly into production through the owner's Cloudflare Access identity.
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json

# Import through an already running local dev:prod service, bound to production D1.
bun run data:import --provider footprint --file /path/to/track.gpx --target production --base-url https://life.dev.hexly.ai --json

# Import into a local database served by bun run dev.
bun run data:import --provider footprint --file /path/to/track.gpx --target local --json
```

Choose the target from the user's request and existing authorization. `dev:prod` uses
production D1 even though its URL is local. The CLI checks `/api/data/target` before
any write and refuses a mismatch. Caddy exposes the same local service at
`https://life.dev.hexly.ai`. A Connect token cannot import or read data.

Each source day present in the file (UTC for GPS/Health; fixed UTC+8 for Pixiu) replaces that date's **entire** previous package;
dates absent from the file remain untouched. This includes replacing a previous full
day with a newer partial day. Read the complete file before submitting: exports may
return to an earlier date. Identical current contents preserve counts, hashes and
content timestamps. There is no whole-file transaction; interrupted imports retain
committed batches. Rerun the complete input to finish safely, including A → B → A.
If another import holds the provider lease, allow it to finish or expire rather than
changing the database to force a takeover.

Direct production imports use `cloudflared access token -app=https://life.hexly.ai`
internally. If needed, install `cloudflared` and run
`cloudflared access login https://life.hexly.ai`. Send the token only in the
`cf-access-token` header; never print it or place it in URLs or command arguments.
The authenticated dashboard also supports web uploads through the same core and API.

After importing, compare the receipt's committed days/points with the dry run and
check Data Management → 数据概览. For a full backup verification, compare per-day
counts, hashes and all original point fields via the protected day-read API; a global
row count alone does not prove completeness. Distinguish payload bytes from physical
D1 size. Keep raw coordinates, source exports, tokens and backups out of the repository.

Apple Health accepts the complete ZIP or extracted directory, not the main XML alone.
It stores one UTC start day × dimension series, splitting only to meet bounded row sizes.
Every included day replaces **all** of that day's dimensions; removed dimensions do not
survive from an older import. Original attributes, nested nodes and coincident samples
remain; routes, ECG, CDA and export metadata have verified, losslessly compressed parts.
Health coverage charts omit sleep-goal settings and Unix-epoch-day measurements,
while preserving their original dates and values in storage and raw reads. The
overview explicitly identifies measurements originally dated 1970-01-01.

For health completeness, compare the committed count to the dry run, then verify every
series and attachment. `scripts/verify-health-import.ts` reads a local SQLite snapshot;
see its usage and `docs/17-apple-health.md` for before/after and unchanged-replay checks.
Production D1 export is an administrative snapshot that can briefly pause reads; keep
its SQL, SQLite copy, signed download links and verification reports outside Git.

Pixiu dates are confirmed UTC+8 accounting dates with day precision. Preserve all nine
original strings, duplicate multiplicities and zero amounts; never combine currencies
or treat transfers/repayments/investments as consumption. One complete source day replaces
one daily JSON row. Conflicting snapshots for the same date in one file selection are
rejected; import them separately in the requested replacement order. Dates absent from
the input remain. Verify full fields and amounts using `scripts/verify-pixiu-import.ts`
against a local production snapshot; compare before/after provider fingerprints and
unchanged-replay timestamps. See `docs/22-pixiu-daily-import.md`.
