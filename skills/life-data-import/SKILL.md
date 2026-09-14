---
name: life-data-import
description: Import Footprint GPX exports into Life.ai from the local machine, or validate an export without writing. Uses the same UTC day codec and idempotent API as the dashboard.
metadata:
  short-description: Import and verify Life GPS data
---

# Life data import

Run from the Life repository, currently `/Users/nocoo/workspace/personal/life.ai`.
Use `bun run data:import`; do not recreate the parser or issue direct SQL inserts.
The implementation and API contract are documented in `docs/15-data-management.md`.

```sh
# Parse the complete file and report counts, range and bytes without writes.
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json

# Import directly into production through the owner's Cloudflare Access identity.
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json

# Import through an already running local dev:prod service, bound to production D1.
bun run data:import --provider footprint --file /path/to/track.gpx --target production --base-url http://127.0.0.1:7011 --json

# Import into a local database served by bun run dev.
bun run data:import --provider footprint --file /path/to/track.gpx --target local --json
```

Choose the target from the user's request and existing authorization. `dev:prod` uses
production D1 even though its URL is local. The CLI checks `/api/data/target` before
any write and refuses a mismatch. Caddy exposes the same local service at
`https://life.dev.hexly.ai`. A Connect token cannot import or read data.

Each UTC date present in the file replaces that date's **entire** previous package;
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
