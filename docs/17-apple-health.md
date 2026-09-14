# Apple Health: complete imports and daily stories

Version 1.5.0 on `main`. The complete production import and unchanged replay have both passed independent snapshot verification. Release checks are recorded below.

## Source analysis

The 2026-09-14 export is a 60,212,536-byte ZIP containing an 850,057,473-byte main HealthData XML, a 516,462,443-byte CDA representation, 151 workout GPX files and 5 ECG CSV files. The extracted directory is 1,498,404,645 bytes. The main XML filename is localized; recognition uses its `HealthData` root.

| Original content | Count | Preservation |
| --- | ---: | --- |
| Top-level `Record` | 1,839,360 | 45 original types, all attribute values and nested children |
| `Workout` | 787 | Original statistics, events, metadata and route references |
| `ActivitySummary` | 1,090 | Original day precision, quantities and units |
| `Correlation` | 60 | Parent plus all 120 child Records |
| ECG recordings | 5 | Metadata events plus all 76,800 CSV voltage samples |
| **Total timeline facts** | **1,841,302** | Nested values and attachment points are not counted as extra top-level facts |
| Workout routes | 151 | All 583,323 GPS points and original GPX bytes |

The main XML contains 1,489,040 nested metadata entries, including 1,481,504 directly under Records; 2,422 WorkoutStatistics; 10,723 WorkoutEvents; 8,702 HRV lists containing 460,398 instantaneous beats; and 151 workout route references. All remain with their parents. Coincident measurements and different device sources are retained separately.

There are 1,413 UTC storage dates and 49 dimensions. Four body measurements carry original timestamps on 1970-01-01; these remain unchanged in storage and raw reads, with an explicit overview note. Unix epoch day and sleep-goal settings do not count toward measured coverage or monthly charts, leaving 1,412 measured dates. The sleep-goal setting itself is dated in 2023, distinct from the four epoch-dated measurements. The main XML's substantive nodes, attribute strings and child order are preserved canonically; formatting-only whitespace is omitted. Original GPX, ECG and CDA files are preserved byte-for-byte. The malformed CDA XML is retained as an attachment, without treating its repeated data as another measurement source. Export root attributes, metadata and `Me` remain in a separate metadata attachment.

## Compact D1 storage and cost

Each **UTC start day × dimension** becomes one lossless gzip/base64 JSON series. Splitting is deterministic and only necessary beyond 512 KiB encoded or 8 MiB decoded. The actual export needs no series splitting: the largest encoded series is 94,708 bytes and the largest decoded series is 3,381,759 bytes. The largest complete day request is 232,561 bytes, below the 4 MiB application limit. This keeps small dimensions cheap while letting the timeline request useful dimensions without reading every raw health metric.

| Content table | Verified production rows |
| --- | ---: |
| `provider_days` daily descriptors | 1,413 |
| `health_series` day/dimension series | 29,100 |
| `health_files` original-file/metadata manifests | 158 |
| `health_file_parts` lossless attachment parts | 1,328 |
| **Total content rows** | **31,999** |

The prepared series and attachment bodies total 97,297,212 bytes (92.79 MiB), before daily descriptors, file manifests and physical SQLite overhead. The complete Health provider payload, including descriptors and manifests, is 104,726,161 bytes. File parts use 512 KiB original-byte slices, each independently compressed and hashed. The CDA alone compresses from 516,462,443 bytes to 13,010,620 encoded bytes, so retaining it is inexpensive compared with retaining another set of measurement rows. The complete content uses about 98.3% fewer rows than one row per top-level fact, while also preserving attachments.

Cloudflare's [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/) were checked on 2026-09-14. Paid includes 25 billion rows read and 50 million rows written per month plus 5 GB storage; excess costs are $0.001/million reads, $1/million writes and $0.75/GB-month. Paid databases have a 10 GB per-database cap; Free has 500 MB per database, 100,000 daily writes and 5 million daily reads. Maximum row size is 2 MB, with 100 KB SQL and 100 bound parameters per query.

**Content rows are not billed write counts.** Index maintenance, aggregate triggers, import receipts and lease updates also write rows. Unchanged reimports avoid rewriting content but still renew leases and update receipts. Exact billing depends on D1's metered operations and account-wide included usage; it cannot be inferred from 31,999 content rows. Daily rendering reads indexed day/dimension ranges; attachment parts and raw dimensions load on demand.

After complete import and unchanged replay, `wrangler d1 info life` reports **155,381,760 bytes (148.18 MiB)** for the entire production database, including existing Footprint, indexes, receipts and caches. The previous release was 29,437,952 bytes. If this entire database were billed beyond the account's included storage, its conditional storage cost would be about **$0.117/month**; remaining account-wide quota was not inspected. The prepared compressed payload, provider payload and actual database size are distinct measurements.

## Import and replacement contract

The new `/data/apple-health` page uses Basalt PageHeader, cards, FileDropzone, UploadQueue, status and progress components. It accepts a complete ZIP or extracted directory. Preview shows this input's counts; cumulative coverage, dimensions, rows, bytes and attachment statistics belong to `/data`. The old generic Health import entry is removed; `/api/imports` returns `410 health_import_moved` for Apple Health.

