# life.ai

本项目用于管理与分析健康与轨迹数据。当前包含两类数据源：Apple Health 与 footprint（原“一生足迹”）。

## 目录结构
- `data/`：原始导出数据（不纳入版本控制）
  - `apple-health/`：Apple Health 导出
  - `footprint/`：footprint 导出（GPX）
- `db/`：SQLite 数据库文件（不纳入版本控制）
- `docs/`：数据结构与规则文档
- `scripts/`：数据处理与数据库维护脚本
- `tests/`：单元测试（UT）

## 数据库与命名规则
- 数据库名与数据源统一为 `footprint`
- 数据库文件路径：`db/footprint.sqlite`
- 所有相关脚本、文档、表结构、查询规则均使用 `footprint`

## 数据库 Schema（footprint）
详见 `docs/02-data-structure-footprint.md` 的 schema 章节。

## 使用方式
```bash
bun install
bun run db:init
bun run db:load
bun run db:agg
```

## 脚本说明
- `scripts/db/init.ts`：创建数据库与表结构
- `scripts/db/cli.ts`：数据库加载与聚合入口（`load`/`agg`/`refresh`）
- `scripts/db/refresh.ts`：一键初始化 + 加载 + 聚合
- `scripts/db/coverage-check.ts`：UT 覆盖率门槛检查

## 测试与质量门禁
- UT：`bun run ut`（覆盖率 >= 90%）
- Lint：`bun run lint`
- pre-commit：运行 UT
- pre-push：运行 UT + Lint

覆盖率要求：90% 以上（UT 需通过覆盖率门槛）。

## Husky 与质量门禁
- Husky 路径：`.husky/`（需要保持 `core.hooksPath` 指向根目录 `.husky`）
- 禁止跳过测试：pre-commit 与 pre-push 均强制执行
- 运行方式：
  - `bun run ut`
  - `bun run lint`
