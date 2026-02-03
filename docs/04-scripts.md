# 04 scripts 目录说明

## 目录结构
```
scripts/
├── import/
│   ├── applehealth/
│   ├── footprint/
│   └── pixiu/
├── verify/
│   └── footprint.ts
└── coverage-check.ts
```

## 导入脚本（import）

### scripts/import/footprint/init.ts
- 作用：初始化数据库并写入 schema
- 执行：`bun run scripts/import/footprint/init.ts`

### scripts/import/footprint/load-gpx.ts
- 作用：解析 GPX 轨迹并写入 `track_point`

### scripts/import/footprint/aggregate.ts
- 作用：按日/周/月/年聚合轨迹数据

### scripts/import/footprint/cli.ts
- 作用：统一入口（load/agg/refresh）
- 执行：`bun run scripts/import/footprint/cli.ts <load|agg|refresh> <year> [gpxPath]`

### scripts/import/footprint/refresh.ts
- 作用：初始化 + 导入 + 聚合
- 执行：`bun run scripts/import/footprint/refresh.ts <year> [gpxPath]`

### scripts/import/footprint/explore-gpx.ts
- 作用：探索 GPX 结构与时间范围，输出统计摘要
- 执行：`bun run scripts/import/footprint/explore-gpx.ts`

### scripts/import/applehealth/
- 说明：预留用于 Apple Health 导入脚本

### scripts/import/pixiu/
- 说明：pixiu CSV 导入脚本

### scripts/import/pixiu/init.ts
- 作用：初始化 pixiu 数据库并写入 schema
- 执行：`bun run scripts/import/pixiu/init.ts`

### scripts/import/pixiu/load-csv.ts
- 作用：解析 pixiu CSV 并写入 `pixiu_transaction`

### scripts/import/pixiu/aggregate.ts
- 作用：按日/月/年聚合 pixiu 数据

### scripts/import/pixiu/cli.ts
- 作用：统一入口（load/agg/refresh）
- 执行：`bun run scripts/import/pixiu/cli.ts <load|agg|refresh> <year> [csvPath]`

### scripts/import/pixiu/refresh.ts
- 作用：初始化 + 导入 + 聚合
- 执行：`bun run scripts/import/pixiu/refresh.ts <year> [csvPath]`

## 校验脚本（verify）

### scripts/verify/footprint.ts
- 作用：校验 GPX 与数据库写入结果的一致性
- 执行：`bun run scripts/verify/footprint.ts <year> [gpxPath] [--json]`

### scripts/verify/pixiu.ts
- 作用：校验 pixiu CSV 与数据库写入结果的一致性
- 执行：`bun run scripts/verify/pixiu.ts <year> [csvPath] [--json]`

## 其他

### scripts/coverage-check.ts
- 作用：UT 覆盖率检查（阈值 90%）

## 导入操作
### footprint 导入流程
1) 初始化数据库
- `bun run scripts/import/footprint/init.ts`

2) 按年份导入数据
- `bun run scripts/import/footprint/cli.ts load <year> [gpxPath]`
- 导入前会删除该年份已有记录，只写入该年份数据

3) 聚合
- `bun run scripts/import/footprint/cli.ts agg`

4) 一键刷新（init + load + agg）
- `bun run scripts/import/footprint/refresh.ts <year> [gpxPath]`

### 使用默认 npm scripts
```
bun run db:init
bun run db:load
bun run db:agg
bun run db:refresh
```

### pixiu 导入流程
1) 初始化数据库
- `bun run scripts/import/pixiu/init.ts`

2) 按年份导入数据
- `bun run scripts/import/pixiu/cli.ts load <year> [csvPath]`
- 导入前会删除该年份已有记录，只写入该年份数据

3) 聚合
- `bun run scripts/import/pixiu/cli.ts agg`

4) 一键刷新（init + load + agg）
- `bun run scripts/import/pixiu/refresh.ts <year> [csvPath]`
