# life.ai

本项目用于统一管理健康数据、足迹数据与记账数据，并提供结构化存储与可视化基础能力。当前包含 Apple Health 数据结构梳理、footprint 轨迹数据的数据库化与聚合方案，以及 pixiu 记账导出数据的结构说明。✨

## 🚀 项目主要功能
- Apple Health 导出数据结构梳理
- footprint 轨迹数据落库与多粒度聚合（日/周/月/年）
- pixiu 记账导出数据结构梳理（按年 CSV）
- 可视化前端雏形（Next.js + Tailwind + shadcn）

## 📁 主要目录结构
- `data/`：原始导出数据（不纳入版本控制）
  - `apple-health/`：Apple Health 导出
  - `footprint/`：footprint 导出（GPX）
- `db/`：SQLite 数据库文件（不纳入版本控制）
- `docs/`：文档目录（统一编号）
- `scripts/`：数据处理与数据库维护脚本
- `tests/`：单元测试（UT）
- `dashboard/`：Next.js 前端项目

## 📚 文档树入口
- `docs/00-overview.md`：项目概览与文档导航
- `docs/01-data-structure-apple-health.md`：Apple Health 数据结构
- `docs/02-data-structure-footprint.md`：footprint 数据结构与数据库 schema
- `docs/03-data-structure-pixiu.md`：pixiu 记账数据结构

## 🧭 如何运行
### 后端/脚本
```bash
bun install
bun run db:init
bun run db:load
bun run db:agg
```

### 前端开发服务器
```bash
cd dashboard
bun install
bun dev
```
默认端口：`7011`

### Dashboard 测试
```bash
cd dashboard
bun run ut      # 运行测试 + 覆盖率检查
bun run lint    # 代码检查
bun run build   # 生产构建
```

## 🧪 测试与质量门禁
- UT：`bun run ut`（覆盖率 >= 90%）
- Lint：`bun run lint`
- pre-commit：运行 UT
- pre-push：运行 UT + Lint
- 禁止跳过测试

## ✅ 覆盖率目标
- UT 覆盖率目标：90% 以上
- 不便测试的模块建议拆分后再覆盖

## 🧩 原子化提交要求
- 每个 commit 必须是单一、可回滚的逻辑变更
- 不混合功能、重构与修复
- 变更完成后再提交，保证可构建

## 📝 文档要求（Agent 必读）
- 更新代码必须同步更新相关文档
- README 仅做概览，细节请写入 `docs/` 并按编号维护
- 文档统一中文

## 🧰 Husky 与 hooksPath
- Husky 目录：`.husky/`
- `core.hooksPath` 必须指向根目录 `.husky`
- hooks 会强制执行 UT 与 Lint

## 🔒 依赖安装安全（bunfig.toml）
仓库根的 `bunfig.toml` 启用 `[install] ignoreScripts = true`，禁用所有依赖的
`preinstall` / `install` / `postinstall` / `prepare` 生命周期脚本，规避 native
binding（如 `better-sqlite3` 触发的 `node-gyp` / `binding.gyp`）供应链 RCE 风险。
`bun.lock` 走 prebuilt binary，默认无需运行任何脚本即可安装。

### 何时需要为某个包临时启用构建脚本？

升级后 prebuilt 不可用、当前平台无 prebuilt、或上游强依赖 `postinstall` 时。**在
`ignoreScripts = true` 仍然生效的前提下**，无论是 `bun install --trust <pkg>`、
`bun pm trust <pkg>`，还是 `package.json` 的 `trustedDependencies`，都**不会**
执行脚本——`ignoreScripts` 会盖过它们。

经实测可生效的临时流程（执行完务必恢复，不要合入仓库）：

```bash
# 1. 临时关掉 ignoreScripts —— 二选一即可：
#    a) 改 bunfig.toml：ignoreScripts = false
#    b) 暂时移走：mv bunfig.toml bunfig.toml.off
# 2. 把目标包加入 package.json 的 trustedDependencies，例如：
#    "trustedDependencies": ["better-sqlite3"]
# 3. 重新安装，脚本会按 trustedDependencies 名单运行：
rm -rf node_modules && bun install
# 4. 验证构建产物已生成（如 node_modules/<pkg>/build/Release/*.node）
# 5. 恢复 bunfig.toml（保持 ignoreScripts = true）
#    并把第 2 步加入的 trustedDependencies 移除（除非项目想长期信任，但那时
#    也需要明白 ignoreScripts 仍会压过它，下次再触发同样需要本流程）
```

> ⚠️ 实测注意：
> - `bun install --trusted=<pkg>` 不是真实 flag（bun 1.3.14 只有 `--trust`），写错时 CLI 也可能静默返回 0，**不能**用"命令不报错"证明它生效。
> - `bun install --trust <pkg>` 会**写入** `package.json` 的 `trustedDependencies`，并不是"仅本次有效"。
> - 唯一可靠的判定：检查包内是否生成预期的 build 产物（例如 native `.node` 文件）。
