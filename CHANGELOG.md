# Changelog

## 2.0.0 — 2026-09-15

- GitHub 数据源支持填写已有 PAT、自动识别账号、查询指定日期的 Commits 与 PR 动作；PAT 加密保存且不回显。
- GitHub 完整日快照按账号与日期/时区永久缓存到 D1，含空日、并发去重及换 PAT 后复用；当天卡片采用 🐙、GitHub 中性色和 PR 状态色。
- 接入 Gecko 每小时电脑活动与 Firefly 公开文章，日记使用外部来源及 GPS 出行、兴趣点与可能通勤证据。
- 新增跨夜睡眠阶段图、逐页加载骨架屏和稳定的侧栏标志/头像；补齐 D1 瞬态读取恢复与健康检查重试。

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
