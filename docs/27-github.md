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

发布前检查：83 个 L1 文件、1,532 项测试通过，语句 98.92%、分支 96.39%、函数 99.09%、行 99.29%；28 个真实 HTTP 场景、35 个浏览器用例通过。严格类型检查、Biome、gitleaks、OSV、生产构建和 Wrangler dry run 通过。浏览器覆盖明暗状态色、PAT 清空、日期跳转、原文链接、空日卡片、手机布局和可访问性。

开发与生产的最终迁移、部署核验在完成后追加。