- Web Worker + IndexedDB and CLI temporary disk share `src/models/apple-health.ts`, the archive reader and `src/services/health-client.ts`. The Skill calls the same CLI. Full parsing, ZIP CRC validation and referenced-file validation finish before any database write.
- Every original attribute, nested node, source, unit and timestamp string is retained. Hashes use canonical decoded content, so compression differences between browsers and CLI do not create false changes.
- `--target` must match `/api/data/target` before writes. The authorized local `dev:prod` service is still a production writer, even through Caddy/loopback. Main-domain CLI requests use the owner's Cloudflare Access credentials.
- A five-minute provider lease coordinates attachment uploads and day batches. Upload immutable parts first; switch each file manifest only when every verified part exists. Commit days only after all declared files exist.
- A later input replaces **all dimensions of every included UTC day**, including dimensions missing from that day in the new input. Dates absent from the input remain. Day descriptors, series and provider totals change atomically with an ownership/expiry/batch-order guard.
- Compare against current hashes, preserving A → B → A. Exact replay retains content timestamps and revision. Import receipt/channel/time can change independently of content.
- Cancellation or failure can leave previously committed files/days. Rerun the complete input: unchanged attachments are skipped, and unchanged days acknowledged without content writes. Unreferenced file parts are collected after finishing/cancelling.
- The ingestion hostname exposes neither Health imports nor reads. Raw files, coordinates, medical values, Access tokens and backups stay outside Git.

```sh
bun run data:import --provider apple-health --file /path/to/导出.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json
```

For an already authorized production-bound local server, append `--base-url http://127.0.0.1:7011`. See [04 Scripts](04-scripts.md) and the local `life-data-import` Skill for both providers. A standalone XML file is insufficient because it omits attachments.

## Reading a day

Store and compare UTC; an absent offset also means UTC. Presentation uses the viewer's current timezone and preserves day/hour/minute/second precision. Day-only facts remain in the metadata column. The timeline requests useful Health dimensions plus the previous 24 hours and following 12 hours for sleep, without counting neighboring-day activity in today's totals.

- **Sleep:** place each night at its waking instant. Prefer detailed wearable stages when sources overlap; distinguish actual sleep, time in bed and awake time. Show the preceding bedtime, waking time, stage strip and source evidence. A weaker source ending on another day cannot move the selected night's waking day. Tonight's bedtime remains a separate event until waking evidence exists.
- **Sleep location:** combine nearby night Footprint with recurring overnight locations in the preceding month. Show qualified residence/familiar/travel/unknown suggestions and evidence. Sparse or absent GPS does not establish a home or hotel.
- **Movement between GPS changes:** hourly steps, walking distance and climbs fill stationary-looking periods. Overlapping Watch/phone/app quantities use a source/interval preference for presentation, not a destructive deduplication of raw samples.
- **Heart-rate moments:** show measured peaks with contemporary walking or workout context. A peak alone does not establish an emotion, interest or diagnosis. Daily oxygen, respiration, HRV and resting pulse remain in the side column.
- **Workouts:** preserve activity type, timing, distance, energy, heart-rate context, statistics, events and route references. Match duplicated sessions by activity and overlap in their full wall-clock spans. A workout and overlapping Footprint use one map; dedicated workout GPX takes precedence where available.
- **ECG:** a distinct timeline card shows the original recording classification and mean heart rate in bpm. The voltage waveform retains every sample, displayed in five-second pages with time/voltage axes. No downsampling discards data.
- **Blood pressure:** a distinct card pairs systolic and diastolic readings from the same instant/source, preferring Correlation evidence and retaining standalone records. Units stay in mmHg; raw child records remain accessible.

Other occasional observations use Basalt DescriptionList with the useful reading, unit and source. Export timestamps, device internals and nested metadata remain in the complete raw record. Workout statistics use the shared Chinese dimension labels and heart rate uses bpm.

Timeline, location and other-record tabs mount independently. Opening raw records loads all dimensions once and caches the decoded result; tables paginate at 50 rows. ECG/route attachments load separately when needed. Selecting a new day cancels stale requests and resets map expansion. The first map of a stay expands, later unchanged locations collapse; Footprint storage and all existing point data are untouched.

AI evidence includes sleep, workouts, movement, ECG/BP and original readings in the validated local-day window. Stable content ordering ignores virtual IDs and import timestamps, including simultaneous samples whose synthetic indexes change. Existing successful summaries survive a model failure and become stale only when their actual inputs change.

## Independent verification

All private evidence resides under `/tmp/life-health-20260914/`, outside Git. Directory and ZIP preparations produced identical day and file hashes. Parsing took 39.5 seconds / 872 MiB peak Bun RSS for the directory, and about 42 seconds / 1,182 MiB for ZIP on this machine. Chrome 152 through Caddy previewed the complete ZIP in 47.0 seconds with all counts matching, zero API writes and no JavaScript errors. Parsing runs in a Worker with IndexedDB staging; the main thread continued receiving its 50 ms timer, with a measured maximum interval of 531 ms. These are measured local figures, not general performance guarantees.

