# 11 质量与隔离

6DQ 采用 nmem `crystal_0c9c31f7de97` 的 2026-09 规范。

| 维度 | 命令与要求 |
| --- | --- |
| L1 | `bun run test:coverage`；Model、Service、ViewModel、Worker 的 statements / branches / functions / lines 全部 ≥95% |
| G1 | `bun run typecheck` 与 `bun run lint`；TypeScript strict、noUncheckedIndexedAccess；Biome 0 error / 0 warning |
| L2 | `bun run test:l2`；全部 API 方法/路径契约，真实 HTTP → 本地 Worker → SQLite |
| L3 | `bun run test:l3`；Playwright 验证认证边界、导入、时间线、Connect、响应式 UI |
| G2 | `bun run gate:security`；gitleaks 扫可评审工作树、osv-scanner 扫根锁文件 |
| D1 | 下述物理隔离，禁止远程测试资源 |

L2/L3 每轮在 `.wrangler/tests/<tier>-<random>` 创建全新状态和 Vite 缓存。绑定检查要求 local 配置、回环监听、无远程路由、local/prod D1 ID 不同。首次写入仅初始化该新目录的 `_test_marker(key,value)`，写入 `env=test`；迁移、SQL 检查、清理均验证标记。

AI 链路使用每轮启动的回环 fixture，支持 OpenAI Responses 与 Anthropic Messages 协议、失败、空输出和延迟。加密密钥与 fixture token 每轮生成；local 不绑定 Workers AI。L2 覆盖全部 14 个方法/路径契约，包含 AI 设置、连接测试和总结的认证、保存、过期与并发语义。每日总结的 L1 用独立内存 SQLite 执行真实租约 SQL；L3 验证 logo 坐标、头像回退、地图、每日概览和 AI 日期切换竞态。

每轮生成临时 RSA 密钥，通过真实 RS256 JWT 测试会话；测试身份只在 RESOURCE_ENV=test、回环请求和数据库标记同时成立时可用。生产不会读取测试 JWKS。测试子进程清除 Cloudflare 凭据变量，通过 XDG 路径隔离 Wrangler OAuth 配置及缓存，不读取本机生产登录状态。

测试结果位于 `test-results`、`playwright-report` 和 `coverage`，不提交生成结果。[08 重构记录](08-chronicle-rewrite.md) 保留 1.0.0 的执行结果与上线证据；[12 每日视图](12-daily-view.md) 记录 1.1.0 的验证与发布。薄 View 和浏览器交互由 L3 覆盖，不纳入 L1 逻辑分母。

Linux 测试会在隔离 XDG 缓存前固定已安装的 Playwright 浏览器路径；只复用浏览器程序，Wrangler OAuth 配置、缓存和 SQLite 仍使用本轮独立目录。自定义 G2 命令使用 Bun，因此复用的 security workflow 必须显式设置 `package-manager: bun`。

Husky pre-commit 执行 L1 + G1；pre-push 并行执行 L2 + G2。CI 同时运行全部维度，所有 GitHub Actions 可复用工作流固定到具体 SHA。
