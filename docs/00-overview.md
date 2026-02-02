# 00 概览

本项目用于统一管理健康数据与足迹数据，并提供结构化存储与可视化基础能力。当前包含 Apple Health 数据结构梳理与 footprint 轨迹数据的数据库化与聚合方案。

## 文档导航
- `docs/01-data-structure-apple-health.md`：Apple Health 数据结构说明
- `docs/02-data-structure-footprint.md`：footprint 数据结构与数据库 schema

## 关键约定
- 数据源与数据库命名统一为 `footprint`
- 数据库文件路径：`db/footprint.sqlite`
- 主要脚本入口在 `scripts/db/`
