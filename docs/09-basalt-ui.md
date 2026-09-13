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
- Per-source SQLite dashboards, heatmaps and sun-position calculations. The central timeline and contextual daily map inform the current reading design; see `docs/13-story-timeline.md`.
- Compatibility shims and hand-built generic controls next to Basalt.

`docs/05-basalt-migration.md` was a contribute-to-basalt plan. `docs/06-basalt-modernization.md` records the npm-package cutover. The chronicle UI replaces that dashboard rather than restyling it.

## What the new UI completes

- Vite React SPA chrome that follows `../basalt/INTEGRATION.md` and the installed `@nocoo/basalt/ai/RECIPES.md`.
- Product routes `/`, `/imports`, `/connect`, `/settings/ai` in the sidebar, plus a not-found page. No `/login`.
- Daily chronicle: all 24 local hours, all-day records, source filter, previous / next / today / date picker, empty / loading / error.
- Daily story: a central time spine with body/spatial evidence on the left and narrative events on the right. Source filtering projects the story, maps and measured totals; AI summary remains all-source. Daily totals and AI are the closing pair at 24:00.
- Source-specific readable details from `LifeEvent.data` (Apple Health, footprint, Pixiu, journal, Connect).
- Import of Apple Health XML, footprint GPX, Pixiu CSV, journal JSON/NDJSON, with preview, progress, errors, cancel, and `/api/imports` batches.
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
src/views/timeline-page.tsx
src/views/ai-settings-page.tsx
src/views/imports-page.tsx
src/views/connect-page.tsx
src/views/not-found-page.tsx
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
- `buildDayStory` projects every hour from `buildDayTimeline` into semantic branches. Body/sleep/GPS samples group by source and first covered hour, with all raw records retained. Long events appear once with continuation links. Date-only records stay in all-day margin notes and never invent a clock time.
- Chapter links cover 00–06 / 06–12 / 12–18 / 18–24; the 24 bars show record density. These are clock chapters, never inferred sunrise/sunset. Empty hours keep their tick with compact spacing. At widths below 768px, one lane merges branches in their original chronological order.
- Hour slots with `instants.length === 0` are nonexistent (spring-forward skip). `state === "missing"` with `instants.length > 0` is a shortened hour (for example Australia/Lord_Howe half-hour DST) and still renders `slot.events`. Each row has `data-hour={slot.hour}` for L3 anchors.
- Import preview is the selected file name, size and source. There is no fake parse of records in the UI; `importFile` owns parsing. Copy talks about replay safety (re-import updates existing records), not batch size or stable keys.
- `importSourceMeta` reads a complete `Record<ImportSourceId, ImportSourceMeta>` map, so the Imports page never sees an undefined source.
- Timeline always fetches the day's events without a source query. The source filter projects the hour list, GPS map, and health/workout/finance stats. AI summary stays all-source. Workouts use `precision` (全天 when the clock is null). Health stats include walking distance, flights and standing; duration text rounds total minutes before splitting hours.
- The full-day map sits next to the first timed GPS branch (or in all-day notes for date-only positions). Each journey opens its own coordinates in a Basalt Dialog. The map lazy-loads `leaflet` and `leaflet/dist/leaflet.css`, uses `preferCanvas`, OSM tiles at `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with linked attribution, keeps all polyline vertices, and only start/end markers (UTC min/max, not segment order). Wheel zoom is disabled so page reading can continue; buttons and keyboard still zoom/pan. Import/init failures show a retry. ResizeObserver calls `invalidateSize`. Popups use `textContent` only.
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

Leaflet 1.9.4 is loaded only for a day with coordinates; its CSS is imported by the same map module. `@nocoo/next-ai` 0.4.0 supplies AI provider metadata. The backend uses AI SDK clients with bounded HTTP transport.

The summary ViewModel ignores late responses from another day and reloads the selected day after returning from imports or settings. Source filtering does not reload summaries. Basalt's AvatarImage/AvatarFallback handle loading and failed images; no duplicate image state is kept. Leaflet instances and ResizeObservers are removed when the day or route changes.

## Validation

Thin Views are exercised by Playwright. L3 checks the exact logo x/y coordinates over repeated collapse/expand cycles, avatar fallback, mobile navigation, keyboard/zoom/resize on maps, source filtering, AI settings, persisted summaries and date-switch races. A dense full-day scene checks desktop branch geometry, raw disclosure, journey Dialogs, chapter links, mobile time order, both themes, accessibility and the closing summary. Model/Service/ViewModel coverage belongs to L1. Release results are recorded in [12 Daily views and AI](12-daily-view.md) and [13 Story timeline](13-story-timeline.md).
