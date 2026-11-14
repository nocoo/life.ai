# Basalt 3.3.4 acceptance

## Scope

The dependency remains exact-pinned and the lock resolves published `@nocoo/basalt@3.3.4`. `AppFrame` delegates the mobile Sheet, hidden title/description, expanded SidebarProvider and focus restoration to `SidebarDrawer`. The menu button exposes `aria-controls` and `aria-expanded`. Existing dismiss-mode SidebarToggle, route-close behavior, session handling and Access logout remain unchanged. No consumer CSS or package patch was added.

## User-approved geometry

用户批准验收标准从外层260改为外层320、内层仍260。

Acceptance revision: `outer320-inner260-v1`. This changes the campaign acceptance criterion, not Basalt's implementation. Historical outer-260px failures remain failures under the former criterion.

`tests/browser/sidebar-drawer.spec.ts` adds two application E2E cases, one per light/dark theme. Each checks desktop 1440/1280px and mobile 390/640/767px viewports:

- Desktop rail 260/68px, Avatar 36×36px with equal settled expanded/collapsed y, and email line-height 16px.
- Collapsed brand name hidden and the shared name/version copy clipped to zero width; expanded/mobile name and version visible.
- Mobile outer Drawer 320px, inner Sidebar 260px, zero horizontal padding, dismiss button and trigger ARIA linkage.
- First Escape, dismiss click and navigation close the Drawer and return focus; AI settings and general settings routes remain reachable.
- A collapsed desktop preference survives opening/closing an expanded mobile Drawer and returning to desktop.

No existing test, theme, viewport or assertion was removed or relaxed. The new outer/inner width assertions implement the explicit user-approved amendment. The trigger's attributes are inspected with `includeHidden: true` while the modal is open because Radix correctly hides background controls from the accessibility tree; focus assertions run after closing.

## Retained customizations

| Customization                                                     | Reason                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| Persisted desktop collapse preference                             | Preserve the owner's existing navigation preference       |
| Grouped navigation and command search                             | Preserve product destinations and keyboard navigation     |
| Route-change and viewport-change closing                          | Avoid stale mobile navigation after navigation/resizing   |
| Session identity and image/initial fallback                       | Preserve authenticated identity independently of geometry |
| SidebarUser Access logout link                                    | Preserve `/cdn-cgi/access/logout`                         |
| Product logo/version, AccentControl, ProjectLinks and ThemeToggle | Preserve accepted branding and framework actions          |

## Initial verification on 2026-11-14

Commands used repository-declared Bun 1.4.0 via a temporary executable path, with Node v26.11.1 (26.x requirement). No global runtime was changed.

- Normal pre-commit hooks passed for dependency, drawer and test commits: index-snapshot coverage, four type configurations and zero-warning/error lint.
- `bun run test:l3 -- tests/browser/sidebar-drawer.spec.ts`: **2 passed**, both themes and every listed viewport. The full L3 run also passed both new cases and existing sidebar/loading/identity cases.
- `bun run quality`: typecheck, lint, coverage and build passed; L2 **29 scenarios passed**. Coverage: statements 98.95%, branches 96.38%, functions 99.12%, lines 99.31%; **1602 tests / 89 files**. Build retained its existing large-chunk advisory.
- Full L3: **38 passed, 1 failed**. `tests/browser/data-management.spec.ts:87` reported Axe `scrollable-region-focusable` on ContentIsland in the Footprint/overview journey. The unchanged failing test passed on a fresh isolated targeted rerun, but this does not establish a green full suite or explain the intermittent failure.
- Independent read-only static review found no confirmed upgrade regression. It identified remaining coverage gaps: collapsed desktop preference through mobile open/close/back-to-desktop, and strict Avatar DOM-node continuity. Geometry checks alone are not node-identity proof. Review could read current files/package APIs but could not execute a raw Git diff; full patch sign-off remains pending.

The initial attempt stopped before PR. The historical failure and review limits above are retained rather than retroactively marked successful.

## Accessibility repair: five-active-upgrade-repairs-v1

Delaying only the overview API did not reproduce the original failure. Delaying the lazy `/src/views/data-overview-page.tsx` module did: the fallback already displays the same data-overview heading, but its scrollable ContentIsland has no focusable descendants. Both light/dark cases deterministically reported the original Axe `scrollable-region-focusable` violation. Waiting for the heading alone was not a reliable readiness signal, and simply waiting longer would leave the real loading-state keyboard gap unfixed.

`AppFrame` now uses ContentIsland's published native HTML attributes: `role="region"`, `aria-label="页面内容"` and `tabIndex={0}`. This makes the scroll owner a named keyboard entry while loading or showing static content. No CSS, package implementation, Axe configuration or existing assertion changed.

`tests/browser/content-keyboard.spec.ts` adds two theme cases that hold the real lazy module, confirm the fallback heading and absence of descendant controls, run the unchanged WCAG 2A/2AA Axe scan, focus the region, verify PageDown changes its actual scroll position and Tab leaves it, then release the module and scan the loaded page too. The new cases failed with the original Axe violation before the semantic change and passed afterward. The original Footprint/overview Axe assertion remains unchanged.

After the repair, `bun run quality` passed all stages: four type configurations, zero-warning/error lint, the same 1602 unit tests and coverage percentages, build, 29 real-HTTP L2 scenarios, **41 L3 browser cases**, and G2 gitleaks/OSV. `bun run test:l1` completed all healthy/rejection probes; macOS rejects GNU cp's reflink option and the existing explicit cp fallback succeeds. The expanded desktop/mobile preference test also passed in both themes. Normal hooks remain installed and active.

Full patch review and publication receipts are recorded with the upgrade PR and campaign evidence. Avatar measurements do not claim strict Avatar DOM-node identity. Actual signed-in Avatar appearance remains **待哥登录验收**. Merge requires every CI check green; deployment follows the repository Release workflow and exact revision/health verification.
