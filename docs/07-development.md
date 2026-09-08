# 07 本地开发与 SQLite 驱动

返回[项目 README](../README.md) · [English](#english)

## 安装后检查

Dashboard 以 Node.js 运行时使用 `better-sqlite3`；导入脚本使用 Bun 的 `bun:sqlite`。根目录与 Dashboard 的依赖分别由各自的锁文件管理。先按 README 完成两次 `bun install --frozen-lockfile`，再从仓库根目录执行：

```bash
node -e 'const db = new (require("./dashboard/node_modules/better-sqlite3"))(":memory:"); console.log(db.prepare("SELECT 1").pluck().get()); db.close()'
```

输出 `1` 表示当前 Node 可以加载驱动、执行查询并关闭连接。该检查只使用内存，不打开个人数据库。

当前锁定的 `better-sqlite3` 随包提供 `prebuilds/`，没有 `install` 生命周期脚本。`bunfig.toml` 中的 `ignoreScripts = true` 可以保持启用；不需要修改 `trustedDependencies`。

## 检查失败时

先查看实际安装的包、Node 和平台：

```bash
node -p '({node: process.version, platform: process.platform, arch: process.arch})'
node -p 'require("./dashboard/node_modules/better-sqlite3/package.json").version'
node -p 'require("./dashboard/node_modules/better-sqlite3/lib/binding").getPrebuildPath()'
```

- 如果整个包不存在，重新执行 `bun install --cwd dashboard --frozen-lockfile`，然后复测。
- 如果预编译模块路径存在但加载失败，先核对 Node ≥ 22、系统架构和错误信息。不要将“重建命令成功”当作加载成功。
- 如果当前平台没有预编译模块，才需要从已安装、已锁定的包源码构建。准备 Python 3、C/C++ 编译器和系统构建工具；macOS 使用 Xcode Command Line Tools，Linux 使用 make / C++ 编译器，Windows 使用 Visual Studio C++ 构建工具。

缺少预编译模块时，从仓库根目录执行：

```bash
npm exec --yes --ignore-scripts --package=node-gyp@10.3.1 -- node-gyp rebuild --directory=dashboard/node_modules/better-sqlite3 --release --force_build=1
```

这条命令用临时工具运行目标包的原生构建，不修改项目 manifest、锁文件或全局安装策略。`--release --force_build=1` 来自该包的 `build-release` 脚本；node-gyp 版本按该包的开发工具声明选择。构建只针对 `dashboard/node_modules/better-sqlite3`，需要获取工具包及当前 Node 的头文件。完成后重复上方 `:memory:` 检查，确认输出 `1`，再运行 Dashboard。若安装的包版本或构建脚本发生变化，先检查该版本的 `package.json` 和 `binding.gyp`。

## English

The Dashboard uses `better-sqlite3` under Node.js; import scripts use Bun's `bun:sqlite`. Install the root and Dashboard dependencies with their respective lockfiles, then run this check from the repository root:

```bash
node -e 'const db = new (require("./dashboard/node_modules/better-sqlite3"))(":memory:"); console.log(db.prepare("SELECT 1").pluck().get()); db.close()'
```

A result of `1` confirms that the current Node runtime can load the driver, execute a query, and close the connection. This check uses memory only and never opens a personal database.

The locked `better-sqlite3` package ships a `prebuilds/` directory and has no `install` lifecycle script. Keep `ignoreScripts = true` in `bunfig.toml`; there is no need to change `trustedDependencies`.

If the check fails, inspect the runtime and installed package:

```bash
node -p '({node: process.version, platform: process.platform, arch: process.arch})'
node -p 'require("./dashboard/node_modules/better-sqlite3/package.json").version'
node -p 'require("./dashboard/node_modules/better-sqlite3/lib/binding").getPrebuildPath()'
```

- If the package itself is missing, repeat `bun install --cwd dashboard --frozen-lockfile` and rerun the check.
- If a prebuilt binary exists but fails to load, check Node ≥ 22, the system architecture, and the reported error. A successful rebuild command does not prove the driver loads.
- Build from the installed, locked package only when the current platform has no prebuilt binary. This requires Python 3, a C/C++ compiler, and platform build tools: Xcode Command Line Tools on macOS, make and a C++ compiler on Linux, or Visual Studio C++ build tools on Windows.

For a missing prebuilt binary, run from the repository root:

```bash
npm exec --yes --ignore-scripts --package=node-gyp@10.3.1 -- node-gyp rebuild --directory=dashboard/node_modules/better-sqlite3 --release --force_build=1
```

This uses a temporary tool to build only `dashboard/node_modules/better-sqlite3`, preserving project manifests, lockfiles, and the global installation policy. The release flags come from the package's `build-release` script, and the node-gyp version follows its development tool declaration. The command needs to download the tool and the active Node version's headers. Rerun the in-memory check afterward and confirm `1` before starting the Dashboard. If the package version or build script changes, inspect that version's `package.json` and `binding.gyp` first.
