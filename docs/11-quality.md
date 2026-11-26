# 11 质量与隔离

遵循 `system1-quality` 12 槽位契约；CI 槽位实现与固定 `base-ci` 版本以 `.github/workflows/quality-slots.yml`（受保护分支要求 `quality / Z1: Gate`）为准。状态词汇统一使用 `enforced`、`planned`、`manual`、`N/A`。

| 槽位               | 命令 / 实现与要求                                                                                                     | 状态       | 说明                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `S1: Types`        | `bun run typecheck`（`cf-typegen` + 4 套严格 `tsconfig`、`noUncheckedIndexedAccess`）                                 | `enforced` | pre-commit + CI                                            |
| `S2: Lint`         | `bun run lint`（`biome check --error-on-warnings .`，check-only 0 error / 0 warning）                                 | `enforced` | pre-commit + CI                                            |
| `S3: Workflow`     | 校验 `.github/workflows/*.yml` 全部外部 action 固定到 40 位 SHA                                                       | `enforced` | CI                                                         |
| `G1: Secrets`      | `gitleaks` 扫描可评审工作树 / CI 检出树（本地经 `bun run gate:security`）                                             | `enforced` | pre-push + CI                                              |
| `G2: Dependencies` | `osv-scanner` 扫描 `bun.lock`，缺少扫描器直接失败（本地经 `bun run gate:security`）                                   | `enforced` | pre-push + CI                                              |
| `B1: Build`        | `bun run build`（Vite SPA + Worker 产物）                                                                             | `enforced` | `quality` + CI                                             |
| `L1: Unit`         | `bun run test:coverage`；`src/{models,services,viewmodels}/` 与 `worker/` 四项覆盖率 ≥95%，禁止 `.skip`/`.only`       | `enforced` | pre-commit + CI + `l1-precommit-gate`                      |
| `L2: Runtime`      | —                                                                                                                     | `N/A`      | Cloudflare Worker 绑定行为由 `L3`/`L4` 覆盖                |
| `L3: Integration`  | `bun run test:l2`（历史脚本名；`tests/http/api.ts`，真实 HTTP → 本地 Worker → 隔离 SQLite）                           | `enforced` | pre-push + CI；完整 endpoint/method 清单证明仍为 `planned` |
| `L4: E2E`          | `bun run test:l3`（历史脚本名；Playwright 覆盖认证边界、导入、时间线、Connect、Apple Health、记账与 AI 总结核心冒烟） | `enforced` | `quality` + CI                                             |
| `P1: Package`      | `bunx wrangler deploy --dry-run`（复用 `B1` 构建产物验证 Worker 打包与配置）                                          | `enforced` | CI                                                         |
| `Z1: Gate`         | `.github/workflows/quality-slots.yml` 经 `nocoo/base-ci` `z1-gate`（`v2026.18`）校验全部必需与跳过槽位                | `enforced` | 受保护分支 `main` 必需检查                                 |

## L1 与本地 Hook 实测证据

- **Pre-commit（index 快照）**：`.husky/pre-commit` 通过 `git checkout-index` 构建临时快照（不改写工作区），顺序执行 `node scripts/run-unit-coverage.mjs` → `node scripts/verify-coverage-summary.mjs` → `bun run typecheck` → `bun run lint`。index 快照下的单测覆盖率固定用 Node 而非 Bun 运行，避免 v8 coverage 合并偶发失败。
- **干净安装实测**（`bun install --frozen-lockfile`、`bun run prepare`、Bun 1.4.0、Node 26.12.1）：`sh .husky/pre-commit` 退出码 `0`，冷启动约 16.4s、热启动约 15.3–15.7s；`bun run test:coverage` 实测 statements **98.95%**、branches **96.38%**、functions **99.12%**、lines **99.31%**（1,605 tests / 89 files）。
- **拒绝证明与加固**：CI `l1-precommit-gate`（`L1: Unit (Pre-commit Gate)`）运行 `bun run test:l1`（`scripts/verify-l1-gate.mjs`），配合 `scripts/pre-commit-index.test.mjs` 在隔离临时仓自动清理复现；已验证拒绝 UT 失败、四项覆盖率任一不达标、lint error/warning、类型错误、`.only`/skipped suite、staged-bad/unstaged-good、缺工具/缺覆盖率报告/缺 `node_modules`、SIGTERM 中断，以及健康样本通过。`vitest.config.ts` 启用 `allowOnly: false`，hook 内带独立单测与覆盖率摘要校验器。
- **Pre-push 与遗留跟进**：`.husky/pre-push` 当前在工作区并行执行 `bun run test:l2`（L3 Integration）与 `bun run gate:security`（G1/G2），可评审工作树快照进入 secret 扫描。后续跟进：改为按 stdin pushed refs 校验且控制在 `<3min`（`planned`）；补齐 `tests/http/api.ts` 全量 endpoint/method 清单证明（`planned`）。Provider / 日记 / UI 契约文档证据为 `manual`（见 [30 领域约定](30-domain-contracts.md)）。

