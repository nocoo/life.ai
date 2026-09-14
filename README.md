# Life.ai

<img src="assets/brand/icon-rounded.png" width="96" alt="Life.ai 水豚标志" />

一个人的生活实录。把健康、足迹、记账和主动推送的记录，汇聚到每天的 24 小时里。

- 网站：<https://life.hexly.ai>（Cloudflare Access）
- 写入：<https://life.worker.hexly.ai/api/ingest>（Connect Bearer token）
- 健康检查：`GET /api/live`，JSON 包含版本与数据库状态。

## 使用方式

时间线按设备当前时区展示，以 24 小时为主干，身体指标与现场地图、运动与生活片刻分列两侧。沿着凌晨、上午、下午、夜晚向下读，可以还原一天的经过。支持选择日期、来源和查看记录详情。只有日期的记录放在全天旁注；小时、分钟、秒精度按原始精度保留。所有存储和比较都使用 UTC。通用无偏移量输入按 UTC 解释；貔貅原始日期已确认为 UTC+8 记账日，按来源规则转换。

跨夜睡眠放在醒来的这一天，显示入睡、起床、实际睡眠与阶段分布，并结合夜间足迹提供有依据的位置提示。步行、爬楼和心率片刻按发生时间展开；心电图用可翻页的完整波形，血压用收缩压／舒张压专属卡片。锻炼路线与重叠的 Footprint 共用地图。GPS 按 5 / 10 km 区域归组，每小时的行迹配一张小地图；到达区域后的第一张展开，后续同一区域的地图默认收起，离开再回来重新展开。换日恢复自动展开。地图编号居中，采样点和区域圆圈用慢、中、快三档速度着色。天气和日出日落取自当天的参考位置，太阳时刻按本地时间插入时间线。日出日落首次成功获取后永久缓存到 D1，重复查看与日记生成共用缓存。

「时间线 / 位置记录 / 账目记录 / 其他记录」共用当天数据与来源筛选，原始记录只在打开对应页签时以分页表格展示，每页最多 50 条。完整健康维度在首次打开记录页签时加载，路线与心电附件单独按需读取，返回已读页签使用缓存。右侧集中放全天足迹、天气、一日累计、每日账目与日记。点击「写日记」，结合健康、足迹区域、天气、天光与消费片段写下当天的故事，结果保存到 D1。再次生成前可填写修改意见，成功后覆盖，失败保留原文；数据变化后会提示更新。默认使用 Workers AI，也可以在「AI 设置」配置其他模型。侧栏使用 lizheng.blog 的姓名与头像服务。

「数据管理 → 数据概览」统一显示各来源的覆盖天数、记录数、数据行和正文大小，以 Recharts 和 Basalt 图表展示按月记录量与来源对照。「Footprint」独立页面导入 GPS `.gpx`，浏览器后台线程解析完整文件后，以一个 UTC 日一行紧凑 JSON 保存全部点。同一天由新文件整日替换，未出现的日期保留；重导相同内容不会增加副本，也不会改变内容时间戳。覆盖日历可以跳转到每日地图。

「Apple Health」独立页面接受完整导出 ZIP 或解压目录，以 UTC 日 × 健康维度无损压缩；完整保留原始属性、嵌套元数据、多设备观测、锻炼 GPX、心电 CSV 和 CDA。先在浏览器后台线程完整校验，再提交；同一天的全部维度由后一次导入替换，未出现的日期保留。统计统一放在数据概览。详情见 [Apple Health 数据与核验](docs/17-apple-health.md)。

「貔貅记账」独立页面接受一个或多个原始 CSV，以 UTC+8 的记账日保存完整九列，每天一行 JSON，重复、零金额与多币种均保留。同日整份覆盖、未出现的日期保留；消费与收入按原始分类计算，转账和还款等另列。账目放在全天卡片，原始流水在「账目记录」页签查看。详见 [貔貅导入与核验](docs/22-pixiu-daily-import.md)。

日记 `.json` / `.ndjson` 使用「日记导入」入口，普通 JSON 上限 10 MiB。导入可取消，已完成的批次会保留。本机也可以用共享 CLI 或 `life-data-import` Skill 导入 Footprint、Apple Health 和貔貅：

```sh
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json
bun run data:import --provider apple-health --file /path/to/导出.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --dry-run --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --target production --json
```

生产主域名使用 `cloudflared` 获取当前用户的 Access 凭据。已运行 `dev:prod` 时，可追加 `--base-url https://life.dev.hexly.ai`；目标仍必须是 `production`，CLI 会核对实际绑定。

在「Connect」为数据来源命名并创建只写 token。明文只显示一次，保存在自己的推送端。同一个 token 在同一 UTC 小时的后续请求会替换该小时的标题、内容和数据，也支持未来的小时。撤销 token 不会删除历史记录。

## 本地开发

需要 Bun 1.4 与 Node.js 22.20+。

```sh
bun install --frozen-lockfile
bun run prepare
bun run db:migrate
bun dev
```

打开 <https://life.dev.hexly.ai>，Caddy 已映射至 `127.0.0.1:7011`。直接地址是 `http://127.0.0.1:7011`。本地明确使用 development 配置和本地 SQLite；不需要 Google OAuth。生产是 Worker `life` 与 D1 `life`。

本地连接生产数据使用 `bun run dev:prod`：同一 Caddy 地址和端口，D1 明确绑定远程 `life`，网页中的导入与 Connect 操作也会写生产数据。该命令需要本机 Wrangler 登录；自动化测试始终使用独立本地 SQLite。

依赖安装禁止自动运行生命周期脚本，项目 hooks 通过 `bun run prepare` 显式安装。不要提交本地 `.env*`、`.dev.vars*`、数据库或生成的测试结果。

## 架构与验证

Vite + React + Basalt 2.1.7，Biome 与 TypeScript strict。MVVM：`src/models` 管时间和导入，`src/services` 管 HTTP，`src/viewmodels` 管状态，Views 只渲染和派发操作；`worker` 管 API、Access 和 D1。

```sh
bun run quality       # 6DQ：L1 / L2 / L3 / G1 / G2 / D1 隔离
bun run test:coverage # statements / branches / functions / lines 均须 ≥95%
bun run test:l2       # 17011，真实 HTTP + Worker + 独立 SQLite
bun run test:l3       # 27011，Playwright + 独立 SQLite
bun run deploy       # 构建、dry run、迁移检查/执行、Worker 部署
```

首次运行浏览器测试前执行 `bunx playwright install chromium`。测试每轮生成独立状态目录、缓存和签名密钥，运行及清理都校验 `_test_marker(env=test)`，不连接远程测试资源。

详见 [文档索引](docs/README.md)、[项目规则](CLAUDE.md)、[重构与上线记录](docs/08-chronicle-rewrite.md)、[每日视图与 AI](docs/12-daily-view.md)、[数据管理与 Footprint](docs/15-data-management.md)、[每日时间线与记录页签](docs/16-daily-context-and-record-tabs.md)。
