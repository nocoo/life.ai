# GitHub 按日记录

在「设置 → 数据源 → GitHub」填写已有 Personal Access Token，保存时由 Worker 调用 GitHub `/user` 验证并识别账号。设置仅管理凭据与连接状态；查询日期直接沿用当天页面的日期选择，自动读取相应记录。此功能不创建 PAT。

## 查询范围

- 提交使用 `author:<login> author-date:<UTC start>..<UTC end - 1 second>`，显示原始作者时间。GitHub 提交搜索只收录默认分支，私有仓库取决于 PAT 授权。
- PR 使用 `is:pr author:<login>`，分别查创建时间和关闭时间；显示该账号创建的 PR 当天的创建、合并、关闭动作。合并不证明由该账号本人执行，后来的编辑不算当天活动。
- 从 2.0.2 起，Issue 使用 `is:issue author:<login>`，分别查询创建和关闭时间，同样保留各次动作、编号及完整正文；当前状态来自首次查询时的快照，不将后续编辑当作当天活动。
- Release 没有跨仓库的作者/日期搜索接口。先分页读取 `/user/repos` 返回的自有、协作和组织仓库，再读取各仓库全部 Release 分页，仅保留该账号数字 ID 署名、非草稿且 `published_at` 在当天的版本。保留完整发布说明、版本 tag、目标分支/提交及预发布状态。覆盖范围是 PAT 当前可访问且账号具有显式权限的仓库；已经失去权限或已删除的仓库/版本无法还原。
- 复用日期/时区验证器，以 `[start,end)` 裁剪真实 UTC 瞬间，兼容夏令时；以仓库/SHA 或 PR ID/动作去重。
- 每页 100 条，顺序读取全部分页。搜索不完整、超过单次搜索 1,000 条、总数变化、重复或缺页时明确失败，不缓存部分结果。响应上限 4 MiB、单请求 15 秒、整个日读取 45 秒；日快照上限 1 MiB。
- 仓库发现至多 1,000 项，每个仓库至多 1,000 个 Release；分页重复、无效响应或超限时整日失败。每批至多六个仓库并行读取，批内等待全部请求收束后再处理结果，非当天版本在分页时丢弃。首次查询会比仅搜索 Commit/PR 多出仓库及 Release 请求；命中 D1 后全部省去。不能用近期 Events API 的有限记录证明历史日期没有 Release。

