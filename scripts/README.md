# 开发脚本

当前入口以根 `package.json` 为准。网页和 `import-data.ts` 共用 Footprint、Apple Health、貔貅的解析与幂等导入模块，支持 `--dry-run`、显式数据库目标和本机目录；`life-data-import` Skill 调用同一 CLI。

`verify-health-import.ts` 与 `verify-pixiu-import.ts` 只读核对生产导出的本地 SQLite 快照，检查原始字段、附件、精确金额、重复导入和其他 provider 的完整性。原始数据和核验报告保存在仓库外。

`run-tests.ts` 启停独立端口、SQLite 与本机 API fixture，保持开发服务运行；`deploy.ts` 构建、dry run、检查并应用迁移后部署。旧 Node/SQLite 生产导入与聚合命令已移除。

详见 [导入与脚本](../docs/04-scripts.md)、[开发与部署](../docs/07-development.md)、[6DQ](../docs/11-quality.md)。
