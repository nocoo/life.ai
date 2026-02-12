# 05 Basalt UI Migration Plan

Migrate all life.ai dashboard UI to the basalt design system while preserving full functionality.

## Terminology

| Term | Meaning |
|------|---------|
| **basalt** | Template project at `../basalt` — Vite SPA with a 3-tier luminance design system |
| **life.ai** | This project — Next.js dashboard for health, footprint, and finance data |
| **L0/L1/L2** | Basalt luminance layers: body → content panel → inner cards |
| **Contribute** | Write a generic component into basalt so it can later be imported back |

## Guiding Principles

1. **UI-only migration.** Services, models, viewmodels, API routes, and data pipelines stay untouched.
2. **Phase 0 goes first.** Contribute missing generic components to basalt *before* starting migration, so life.ai can import from a single coherent design system.
3. **Atomic commits.** Each commit is buildable and testable. Never mix phases.
4. **Three-tier testing.** Every phase ends with UT + Lint + E2E green.

---

## Phase 0 — Contribute Generic Components to basalt

### Goal

Enrich basalt with 8 reusable components from life.ai, making basalt a complete dashboard template that covers maps, heatmaps, charts, and navigation — not just finance widgets.

### Components to Contribute

| # | Component | Source (life.ai) | Target (basalt) | Lines | Effort |
|---|-----------|-------------------|------------------|-------|--------|
| 1 | HeatmapCalendar | `charts/heatmap-calendar.tsx` | `components/dashboard/HeatmapCalendarCard.tsx` | 296 | Medium |
| 2 | LineChart | `charts/line-chart.tsx` | `components/dashboard/LineChartCard.tsx` | 184 | Low |
| 3 | BarChart (wrapper) | `charts/bar-chart.tsx` | `components/dashboard/WrappedBarChartCard.tsx` | 145 | Low |
| 4 | PieChart / DonutChart | `charts/pie-chart.tsx` | `components/dashboard/PieChartCard.tsx` | 121 | Low |
| 5 | StatCard + StatGrid | `charts/stat-card.tsx` | `components/dashboard/StatCard.tsx` | 102 | Low |
| 6 | Map | `ui/map.tsx` | `components/ui/map.tsx` | 1552 | High |
| 7 | Timeline | `views/day/timeline.tsx` | `components/dashboard/TimelineCard.tsx` | 81 | Low |
| 8 | DateNavigation | `views/day/date-navigation.tsx` | `components/dashboard/DateNavigation.tsx` | 74 | Low |

### Component NOT Contributed (Domain-Specific)

| Component | Reason |
|-----------|--------|
| EnhancedTimeline (359 lines) | Deeply coupled to Apple Health types, 18 Chinese health labels, sun position astronomy, heart rate zones. Will be restyled in-place during Phase 4. |
| DayCalendar (27 lines) | Thin wrapper over shadcn Calendar — not worth standalone contribution. |

### Contribution Strategy Per Component

#### 0.1 — HeatmapCalendar → basalt

- **Adapt:** Replace `oklch` heatmap CSS vars with basalt HSL equivalents.
- **Adapt:** Replace shadcn `Tooltip` import path from `@/components/ui/tooltip` (already matches basalt layout).
- **Adapt:** Add CSS variables for heatmap color scales to basalt's `index.css` (4 scales × 4 levels = 16 vars).
- **Demo page:** Create `HeatmapShowcasePage.tsx` in basalt `/pages/` showing sample data (e.g. GitHub commit activity).
- **Test:** UT for rendering, cell count, tooltip behavior, color scale selection.
- **ViewModel:** `useHeatmapShowcaseViewModel.ts` with mock yearly data.

#### 0.2 — LineChart / BarChart / PieChart → basalt

- **Adapt:** Replace `chart-colors.ts` oklch palette with basalt's `palette.ts` HSL system.
- **Adapt:** Each chart becomes a Card-wrapped component following basalt's `CardHeader + CardContent` pattern.
- **Adapt:** Use basalt's `chartAxis`, `chartPrimary`, `CHART_COLORS` instead of hardcoded oklch.
- **Note:** basalt already has inline Recharts in its dashboard cards (SummaryMetricCard, BarChartCard, etc.). These new wrappers provide *reusable, props-driven* versions — they complement, not replace, existing cards.
- **Demo page:** Extend existing `StatsOverviewPage` or create `ChartShowcasePage` to demo all three wrappers with varied datasets.
- **Test:** UT for each chart: renders without crashing, displays correct number of data points, handles empty data.

#### 0.3 — StatCard + StatGrid → basalt

- **Adapt:** Restyle to basalt's L2 card pattern: `bg-secondary rounded-card border-0 shadow-none`.
- **Adapt:** Add `font-display` to value text for DM Sans heading style.
- **Adapt:** Use basalt's `text-success` for positive trends, `text-destructive` for negative.
- **Demo:** Integrate into existing `DashboardPage` or `StatsOverviewPage`.
- **Test:** UT for rendering title, value, trend badge, icon, grid column variants.

