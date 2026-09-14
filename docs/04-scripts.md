# 04 导入与脚本

Footprint 在“数据管理 → Footprint”导入，也支持本机 CLI 和 `life-data-import` Skill。两种入口共用流式解析、UTC 日归并与上传客户端；每个 UTC 日保存一行紧凑 JSON，每批最多 32 日且序列化请求体不超过 768 KiB。新文件出现的日期整日替换，未出现的日期保留。详情见 [15 数据管理](15-data-management.md)。

Apple Health 在“数据管理 → Apple Health”导入完整 ZIP 或解压目录；浏览器 Worker + IndexedDB 和本机临时磁盘共用解析与上传模块，每个 UTC 日按维度无损压缩，整日替换，附件单独保留。详见 [17 Apple Health](17-apple-health.md)。

貔貅在 `/data/pixiu` 选择一个或多个 CSV，CLI 也接受年度 CSV 目录，整份输入先校验再上传。每个 UTC+8 来源日一行完整 JSON，后导入的同日快照整体覆盖。详情见 [22 貔貅导入](22-pixiu-daily-import.md)。

日记保留 `/imports` 网页入口，按最多 100 条且小于 512 KiB 的批次提交；文件每次读取 64 KiB。失败或取消前已提交的批次保留，重新导入使用稳定键覆盖。

| 来源 | 支持格式 | 映射 |
| --- | --- | --- |
| Apple Health | 完整 ZIP / 解压目录 | 独立页面或 CLI；完整 XML 节点、睡眠、锻炼、关联读数、ActivitySummary、GPX、ECG、CDA |
| Footprint | GPX | 独立页面或 CLI；保留全部 trkpt / rtept / wpt、时间、经纬度、海拔、速度、方向及原始分段 |
| 貔貅 | UTF-8 CSV | 日期、交易分类/类型、流入/流出金额、币种、资金账户、标签、备注 |
| 日记 | JSON 对象/数组，NDJSON/JSONL | 通用实录字段；普通 JSON 限 10 MiB |

Apple Health 选择完整导出包；仅上传 `导出.xml` 会遗漏附件，因此不支持这一方式。旧 `/api/imports` 的 Apple Health 写入返回 410。GPX 使用 Footprint 独立入口，注意文件中的每个 UTC 日会整日替换。貔貅 CSV 支持 BOM、引号、换行和同内容重复交易，全部原始单元格与重复次数均保留，文件改名不改变内容哈希。旧 `/api/imports` 的貔貅写入返回 410。XML 外部实体不会被解析或下载。

```sh
bun run data:import --provider apple-health --file /path/to/导出.zip --dry-run --json
bun run data:import --provider apple-health --file /path/to/apple_health_export --target production --json
bun run data:import --provider footprint --file /path/to/track.gpx --dry-run --json
bun run data:import --provider footprint --file /path/to/track.gpx --target production --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --dry-run --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --target production --json
```

直接上传生产主域名使用当前用户的 Cloudflare Access 身份，CLI 内部取得 token，日志只返回统计和回执。已授权的 `dev:prod` 服务可通过 `--target production --base-url https://life.dev.hexly.ai` 写生产 D1；`--target local` 只允许真正的本地数据库。HTTP 错误会保留已提交批次，可重跑完整输入。原始文件和坐标不进入 Git。

日记示例：

```json
[
  {"key":"day-1","date":"2026-09-13","title":"旅行第一天","precision":"day"},
  {"key":"reading-1","occurredAt":"2026-09-13T08:30:00+08:00","precision":"minute","title":"阅读","data":{"pages":12}}
]
```

`occurredAt` 也接受 `timestamp` / `date` 别名；`id` 可作为 `key`。建议推送端提供稳定的 `key`；省略时根据记录内容生成摘要。`content` 最多 8000 字符、`data` 最多 32 KiB。API 具体约束见 [10 Worker API](10-worker-api.md)。

当前脚本：`run-tests.ts` 自动启停隔离的 L2/L3；`local-db.ts` 校验测试标记并执行本地 SQL；`security.ts` 扫描工作树和锁文件；`deploy.ts` 检查环境、构建、dry run、迁移后部署。旧 `scripts/import` 和 `scripts/verify` 已退役，历史版本见 `6cdb344`。
