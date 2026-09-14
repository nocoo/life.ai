# 09 Basalt UI (chronicle rewrite)

Frontend ownership for the Life.ai rewrite. Chinese product UI, existing capybara brand, published `@nocoo/basalt` 2.1.7. No Google sign-in. Work stays on `main`; this document is the UI contract for Codex integration.

## Old dashboard Basalt adoption

The Next.js app under `dashboard/` already consumed `@nocoo/basalt` 2.1.7. That adoption is the baseline, not the product.

Completed in the old app:

- Root `ThemeProvider`, `AccentProvider`, `LinkProvider`, `TooltipProvider`, `Toaster`.
- `AppShell` / `AppSkipLink` / `Sidebar*` / `AppHeader` / `AppMain` / `ContentIsland`.
- Desktop 260px / 68px rail, mobile `Sheet` drawer, `ThemeToggle`, command palette, version pill from package.json.
- Brand accent override: light `217 91% 60%`, dark `217 91% 65%`, with a pre-hydration script so the first paint is not unstyled.
- `LayerCard`, `PageHeader`, `DatePicker`, buttons, inputs, tabs, badges, tables, skeletons.
- Chart adapters around Basalt charts, with Recharts fallbacks for behaviour Basalt did not provide.
- Domain leftovers that Basalt does not own: Leaflet / Google maps, Photon autocomplete, map checkbox chrome.

Not completed, and intentionally not ported:

- Next.js App Router, Auth.js Google login, login route.
- Day / month / year health-dashboard information architecture.
- Per-source SQLite dashboards and the old heatmaps. The central timeline and contextual daily map inform the current reading design; weather and solar moments now follow the selected GPS reference place. See `docs/16-daily-context-and-record-tabs.md`.
- Compatibility shims and hand-built generic controls next to Basalt.

`docs/05-basalt-migration.md` was a contribute-to-basalt plan. `docs/06-basalt-modernization.md` records the npm-package cutover. The chronicle UI replaces that dashboard rather than restyling it.

## What the new UI completes

- Vite React SPA chrome that follows `../basalt/INTEGRATION.md` and the installed `@nocoo/basalt/ai/RECIPES.md`.
- Product routes `/`, `/imports`, `/connect`, `/settings/general`, `/settings/ai` and a Data Management partition containing `/data`, `/data/footprint`, `/data/apple-health` and `/data/pixiu`, plus a not-found page. No `/login`. General settings, AI settings, Connect and journal import sit in the bottom Settings partition; all navigation scrolls above the identity footer on short screens.
- Daily chronicle: all 24 local hours, all-day records, source filter, previous / next / today / date picker, empty / loading / error.
- Daily story: a central time spine with body/spatial evidence on the left and narrative events on the right. Source filtering projects the story, maps and measured totals; AI summary remains all-source. A separate right metadata column holds all-day records, full-day map, context, totals and AI.
- Basalt Tabs separate the daily story, location records and other records. Only the active panel mounts. Raw tables lazy-load, use Basalt DataTable sorting/pagination, and render 50 rows per page; complete JSON is prepared only for a selected row's Dialog.
- Source-specific readable details from `LifeEvent.data` (Apple Health, footprint, Pixiu, journal, Connect).
- Journal JSON/NDJSON uses `/api/imports`. Footprint GPX, complete Apple Health exports and Pixiu CSV each use dedicated compact import APIs and pages, with Basalt PageHeader, FileDropzone, UploadQueue, StatStrip and preview Table. Cumulative statistics live in Data Overview.
- General settings use Basalt PageHeader, LayerCard, Field, Input, Switch, Slider, Banner and ConfirmDialog. Leaflet edits multiple named circles by clicking a center and changing radius with live preview. A separate optional routine has empty initial sleep/wake clocks and an explicit timezone. Saved settings project into the timeline, map labels/popups, raw location table, sleep locations and diary evidence.
- Data Overview uses Basalt PageHeader/LayerCard/StatStrip/Table, plus Recharts with Basalt ChartFrame, chart config, Tooltip and Legend. Monthly totals fill missing months with zero; source comparisons share the cached overview response.
- Connect list / create / revoke. Plaintext token and curl example are ephemeral. Copy targets `https://life.worker.hexly.ai/api/ingest`. Copy explains UTC-hour replacement and future hours.
- Session from `GET /api/session` (`access` or `local`). Network errors retry; 401/403 reload for re-auth.
- Theme and accent providers plus header controls. Life.ai blue remains the default `primary` override.
- MVVM: services own HTTP; ViewModels own async state with no React/DOM imports; Views are thin.

## Files