参考：[搜索 API](https://docs.github.com/en/rest/search/search)、[提交搜索范围](https://docs.github.com/en/search-github/searching-on-github/searching-commits)、[PR 日期过滤](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)。

Release 参考：[账号有权访问的仓库](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)、[Release 列表](https://docs.github.com/en/rest/releases/releases#list-releases)。历史筛选使用发布时间，不根据创建时间或最近一页提前停止。

## 凭据与缓存

PAT 复用 AES-GCM 与现有 `AI_SETTINGS_KEY`，只由 Worker 解密后发送至固定 `api.github.com`，不跟随重定向。同源设置 API 受 Access、主机及来源检查保护；响应仅返回账号 ID/login 和 `hasApiKey`，不返回 PAT、密文或掩码片段。错误不透传上游正文或网络错误文本。保存成功及离开页面后清空输入，Gecko/GitHub 草稿彼此独立。

Classic PAT 只查公开仓库时无须 scope；包含私有仓库时需要 `repo`。账号识别只读取公开的 ID/login，无须 `read:user` 或 `user:email`，也不需要 `workflow` 或管理权限。`repo` 本身包含写权限，但 Life.ai 只调用读取接口；组织仓库启用 SSO 时，还需授权该 PAT。参考 [GitHub scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) 与 [账号接口](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)。

Fine-grained PAT 选择需要读取的仓库；私有数据需要 Contents、Pull requests、Issues 的只读权限，仓库列表使用自动包含的 Metadata read。GitHub 仍可能限制 fine-grained PAT 对多个资源所有者及组织仓库的访问；以 token 实际授权范围为准。

`0008_github.sql` 保留原数据源配置和密文，扩展 provider 约束及账号字段，新增 `github_day_cache`。

- 缓存键为 GitHub 数字账号 ID、日期、规范化时区和 UTC 窗口，与 PAT 和配置版本无关。完整成功结果永久保存，包括空日；命中不访问 GitHub、不写 D1。用户可通过内容区右上角的[缓存管理](28-cache-management.md)手动清除，下次读取才重新查询。
- 今天同样以首次成功查询为准，不自动刷新。换同账号 PAT、停用/启用、移除后再添加同账号，均复用既有日快照。不同账号及日期窗口分别缓存。
- 移除删除 PAT 与账号配置，保留历史快照；未启用该账号时不展示缓存。
- 原子 D1 租约协调并发首次查询，等待者只查 D1；租约 60 秒后可接管，失败释放未完成行。停用、移除或切换账号后，旧账号的在途请求不能写回；同账号重新保存配置不丢弃正在读取的快照。
- 幂等 SQL 使用有界瞬态重试，保存后读取确认，不重试整个 GitHub 查询。健康检查也复用同一读取重试。

接口沿用 `GET /api/settings/sources`、`PUT/DELETE /api/settings/sources/github`、`POST /api/settings/sources/github/test`、`GET /api/day-sources`。当天页面提交当前日期的窗口；设置没有独立的日期或查询控件。GitHub `/test` 供 API 检查使用，同样遵守缓存，不强制刷新。

## 当天阅读

从 2.0.2 起，同一小时的 GitHub 记录合并成一张卡片，显示实际记录时段、动态总数、仓库数与出现的 Commit/PR/Issue/Release 数量。PR、Issue 按仓库与编号去重计数，详情保留其每次动作。同一编号在不同仓库或不同类型中分别计数；原始事件不被合并删除。

「查看详情」打开独立 Basalt Dialog，按时间列出所有记录，保留秒精度、账号与仓库、完整 SHA、编号、状态、版本 tag、目标分支/提交、原文链接和完整说明。正文按纯文本换行，外链限定 GitHub HTTPS；长内容在弹窗内滚动，标题和右上角关闭按钮留在视口内，Escape 关闭后焦点回到原触发按钮。切日后不会沿用旧时段的弹窗状态。

设置、记录及空日卡片统一采用 Lucide `GitFork`；动作使用 `GitCommitHorizontal`、`GitPullRequest`、`GitMerge`、`GitPullRequestClosed`、`CircleDot`、`CircleCheck` 和 `Tag`。卡片沿用 GitHub 中性色，状态有对应颜色与文字，兼容明暗主题。右上角信息入口解释查询范围、快照状态及缓存；空日不伪造零点事件。

2.0.2 的新查询保留完整 Commit message、PR/Issue body 和 Release notes；超过已有日快照上限仍明确失败，不截断后缓存。旧缓存保持原样，可能没有新增类型、PR 正文或 4,000 字符之后的旧提交说明。需要补齐时，用户在缓存管理中清除该日 GitHub 缓存，再读取该日；打开弹窗本身不会发起 GitHub 请求。

宽屏同一横排的卡片填满所在行高度，仍保留短卡片的自然宽度；手机按时间纵向排列，使用内容自然高度。

日记证据包含账号、仓库、动作、标题、链接和时间，不据此断言连续工作时长或合并操作者；沿用既有输入指纹和旧日记保留机制。

## 验证与发布

自动化测试使用隔离 Worker/SQLite、合成凭据和 loopback GitHub fixture，不使用真实 PAT。

合并远端 Node 运行时与日期导航修复、完成缓存管理和卡片调整后，发布前检查：87 个 L1 文件、1,561 项测试通过，语句 98.92%、分支 96.40%、函数 99.10%、行 99.28%；29 个真实 HTTP 场景、36 个浏览器用例通过。严格类型检查、Biome、gitleaks、OSV、生产构建和 Wrangler dry run 通过。浏览器覆盖明暗状态色、PAT 清空、日期自动查询、横排等高、原文链接、空日卡片、缓存范围及清除重试、手机布局和可访问性。

2026-09-15 已从代码提交 `33d51c5` 部署最终 2.0.0，Worker 版本 `07cb27bd-7d66-4b24-b48b-7fcd475a5d89`。原有 2.0.0 提交和远端 main 提交均保留。

- 生产 D1 应用 `0008_github.sql`，本地 D1 正常执行 `0001` 至 `0008`；两者均无待执行迁移。迁移前后，既有两项数据源配置及密文的 SHA-256 指纹完全一致，六张数据表记录数量不变：`life_events` 0、`provider_days` 4,870、`health_series` 29,100、`health_files` 158、`day_summaries` 5、`general_settings` 1。
- `life.hexly.ai/api/live`、`life.worker.hexly.ai/api/live` 和 Caddy 开发入口均返回 HTTP 200、版本 2.0.0、D1 `ok`。19 项只读检查通过：未认证及伪造 JWT 的生产页面/API 请求跳转 Access；机器导入主机的页面、数据源、事件、Connect、数据管理及新增缓存入口均返回 404。
- Caddy 的七项只读 API 检查通过，包括数据源、通用/AI 设置、真实日期记录和生产数据目标。桌面及手机浏览器确认 GitHub 设置存在、PAT 输入默认隐藏且为空、无横向溢出、无页面错误和写入操作。Gecko、Firefly 的既有启用状态保留。
- 最终版本额外核验 Caddy 的当天及所有日期缓存元数据接口，均返回六类缓存，未输出正文、坐标键或凭据，未清除真实缓存。本地与远端仍无待执行迁移。发布时 Cloudflare 管理 API 曾返回一次 `7403`；检查确认原 OAuth 账号及 D1 写权限有效，重新读取与部署成功，未更换凭据。
- `bun run dev:prod` 继续在 `127.0.0.1:7011` 服务 `https://life.dev.hexly.ai`；原有 `.dev.vars.devprod` 内容及 600 权限不变。未替换 `AI_SETTINGS_KEY`，未重导入数据或生成日记。

实现与发布验证未获取、填写或输出真实 GitHub PAT；用户可自行在设置中填写已有 PAT。真实凭据不提交；自动化查询与缓存验证使用合成凭据和隔离上游 fixture。

## 2.0.2 发布验证

2026-09-15 从代码提交 `c77c1256de76471b8d546356135745d7a22e3200` 部署，Worker 版本 `7448b44c-ba3d-4f6d-8d7f-2588d4f31532`。生产构建、Wrangler dry-run 及部署成功；本地与远程 D1 均无待执行迁移。

- L1：88 个文件、1,602 个测试通过；statements 98.95%、branches 96.38%、functions 99.11%、lines 99.31%。严格类型与 Biome 检查通过。
- L2：29 个隔离 Worker/SQLite HTTP 场景通过。完整浏览器回归覆盖 37 个用例；修正仍按旧记录/卡片数量断言的缓存测试后，相关用例重跑通过。GitHub 桌面、手机和明暗弹窗均无 Axe WCAG A/AA 问题。
- 新增用例覆盖 101 个仓库分页、第二页的 2020 年历史 Release、六个并行仓库的上限、重复/无效/过多分页、失败时不写半份日缓存、换 PAT 及并发请求复用缓存。机器人发布者可解析但按账号 ID 排除，不会阻断该账号的查询；补充 fixture 后 37 项 GitHub 单元测试和四个来源浏览器用例再次通过。
- gitleaks 与 OSV 通过；未添加依赖。自动化测试只使用隔离 SQLite 和合成上游，不使用真实 GitHub PAT。
- 上线后 21 项只读检查通过：`life.hexly.ai`、`life.worker.hexly.ai`、`life.dev.hexly.ai` 均返回 2.0.2 与 D1 `ok`；仪表盘/API 保持 Access 保护，机器写入域名的页面、记录、设置、日记与缓存接口保持 404。
- 生产 `AI_SETTINGS_KEY` secret 仍存在；未读取其值或替换密钥。生产数据 dev 服务继续监听 `127.0.0.1:7011`；`.dev.vars.devprod` 保持 0600 并受 Git 忽略。检查未清除真实缓存、重新生成日记或写入用户数据。
