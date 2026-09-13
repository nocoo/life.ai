# Changelog

## 1.0.0 — 2026-09-13

- 将产品统一为个人生活实录：24 小时时间线、UTC 精度、导入与小时 Connect 快照。
- Vite / React / Basalt 2.1.7 / Biome / MVVM，移除 Next.js 与 Google OAuth。
- Cloudflare Worker、Access JWT、D1 life、独立机器写入主机；只写 token 支持撤销和幂等覆盖。
- 本地 Worker + SQLite 的隔离 L2/L3，四项 L1 ≥95% 门槛，TypeScript strict 与安全扫描。


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