#### 0.4 — Map → basalt

- **Adapt:** Replace `next-themes` dependency with basalt's localStorage-based theme detection.
- **Adapt:** Add Leaflet CSS overrides to basalt's `index.css` (port from life.ai's `globals.css`).
- **Adapt:** Replace shadcn `ButtonGroup`, `DropdownMenu`, `Input` imports to match basalt's component paths.
- **Dependencies:** Add to basalt `package.json`: `leaflet`, `react-leaflet`, `leaflet-draw`, `leaflet.fullscreen`, `leaflet.markercluster`, `react-leaflet-markercluster`, and their `@types/*`.
- **Demo page:** Create `MapShowcasePage.tsx` showing: basic map, markers, polylines, drawing tools, dark/light tile switching.
- **Test:** UT for Map rendering (mock Leaflet), tile layer switching, zoom controls.

#### 0.5 — Timeline → basalt

- **Adapt:** Replace domain-specific `TimelineEvent` type with a generic interface: `{ id: string; time: string; title: string; subtitle?: string; color?: string; icon?: React.ElementType }`.
- **Adapt:** Style with basalt tokens (card background, muted foreground, etc.).
- **Demo page:** Create `TimelineShowcasePage.tsx` or add a timeline section to an existing page.
- **Test:** UT for rendering events, hour grouping, empty state.

#### 0.6 — DateNavigation → basalt

- **Adapt:** Replace hardcoded Chinese locale with configurable `locale` prop (default `enUS`).
- **Adapt:** Replace `"今天"` with `locale.today` or a `todayLabel` prop.
- **Adapt:** Ensure it uses basalt's Button component and spacing conventions.
- **Demo:** Integrate into an existing page or create standalone demo.
- **Test:** UT for prev/next/today callbacks, date formatting, calendar toggle.

### Phase 0 Testing Protocol

For each contributed component in basalt:

```
# After each component commit:
cd ../basalt
bun test           # UT pass
bun run lint       # 0 warnings

# After all components:
bun run build      # Production build succeeds
bun dev            # Visual verification on each demo page
```

### Phase 0 Commit Sequence

```
feat: add heatmap calendar component with color scales
feat: add reusable line chart card wrapper
feat: add reusable bar chart card wrapper
feat: add reusable pie/donut chart card wrapper
feat: add stat card and stat grid components
feat: add leaflet map component with theme support
feat: add timeline component
feat: add date navigation component
```

---

## Phase 1 — Design Token Migration

### Goal

Replace life.ai's oklch tokens with basalt's HSL 3-tier luminance system.

### Changes

1. **`globals.css`**: Replace all oklch values with basalt HSL equivalents.
   - Port basalt's `:root` and `.dark` token blocks wholesale.
   - Add life.ai-specific tokens that basalt doesn't have (heatmap scales) converted to HSL.
   - Add basalt extensions: `--success`, `--badge-red`, `--chart-1~24`, `--chart-axis`, `--chart-muted`.
   - Add `--radius-card: 14px`, `--radius-widget: 10px`.
   - Add `@import "tw-animate-css"`.
   - Add `@utility font-display` block.
   - Preserve Leaflet CSS overrides (they reference semantic tokens, so they auto-adapt).

2. **`card.tsx`**: Replace with basalt's Card component (flex-col, `rounded-lg border bg-card shadow-xs`).

3. **`chart-colors.ts`**: Replace oklch palette with `palette.ts` from basalt (HSL via CSS vars). Since basalt proved `hsl(var(...))` works in Recharts SVG, we can switch.

4. **`package.json`**: Add `tw-animate-css` dependency.

### Testing Protocol

```bash
cd dashboard
bun test                    # All 44 test files pass
bun run lint                # 0 errors, 0 warnings
bun run build               # Production build succeeds
bun dev                     # Visual check: all pages render, colors look correct
```

### Verification Checklist

- [ ] Light mode: body is L0 gray, not white
- [ ] Dark mode: body is near-black, cards are slightly lighter
- [ ] Charts still render colors (not black/invisible)
- [ ] Heatmap calendars show correct color scales
- [ ] Map tiles load in both themes
- [ ] No oklch references remain in globals.css

### Commit

```
refactor: migrate design tokens from oklch to basalt HSL system
```

---

## Phase 2 — Layout Skeleton Replacement

### Goal

Replace flat Header layout with basalt's Sidebar + Content Panel architecture.

### Changes

1. **New `DashboardLayout.tsx`** — Port from basalt, adapted for Next.js:
   - Use `"use client"` directive.
   - Replace `<Outlet />` with `{children}` (React Server Component pattern).
   - Keep collapsible sidebar, mobile overlay, header with page title.
   - Content area: `rounded-[20px] bg-card p-5` (L1 panel).

