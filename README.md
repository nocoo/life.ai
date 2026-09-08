<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Life.ai" width="128" height="128" />
</p>

<h1 align="center">Life.ai</h1>

<p align="center">把健康记录、位置足迹和记账数据放在同一时间线上查看。</p>

<p align="center"><a href="docs/README.en.md">English</a></p>

## 这是什么

Life.ai 将 Apple Health、footprint 和貔貅记账的导出文件转换为本地 SQLite 数据库，再通过 Web Dashboard 按日、月、年查看健康指标、轨迹与收支。适合整理自己的历史数据，比较同一段时间里的活动、位置与消费。

数据来自手动导入的文件，不会自动连接健康或记账账户。Dashboard 读取部署机器上的同一组数据库；登录邮箱用于限制访问，数据没有按登录用户分库。

## 功能

- 导入 Apple Health XML、ECG CSV 和运动路线 GPX，保存健康记录、运动与活动摘要。
- 导入 footprint GPX，生成日、周、月、年轨迹聚合。
- 导入貔貅记账 CSV，生成按日、月、年的收支聚合。
- 在日视图组合健康、活动、轨迹和记账信息；在月、年视图查看趋势、分布与日历热力图。
- 使用 Leaflet / Carto 或 Google Maps 查看位置，检查原始记录与存储统计。
- 使用 Google 登录，切换地图来源和界面主题。

## 使用

先按下方步骤部署并导入自己的数据。登录 Dashboard 后选择日期，或切换到月、年视图。仓库不包含个人原始数据与数据库文件。

导入器按文件格式和年份读取数据。footprint 与貔貅的年度刷新会替换该年份记录；Apple Health 也会清理选定年份，未指定年份时覆盖对应全部数据。重新导入前保留原始导出文件，格式说明见[数据文档](docs/00-overview.md)。

## 开发

需要 Bun 和 Node.js ≥ 22；`.node-version` 指定 Node 22。根目录与 Dashboard 分别安装依赖：

```bash
git clone https://github.com/nocoo/life.ai.git
cd life.ai
bun install --frozen-lockfile
bun install --cwd dashboard --frozen-lockfile
mkdir -p db
bun run db:init
bun run scripts/import/applehealth/init.ts
bun run scripts/import/pixiu/init.ts
```

在 `dashboard/.env.local` 配置 `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET` 和 `ALLOWED_EMAILS`。Google OAuth 本地回调地址是 `http://localhost:7011/api/auth/callback/google`。`ALLOWED_EMAILS` 为逗号分隔的允许邮箱；为空时，任何可完成 Google 登录的账号都可以访问同一份数据。

可选的 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 用于 Google 地图；默认 Carto 地图不需要它。数据库默认在根目录 `db/`，可用 `APPLEHEALTH_DB_PATH`、`FOOTPRINT_DB_PATH`、`PIXIU_DB_PATH` 指定其他绝对路径。

用实际年份和导出文件路径替换示例：

```bash
bun run db:refresh 2025 /path/to/footprint.gpx
bun run scripts/import/applehealth/cli.ts load 2025 /path/to/export.xml
bun run scripts/import/pixiu/refresh.ts 2025 /path/to/pixiu.csv
bun run dev
```

Dashboard 位于 `http://localhost:7011`。ECG、运动路线与导入结果校验的命令见[脚本说明](docs/04-scripts.md)。脚本从仓库根目录运行，Dashboard 脚本从 `dashboard/` 运行；数据库路径依赖这一目录关系。

```bash
bun run lint
bun run typecheck
bun run --cwd dashboard build
bun run --cwd dashboard start
```

Dashboard 的 Node.js 数据库驱动是 `better-sqlite3`。安装后从仓库根目录检查内存数据库；返回 `1` 即表示驱动可用：

```bash
node -e 'const db = new (require("./dashboard/node_modules/better-sqlite3"))(":memory:"); console.log(db.prepare("SELECT 1").pluck().get()); db.close()'
```

当前锁定的包随附常见平台的原生模块，不需要自动安装脚本。若检查失败，按[本地开发说明](docs/07-development.md)定位缺失模块，并仅在需要时构建这个依赖。

## 测试

| 测试层 | 从仓库根目录执行 |
| --- | --- |
| 导入与校验脚本单元测试 | `bun --bun vitest run` |
| Dashboard 单元与组件测试 | `bun run --cwd dashboard ut` |
| Dashboard API 集成测试 | `bun run test:l2` |
| 浏览器冒烟测试 | `bun run test:e2e:bdd` |

脚本测试使用 Bun 的 SQLite 和隔离夹具。API 测试使用模拟依赖，不要求个人数据库。浏览器测试前在 `dashboard/` 执行 `bunx playwright install chromium`；测试会启动端口 `27011` 的服务并检查登录页，不需要真实 Google 登录。

## 技术栈

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?logo=leaflet&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| 数据处理 | TypeScript、Bun、SQLite |
| Dashboard | Next.js、React、Tailwind CSS、Zustand、Recharts |
| 地图与登录 | Leaflet / Carto、Google Maps、Auth.js / Google OAuth |
| 数据库驱动与测试 | bun:sqlite、better-sqlite3、Vitest、Testing Library、Playwright |

## 文档

- [概览与数据结构](docs/00-overview.md)
- [导入和校验脚本](docs/04-scripts.md)
- [Apple Health 数据格式](docs/01-data-structure-apple-health.md)
- [footprint 数据格式](docs/02-data-structure-footprint.md)
- [貔貅记账数据格式](docs/03-data-structure-pixiu.md)
- [品牌资源](assets/brand/README.md)

## 许可证

[MIT](LICENSE) © 2026 Zheng Li
