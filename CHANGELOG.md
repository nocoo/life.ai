# Changelog

## v0.2.1 — 2026-09-13

- Upgrade the root lint toolchain and Dashboard dependencies, including Next.js 16.3.5, React 19.3.0, Lucide 1.45.0, and Happy DOM 20.14.5.
- Refresh compatible transitive dependencies and eliminate the Dashboard `@humanfs/node` and `browserslist` vulnerabilities without dependency overrides.
- Respect upstream Babel and PostCSS version boundaries while aligning Dashboard ESM configuration with Vite's native config loader.
- Make Leaflet draw event subscriptions ref-safe, add lifecycle regression coverage, and stop tracking Next.js-generated type declarations.

## v0.2.0 — 2026-09-13

- Adopt `@nocoo/basalt` 2.1.7 for the application shell, navigation, providers, page chrome, surfaces, controls, metrics, heatmaps, and chart framing.
- Add a responsive single-instance sidebar lifecycle, mobile Sheet navigation, pre-hydration Life.ai accent, and accessible login and chart behavior.
- Preserve advanced chart capabilities through typed adapters, including sparse multi-series alignment, reference lines, horizontal bars, labels, and percentage tooltips.
- Expand component and responsive coverage while retaining script, API, production build, and browser release gates.