2. **New `AppSidebar.tsx`** — Port from basalt, adapted navigation:
   - Nav groups: "日常" (日/月/年), "System" (Settings/Palette).
   - Keep ⌘K command palette.
   - Replace `react-router` with `next/navigation` (`usePathname`, `useRouter`).
   - Replace "basalt." branding with "Life.ai" branding.

3. **New `ThemeToggle.tsx`** — Evaluate: keep `next-themes` (simpler with SSR) but use basalt's toggle UI (Moon/Sun icon button).

4. **`layout.tsx`** — Replace `<AppHeader>` + `<main>` with `<DashboardLayout>`.

5. **Delete** old `app-header.tsx`.

6. **Page files** — Remove outer `<ScrollArea>` and padding from each page (layout now handles it).

### New UI Primitives Needed

Port from basalt if not already present in life.ai:
- `ui/collapsible.tsx` (for sidebar groups)
- `ui/command.tsx` (for ⌘K palette)
- `ui/avatar.tsx` (for sidebar footer)
- `hooks/use-mobile.tsx` (for responsive sidebar)

### Testing Protocol

```bash
bun test                    # Fix tests referencing AppHeader → DashboardLayout
bun run lint
bun run build
# Manual: verify sidebar collapses, mobile overlay works, ⌘K opens, all 3 pages navigate correctly
```

### Verification Checklist

- [ ] Sidebar renders with 日/月/年 nav items
- [ ] Sidebar collapses to icons on toggle
- [ ] Mobile: hamburger menu opens overlay sidebar
- [ ] ⌘K command palette searches pages
- [ ] Content panel has rounded corners and L1 background
- [ ] Each page shows correct title in header
- [ ] Theme toggle works (system/light/dark cycle)
- [ ] Old AppHeader is fully removed

### Commits

```
feat: add sidebar layout with collapsible navigation
refactor: replace app header with sidebar dashboard layout
chore: remove deprecated app-header component
```

---

## Phase 3 — Chart System Migration

### Goal

Unify chart components to use basalt's palette and card patterns.

### Changes

1. **Replace `chart-colors.ts`** with basalt's `palette.ts` (already done conceptually in Phase 1, but wire up actual imports).

2. **Update chart wrappers** (LineChart, BarChart, PieChart):
   - Import colors from `@/lib/palette` instead of `@/lib/chart-colors`.
   - Update default tooltip styling to match basalt (dark bg, white text, rounded-widget).
   - Add `chartAxis` for axis tick colors.

3. **Update all view files** that pass hardcoded color props to charts:
   - Replace `oklch(...)` strings with `chart.xxx` or `CHART_COLORS[n]`.
   - Replace Tailwind color classes (`text-green-500`) with semantic tokens (`text-success`).

4. **HeatmapCalendar**: Update color scale CSS vars from oklch to HSL (done in Phase 1, but verify the component reads them correctly).

### Testing Protocol

```bash
bun test                    # Chart component tests pass
bun run lint
bun dev                     # Visual: charts show correct colors, axes readable
```

### Commits

```
refactor: migrate chart palette to basalt HSL system
refactor: update chart components to use basalt palette
refactor: update view color references to semantic tokens
```

---

## Phase 4 — Card & View Component Restyling

### Goal

Apply basalt's L2 card styling to all dashboard cards across all views.

### Changes

#### Card Pattern Migration

