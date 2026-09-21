# Changelog

## v2.0.3 — 2026-09-21

- Run pre-commit coverage, strict type checks and warning-fatal lint against the Git index snapshot; preserve unstaged changes and reject interrupted checks.
- Add regression tests for staged failures, healthy staged content with unrelated working-tree edits, and signal cleanup.
- Add accessible header links and tooltips, align browser theme selectors, and refresh bilingual project documentation.
- Update AI SDK, Cloudflare, React Router, Basalt and related tooling dependencies; automate production deployment after successful CI.

## 2.0.2 — 2026-09-15

- 「当日日记」改为「AI 总结」；「电脑活动」「文章创作」「GitHub」位于总结内部，可各自展开，沿用已保存的结构化内容。
- 时间轴每小时只显示一张 GitHub 卡片，概括动态、仓库和各类数量；独立弹窗按时间展示所有记录、完整提交说明、PR/Issue 正文、Release notes、SHA、编号、版本与原文链接。
- GitHub 新增该账号创建的 Issue 当天动作，以及有访问权限的自有、协作和组织仓库中该账号署名的 Release。分页失败、超限或超时不保存部分日快照。
- 保留账号/日期 D1 缓存及凭据；旧缓存可手动清除以补取新增类型和完整说明。弹窗支持长文本滚动、手机关闭、键盘焦点恢复及明暗主题。

## 2.0.1 — 2026-09-15

- 日记以 GPS 与逐笔消费备注为主线，天气与 Apple 健康补充个人活动；开发、文章创作与 GitHub 分别显示在可独立展开的卡片中。
- AI 返回固定结构的 JSON，保存前校验语法、字段位置、类型、长度和来源对应关系；旧日记继续可读，生成失败保留原文。
- 电脑与 GitHub 不再重复进入生活事件样本，GitHub 按仓库归纳数量与代表性记录，稀少的文章单独保留。
- 天气、当天概况、地图和日记生成说明统一收进右上角的 Lucide 信息入口，修复手机再次点击信息按钮时无法关闭的问题。

## 2.0.0 — 2026-09-15

- GitHub 数据源支持填写已有 PAT、自动识别账号、查询指定日期的 Commits 与 PR 动作；PAT 加密保存且不回显。
- GitHub 完整日快照按账号与日期/时区永久缓存到 D1，含空日、并发去重及换 PAT 后复用；日期沿用当天页面，卡片采用标准 Lucide 图标、GitHub 中性色和 PR 状态色。
- 内容区右上角可查看并清除 GitHub、Gecko、Firefly、天气、日出日落和共享地点缓存，默认所选日期并支持所有日期；清除保留 PAT、设置、原始记录与日记。
- 宽屏横排卡片填满所在行的高度，手机保留自然纵向布局；设置只填写 PAT，切换当天页面日期自动查询。
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