## 隔离边界与历史验证

L2/L3 每轮在 `.wrangler/tests/<tier>-<random>` 创建全新状态和 Vite 缓存。绑定检查要求 local 配置、回环监听、无远程路由、local/prod D1 ID 不同。首次写入仅初始化该新目录的 `_test_marker(key,value)`，写入 `env=test`；迁移、SQL 检查、清理均验证标记。

AI 链路使用每轮启动的回环 fixture，支持 OpenAI Responses 与 Anthropic Messages 协议、失败、空输出和延迟。加密密钥与 fixture token 每轮生成；local 不绑定 Workers AI。L2 覆盖全部方法/路径契约，包含数据目标、概览、Footprint 与 Apple Health 整日导入和附件，以及 AI 设置、连接测试和总结的认证、保存、过期与并发语义。每日总结的 L1 用独立内存 SQLite 执行真实租约 SQL；L3 验证 logo 坐标、头像回退、地图、每日概览和 AI 日期切换竞态。

每轮生成临时 RSA 密钥，通过真实 RS256 JWT 测试会话；测试身份只在 RESOURCE_ENV=test、回环请求和数据库标记同时成立时可用。生产不会读取测试 JWKS。测试子进程清除 Cloudflare 凭据变量，通过 XDG 路径隔离 Wrangler OAuth 配置及缓存，不读取本机生产登录状态。

测试结果位于 `test-results`、`playwright-report` 和 `coverage`，不提交生成结果。[08 重构记录](08-chronicle-rewrite.md) 保留 1.0.0 的执行结果与上线证据；[12 每日视图](12-daily-view.md) 记录 1.1.0 的验证与发布；[13 时间线设计](13-story-timeline.md) 记录 1.2.0 的密集每日场景、视觉复核与发布。[15 数据管理](15-data-management.md) 记录 1.3.0 的网页/CLI 导入、完整 GPS 保真与幂等验证。薄 View 和浏览器交互由 L3 覆盖，不纳入 L1 逻辑分母。

[16 每日环境与记录页签](16-daily-context-and-record-tabs.md) 记录 GPS 分组与速度、公共天气/天文服务、按需挂载和分页表格的验证。L3 的天气、日出日落与地图瓦片使用固定响应；真实公共 API 与完整生产数据仅由本地 Caddy 进行只读复核。大记录量、分页、跨小时去重、页签切换及所有写入场景继续只用隔离 SQLite。

[17 Apple Health](17-apple-health.md) 记录完整 ZIP/目录导入、跨夜睡眠、重叠传感器、心电图/血压、锻炼与 GPS 合并地图的验证。L1 检查保真编解码、租约和并发、幂等、异步取消与日期竞态；L3 覆盖真实 ZIP/目录选择、重复导入、波形分页、原始维度延迟读取、移动端/深色及可访问性。原始完整导出另外通过独立解析器逐节点/逐附件核对，再用只读 SQLite 快照核验生产导入和重导，健康值与坐标不进入报告或 Git。

Linux 测试会在隔离 XDG 缓存前固定已安装的 Playwright 浏览器路径；只复用浏览器程序，Wrangler OAuth 配置、缓存和 SQLite 仍使用本轮独立目录。自定义安全扫描命令使用 Bun，因此 CI 中复用安装步骤时显式设置 `package-manager: bun`。

Husky pre-commit 对 Git index 快照执行 `L1` + `S1` + `S2`；pre-push 在工作区并行执行 `test:l2`（`L3`）与 `gate:security`（`G1`/`G2`）。CI 通过 `.github/workflows/quality-slots.yml` 独立运行全部启用槽位及 `l1-precommit-gate`，所有 GitHub Actions 外部引用均固定到 40 位 SHA。
