# 开发脚本

当前入口以根 `package.json` 为准。网页和 `import-data.ts` 共用 Footprint、Apple Health、貔貅的解析与幂等导入模块，支持 `--dry-run`、显式数据库目标和本机目录；`life-data-import` Skill 调用同一 CLI。

`verify-health-import.ts` 与 `verify-pixiu-import.ts` 只读核对生产导出的本地 SQLite 快照，检查原始字段、附件、精确金额、重复导入和其他 provider 的完整性。原始数据和核验报告保存在仓库外。

`eval-diary.ts` 从只读快照构造真实日记证据，用相同模型比较新旧 prompt，并做调换顺序的匿名评审；不加 `--run` 时只准备材料。真实数据与输出保存在仓库外，不写生产日记。见 [日记评测](../docs/23-diary-eval.md)。

`diary-eval-cases.json` 是已完成主评测的冻结虚构集；`diary-personal-context-cases.json` 单独检查个人地点、缺失睡眠、非常规作息、时区和实际观测优先。后一组使用结构化 GPS 与睡眠段，共用生产位置匹配和跨夜睡眠格式化，公共 API 使用固定空结果。`--baseline-ref 3d903d3` 对照 v4；运行器加载该提交的原始 system prompt，给双方相同的个人背景，不以缺失指令或不同资料制造优势。

`run-tests.ts` 启停独立端口、SQLite 与本机 API fixture，保持开发服务运行；`deploy.ts` 构建、dry run、检查并应用迁移后部署。旧 Node/SQLite 生产导入与聚合命令已移除。

详见 [导入与脚本](../docs/04-scripts.md)、[开发与部署](../docs/07-development.md)、[6DQ](../docs/11-quality.md)。
