# 04 导入与脚本

数据导入在网页完成。文件留在浏览器中解析，按最多 100 条且小于 512 KiB 的批次提交；大 XML/GPX/CSV/NDJSON 每次读取 64 KiB。失败或取消前已提交的批次保留，重新导入使用稳定键覆盖。

| 来源 | 支持格式 | 映射 |
| --- | --- | --- |
| Apple Health | `HealthData` XML | Record、Workout、Correlation、ActivitySummary；保留来源属性与起止时间 |
| GPS / footprint | GPX | trkpt / rtept / wpt；需要经纬度和 time，保留海拔、速度等 |
| 貔貅 | UTF-8 CSV | 日期、交易分类/类型、流入/流出金额、币种、资金账户、标签、备注 |
| 日记 | JSON 对象/数组，NDJSON/JSONL | 通用实录字段；普通 JSON 限 10 MiB |

Apple Health 请解压后选 `导出.xml`；CDA 临床文档、ECG 波形 CSV、ZIP 不作为该导入器的输入。运动路线 `.gpx` 可选 GPS 来源导入。CSV 支持 BOM、引号、换行和重复同内容交易；完全相同交易通过文件内出现次数区分，文件改名不改变键。XML 外部实体不会被解析或下载。

日记示例：

```json
[
  {"key":"day-1","date":"2026-09-13","title":"旅行第一天","precision":"day"},
  {"key":"reading-1","occurredAt":"2026-09-13T08:30:00+08:00","precision":"minute","title":"阅读","data":{"pages":12}}
]
```

`occurredAt` 也接受 `timestamp` / `date` 别名；`id` 可作为 `key`。建议推送端提供稳定的 `key`；省略时根据记录内容生成摘要。`content` 最多 8000 字符、`data` 最多 32 KiB。API 具体约束见 [10 Worker API](10-worker-api.md)。

当前脚本：`run-tests.ts` 自动启停隔离的 L2/L3；`local-db.ts` 校验测试标记并执行本地 SQL；`security.ts` 扫描工作树和锁文件；`deploy.ts` 检查环境、构建、dry run、迁移后部署。旧 `scripts/import` 和 `scripts/verify` 已退役，历史版本见 `6cdb344`。
