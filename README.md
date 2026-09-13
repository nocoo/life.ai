# Life.ai

<img src="assets/brand/icon-rounded.png" width="96" alt="Life.ai 水豚标志" />

一个人的生活实录。把健康、足迹、记账和主动推送的记录，汇聚到每天的 24 小时里。

- 网站：<https://life.hexly.ai>（Cloudflare Access）
- 写入：<https://life.worker.hexly.ai/api/ingest>（Connect Bearer token）
- 健康检查：`GET /api/live`，JSON 包含版本与数据库状态。

## 使用方式

时间线按设备当前时区展示，支持选择日期、来源和查看记录详情。只有日期的记录放在全天区；小时、分钟、秒精度按原始精度保留。所有存储和比较都使用 UTC，没有偏移量的输入也按 UTC 解释。

每日视图同时展示 GPS 地图、健康、运动和分币种收支概览。点击「生成摘要」可以保存当天的 AI 总结；数据变化后会提示重新生成。默认使用 Workers AI，也可以在「AI 设置」配置其他模型。侧栏使用 lizheng.blog 的姓名与头像服务。

在「导入」选择 Apple Health `导出.xml`、GPS `.gpx`、貔貅 `.csv`，或日记 `.json` / `.ndjson`。XML、GPX、CSV、NDJSON 按块读取；普通 JSON 上限 10 MiB。导入可取消，重新导入同一数据不会增加副本。已完成的批次会保留。

在「Connect」为数据来源命名并创建只写 token。明文只显示一次，保存在自己的推送端。同一个 token 在同一 UTC 小时的后续请求会替换该小时的标题、内容和数据，也支持未来的小时。撤销 token 不会删除历史记录。

## 本地开发

需要 Bun 1.4 与 Node.js 22.20+。

```sh
bun install --frozen-lockfile
bun run prepare
bun run db:migrate
bun dev
```

打开 <https://life.dev.hexly.ai>，Caddy 已映射至 `127.0.0.1:7011`。直接地址是 `http://127.0.0.1:7011`。本地明确使用 development 配置和本地 SQLite；不需要 Google OAuth。生产是 Worker `life` 与 D1 `life`。

本地连接生产数据使用 `bun run dev:prod`：同一 Caddy 地址和端口，D1 明确绑定远程 `life`，网页中的导入与 Connect 操作也会写生产数据。该命令需要本机 Wrangler 登录；自动化测试始终使用独立本地 SQLite。

依赖安装禁止自动运行生命周期脚本，项目 hooks 通过 `bun run prepare` 显式安装。不要提交本地 `.env*`、`.dev.vars*`、数据库或生成的测试结果。

## 架构与验证

Vite + React + Basalt 2.1.7，Biome 与 TypeScript strict。MVVM：`src/models` 管时间和导入，`src/services` 管 HTTP，`src/viewmodels` 管状态，Views 只渲染和派发操作；`worker` 管 API、Access 和 D1。

```sh
bun run quality       # 6DQ：L1 / L2 / L3 / G1 / G2 / D1 隔离
bun run test:coverage # statements / branches / functions / lines 均须 ≥95%
bun run test:l2       # 17011，真实 HTTP + Worker + 独立 SQLite
bun run test:l3       # 27011，Playwright + 独立 SQLite
bun run deploy       # 构建、dry run、迁移检查/执行、Worker 部署
```

首次运行浏览器测试前执行 `bunx playwright install chromium`。测试每轮生成独立状态目录、缓存和签名密钥，运行及清理都校验 `_test_marker(env=test)`，不连接远程测试资源。

详见 [文档索引](docs/README.md)、[项目规则](CLAUDE.md)、[重构与上线记录](docs/08-chronicle-rewrite.md)、[每日视图与 AI](docs/12-daily-view.md)。
