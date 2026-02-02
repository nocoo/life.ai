# 04 scripts 目录说明

## 目录结构
```
scripts/
├── import/
│   ├── apple-health/
│   ├── footprint/
│   ├── pixiu/
│   ├── db.ts
│   └── schema.sql
├── verify/
│   └── footprint/
└── coverage-check.ts
```

## 导入脚本（import）

### scripts/import/db.ts
- 作用：SQLite 连接与默认数据源配置

### scripts/import/schema.sql
- 作用：数据库 schema（当前用于 footprint）

### scripts/import/footprint/init.ts
- 作用：初始化数据库并写入 schema
- 执行：`bun run scripts/import/footprint/init.ts`

### scripts/import/footprint/load-gpx.ts
- 作用：解析 GPX 轨迹并写入 `track_point`

### scripts/import/footprint/aggregate.ts
- 作用：按日/周/月/年聚合轨迹数据

### scripts/import/footprint/cli.ts
- 作用：统一入口（load/agg/refresh）
- 执行：`bun run scripts/import/footprint/cli.ts <load|agg|refresh> [gpxPath]`

### scripts/import/footprint/refresh.ts
- 作用：初始化 + 导入 + 聚合
- 执行：`bun run scripts/import/footprint/refresh.ts`

### scripts/import/footprint/explore-gpx.ts
- 作用：探索 GPX 结构与时间范围，输出统计摘要
- 执行：`bun run scripts/import/footprint/explore-gpx.ts`

### scripts/import/apple-health/
- 说明：预留用于 Apple Health 导入脚本

### scripts/import/pixiu/
- 说明：预留用于 pixiu CSV 导入脚本

## 校验脚本（verify）

### scripts/verify/footprint/
- 说明：用于对比原始 GPX 与数据库写入结果的一致性校验脚本（待补）

## 其他

### scripts/coverage-check.ts
- 作用：UT 覆盖率检查（阈值 90%）

## 导入操作
### 初始化 + 导入 + 聚合
```
bun run scripts/import/footprint/refresh.ts
```

### 分步骤执行
```
bun run scripts/import/footprint/init.ts
bun run scripts/import/footprint/cli.ts load
bun run scripts/import/footprint/cli.ts agg
```

### 使用默认 npm scripts
```
bun run db:init
bun run db:load
bun run db:agg
bun run db:refresh
```
