# 公共环境数据缓存

2026-09-14。前端每日视图与 AI 日记共用 Worker 的公共数据服务；成功取得的日出日落存入 D1，重复查看不再请求太阳 API。

## 缓存与存储

迁移 `0005_public_context.sql` 新增 `public_context_cache`，每个环境结果保存一行 JSON。主键是数据类型与缓存键，索引查找不扫描健康、足迹或记账原始数据。

| 类型 | 缓存键 | 有效期 |
| --- | --- | --- |
| 日出日落 | 日期、时区、UTC 日窗口、两位小数经纬度 | 成功且完整时永久保存 |
| 历史天气 | 同上 | 距今超过五天且数据完整时永久保存；不完整时 30 分钟 |
| 近期天气、预报 | 同上 | 3 小时 |
| 地点名称 | 两位小数经纬度 | 成功时永久保存，可跨日期复用 |

日出日落正常响应必须同时包含窗口内的日出与日落，或明确返回极昼／极夜。网络错误、无效 JSON、重定向和缺少太阳事件的半响应不写入永久缓存，后续可重试。高纬度只有单一太阳事件的过渡日同样保持可重试。更换时区或参考位置后使用新的缓存键，避免把另一地点的日出显示到当前时间线上。

缓存命中只读取，不更新时间戳或产生写入。`public_context_leases` 用 30 秒租约协调并发请求，成功写入需校验租约 token；竞争者最多等待约 3 秒，未获得缓存或租约则返回暂不可用，不重复请求上游。租约最终释放，意外中断后可在过期时接替。

## 公共服务

- [Sunrise-Sunset API](https://sunrise-sunset.org/api)：取得相邻 UTC 日期的太阳时刻，再裁剪到用户选择的本地日窗口。展示时转换为当前时区。
- [Open-Meteo](https://open-meteo.com/)：历史天气与近期预报，按 UTC 窗口汇总逐小时天气，附带完整性信息。
- [OpenStreetMap Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/)：日记最多查询四个主要停留区域，使用两位小数坐标、`zoom=12` 和稳定的应用 User-Agent。只取得大致城市／区县，不据此认定具体住所或活动。

Nominatim 的 [使用政策](https://operations.osmfoundation.org/policies/nominatim/) 要求缓存、可识别的客户端及最多每秒一次请求。`public_context_ratelimit` 在 D1 原子领取调用时隙，等待预算最多五秒。太阳与天气请求超时 12 秒，地名请求 6 秒，响应最多 128 KiB，重定向采用 Workers 支持的 `manual` 并拒绝继续跳转。发送给 GIS 的参数只有粗化坐标与查询选项，不包含健康、账目或日记内容。地名查询失败时日记仍可生成，并保留位置不确定性。

## 接口与前端

`GET /api/context/sun` 与 `GET /api/context/weather` 受 Access 认证保护，机器写入域名不可访问。参数为 `date`、`timeZone`、`start`、`end`、`latitude`、`longitude`；日期、时区和 UTC 窗口必须一致，经纬度必须有效。

`src/services/day-context-service.ts` 改为请求这些内部接口，保留原有取消请求与换日竞态处理。AI 使用同一缓存服务；仅查看已保存日记不触发外部 API。日记的数据指纹包括缓存中的环境证据，用来提示数据更新。

## 验证

单元测试覆盖永久重用、不完整结果重试、历史／近期天气有效期、无效输入、响应限制、地名限速与租约竞争。L2 使用真实 Worker、隔离 SQLite 和本机公共 API fixture，核对同时请求及再次查看时的上游调用次数、缓存内容与时间戳。真实生产验证与发布记录见 [貔貅导入](22-pixiu-daily-import.md)。
