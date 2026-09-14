# 貔貅记账：完整日包与每日账目

用户已确认所有貔貅日期均为北京时间 UTC+8。`/data/pixiu` 接受一个或多个原始 CSV，CLI 接受 CSV 或包含年度 CSV 的目录。它们共用 `src/models/pixiu.ts`、`src/services/pixiu-client.ts` 和现有 provider 导入会话。原「导入」页面仅保留 Journal；旧 `POST /api/imports` 的 Pixiu 写入返回 410。

## 存储与日期

复用 `provider_days`，每个有记录的来源记账日一条 JSON 内容行，不另建逐笔流水表。九列表头只存一次，所有单元格以原始字符串存入 `rows`，包括逗号、换行、空字符串、零金额和完全相同的多笔流水。保留日内原始顺序，不承诺还原 CSV 的引号或换行编码字节。

| 字段 | 含义 |
| --- | --- |
| `utc_day` | 技术日期键：原始 `sourceDate` 编码为 UTC 零点，符合已有表的整 UTC 日约束 |
| `first_at` / `last_at` | 真实 UTC 账期起点 / 最后毫秒，即 `utc_day - 8h` 与起点加 24h 减 1ms |
| `data_json` | `v: 1`、`precision: day`、`sourceDate`、`timeZone: Asia/Shanghai`、`utcOffsetMinutes: 480`、九个 `columns` 和完整 `rows` |
| `summary_json` | 每币种 × 原始交易分类的条数、流入与流出最小货币单位整数 |
| `content_hash` | SHA-256，包含全部原始字段及重复次数；忽略文件名、导入时间和仅有行顺序的变化 |

例如 `2026-09-14` 的账期是 `[2026-09-13T16:00:00Z, 2026-09-14T16:00:00Z)`。它始终作为一份全天账目，归属于包含账期起点的那个展示日；切换时区不会让同一笔钱在相邻两天重复计入。原始记账日期在详情和账目表中保留，不推断交易发生时间，也不按时长分摊金额。

读取按 `(source_id, utc_day)` 索引限制日期范围。`GET /api/events` 首页携带 `pixiuDays`，运行时还原少量虚拟全天事件，后续分页不重复日包。生产实际最多 28 笔/天，直接解析小 JSON；时间线不挂载账目表或完整健康原始表。

## 完整覆盖与复用

整个文件选择先完成解析、金额与日期校验，再执行写入。每次最多 32 MiB，日包正文与汇总不超过 512 KiB，单日最多 10,000 笔；输入越界明确拒绝，不静默截断。

导入沿用五分钟 provider 租约、递增批次号、原子批次和回执。每批最多 32 天 / 768 KiB。同一天后一次完整快照覆盖前一次，未包含的日期保留。当前内容相同不改写正文、哈希或内容时间戳；A → B → A 恢复 A。仅重排行序保留此前存储顺序。多文件含同日相同快照只取一份；同日内容冲突拒绝整次预览，需按期望覆盖顺序分次导入，避免误把两份日快照相加。

已经提交的批次不会随取消回滚，重新提交完整选择即可继续。只有本次覆盖的日期才会清理旧逐笔 Pixiu 行。生产导入前快照确认旧 Pixiu 行数为 0。

| API（均需 Access 与应用域名） | 用途 |
| --- | --- |
| `POST /api/data/pixiu/imports` | `{fileName,totalDays,totalRecords,channel,target}`，校验目标后创建会话 |
| `PUT /api/data/pixiu/imports/:id/batches/:batchId` | `{days}`，重算可信哈希、范围、条数和金额后原子写入 |
| `POST /api/data/pixiu/imports/:id/finish` | `{status: complete或cancelled}`，完整时核对清单与累计回执 |
| `GET /api/data/pixiu/days?start=ISO&end=ISO` | 最多 32 天的 UTC 展示窗口，返回归属窗口的完整来源日包 |

`/api/data/target`、`/api/data/overview` 与其他 provider 共用。Ingest 域名和只写 Connect 无权导入或读取。

## 阅读与日记

右侧「一日账目」展示消费、日常收入、分类与账本备注。「其他资金往来」可展开查看转账、还款、投资和余额调整等原分类。不同币种分别显示；只有「日常支出」的流出计为日常消费，该类流入单列，不能自动称为退款。金额以精确分值计算，显示时才格式化。设备、来源与账户等辅助解释放在信息面板。

点击「查看原始账目」进入按需挂载的「账目记录」Tab，完整九列和详情可查，每页 50 行，保留重复项。该 Tab 不触发全量健康维度请求。全部 provider 的累计覆盖、条数、正文大小和内容行统计集中在「数据概览」。

日记读取全部日账目，消费片段可与睡眠、健康活动、位置、天气和天光一起写进当天的故事，但不得把只有日期的消费配到具体时刻、定位或同伴。生成、反馈与覆盖规则见 [日记证据与生成](21-diary.md)，公共 API 缓存见 [D1 公共上下文缓存](20-public-context-cache.md)。

## 本机导入和独立核验

