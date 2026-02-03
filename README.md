# life.ai

本项目用于统一管理健康数据、足迹数据与记账数据，并提供结构化存储与可视化基础能力。当前包含 Apple Health 数据结构梳理、footprint 轨迹数据的数据库化与聚合方案，以及 pixiu 记账导出数据的结构说明。✨

## 🚀 项目主要功能
- Apple Health 导出数据结构梳理
- footprint 轨迹数据落库与多粒度聚合（日/周/月/年）
- pixiu 记账导出数据结构梳理（按年 CSV）
- 可视化前端雏形（Next.js + Tailwind + shadcn）

## 📁 主要目录结构
- `data/`：原始导出数据（不纳入版本控制）
  - `apple-health/`：Apple Health 导出
  - `footprint/`：footprint 导出（GPX）
- `db/`：SQLite 数据库文件（不纳入版本控制）
- `docs/`：文档目录（统一编号）
- `scripts/`：数据处理与数据库维护脚本
- `tests/`：单元测试（UT）
- `dashboard/`：Next.js 前端项目

## 📚 文档树入口
- `docs/00-overview.md`：项目概览与文档导航
- `docs/01-data-structure-apple-health.md`：Apple Health 数据结构
- `docs/02-data-structure-footprint.md`：footprint 数据结构与数据库 schema
- `docs/03-data-structure-pixiu.md`：pixiu 记账数据结构

## 🧭 如何运行
### 后端/脚本
```bash
bun install
bun run db:init
bun run db:load
bun run db:agg
```

### 前端开发服务器
```bash
cd dashboard
bun install
bun dev
```
默认端口：`7013`

### Dashboard 测试
```bash
cd dashboard
bun run ut      # 运行测试 + 覆盖率检查
bun run lint    # 代码检查
bun run build   # 生产构建
```

## 🧪 测试与质量门禁
- UT：`bun run ut`（覆盖率 >= 90%）
- Lint：`bun run lint`
- pre-commit：运行 UT
- pre-push：运行 UT + Lint
- 禁止跳过测试

## ✅ 覆盖率目标
- UT 覆盖率目标：90% 以上
- 不便测试的模块建议拆分后再覆盖

## 🧩 原子化提交要求
- 每个 commit 必须是单一、可回滚的逻辑变更
- 不混合功能、重构与修复
- 变更完成后再提交，保证可构建

## 📝 文档要求（Agent 必读）
- 更新代码必须同步更新相关文档
- README 仅做概览，细节请写入 `docs/` 并按编号维护
- 文档统一中文

## 🧰 Husky 与 hooksPath
- Husky 目录：`.husky/`
- `core.hooksPath` 必须指向根目录 `.husky`
- hooks 会强制执行 UT 与 Lint