The full browser export exposed a native argument-spread limit on larger compressed attachments. Base64 conversion now uses 8 KiB chunks independently of the 64 KiB stream reader. A generated, poorly compressible 512 KiB attachment exercises the actual Chrome Worker and isolated upload, with independent Node gzip decoding and byte/SHA-256 equality. Browser and CLI compression sizes can differ; decoded canonical hashes, records and original bytes remain identical.

An independent Python parser compared **every 1,841,297 top-level original XML node** against decoded prepared series and **all 157 original attachments / 648,347,172 bytes** against reconstructed files. No differences were found. All 1,413 day groups and every original attachment part were included; this is stronger than comparing totals alone.

`scripts/verify-health-import.ts` then checks a separately exported production database using `node:sqlite` in read-only/query-only mode. It validates each descriptor, every decoded series and file part, whole-file hashes, all counts, provider totals, absence of legacy records and completed import receipts. A pre-import snapshot fingerprints all Footprint content and timestamps. Comparing a second unchanged import also requires exact Health content, timestamps and provider revision to remain stable. The verifier passed 13 corruption/self-check scenarios plus a complete 31,999-row scratch-reference verification before production use.

```sh
bun scripts/verify-health-import.ts capture /private/path/before.sqlite /private/path/before.json
bun scripts/verify-health-import.ts verify /private/path/after.sqlite /private/path/codec-directory /private/path/after.json --before /private/path/before.json
bun scripts/verify-health-import.ts verify /private/path/reimport.sqlite /private/path/codec-directory /private/path/reimport.json --before /private/path/before.json --previous /private/path/after.json
```

Snapshots are fresh local restores of Wrangler D1 exports. The verifier makes no network requests and cannot write the database; reports contain aggregate counts/hashes, not individual health values. Report files refuse overwrite. Original input and prepared-data comparisons remain separate from database verification so an importer cannot verify only its own mistaken output.

Actual-data Chrome review through `https://life.dev.hexly.ai` confirmed all 49 dimensions, 1,412 measured dates and the unchanged Footprint totals. All five ECG recordings were opened, and all 76,800 plotted samples were counted across their five-second pages. A day with cross-night sleep, paired blood pressure and cycling verified the combined map, delayed raw-dimension request, 50-row pagination and tab cache. At 2,560 px the page has no horizontal overflow; at 390 px actual dark mode passes axe with zero violations. There were no JavaScript errors or API writes.

A second real day with a native workout GPX displayed all 3,445 original route points in one workout map, with every visible map tile loaded. Its sleep card displayed 13 nearby GPS samples; the historical evidence correctly remained insufficient to classify the location as a residence or hotel. This review also checked that occasional observations hide internal fields and workout labels/units are localized. Screenshots and detailed date-level evidence remain private.

## Quality and release evidence

L1 passes 1,113 tests across 62 files, with coverage 99.17% statements / 97.31% branches / 99.20% functions / 99.38% lines. Strict typecheck passes all four projects; Biome has zero errors/warnings. L2 passes 23 real-HTTP scenarios using a fresh isolated Worker/SQLite. The complete L3 suite passes all 20 scenarios, including ZIP and directory selection, unchanged replay, waking-day sleep, ECG waveform/BP cards, native workout route, lazy raw records/cache, actual dark mode and accessibility. G2 runs gitleaks against the reviewable tree and OSV against the root lockfile; both passed. Required commit/push hooks retain these gates.

Production migration `0004_apple_health.sql` was applied after a private pre-import D1 export. The complete first import committed 1,413 days / 1,841,302 facts; a fresh exported database passed the independent 31,999-content-row, every-series and every-attachment verification. A complete second CLI import reused the existing attachments and reported **0 inserted / 0 updated / 1,413 unchanged days**. A third, freshly exported snapshot then passed the full verifier against both the original source reference and the first import: content, timestamps and Health revision remained identical. Footprint's 670,191 points in 1,625 daily rows, 27,719,570 payload bytes, hashes, timestamps and revision remain unchanged.

**1.5.0 deployed on 2026-09-14**, Worker version `d121a787-e9e7-429e-b299-adfb9f8bbb44`. The deployment command built production assets, passed Wrangler's dry run, confirmed no pending migrations, and deployed both custom domains. Reported Worker startup is 24 ms and compressed Worker upload is 344.21 KiB; `AI_SETTINGS_KEY` was retained.

Post-deployment checks confirmed JSON `status: ok`, `database: ok`, `version: 1.5.0` at `/api/live` on both hosts. Unauthenticated dashboard, Health import page, overview, series and attachment reads redirect to `nocoo` Access. The machine hostname returns 404 for dashboard, Health import/read routes, generic imports, events and actual deployed assets. The real-data interactive Chrome checks above use the authorized production-bound Caddy service; the production daily link also opened in the owner's existing Chrome session.
