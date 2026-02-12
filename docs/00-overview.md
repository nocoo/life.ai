# 00 概览

本项目用于统一管理健康数据、足迹数据与记账数据，并提供结构化存储与可视化基础能力。当前包含 Apple Health 数据结构梳理、footprint 轨迹数据的数据库化与聚合方案，以及 pixiu 记账导出数据的结构说明。

## 文档导航
- `docs/01-data-structure-apple-health.md`：Apple Health 数据结构说明
- `docs/02-data-structure-footprint.md`：footprint 数据结构与数据库 schema
- `docs/03-data-structure-pixiu.md`：pixiu 记账数据结构说明
- `docs/04-scripts.md`：scripts 目录结构与导入说明
- `docs/05-basalt-migration.md`：basalt UI 迁移工作计划

## 数据库文件
项目使用 SQLite 数据库存储结构化数据，位于 `db/` 目录：
- `db/applehealth.sqlite`：Apple Health 数据（record、correlation、workout、activity_summary、ecg、workout_route）
- `db/footprint.sqlite`：足迹数据（track_point、track_day_agg、track_week_agg、track_month_agg、track_year_agg）
- `db/pixiu.sqlite`：记账数据（pixiu_transaction、pixiu_day_agg、pixiu_month_agg、pixiu_year_agg）

## 关键约定
- 数据源与数据库命名统一为对应模块名
- 主要脚本入口在 `scripts/`
- Dashboard 前端项目在 `dashboard/`
