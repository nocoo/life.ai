# GitHub 按日记录 — 2.0.0

在「设置 → 数据源 → GitHub」填写已有 Personal Access Token，保存时由 Worker 调用 GitHub `/user` 验证并识别账号。支持指定查询日期，也会随每天的时间线自动读取。此功能不创建 PAT。

## 查询范围

- 提交使用 `author:<login> author-date:<UTC start>..<UTC end - 1 second>`，显示原始作者时间。GitHub 提交搜索只收录默认分支，私有仓库取决于 PAT 授权。
- PR 使用 `is:pr author:<login>`，分别查创建时间和关闭时间；显示该账号创建的 PR 当天的创建、合并、关闭动作。合并不证明由该账号本人执行，后来的编辑不算当天活动。
- 复用日期/时区验证器，以 `[start,end)` 裁剪真实 UTC 瞬间，兼容夏令时；以仓库/SHA 或 PR ID/动作去重。
- 每页 100 条，顺序读取全部分页。搜索不完整、超过单次搜索 1,000 条、总数变化、重复或缺页时明确失败，不缓存部分结果。响应上限 4 MiB、单请求 15 秒、整个日读取 45 秒；日快照上限 1 MiB。

参考：[搜索 API](https://docs.github.com/en/rest/search/search)、[提交搜索范围](https://docs.github.com/en/search-github/searching-on-github/searching-commits)、[PR 日期过滤](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)。

## 凭据与缓存

PAT 复用 AES-GCM 与现有 `AI_SETTINGS_KEY`，只由 Worker 解密后发送至固定 `api.github.com`，不跟随重定向。同源设置 API 受 Access、主机及来源检查保护；响应仅返回账号 ID/login 和 `hasApiKey`，不返回 PAT、密文或掩码片段。错误不透传上游正文或网络错误文本。保存成功及离开页面后清空输入，Gecko/GitHub 草稿彼此独立。

Classic PAT 只查公开仓库时无须 scope；包含私有仓库时需要 `repo`。账号识别只读取公开的 ID/login，无须 `read:user` 或 `user:email`，也不需要 `workflow` 或管理权限。`repo` 本身包含写权限，但 Life.ai 只调用读取接口；组织仓库启用 SSO 时，还需授权该 PAT。参考 [GitHub scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) 与 [账号接口](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)。

`0008_github.sql` 保留原数据源配置和密文，扩展 provider 约束及账号字段，新增 `github_day_cache`。

- 缓存键为 GitHub 数字账号 ID、日期、规范化时区和 UTC 窗口，与 PAT 和配置版本无关。完整成功结果永久保存，包括空日；命中不访问 GitHub、不写 D1。
- 今天同样以首次成功查询为准，不自动刷新。换同账号 PAT、停用/启用、移除后再添加同账号，均复用既有日快照。不同账号及日期窗口分别缓存。
- 移除删除 PAT 与账号配置，保留历史快照；未启用该账号时不展示缓存。
- 原子 D1 租约协调并发首次查询，等待者只查 D1；租约 60 秒后可接管，失败释放未完成行。停用、移除或切换账号后，旧账号的在途请求不能写回；同账号重新保存配置不丢弃正在读取的快照。
- 幂等 SQL 使用有界瞬态重试，保存后读取确认，不重试整个 GitHub 查询。健康检查也复用同一读取重试。

接口沿用 `GET /api/settings/sources`、`PUT/DELETE /api/settings/sources/github`、`POST /api/settings/sources/github/test`、`GET /api/day-sources`。查询按钮提交所选日窗口；GitHub `/test` 同样遵守缓存，不强制刷新。

## 当天阅读

时间线显示 🐙 GitHub 卡片、仓库、标题、短 SHA/PR 编号、原文链接与动作时间。卡片采用 GitHub 中性色，PR 状态使用绿色、紫色、红色和草稿灰色，兼容明暗主题且有文字标签。信息面板说明 PR 状态是首次查询时的快照。空日显示 GitHub 空状态卡片，不伪造零点事件。

日记证据包含账号、仓库、动作、标题、链接和时间，不据此断言连续工作时长或合并操作者；沿用既有输入指纹和旧日记保留机制。

## 验证与发布

自动化测试使用隔离 Worker/SQLite、合成凭据和 loopback GitHub fixture，不使用真实 PAT。

合并远端 Node 运行时与日期导航修复后，发布前检查：84 个 L1 文件、1,544 项测试通过，语句 98.92%、分支 96.39%、函数 99.09%、行 99.29%；28 个真实 HTTP 场景、35 个浏览器用例通过。严格类型检查、Biome、gitleaks、OSV、生产构建和 Wrangler dry run 通过。浏览器覆盖明暗状态色、PAT 清空、日期跳转、原文链接、空日卡片、手机布局和可访问性。

2026-09-15 已从代码提交 `5cd1fa0` 部署 2.0.0，Worker 版本 `798e448c-1165-47cb-a7c1-986238ddf930`。原有 2.0.0 提交和远端 main 提交均保留。

- 生产 D1 应用 `0008_github.sql`，本地 D1 正常执行 `0001` 至 `0008`；两者均无待执行迁移。迁移前后，既有两项数据源配置及密文的 SHA-256 指纹完全一致，六张数据表记录数量不变：`life_events` 0、`provider_days` 4,870、`health_series` 29,100、`health_files` 158、`day_summaries` 5、`general_settings` 1。
- `life.hexly.ai/api/live`、`life.worker.hexly.ai/api/live` 和 Caddy 开发入口均返回 HTTP 200、版本 2.0.0、D1 `ok`。15 项只读检查通过：未认证及伪造 JWT 的生产页面/API 请求跳转 Access；机器导入主机的页面、数据源、事件、Connect 和数据管理入口均返回 404。
- Caddy 的七项只读 API 检查通过，包括数据源、通用/AI 设置、真实日期记录和生产数据目标。桌面及手机浏览器确认 GitHub 设置存在、PAT 输入默认隐藏且为空、无横向溢出、无页面错误和写入操作。Gecko、Firefly 的既有启用状态保留。
- `bun run dev:prod` 继续在 `127.0.0.1:7011` 服务 `https://life.dev.hexly.ai`；原有 `.dev.vars.devprod` 内容及 600 权限不变。未替换 `AI_SETTINGS_KEY`，未重导入数据或生成日记。

本次未提供或保存真实 GitHub PAT；首次连接可在「设置 → 数据源 → GitHub」填写已有 PAT。真实凭据未输出或提交；自动化查询与缓存验证使用合成凭据和隔离上游 fixture。