```
src/main.tsx
src/App.tsx
src/styles.css
src/services/http.ts
src/services/session-service.ts
src/services/sources-service.ts
src/services/events-service.ts
src/services/imports-service.ts
src/services/connects-service.ts
src/services/ai-service.ts
src/viewmodels/errors.ts
src/viewmodels/format.ts
src/viewmodels/event-details.ts
src/viewmodels/session-view-model.ts
src/viewmodels/timeline-view-model.ts
src/viewmodels/import-view-model.ts
src/viewmodels/connect-view-model.ts
src/viewmodels/hour-slot.ts
src/viewmodels/ai-settings-view-model.ts
src/viewmodels/day-summary-view-model.ts
src/viewmodels/day-story.ts
src/viewmodels/day-records.ts
src/viewmodels/day-context-view-model.ts
src/viewmodels/data-overview-view-model.ts
src/viewmodels/footprint-view-model.ts
src/components/hydrate-chrome.ts
src/components/app-version.ts
src/components/brand.ts
src/components/app-link.tsx
src/components/app-providers.tsx
src/components/accent-control.tsx
src/components/navigation.ts
src/components/use-is-mobile.ts
src/components/app-sidebar.tsx
src/components/app-frame.tsx
src/components/date-navigation.tsx
src/components/event-card.tsx
src/components/day-timeline.tsx
src/components/day-insights.tsx
src/components/day-map.tsx
src/components/day-summary.tsx
src/components/day-records.tsx
src/components/day-context.tsx
src/views/timeline-page.tsx
src/views/ai-settings-page.tsx
src/views/imports-page.tsx
src/views/connect-page.tsx
src/views/not-found-page.tsx
src/views/data-overview-page.tsx
src/views/footprint-page.tsx
src/components/page-fallback.tsx
tests/unit/frontend/helpers.ts
tests/unit/frontend/services/*.test.ts
tests/unit/frontend/viewmodels/*.test.ts
```

Views are not unit-tested here. Codex L3 covers timeline, import, Connect, responsive chrome and auth boundaries.

## Decisions

- Zustand vanilla stores are the ViewModels. Views subscribe with `useStore`. Stores never import React, DOM, lucide or Basalt.
- HTTP helper parses `{ data }` / `{ error: { code, message } }` exactly as `docs/08`. Client uses `credentials: "same-origin"` and `cache: "no-store"`. AbortError is not converted into a page error. Fetch uses manual redirects so Access login redirects become a session-expired error instead of a CORS/network failure.
- Event list follows `nextCursor` until null. Repeated cursors and a page budget fail with a recoverable error.
- `buildDayStory` projects every hour from `buildDayTimeline` into semantic branches. Health/sleep samples group by source and first covered hour. GPS uses fixed-anchor 5/10 km places and ordered visits, combined into one inline route map per hour with actual samples. Long events appear once with continuation links. Date-only records stay in the metadata column and never invent a clock time. Raw data remains in the cached timeline model, with no hidden bulk record lists mounted under story branches.
- Chapter links cover 00–06 / 06–12 / 12–18 / 18–24; the 24 bars show record density. These are clock chapters, never inferred sunrise/sunset. Empty hours keep their tick with compact spacing. At widths below 768px, one lane merges branches in their original chronological order.
- Hour slots with `instants.length === 0` are nonexistent (spring-forward skip). `state === "missing"` with `instants.length > 0` is a shortened hour (for example Australia/Lord_Howe half-hour DST) and still renders `slot.events`. Each row has `data-hour={slot.hour}` for L3 anchors.
- Import preview is the selected file name, size and source. There is no fake parse of records in the UI; `importFile` owns parsing. Copy talks about replay safety (re-import updates existing records), not batch size or stable keys.
- `importSourceMeta` reads a complete `Record<ImportSourceId, ImportSourceMeta>` map, so the Imports page never sees an undefined source.
- Timeline always fetches the day's events without a source query. The source filter projects the hour list, GPS map, and health/workout/finance stats. AI summary stays all-source. Workouts use `precision` (全天 when the clock is null). Health stats include walking distance, flights and standing; duration text rounds total minutes before splitting hours.
- The full-day map sits in the metadata column. Hourly maps contain only that hour's samples and numbered regions. The first map of a stay expands; later maps in the same area collapse into compact measurements. Leaving and returning starts a new expanded arrival, and routes through several areas stay expanded. Hours without samples add no content or observed duration. A new day restores automatic expansion. The map loads Leaflet and its CSS only within 400px of the viewport, uses Canvas, OSM attribution, and all polyline vertices while retaining native/gap breaks. UTC min/max endpoints use neutral start/end markers. Area numbers stay centered after Leaflet CSS loads; slow/medium/fast colors derive from valid adjacent samples, not assumed GPX units. Wheel zoom is disabled; resize recomputes bounds. Popups use `textContent` only. Tab unmount destroys map instances and observers.
- Raw tables deduplicate cross-hour occurrences by event ID, preserving different points with the same timestamp. Date-only values show 全天; the precision column preserves day/hour/minute/second. Negative and missing raw coordinate/measurement fields remain inspectable. Legacy track arrays remain one original event with their complete points in the on-demand JSON Dialog.
- Public context comes from Open-Meteo and Sunrise-Sunset v2 through the Access-protected Worker APIs and shared D1 cache, with bounded reads and cancellation. Choose the region with most continuously observed time, and show unavailable states rather than invented defaults. Hourly weather and solar instants are clipped to the local day's UTC window; only returned solar moments enter the time spine.
- AI: `GET/PUT /api/settings/ai`, test `POST /api/settings/ai/test` against the saved config. Default `workers-ai` needs no key. Builtins/custom come from `@nocoo/next-ai` `defaultRegistry` / `CUSTOM_PROVIDER_INFO`. Day summary `GET/POST /api/day-summary` is manual, all sources, plain-text paragraphs, stale flag, previous text kept on failure.
- Created Connect secrets live only in store memory and disappear on dismiss or reset. They are never written to `localStorage`.
- Accent picker is application composition on Basalt `DropdownMenu` + `useAccent`, not a copied ThemeToggle.
- Router imports are from `react-router` 8.3.1 (`BrowserRouter`, `useLocation`, `Link`). Brand mark is `/logo-24.png`. Sidebar version reads root `package.json`. lucide-react 1.43.0 has no `Github` export; the header repo control uses `ExternalLink`.
- `AppHeader` uses `breadcrumbs={[{ label: meta.title }]}` and omits `title`, so the page `PageHeader` is the only `h1`. Unknown paths render a not-found page. Timeline, imports and Connect are `lazy()` route chunks so the XML/CSV parser stays off the main bundle.
- Sidebar 24×24 mark uses Basalt `SidebarHeader` defaults (`h-14 px-3 items-center`) in both collapse and expand, with `data-sidebar-logo` and `h-6 w-6`. Do not center or zero-pad the collapsed header; that shifts x. Root owns coordinate tests.
- Footer identity reads `Session.name` / `Session.avatar` directly. Prefer name, then email; secondary line is email only (never `subject`). `AvatarImage` plus initials fallback.
- Session 401/403 sets `expired` and the chrome offers a full reload / re-auth, not another `/api/session` retry.
- Chinese copy throughout. No production fixtures, mocks or placeholder events in Views.

