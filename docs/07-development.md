# 07 开发与部署

## 环境

| 环境 | 地址 / 资源 |
| --- | --- |
| 开发 | `https://life.dev.hexly.ai` → Caddy → `127.0.0.1:7011` |
| L2 | `127.0.0.1:17011`，每轮独立 SQLite |
| L3 | `127.0.0.1:27011`，每轮独立 SQLite |
| 生产 | `https://life.hexly.ai`，Worker `life`，D1 `life` |
| 机器写入 | `https://life.worker.hexly.ai/api/ingest` |

端口依据 nmem `25b22d6b-1df5-4491-ae4d-269a556f6442`。Caddy 配置位于 `/opt/homebrew/etc/Caddyfile`，镜像为 `../workflow/caddy/Caddyfile`。Vite 与 Worker 集成在一个端口，不需要额外 sidecar。

本地启动：`bun run db:migrate` 后 `bun dev`。`CLOUDFLARE_ENV=local` 使用 `RESOURCE_ENV=development`、D1 ID `local-life` 与 `.wrangler/state`。本地身份只允许已知开发主机和回环地址。不会隐式连接生产数据。

`bun run dev:prod` 是用户授权的本地生产数据入口：选择 `devprod` 配置，将 D1 `life` 标为 `remote: true`，Vite 仅在该明确环境启用 remote bindings。网页请求仍限定本地开发主机，导入、Connect 管理会影响生产数据。它不运行迁移或 seed。L2/L3 会强制切回 local，并拒绝 remote bindings。

## 生产配置

D1 `life`（APAC）：`50a1d276-d24b-4c07-82af-e14683116489`。绑定 `DB`。Worker 静态资产绑定 `ASSETS`，所有请求先进入 Worker；`workers.dev` 和预览 URL 禁用，机器写入域名不会返回网页或读取接口。

Access team 为 `nocoo`，issuer 为 `https://nocoo.cloudflareaccess.com`；audience 记录在 `CLAUDE.md` 和 `wrangler.jsonc`。服务端使用 Cloudflare 公钥验证 RS256 签名、issuer、audience、exp、sub。Connect token 是随机 32 字节，只保存 SHA-256 摘要。

部署前运行 `bun run quality`。`bun run deploy` 构建和 dry run 后检查迁移列表、应用缺失迁移，再部署两个域名。先迁移再更新服务，避免缺表。当前版本必须同时显示于侧栏与 `/api/live`。

部署后检查 `/api/live` 的 JSON / D1 / version、Access 入口跳转、拒绝未授权 API 与机器域名读取。生产环境只做只读上线检查，不运行测试 seed/reset。具体证据写入 [08 重构记录](08-chronicle-rewrite.md)。
