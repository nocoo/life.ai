<p align="center"><img src="assets/brand/icon-rounded.png" width="128" alt="Life.ai logo" /></p>
<h1 align="center">Life.ai</h1>
<p align="center">一个人的生活实录：把健康、足迹、记账和主动推送的记录汇聚到每天。</p>
<p align="center"><a href="https://life.hexly.ai">站点</a> · <a href="docs/README.en.md">English</a></p>

## 这是什么

Life.ai 是单用户生活记录应用，通过 Web 时间线回看健康、GPS、账目与日记。Cloudflare Access 保护入口，Worker 和 D1 保存同一份数据；导入与外部来源保留证据和原始时间精度。

## 功能

- **每日时间线**：按设备时区浏览 24 小时，选择日期与来源。存储和比较使用 UTC，保留日期、小时、分钟、秒的原始精度；仅日期记录显示在全天旁注。通用无偏移量输入按 UTC 解释，貔貅日期按 UTC+8 记账日处理。
- **健康与位置**：跨夜睡眠归入醒来日，展示阶段和有依据的位置提示；支持步行、爬楼、心率、完整分页心电图、血压和锻炼路线。GPS 按 5 / 10 km 区域归组，每小时配地图；首次到达展开，重复区域收起，重新到达或换日恢复自动展开。采样点按速度着色。
- **天气与日记**：参考当天位置展示天气和本地日出日落，太阳时刻成功获取后永久缓存在 D1。日记结合当天来源生成，可附修改意见重写；失败保留原文，数据变化提示更新。默认 Workers AI，也可配置其他模型。
- **按需记录**：时间线、位置、账目和其他记录共享日期与来源筛选；原始表格每页最多 50 条，健康维度、路线和心电附件按需加载并缓存。右侧集中展示全天足迹、天气、累计、账目和日记；侧栏姓名与头像来自 lizheng.blog。
- **数据概览与导入**：按来源显示覆盖天数、记录数、数据行、正文大小和月度图表；Footprint 覆盖日历可跳转每日地图。完整解析校验后才写入，包含的日期整日替换，未包含的日期保留，重复导入不增加副本或改变内容时间戳。
- **个人背景**：地图圆形区域可命名，时间线、位置表和睡眠沿用地点名称；支持平时作息及其时区。日记对照作息时先转换时区，缺少观测时保留空白，设置变化提示重写。
- **外部来源**：Connect 接收主动推送，Gecko 提供电脑活动，Firefly 提供公开文章；GitHub 按日查询提交与 PR 动作。GitHub PAT 加密保存且不回显，同账号、日期和时区的完整结果（含空日）永久缓存；提交范围为 GitHub 搜索收录的默认分支。

## 使用

访问 [life.hexly.ai](https://life.hexly.ai)，通过 Cloudflare Access 进入。所有获准身份访问同一个人的数据。

在「数据管理」选择来源：

| 来源 | 输入与保存方式 |
| --- | --- |
| Footprint | 完整 GPX；全部点按 UTC 日压缩保存，同日整份替换 |
| Apple Health | 完整导出 ZIP 或解压目录；按 UTC 日 × 维度无损保存，保留原始属性、嵌套元数据、多设备观测、锻炼 GPX、心电 CSV 和 CDA；同日全部维度一起替换 |
| 貔貅记账 | 一个或多个原始 CSV；保留九列、重复、零金额与多币种，按 UTC+8 记账日整份替换；消费、收入与转账/还款分别展示 |

「设置」集中管理通用设置、AI、Connect 和日记导入。日记支持 JSON / NDJSON，普通 JSON 上限 10 MiB；取消时保留已完成批次。

本机可使用共享 CLI 或 `life-data-import` Skill。以下 `--dry-run` 只校验，`--target production` 会写入生产：

```sh
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json
bun run data:import --provider apple-health --file /path/to/export.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json
bun run data:import --provider pixiu --file /path/to/pixiu --dry-run --json
bun run data:import --provider pixiu --file /path/to/pixiu --target production --json
```

生产主域名通过 `cloudflared` 获取当前用户的 Access 凭据。若使用 `dev:prod`，可追加 `--base-url https://life.dev.hexly.ai`，目标仍须为 `production`；CLI 会核对实际绑定。

在 Connect 为来源创建只写 token，明文仅显示一次。向 `https://life.worker.hexly.ai/api/ingest` 发送 Bearer token 请求；同一 token 只能替换其自己的同一 UTC 小时内容，也支持未来小时。撤销 token 保留历史数据。公开 `GET /api/live` 返回版本和数据库状态。

## 开发

需要 Bun 1.4 与 Node.js 22.20.x、24.x 或 26+；Node 23 / 25 不受当前测试工具支持。

```sh
bun install --frozen-lockfile
bun run prepare
bun run db:migrate
bun dev
```

```sh
bun run typecheck
bun run lint
bun run build
```

打开 https://life.dev.hexly.ai，Caddy 上游为 `127.0.0.1:7011`，默认使用本地 SQLite，无需 Google OAuth。`bun run dev:prod` 使用同一地址但连接生产 D1，需要 Wrangler 登录，导入与 Connect 操作会写生产。保留现有 `AI_SETTINGS_KEY` 与本地配置，不提交凭据、数据库或私有导出。

## 测试

```sh
bun run test:coverage
bun run test:l2
bunx playwright install chromium
bun run test:l3
```

单元测试使用 Vitest；HTTP 和浏览器测试分别使用 17011 / 27011，每轮生成独立 SQLite、缓存和测试密钥，不需要真实 Access、模型或来源凭据。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| React · Vite · Basalt | Web 界面 |
| TypeScript · Bun · Biome | 类型、脚本与静态检查 |
| Cloudflare Workers · D1 | API、Access 校验和存储 |
| Workers AI · AI SDK | 日记生成与模型接入 |
| Leaflet · Recharts | 地图与统计 |
| Vitest · Playwright | 单元、HTTP 与浏览器测试 |

`src/models/`、`src/services/`、`src/viewmodels/` 分别负责领域、HTTP 和状态；Views 渲染与派发操作，`worker/` 管理 API 与数据库。

## 文档

- [文档索引](docs/README.md)
- [架构与上线记录](docs/08-chronicle-rewrite.md)
- [每日视图与 AI](docs/12-daily-view.md)
- [数据管理与 Footprint](docs/15-data-management.md)
- [时间线与记录页签](docs/16-daily-context-and-record-tabs.md)
- [Apple Health](docs/17-apple-health.md)
- [貔貅导入](docs/22-pixiu-daily-import.md)
- [通用设置](docs/24-general-settings.md)
- [GitHub 按日记录](docs/27-github.md)
- [领域契约与运维](docs/30-domain-contracts.md)

## 许可证

[MIT](LICENSE) © 2026 Zheng Li
