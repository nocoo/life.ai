# 每日视图与 AI 总结

本轮在 `main` 补齐每日阅读体验：侧栏 logo 在展开/折叠时保持相同坐标，左下角显示 lizheng.blog 的姓名与头像，每日页恢复足迹地图、健康、运动和收支概览，并增加可保存的 AI 总结。

## 数据与显示

- 时间线、足迹与数值概览使用相同的半开 UTC 日期窗口。日期选择在浏览器本地时区转换；服务端验证总结窗口确实对应所选日期和 IANA 时区，包括夏令时。
- 汇总使用原始事件列表，避免一条跨小时记录因在时间线重复展示而重复累计。健康数量按导入单位换算；跨日数量按区间占比计入，睡眠与站立时长采用区间并集。
- GPS 支持 GPX 导入的经纬度字段和 Connect `data.points` / `data.trackPoints` 数组。坐标范围、UTC 时间和日期边界均检查。不同来源、30 分钟以上断点、日期精度位置与经度跨越日期线时分段，不据此推测中间行程。距离只计算连续已记录轨迹。
- 收支按币种分别汇总，转账单列。睡眠分期可能来自重叠设备记录，睡眠总时长使用并集。数量是导入样本的汇总，不推测缺失数据；每日活动环数据仅在相应明细缺失时回退使用。
- 现有 24 小时时间线、全天记录、来源筛选、逐条原始数据详情继续保留。地图使用 Leaflet 与 OpenStreetMap，无需 Google 登录或地图密钥。

## 作者资料

参考 surety，Worker 只使用已认证会话邮箱，将其 trim/lowercase 后 SHA-256，查询 `https://lizheng.blog/api/authors/profile?hash=…`。只接受安全 HTTPS 头像 URL；响应限制 16 KiB，2.5 秒超时。失败、未知邮箱或不合法资料回退到会话邮箱和姓名首字母，不影响认证和页面读取。资料通过私有 `/api/session` 返回。

## AI

默认使用 Cloudflare Workers AI 绑定与 `@cf/qwen/qwen3-30b-a3b-fp8`，无需另填 API key。参考 lyre，通过 `@nocoo/next-ai` 与 AI SDK 支持其他内置服务商及自定义 OpenAI / Anthropic 协议端点。模型配置、连接测试、每日总结均在 Access 之后，机器写入域名全部拒绝。

| 接口 | 契约 |
| --- | --- |
| `GET /api/settings/ai` | `AiSettings`，只返回 `hasApiKey`，不返回密钥 |
| `PUT /api/settings/ai` | 完整 `AiSettingsInput`；省略 key 仅在同一服务商/端点/协议/认证方式时保留旧 key |
| `POST /api/settings/ai/test` | 测试已保存的配置，不写生活记录 |
| `GET /api/day-summary` | 查询参数 `date`、`timeZone`、`start`、`end`；返回总结、记录数与过期标记 |
| `POST /api/day-summary` | 相同字段的 JSON；生成或重新生成，成功后保存 |

共享契约位于 `src/models/ai.ts`。总结涵盖当日全部来源，独立于页面当前来源筛选。生成必须由用户触发，不在加载页面或导入时自动调用模型。模型只收到有界的事件样本与全量数值汇总，不提供工具；提示要求简体中文、尊重日期精度、不补写未记录的地点或健康诊断。

D1 `0002_daily_ai.sql` 新增单人 AI 配置、按日期/时区保存的总结和生成租约。外部 API key 使用 AES-GCM 加密，`AI_SETTINGS_KEY` 是独立的 Worker secret，不提交至仓库。生成失败保留上次成功内容；相关记录变化后提示重新生成。

记录每 200 条读取一页，并用增量 SHA-256 覆盖完整内容、数据、精度、起止时间、更新时间与来源元数据；只保留当前页和聚合状态。叙事先保留各来源每小时的首尾事件，再限制为最多 32 个来源、64 个代表事件。日期精度另设采样区，进入提示时仅显示日期。提示中的时间已转换为所选时区；所有查询、分桶、比较和摘要输入指纹仍使用 UTC。

生成租约持续 90 秒，模型调用上限 45 秒，连接测试上限 15 秒。保存时用同一条 SQL 验证租约 token 和有效期，丢失租约返回 409；清理只删除自己的租约。模型返回后重新计算指纹，生成过程中收到新记录也会标记过期。前端丢弃旧日期的晚到响应，返回同一天时会重新读取配置和摘要。

