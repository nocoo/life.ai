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

## Verification on 2026-11-14

Commands used repository-declared Bun 1.4.0 via a temporary executable path, with Node v26.11.1 (26.x requirement). No global runtime was changed.

- Normal pre-commit hooks passed for dependency, drawer and test commits: index-snapshot coverage, four type configurations and zero-warning/error lint.
- `bun run test:l3 -- tests/browser/sidebar-drawer.spec.ts`: **2 passed**, both themes and every listed viewport. The full L3 run also passed both new cases and existing sidebar/loading/identity cases.
- `bun run quality`: typecheck, lint, coverage and build passed; L2 **29 scenarios passed**. Coverage: statements 98.95%, branches 96.38%, functions 99.12%, lines 99.31%; **1602 tests / 89 files**. Build retained its existing large-chunk advisory.
- Full L3: **38 passed, 1 failed**. `tests/browser/data-management.spec.ts:87` reported Axe `scrollable-region-focusable` on ContentIsland in the Footprint/overview journey. The unchanged failing test passed on a fresh isolated targeted rerun, but this does not establish a green full suite or explain the intermittent failure.
- Independent read-only static review found no confirmed upgrade regression. It identified remaining coverage gaps: collapsed desktop preference through mobile open/close/back-to-desktop, and strict Avatar DOM-node continuity. Geometry checks alone are not node-identity proof. Review could read current files/package APIs but could not execute a raw Git diff; full patch sign-off remains pending.

Status: **blocked before PR** by the unresolved full-suite accessibility failure. No tests were weakened to bypass it. Standalone `test:l1` rejection proof, security gate and normal pre-push hook have not run in this attempt; quality stopped before security. No PR, CI, merge or deployment is claimed. Actual signed-in Avatar appearance: **待哥登录验收**.

Resume only after the independent failure is resolved/authorized: complete missing E2E/review evidence and normal gates, push with hooks, obtain all-green CI before merge-commit merge, then follow the repository Release workflow (`bun run deploy`) and verify the exact delivered revision/health. Never use a passing isolated rerun as a substitute for the failed full run.