Every Card in every view switches from:
```tsx
// Old pattern
<Card className="rounded-lg border bg-card p-4 shadow-sm">
```
To:
```tsx
// Basalt pattern (L2)
<Card className="rounded-card border-0 bg-secondary shadow-none">
  <CardHeader>
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      <CardTitle className="text-sm font-normal text-muted-foreground">Title</CardTitle>
    </div>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

#### StatCard Restyling

Update `StatCard` to match basalt's metric card pattern:
- Large value with `font-display tracking-tight`
- Trend badge with `text-success` / `text-destructive`
- Icon in header row (not top-right corner)

#### View-by-View Changes

| View | Files to Update | Key Changes |
|------|----------------|-------------|
| Day | `day-page.tsx`, `day-info-card.tsx`, `health-panel.tsx`, `activity-panel.tsx`, `summary-cards.tsx` | All cards → L2 style, mini bar charts keep inline div approach |
| Day | `enhanced-timeline.tsx` | Wrap in L2 card, adapt pill colors to basalt palette |
| Month | `month-page.tsx`, `month-health-panel.tsx`, `month-footprint-panel.tsx`, `month-pixiu-panel.tsx` | All StatCards + chart cards → L2 style |
| Year | `year-page.tsx`, `year-health-panel.tsx`, `year-footprint-panel.tsx`, `year-pixiu-panel.tsx` | All StatCards + heatmaps + chart cards → L2 style |
| Raw data | `raw-health-data.tsx`, `raw-footprint-data.tsx`, `raw-pixiu-data.tsx` | Table styling: borders → basalt border tokens |

#### Typography Updates

- Section headers: `text-sm font-normal text-muted-foreground` (basalt pattern)
- Large values: add `font-display tracking-tight` class
- Stats grid: use basalt spacing (gap-3 vs gap-4)

### Testing Protocol

```bash
bun test                    # Fix any snapshot/assertion tests referencing old class names
bun run lint
bun run build
bun dev                     # Visual: every page shows 3-tier luminance, no flat white cards
```

### Commits (one per view scope)

```
refactor: restyle day view cards to basalt L2 pattern
refactor: restyle month view cards to basalt L2 pattern
refactor: restyle year view cards to basalt L2 pattern
refactor: restyle raw data tables to basalt tokens
refactor: update StatCard to basalt metric card pattern
```

---

## Phase 5 — Polish & Cleanup

### Goal

Final visual polish, remove dead code, ensure consistency.

### Changes

1. **Icon stroke width**: Audit all Lucide icons — basalt uses `strokeWidth={1.5}` consistently.
2. **Remove unused imports**: Dead `chart-colors.ts`, old color utilities.
3. **Responsive audit**: Verify mobile layout on all pages with new sidebar.
4. **Accessibility**: Ensure all `role="img"` and `aria-label` on charts (basalt pattern).
5. **Loading states**: Update Skeleton components to match new card shapes.

### Commits

```
refactor: standardize icon stroke width to 1.5
chore: remove deprecated chart-colors and unused imports
fix: update skeleton loading states for new card layout
```

---

## Phase 6 — Final Test Verification

### Goal

All three testing tiers pass with zero tolerance.

### UT (Unit Tests)

```bash
cd dashboard
bun test                    # All pass
# Coverage ≥ 90%
```

Expected test fixes:
- Tests that query by `role` or `className` may need updates for new card structure.
- Tests that mock `AppHeader` need to mock `DashboardLayout` instead.
- Chart tests may need updated color value assertions.

### Lint

```bash
bun run lint                # 0 errors, 0 warnings
```

### E2E (End-to-End)

Currently life.ai has no E2E tests. As part of this migration, add BDD-style E2E tests:

```bash
# E2E scenarios to verify:
# 1. Navigate to /day — sidebar highlights "日", content shows day dashboard
# 2. Navigate to /month — sidebar highlights "月", content shows month stats
# 3. Navigate to /year — sidebar highlights "年", content shows year heatmaps
# 4. Toggle theme — all cards, charts, and map adapt correctly
# 5. Collapse sidebar — icons only, content expands
# 6. Mobile viewport — hamburger menu, overlay sidebar
# 7. ⌘K — command palette opens, search and navigate works
# 8. Date navigation — prev/next/today buttons work, data updates
```

### Final Commit

```
test: fix all test assertions for basalt UI migration
test: add e2e tests for sidebar navigation and theme switching
```

---

## Dependency Summary

### New dependencies for life.ai

| Package | Phase | Reason |
|---------|-------|--------|
| `tw-animate-css` | 1 | Basalt animation utilities |

### New dependencies for basalt (Phase 0)

| Package | Component | Reason |
|---------|-----------|--------|
| `leaflet` | Map | Core map library |
| `react-leaflet` | Map | React bindings |
| `leaflet-draw` | Map | Drawing tools |
| `leaflet.fullscreen` | Map | Fullscreen control |
| `leaflet.markercluster` | Map | Marker clustering |
| `react-leaflet-markercluster` | Map | React cluster bindings |
| `@types/leaflet` | Map | TypeScript types |
| `@types/leaflet-draw` | Map | TypeScript types |
| `@types/leaflet.fullscreen` | Map | TypeScript types |
| `@types/leaflet.markercluster` | Map | TypeScript types |
| `date-fns` | DateNavigation | Date formatting |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| oklch → HSL color mismatch for heatmaps | Medium | Use precise conversion tool; visual verify each scale |
| Map component heavy deps bloat basalt | Medium | Tree-shake; Leaflet is a peer dep, not bundled |
| Sidebar breaks mobile App Router pages | Low | Test on 375px viewport; basalt pattern is proven |
| 44 test files need className updates | High | Fix per-phase, not batched; keep CI green |
| Recharts SVG ignores CSS vars | Low | basalt already validates `hsl(var(...))` works |

---

## Phase Execution Order

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
 basalt      tokens      layout      charts      cards       polish      tests
(external)  (life.ai)   (life.ai)   (life.ai)   (life.ai)  (life.ai)  (life.ai)
```

Phase 0 is the prerequisite. All other phases are sequential within life.ai.