外部地址要求 HTTPS 域名，拒绝凭据、query、fragment、IP 字面量和内部主机名。只有经过数据库 marker 验证的测试环境可使用指定回环地址。共享 `next-ai` 提供方注册表，直接创建 AI SDK 客户端以约束 HTTP：`redirect: manual` 并拒绝 3xx，响应上限 512 KiB，文本上限 16,000 字符，失败不回显上游异常。Anthropic Bearer 使用 SDK 的 `authToken`，不会同时发送 `x-api-key`。

## 验证与交付

本轮 Codex 负责共享模型、集成审查、工具、测试、发布和文档；grok 完成前端并补齐 AI/profile 单测；pi 提供 Worker 初稿、迁移和模型只读复核。最终实现与文件所有权统一交回 Codex，在主分支集成。

L2/L3 使用独立 SQLite、临时加密密钥和回环地址上的模拟模型，覆盖真实 HTTP → Worker → D1 → 模拟上游链路。自动化测试不调用生产模型，也不向生产 D1 写入测试记录。

2026-09-13 完成的质量检查：

| 检查 | 实际结果 |
| --- | --- |
| L1 | 29 个文件、390 项单测全部通过 |
| 覆盖率 | Statements 99.39%、branches 97.70%、functions 99.61%、lines 99.41%，四项均超过 95% |
| G1 | Web、Worker、工具和测试的严格类型检查通过；Biome 检查 107 个文件，零错误、零警告 |
| L2 | 21 个场景通过，覆盖全部 14 个方法/路径契约，包括外部模型两种协议、加密设置、租约、持久化和过期语义 |
| L3 | 11 个场景通过，包括 logo 展开/折叠坐标、头像加载失败、地图与每日概览、AI 设置/生成/日期竞态、移动端与可访问性 |
| G2 | gitleaks 与 OSV 扫描通过 |
| 构建与部署预检 | Vite 构建、Wrangler dry run 通过 |

版本 **1.1.0** 已部署到 [life.hexly.ai](https://life.hexly.ai)，Worker `life`，发布 tag `v1.1.0`，活动版本 **`5e2657d8-a6a1-4f67-bb87-9c2bb15b06ad`**。Worker 启动时间 13 ms，上传 1410.42 KiB（gzip 298.47 KiB）。生产 D1 `life` 已应用增量迁移 `0002_daily_ai.sql`；`AI_SETTINGS_KEY` 已作为 Worker secret 配置，本地生产数据开发只在忽略的 `.dev.vars.devprod` 中保存对应值。`workers.dev` 和预览 URL 继续关闭。

上线后于 `2026-09-13T11:43Z` 完成九项 HTTP 检查：

| 地址或操作 | 实际结果 |
| --- | --- |
| `https://life.hexly.ai/api/live` | HTTP 200 JSON，`status=ok`、`version=1.1.0`、`database=ok` |
| `https://life.worker.hexly.ai/api/live` | 同样返回正常的 1.1.0 JSON |
| Dashboard 首页、AI 设置 API，无 Access 会话 | HTTP 302 到 `nocoo.cloudflareaccess.com` |
| 机器域名首页、AI 设置、每日总结、实际构建的 JS 资源 | HTTP 404 JSON |
| 机器域名 POST ingest，无 token | HTTP 401，无写入 |

[本地生产数据开发](https://life.dev.hexly.ai) 保持运行，Caddy 转发到 `127.0.0.1:7011`。浏览器使用正常 TLS 校验，确认标题、1.1.0 版本、24 小时和当日摘要可见，无 JavaScript 错误。该环境通过真实 Workers AI 绑定执行连接测试，默认 Qwen 模型成功返回“收到。”；测试只发送固定连接提示，没有写入生活记录或每日总结。OpenStreetMap 公共瓦片请求也返回 HTTP 200。

发布证据位于 `test-results/release/http-1.1.0.json` 与 `test-results/release/dev-production-d1-1.1.0.png`；L1/L2/L3 结果按质量约定保存在忽略的生成目录。生产验证覆盖公开健康检查、Access 入口与拒绝请求；成功签名会话、地图数据和完整 AI 生成/保存流程由隔离 Worker + SQLite 测试验证。没有自动化操作所有者的生产 Access 交互登录，也没有向生产数据库插入测试数据。
