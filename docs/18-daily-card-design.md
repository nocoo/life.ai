# Daily cards — 1.5.1

The daily tree remains the reading structure. Cards now distinguish the kind of evidence through a Basalt color, a Lucide icon and a readable title. Text keeps its normal alignment. Short observations take their natural width, bounded by their lane; maps retain their available drawing space.

## Visual language

| Evidence | Basalt palette | Main icons |
| --- | --- | --- |
| Sleep and bedtime | Grape, accent 10 | MoonStar, Moon, Sunrise, BedDouble |
| Workouts and walking | Chart green | Bike, Footprints, Dumbbell, Mountain, Waves |
| Climbing and daylight | Chart yellow | MoveUpRight, SunMoon, Sunrise |
| Heart-rate moments | Chart pink | HeartPulse |
| Blood pressure | Tangerine, accent 7 | Gauge, ArrowUp, ArrowDown |
| ECG and daily vital signs | Bondi, accent 3 | SquareActivity, Activity, Heart, Droplets, Wind |
| Occasional measurements | Lime, accent 5 | Scale, Ruler, ClipboardList, BellRing |
| GPS | Chart blue | Map, MapPin |
| AI and Connect | Indigo, accent 11 | Sparkles, Plug |

Category colors identify the type of record; they do not indicate a medical judgement. Numbers, units and text labels remain readable without relying on color. The existing GPS speed colors and sleep-stage legend keep their original meaning.

`StoryCardHeading` shares the icon tile and Basalt typography; `StoryMetricLabel` supplies small decorative icons for measurements. `LayerCard` remains the surface primitive. A faint diagonal texture, a restrained color wash, an inset highlight and two soft shadow layers provide material depth in both themes. Lucide imports remain explicit and tree-shakable.

Cards enter with a 240 ms fade and a 6 px rise only when the system permits motion. Basalt owns collapse/expand and information-panel transitions. A closing mobile map stays mounted for its exit animation, then releases the hidden container and Leaflet instance. There is no new animation library or scroll listener.

## Primary information and supporting notes

Main cards show time, meaningful readings and the event narrative. Source/device descriptions, overlapping-source explanations and other supporting Health evidence live in the upper-right information control. Its Basalt HoverCard opens on hover or keyboard focus, supports touch, and dismisses with Escape or outside interaction. Notes wrap and scroll within the viewport; the trigger has a descriptive accessible name.

In 2.0.1 this also covers the daily overview's timezone/aggregation scope, weather reference area/model provenance/provider links, map speed methodology, empty GitHub snapshot explanation and diary generation details. Weather measurements, the map legend and actionable errors remain in the card body. Redundant generic subtitles are removed. Pointer activation and keyboard activation are handled separately so a second touch closes the panel without a focus timer reopening it. In 2.0.2, computer activity, writing and GitHub are independent collapsible sections inside the single **AI 总结** card, each with an upper-right information control. See [layered diaries](29-layered-diary.md).

GitHub timeline entries are grouped per local hour. A compact card shows activity and repository totals plus counts for each present category; a separate dialog preserves every action, full description and source link. PR/Issue counts deduplicate the repository/number pair without removing any action. The dialog uses a fresh Basalt surface, an independently scrolling body and a visible close button that remains available on mobile. Details and category counts use explicit Lucide icons and GitHub state colors. See [GitHub](27-github.md).

Rare Health observations suppress internal `HK…` enum values and their orphaned units in the story projection. Numeric zero remains a measurement. Source, version and device details become `notes`; the original event and every raw field remain untouched and available in the records tab.

All-day records use one outer card. An embedded semantic article holds each record's content and compact, wrapping metrics without a second LayerCard, repeated provider heading or record-count footer. The outer information control contains source/count details and the date-precision explanation. All-day events still never occupy the midnight slot.

## Data and runtime boundaries

This release changes presentation and the read-side story projection. It adds no migration, import, production record write or new dependency. UTC storage, full Health/GPS fidelity, write idempotence, lazy raw tabs, ECG sample pagination and combined workout maps remain governed by [Apple Health](17-apple-health.md) and the [daily context design](16-daily-context-and-record-tabs.md).

Local review uses Chrome through `https://life.dev.hexly.ai` with production D1 reads. Automated browser tests use their own isolated Worker/SQLite. Real-data screenshots and detailed reports stay outside Git.

## Verification and release — 2026-09-14

| Gate | Verified result |
| --- | --- |
| L1 | 1,114 tests in 62 files passed. Statements 99.17%, branches 97.31%, functions 99.20%, lines 99.38%. |
| G1 | Strict TypeScript and Biome passed with no warnings or errors. Generated Worker types are unchanged. |
| L2 | 23 scenarios passed through real HTTP and local D1. |
| L3 | 20 browser scenarios passed, including source hover/focus/Escape, compact all-day metrics and complete raw enum values. |
| G2 | Gitleaks and OSV passed; production build and Wrangler deployment dry run passed. |
| D1 isolation | Automated tests used fresh local Worker/SQLite state. Production-data browser review issued no API mutations. |

Chrome 152.0.7977.83 review through Caddy covered 2560 × 1440 desktop and 390 × 844 mobile. Light desktop, dark desktop and dark mobile returned zero Axe WCAG A/AA violations after theme transitions settled. The mobile page had no horizontal overflow. Information panels opened with real touch input and dismissed outside; reduced-motion disabled the entrance animation. Computed styles confirmed that the texture layers survive Basalt's nested surface rules and that a short blood-pressure card occupies 280 px of a 750 px lane.

Real-data review also verified loaded workout map tiles, collapse/reopen, and pagination between 5-second waveform windows for the two ECGs on 2025-01-05. The all-day card renders its three activity metrics directly below one header. Browser errors and API mutation attempts were both zero. Private screenshots and reports are in `/tmp/life-card-design-20260914` and are not committed.

Version **1.5.1** is deployed to `life.hexly.ai` and `life.worker.hexly.ai`, Worker version `795724ab-d2ed-4879-b3e3-23cf3cd945b7`. Migration inspection and application both reported no pending migrations. Worker startup was 18 ms.

Post-deploy checks returned HTTP 200 JSON with `status: ok`, `version: 1.5.1` and `database: ok` from both `/api/live` endpoints. Unauthenticated dashboard and overview requests redirect to `nocoo.cloudflareaccess.com`; the ingestion hostname returns 404 for dashboard, records, overview, Connect management and application assets. The local Caddy endpoint also serves 1.5.1 with production D1 healthy.