## Contract with Codex (`src/models`)

Consumed as specified. No change required.

- `src/models/time.ts`: `localDateKey`, `shiftLocalDate`, `localDayWindow`, `buildDayTimeline`, `normalizeTimestamp`.
- `src/models/import.ts`: `importFile(file, source, onBatch, onProgress, signal?)`.
- `src/models/day-insights.ts`: `buildDayInsights(events, window)`.
- `src/models/ai.ts`: settings and day-summary types, `DEFAULT_AI_MODEL`.

Assumptions:

- `buildDayTimeline` returns 24 local hour slots and partitions day-precision events into `allDay`. A missing hour may still have instants when DST shortens the hour; only an empty `instants` array means the clock label does not occur.
- A resolved `onBatch` means the UI POST succeeded; a throw fails the import. `onBatch` is `Promise<void>`, so the adapter cannot see `{ accepted }` from `/api/imports`. The success summary uses `importFile`'s `{ processed, accepted }`.
- `normalizeTimestamp` is not called by the UI. Presentation formats API ISO strings with `Intl` in the local timezone.

If those assumptions are wrong, adjust the models rather than adding UI shims.

## Runtime dependencies

Leaflet 1.9.4 is loaded only for visible maps with coordinates; its CSS is imported by the same map module. Recharts 3.10.1 is loaded with Data Overview and uses Basalt's chart adapters. `@nocoo/next-ai` 0.4.0 supplies AI provider metadata. The backend uses AI SDK clients with bounded HTTP transport.

The summary ViewModel ignores late responses from another day and reloads the selected day after returning from imports or settings. Source filtering does not reload summaries. Basalt's AvatarImage/AvatarFallback handle loading and failed images; no duplicate image state is kept. Leaflet instances and ResizeObservers are removed when the day or route changes.

The shared general-settings store survives route changes. Place and routine saves serialize requests and preserve the other section's draft. Changing a saved name reprojects cached timeline data without reimporting points. Actual coordinates determine names before 5/10 km grouping; distinct small circles remain distinct and returning to a place opens its arrival map again. See [24 General settings](24-general-settings.md).

## Validation

Thin Views are exercised by Playwright. L3 checks the exact logo x/y coordinates, avatar fallback, mobile navigation, maps, source filtering, general/AI settings, summaries and date-switch races. Dense scenes cover hourly map placement, repeated-area collapse, centered speed markers, solar ordering, lazy record tabs, bounded pagination, raw values, UTC detail and responsive accessibility. General settings add keyboard coordinate entry, live circles, rename propagation and plain-text label escaping. Model/Service/ViewModel coverage belongs to L1. Current release results are recorded in [24 General settings](24-general-settings.md); earlier evidence remains in docs 12, 13, 15, 16, 17 and 22.
