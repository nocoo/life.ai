# Life.ai 文档

当前版本以个人生活实录为核心：UTC 记录、多来源导入与 Connect 写入、本地 24 小时时间线。

| 文档 | 内容 |
| --- | --- |
| [00 产品与架构](00-overview.md) | 单人数据集与 MVVM 分层 |
| [01 Apple Health 数据](01-data-structure-apple-health.md) | 原始导出格式参考 |
| [02 GPS 数据](02-data-structure-footprint.md) | GPX 格式参考 |
| [03 貔貅数据](03-data-structure-pixiu.md) | CSV 字段参考 |
| [04 导入与脚本](04-scripts.md) | 当前导入格式与命令 |
| [05 Basalt 初次迁移](05-basalt-migration.md) | 0.2.x 历史记录 |
| [06 Basalt 整理](06-basalt-modernization.md) | 0.2.x 历史记录 |
| [07 开发与部署](07-development.md) | 环境、端口、D1、Access |
| [08 重构记录](08-chronicle-rewrite.md) | 产品/API 契约与实际验证 |
| [09 Basalt UI](09-basalt-ui.md) | 当前组件使用与界面整理 |
| [10 Worker API](10-worker-api.md) | 认证、接口与数据库 |
| [11 质量与隔离](11-quality.md) | 6DQ、运行方法和隔离边界 |
| [12 每日视图与 AI](12-daily-view.md) | 足迹、健康、运动、收支、作者资料与每日总结 |
| [13 时间线设计](13-story-timeline.md) | 中轴与两侧枝条、时段叙事、关联地图、移动阅读与 1.2.0 发布 |
| [14 Footprint 导入评估](14-footprint-import-analysis.md) | 实施前全量 GPX 实测、D1 占用与费用、UTC 日包选型 |
| [15 数据管理与导入](15-data-management.md) | 概览与 provider 独立页面、整日替换、网页与本机共用导入、1.3.0 发布及全量生产数据核验 |
| [16 每日环境与记录页签](16-daily-context-and-record-tabs.md) | GPS 区域与速度、小时地图、天气及日出日落、Basalt/Recharts 整理、原始记录懒加载分页 |
| [17 Apple Health 完整导入](17-apple-health.md) | 原始数据完整性、UTC 日与维度压缩、跨天睡眠、心电图/血压、锻炼路线合并及生产核验 |
| [18 每日卡片](18-daily-card-design.md) | 卡片材质、颜色、图标、辅助信息与全天布局 |
| [19 貔貅原始分析](19-pixiu-import-analysis.md) | CSV 实测、UTC+8 日期与 D1 存储选型 |
| [20 公共环境缓存](20-public-context-cache.md) | 日出日落永久缓存、天气与 GIS 区域名称 |
| [21 每日日记](21-diary.md) | 全来源证据、叙事 prompt、修改意见与持久化 |
| [22 貔貅完整导入](22-pixiu-daily-import.md) | 日包存储、全天账目、网页/CLI 导入与生产核验 |
