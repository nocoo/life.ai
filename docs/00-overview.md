# 00 产品与架构

Life.ai 是一个人的生活实录。一天分成 24 个本地小时，把来自健康、足迹、记账和主动推送的记录放回它们发生的时间。

## 时间和来源

数据库存 UTC 毫秒，API 返回 ISO `Z`。没有偏移量的时间按 UTC 处理；设备时区只影响展示和日期选择。保留 day/hour/minute/second 精度：仅有日期的记录锚定 UTC 午夜，在包含该时刻的本地日期显示为全天记录。区间可以跨多个小时；夏令时日仍有 24 个钟点标签，标明跳过或重复。

导入键是来源与稳定外部键。Connect 键是 token 对应来源与 UTC 小时。同一键再次提交会覆盖内容，Connect 不限制未来时间。Access 只认证入口；数据不按 email/subject 分区。

每日页保留地图、健康、运动和收支概览。来源筛选作用于时间线和这些概览；AI 总结始终读取所选本地日期的全部来源，由用户手动生成并保存。数值按完整事件集合汇总，叙事使用有界采样，尊重原始时间精度。详见 [12 每日视图与 AI](12-daily-view.md)。

## 分层

| 层 | 路径 | 责任 |
| --- | --- | --- |
| Model | `src/models` | UTC、精度、日时间线、流式导入、共享类型 |
| Service | `src/services` | HTTP、分页、错误与取消 |
| ViewModel | `src/viewmodels` | 与 DOM 无关的状态及操作 |
| View | `src/views`、`src/components` | Basalt 页面、可访问交互、响应式布局 |
| API | `worker` | Access JWT、Connect、D1 SQL、主机隔离 |

一个 Vite 构建同时产出 SPA 和 Worker。生产不运行 Node 服务，数据库使用 D1 `life`。Google OAuth、Next.js 和旧本地 SQLite 服务已移除；旧实现可在 Git 提交 `6cdb344` 查看。