```sh
bun run data:import --provider pixiu --file /path/to/貔貅记账 --dry-run --json
bun run data:import --provider pixiu --file /path/to/貔貅记账 --target production --json
# 已启动 dev:prod 时，仍需明确 production，并可使用 Caddy 地址
bun run data:import --provider pixiu --file /path/to/貔貅记账 --target production --base-url https://life.dev.hexly.ai --json
```

`life-data-import` Skill 调用同一 CLI。不可绕过 codec 直接插 SQL。导入选择由真实 `/api/data/target` 验证，`dev:prod` 的本机地址仍写生产 D1。

2026-09-14 全量预检查：7 份文件、930,961 原始字节，8,690 笔、1,832 个记账日，2020-01-12 至 2026-09-14；内容日包及汇总合计 1,837,604 字节。133 条双零流水、99 次额外重复完整保留。正文大小与生产 D1 物理大小不同，费用估算背景见 [原始分析](19-pixiu-import-analysis.md)。

`scripts/verify-pixiu-import.ts` 独立解析原始 CSV，与生产导出的本地 SQLite 快照比较每个单元格、日期、日内顺序、重复次数、精确金额、元数据、哈希和导入回执，并对原有 Footprint/Health 的内容与时间戳作前后指纹比对。重复导入还需核验 1,832 天均未变，以及正文时间戳未变。源文件、快照和明细核验报告仅保存在本机私有目录，不进入 Git。

## 生产导入与验证（2026-09-14）

已将 Downloads 的 2020–2026 年七份原始 CSV 完整导入生产 D1 `life`，并以同一选择再次导入。两次均通过共享 CLI → 应用 provider API → D1 日包路径，使用用户已授权的 `dev:prod` 与 Caddy 地址，目标明确为 `production`。

| 核验项 | 结果 |
| --- | --- |
| 首次导入 | 新增 1,832 天，8,690 笔；更新 0 天 |
| 完整重复导入 | 新增 0、更新 0、未变化 1,832 天 |
| 原始内容 | 所有九列、顺序、133 条双零流水、99 次额外重复均匹配 |
| 金额 | 按币种、分类、类型、账户的整数分值核对一致，不混合币种 |
| 内容载荷 | 日 JSON 与汇总合计 1,837,604 字节，1,832 条内容行 |
| Footprint | 670,191 个点 / 1,625 条日记录，内容和时间戳未变 |
| Apple Health | 1,841,302 条事实，内容和时间戳未变，全部附件保留 |
| D1 实际总大小 | 重复导入后 158,007,296 字节；较导入前增加 2,625,536 字节，包含新表、索引和公共缓存 |

独立核验器不调用生产 Pixiu parser：用 PapaParse 与 BigInt 建立金额和原文 oracle，另用 Python CSV／Decimal 交叉核对。分别比较导入前、导入后与重复导入后的生产快照，`matched`、`otherProvidersUnchanged` 和重复导入的 `pixiuIdempotent` 均为 `true`。临时文件位于本机私有 `/tmp/life-pixiu-20260914`；明细不写入仓库。

真实 Google Chrome 通过 Caddy `https://life.dev.hexly.ai` 验证生产数据：数据概览与貔貅页面显示累计统计；2026-09-13 的九笔账目显示在全天卡片与独立九列表格中，24 小时时间轴保留。1920 px 与 390 px 视口通过检查，无横向溢出或浏览器异常。

同日真实太阳 API 首次请求后产生一条 183 字节的 D1 结果；再次访问返回相同内容，`created_at` 未变。实测首次约 1,467 ms，之后约 160–176 ms；这些是本次请求耗时，不作为性能承诺。隔离 HTTP 测试另外验证三次并发和重复读取合计只调用一次上游。天气、地点缓存与已保存日记共用同一公共上下文服务。

## 1.6.0 发布

2026-09-14 部署到 Worker `life`，版本 ID `58414787-688d-43f5-b904-9457b66488a2`。生产已应用 `0005_public_context.sql`；部署前查询确认无待执行迁移，构建和 Wrangler dry run 成功。Worker 上传量约 1,646 KiB，gzip 359 KiB，部署报告启动耗时 26 ms。

| 检查 | 结果 |
| --- | --- |
| L1 | 69 文件、1,320 测试通过；语句 98.96%、分支 96.70%、函数 98.91%、行 99.34% |
| G1 | strict TypeScript 与 Biome 通过 |
| L2 | 25 个场景通过，真实 Worker HTTP + 全新隔离 SQLite + 本机 AI／公共 API fixture |
| L3 | 21 个浏览器用例通过，覆盖健康／GPS 保留、貔貅导入与账目 Tab、日记反馈、响应式和可访问性 |
| G2 | gitleaks 与 OSV 检查通过 |
| 生产健康 | 两个域名的 `/api/live` 均返回 200 JSON、版本 1.6.0、`database: ok` |
| 认证边界 | 未登录的应用页面与数据 API 跳转 `nocoo.cloudflareaccess.com`；写入域名的页面、记录、导入读取、日记和公共上下文 API 均返回 404 |
| 本地预览 | Caddy 首页 200，开发 Worker 1.6.0、生产 D1 正常，7011 保持运行 |

浏览器和自动测试使用独立状态。生产数据核验、真实地图／日记预览和部署健康检查的明细日志在本机私有临时目录；不会把账本、健康数据或坐标提交到 Git。
