# 按天数据源、出行与通勤

2026-09-14。实现仅在 Life.ai；Gecko、Firefly 仓库只读核验。开发地址为 `https://life.dev.hexly.ai/?day=2026-09-10`，继续使用已授权的生产 D1。与 [睡眠阶段图及页面加载](26-sleep-chart-and-loading.md) 一起纳入 2.0.0，最终发布记录见 [GitHub 集成与发布证据](27-github.md#验证与发布)。

## 已核实的项目与接口

| 项目 | 本机位置与代码 | 现有读取契约 |
| --- | --- | --- |
| Life.ai | `/Users/nocoo/workspace/personal/life.ai`；`worker/day-sources.ts`、`src/models/day-sources.ts` | Access 保护的设置与日读取 API，服务端适配两个来源 |
| Gecko | `/Users/nocoo/workspace/personal/gecko`；`apps/web-dashboard/src/app/api/v1/snapshot/route.ts`、`src/lib/session-queries.ts` | `GET https://gecko.hexly.ai/api/v1/snapshot?date=YYYY-MM-DD`，`Authorization: Bearer <API Key>` |
| Firefly | `/Users/nocoo/workspace/personal/firefly`；`src/app/api/posts/route.ts`、`src/data/entities/post.ts` | `GET https://lizheng.blog/api/posts?page=N&page_size=20`，无须鉴权，强制只返回公开发表的文章 |

Gecko 返回未包装的 `{ date, timezone, stats, ai }`。`stats.sessions` 包含 `id`、`appName`、`bundleId`、`windowTitle`、`url`、`startTime`（Unix 秒）、`duration`（秒）。`timezone` 是账号时区。接口拒绝未来日期；跨午夜会裁剪会话时间，保留同一个会话 ID。Life.ai 只读 snapshot，不使用该密钥的同步写入能力。

Firefly 的 `/api/v1/snapshot` 当前不存在；`/api/posts?date=...` 会忽略日期参数，不能当成日期过滤。实际列表返回 `{ posts, total }`，按 `published_at`、`created_at` 倒序。文章包含 `id/title/slug/excerpt/featured_image/human_name/agent_name/published_at/updated_at` 等字段，时间为 Unix 秒。

## Life.ai 集成契约

所有接口经过现有 Access JWT 校验；写入同时校验浏览器 Origin。机器写入域名不开放这些接口。返回沿用 `{ data: ... }` / `{ error: { code, message } }`，均 `Cache-Control: no-store`。

| 方法与路径 | 输入 / 输出 |
| --- | --- |
| `GET /api/settings/sources` | 返回两个来源的 `{ provider, enabled, hasApiKey }`；不返回密钥或密文 |
| `PUT /api/settings/sources/gecko` | `{ enabled, apiKey? }`；首次启用需要 `gk_` 密钥，之后留空保留已存密钥 |
| `PUT /api/settings/sources/firefly` | `{ enabled }`，拒绝不必要的密钥 |
| `DELETE /api/settings/sources/:provider` | 移除连接及该来源缓存；停用则保留已加密密钥 |
| `POST /api/settings/sources/:provider/test` | 已保存且启用的连接；请求体为下方日期查询，返回 `{ provider, success, eventCount, date, message? }` |
| `GET /api/day-sources` | 下方日期查询为 URL 参数；返回 `{ events, sources, configuration }` |

```json
{
  "date": "2026-09-10",
  "timeZone": "Asia/Shanghai",
  "start": "2026-09-09T16:00:00.000Z",
  "end": "2026-09-10T16:00:00.000Z"
}
```

日期、IANA 时区与 UTC 半开窗口必须一致，复用日记查询校验。`events` 是 Life.ai `LifeEvent[]`，来源类型为 `external`；`sources` 每项包含 `provider/state/stale/message?`。启用列表 `configuration` 进入日记内容指纹。

设置页 `/settings/sources` 位于底部 Settings 区域。Gecko 使用隐藏输入框，保存或离页后清空草稿；Firefly 一键添加。两个来源均可测试、停用、移除。

### Gecko 归一化

- 根据返回的账号时区读取覆盖展示窗口的相邻日期；近期/未来查询先用过去一天探测时区，避免上游拒绝未来日期。
- 每个展示时区的钟表小时最多一个卡片，夏令时重复小时合并；跨小时活动按实际相交时间切分。
- 保留同一会话在相邻快照中的不同裁剪片段；相同片段去重，活跃时长按区间并集计算，避免多设备或重复会话累加。
- 排除 `idle/idel`、`idle: true`、锁屏、屏保、截图系统会话；实际 Gecko 会话目前不带 `type`，需识别系统 bundle ID。
- 卡片数据为 `{ type: "computer-activity", activeSeconds, sessionCount, apps: [{ name, seconds, titles }] }`。每应用保留至多 6 个窗口标题，每标题最多 300 字；不缓存浏览 URL。

### Firefly 归一化

- 用公开分页的发表时间定位目标日期，再读取相交页；按 `[start,end)` 精确过滤，按文章 ID 去重。
- 校验总数变化、页长度和发表时间顺序；每次最多 20 页、每页 20 篇，无法完整读取时明确失败，不把部分结果当成成功缓存。
- `occurredAt` 是发表时间，精确到秒；`content` 取摘要或引用描述，最多 4,000 字。`data` 为 `{ type: "published-article", url, image, author }`。
- 原文 URL 沿用 `/YYYY/MM/slug`；图片只使用无内嵌凭据的 HTTPS URL。封面懒加载、失败后隐藏；标题、摘要、作者按文本渲染。
- 分页本身不是原子快照。上游以后若增加真正的日期接口，应替换适配器，不需要改变 Life.ai 时间线或设置页。

建议 Firefly 后续提供公开的 `GET /api/v1/snapshot?date=YYYY-MM-DD&timeZone=Asia/Shanghai`，显式返回 `date/timeZone/start/end/complete` 及 `posts`。每篇至少提供 `id/title/url/summary/authors/publishedAt/updatedAt/images`，时间使用带 `Z` 的 ISO 字符串，图片为 URL/alt 对象数组；按发表时间和稳定 ID 排序。空日返回 200、`posts: []`、`complete: true`，无效日期/时区返回 400；若分页，使用稳定游标并提供 `nextCursor`。这只是建议契约，本次没有为 Firefly 新建接口或修改其代码。

### 持久化与失败处理

`0007_day_sources.sql` 增加 `day_source_settings` 和 `day_source_cache`，已应用到 D1。Gecko 密钥复用现有 AES-GCM 与 `AI_SETTINGS_KEY`，只在 Worker 解密并发送给固定 Gecko 主机；不跟随重定向。上游读取每次最多 4 MiB、单请求 15 秒、总读取 45 秒。

缓存按来源、日期、时区、UTC 窗口和配置版本隔离。近三天缓存 120 秒，较早日期 1 小时。仅完整成功响应入库；配置更新清空缓存，旧的在途请求不能在移除或更新后写回旧配置缓存。成功的其他来源与原有当天数据仍可显示；失败来源有独立提示，有旧缓存时标明沿用旧数据。

时间线先显示本地数据，外部记录就绪后补入，保留已挂载地图。切日取消旧请求；来源过滤与原始记录页复用当天缓存。

## GPS 移动方式与通勤

前端和日记 Worker 共用 `src/models/gps-journeys.ts`，只从有效 UTC 相邻采样推导，不改变原始 GPS 值，也不猜测 GPX 的原始 speed 单位。

- 只用分/秒精度，密集点按约 30 秒归并；保留原始分段、来源边界和断档。相邻间隔超过 5 分钟不连线。
- 低于 2 km/h 视为停等。连续停等不超过 5 分钟可连接前后移动，但不计入移动均速；更长停留拆成两次行程，首尾纯静止不计入。
- 均速为有效移动距离 / 有效移动时间，另算按时间加权的 85 分位速度。忽略超过 450 km/h 的异常边。至少两个移动边、150 米、1 分钟，且离起点曾超过 100 米，避免局部漂移累计成出行。
- 采样不足保留“待判断”。步行候选要求均速 ≤8 且 85 分位 ≤12 km/h；骑行候选要求均速 ≤25 且 85 分位 ≤35；持续至少 3 分钟达到 160 km/h、距离至少 15 km 才提示可能高铁/城际，其余通常为可能乘车。极高速度仍为未知。
- 这些是可解释的速度启发式，尚未匹配道路/铁路。慢跑、骑行、电动车和拥堵车辆有重叠；GPS 不能可靠分辨汽车、公交、地铁或本人驾驶。

命中用户命名的家↔公司/办公室/工作室范围时生成可能的通勤去程/返程。未命名目的地的同日起终点往返，仅在两点相距至少 500 米、回到相近起终点（300 米内）、间隔 90 分钟至 16 小时、目的地附近实际采样覆盖至少 30 分钟时，提示可能通勤；重叠设备不重复计算采样时间。已命名的非工作目的地不按这个规则改成通勤。定位空档不充当工作停留证据，不依赖常规上班钟点。

每段出行卡片只在开始小时显示一次，之后小时显示回链；各小时地图仍只含该小时采样。卡片显示候选方式、命名起终点、移动均速、距离、移动时间、排除的短暂停等及命中的兴趣点范围。信息面板保留推断依据。

## 日记与原故障修复

日记输入包含 Gecko 应用/窗口、Firefly 标题/摘要/作者/URL/发表时间，以及 GPS 时段、地点/兴趣点、移动均速、停等时间、交通方式与通勤依据。`life-diary-scenes-v7-sources-and-travel` 明确将交通和通勤作为候选解释；电脑前台活动不等于连续工作，发表时间不等于创作开始时间，同段健康运动与 GPS 不重复计为两次出行。

GET 日记只读来源缓存，不调用上游。生成前与生成后均检查启用来源可用性；任一来源失败保留上次日记。来源内容、开关、个人设置、公共上下文与提示词版本都进入输入指纹；新增信息只提示旧稿过期，不自动覆盖日记。

此前“无法加载一天 / An internal server error occurred”复现为 D1 远程绑定读取的瞬时连接故障，发生在 AI 调用之前。`worker/database.ts` 只对已识别的瞬态错误做最多三次有界重试；用于公共读取和明确幂等的日记租约/保存，不重试整个生成请求或重复调用 AI。生成租约为 5 分钟，覆盖两次来源读取、公共上下文与 90 秒模型预算。重试耗尽返回明确的 503。日志不包含 SQL、密钥或原始错误消息。

暗色按钮/日期输入修复位于 `src/styles.css`；地点编辑器先设定地图视图再绘制圆形，避免 Leaflet 初始化异常与闪动；添加地点按钮使用稳定的标题栏布局。

## 核验记录

- Gecko 线上 Bearer 验证成功。9 月 10 日 2,822 段源会话归并成 23 个非闲置小时卡片；Firefly 当天公开文章为 0，不是假定接口失败。
- 9 月 10 日 302 个 GPS 点归为 3 段有效出行，1 段命中已命名家/工作地点，另 1 段排除约 3.6 分钟短暂停等。
- 9 月 10 日之前无日记，故障修复后已成功生成并保存一次；集成新增记录后保留原稿并标记过期。后续联调不覆盖该日记。
- 实际浏览器验证 9 月 10 日：23 个电脑活动卡片、3 个出行卡片、1 个可能的通勤卡片；延迟返回数据源后 Leaflet 实例 ID 保持不变，原日记仍在。9 月 11 日：1 个真实文章卡片，原图 1536×1024 成功加载，桌面和手机暗色布局正常，手机无横向溢出，零页面异常、零浏览器写请求。
- 用户提供的 Gecko 密钥已加密存储；两个来源均已启用。不在文档、日志或 Git 中保存真实密钥、轨迹或窗口标题。
- 自动 HTTP/浏览器测试只通过隔离 runner，使用全新本地 SQLite、每次生成的 Access/AI 测试凭据及 loopback Gecko/Firefly fixture，不指向 `dev:prod`。
- 最终 L1：80 个文件、1,496 项测试通过；语句 98.89%、分支 96.31%、函数 99.06%、行 99.27%。L2：27 个真实 HTTP 场景通过。L3：30 个浏览器用例通过，覆盖新来源、跨小时出行、暗色/移动布局与原有导入/日记/地图行为。
- 此阶段严格类型检查、Biome、gitleaks、OSV、生产构建及 Wrangler 部署 dry run 通过。Caddy 开发域名 `/api/live` 返回 `status: ok`、`database: ok`；当时生产 Worker 为 1.7.0。2026-09-15 已随 GitHub 集成发布 2.0.0，最终核验见上述发布记录。
