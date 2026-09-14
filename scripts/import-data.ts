import { execFile } from "node:child_process";
import { createReadStream, openAsBlob, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { promisify } from "node:util";
import type { DataTarget, FootprintImportReceipt } from "../src/models/data-management";
import { type FootprintPlan, parseFootprint } from "../src/models/footprint";
import { createFootprintClient, uploadFootprintPlan } from "../src/services/footprint-client";

const execFileAsync = promisify(execFile);

export interface ImportCliOptions {
	provider?: string;
	filePath?: string;
	target?: DataTarget;
	baseUrl?: string;
	dryRun?: boolean;
	json?: boolean;
}

export function parseArgs(argv: string[]): ImportCliOptions {
	const options: ImportCliOptions = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		if (arg === "--provider") {
			const next = argv[++i];
			if (!next || next.startsWith("-")) {
				throw new Error("参数 --provider 缺少有效值");
			}
			options.provider = next;
		} else if (arg.startsWith("--provider=")) {
			const val = arg.slice("--provider=".length);
			if (!val) throw new Error("参数 --provider 缺少有效值");
			options.provider = val;
		} else if (arg === "--file") {
			const next = argv[++i];
			if (!next || next.startsWith("-")) {
				throw new Error("参数 --file 缺少有效值");
			}
			options.filePath = next;
		} else if (arg.startsWith("--file=")) {
			const val = arg.slice("--file=".length);
			if (!val) throw new Error("参数 --file 缺少有效值");
			options.filePath = val;
		} else if (arg === "--target") {
			const next = argv[++i];
			if (!next || next.startsWith("-")) {
				throw new Error("参数 --target 缺少有效值");
			}
			if (next === "local" || next === "production" || next === "test") {
				options.target = next;
			} else {
				throw new Error(`无效的 target 参数: "${next}"。可选值: local, production, test`);
			}
		} else if (arg.startsWith("--target=")) {
			const val = arg.slice("--target=".length);
			if (!val) throw new Error("参数 --target 缺少有效值");
			if (val === "local" || val === "production" || val === "test") {
				options.target = val;
			} else {
				throw new Error(`无效的 target 参数: "${val}"。可选值: local, production, test`);
			}
		} else if (arg === "--base-url") {
			const next = argv[++i];
			if (!next || next.startsWith("-")) {
				throw new Error("参数 --base-url 缺少有效值");
			}
			options.baseUrl = next;
		} else if (arg.startsWith("--base-url=")) {
			const val = arg.slice("--base-url=".length);
			if (!val) throw new Error("参数 --base-url 缺少有效值");
			options.baseUrl = val;
		} else if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		} else {
			throw new Error(`未知或不支持的命令行参数: "${arg}"`);
		}
	}
	return options;
}

export function printUsage(): void {
	console.log(`
使用方法:
  bun scripts/import-data.ts --provider <provider> --file <path> [options]

必填参数:
  --provider <name>   导入来源，当前支持: footprint, apple-health, pixiu
  --file <path>       GPX、Apple 健康 ZIP/目录、貔貅 CSV/目录路径

选项:
  --target <env>      目标环境: local 或 production (dry-run 时可选，实际导入时必填)
  --base-url <url>    覆盖目标 API Base URL (例如 http://127.0.0.1:7011 或 https://life.hexly.ai)
  --dry-run           仅本地解析、校验和统计，不提交到服务端
  --json              以 JSON 格式输出统计或回执
  --help, -h          显示帮助信息

示例:
  # 本地解析与校验
  bun scripts/import-data.ts --provider footprint --file ~/Downloads/track.gpx --dry-run

  # 导入生产数据库
  bun scripts/import-data.ts --provider footprint --file ~/Downloads/track.gpx --target production

  # 导入本地开发服务 (指定 URL)
  bun scripts/import-data.ts --provider footprint --file track.gpx --target local --base-url http://127.0.0.1:7011
`);
}

export function validateAndNormalizeBaseUrl(rawUrl: string): { url: string; isLocalApi: boolean } {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error(`无效的 base-url 格式: "${rawUrl}"`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`base-url 协议必须是 http: 或 https:，收到: "${parsed.protocol}"`);
	}

	if (parsed.username || parsed.password) {
		throw new Error("base-url 禁止包含凭据信息 (username/password)");
	}

	if (parsed.search || parsed.hash) {
		throw new Error("base-url 禁止包含 query 参数或 hash 标识");
	}
	if (parsed.pathname !== "/") {
		throw new Error("base-url 必须是服务根地址，不能包含路径");
	}

	const hostname = parsed.hostname.toLowerCase();
	const localHostnames = new Set(["127.0.0.1", "localhost", "[::1]", "life.dev.hexly.ai"]);
	const isLocalApi = localHostnames.has(hostname);
	if (!isLocalApi && parsed.protocol !== "https:") {
		throw new Error("远程 base-url 必须使用 HTTPS");
	}

	return { url: parsed.origin, isLocalApi };
}

export async function getCloudflareAccessHeader(
	appUrl: string,
	options: {
		execFn?: (
			cmd: string,
			args: string[],
			opts: { timeout: number },
		) => Promise<{ stdout: string; stderr: string }>;
	} = {},
): Promise<Record<string, string>> {
	const run = options.execFn ?? execFileAsync;
	try {
		const result = await run("cloudflared", ["access", "token", `-app=${appUrl}`], {
			timeout: 10_000,
		});
		const token = result.stdout.trim();
		if (!token) {
			throw new Error(
				`获取 Cloudflare Access Token 失败 (token 为空)。\n请先登录 Access:\n  cloudflared access login ${appUrl}`,
			);
		}
		// Return token solely in header; never logged or exposed
		return { "cf-access-token": token };
	} catch (error: unknown) {
		const isNoEnt =
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code: unknown }).code === "ENOENT";
		if (isNoEnt) {
			throw new Error(
				`未找到 cloudflared 命令。\n生产环境导入需要通过 Cloudflare Access 认证。\n请先安装 cloudflared 并完成登录：\n  brew install cloudflared\n  cloudflared access login ${appUrl}`,
			);
		}
		const exitCode =
			error && typeof error === "object" && "code" in error
				? String((error as { code: unknown }).code)
				: "unknown";
		throw new Error(
			`获取 Cloudflare Access Token 失败 (退出代码/错误码: ${exitCode})。\n请确认已安装并登录 Access:\n  cloudflared access login ${appUrl}`,
		);
	}
}

export async function runImportCli(
	argv: string[],
	deps: {
		logFn?: (msg: string) => void;
		errorFn?: (msg: string) => void;
		getAccessHeaderFn?: (url: string) => Promise<Record<string, string>>;
		signal?: AbortSignal;
	} = {},
): Promise<number> {
	const log = deps.logFn ?? console.log;
	const logErr = deps.errorFn ?? console.error;

	let options: ImportCliOptions;
	try {
		options = parseArgs(argv);
	} catch (e) {
		logErr(e instanceof Error ? e.message : String(e));
		return 1;
	}

	if (!options.provider) {
		logErr("缺少必填参数: --provider (例如: --provider footprint)");
		return 1;
	}
	if (!["footprint", "apple-health", "pixiu"].includes(options.provider)) {
		logErr(
			`不受支持的 provider: "${options.provider}"。当前支持 footprint、apple-health 与 pixiu。`,
		);
		return 1;
	}

	if (!options.filePath) {
		logErr("缺少必填参数: --file <path>");
		return 1;
	}

	const resolvedPath = resolve(process.cwd(), options.filePath);
	let fileSize = 0;
	try {
		const stat = statSync(resolvedPath);
		if (!stat.isFile() && !(options.provider !== "footprint" && stat.isDirectory())) {
			logErr(`指定的文件不是普通文件: ${resolvedPath}`);
			return 1;
		}
		fileSize = stat.size;
	} catch {
		logErr(`指定的文件不存在: ${resolvedPath}`);
		return 1;
	}

	if (!options.dryRun && !options.target) {
		logErr(
			"实际导入时必须显式指定 --target local 或 --target production。若仅需验证文件，请使用 --dry-run。",
		);
		return 1;
	}

	// Setup abort controller for signals
	const abortController = new AbortController();
	const activeSignal = deps.signal
		? AbortSignal.any([deps.signal, abortController.signal])
		: abortController.signal;

	const onSignal = () => {
		abortController.abort();
	};
	const processEvents: NodeJS.EventEmitter = process;
	processEvents.on("SIGINT", onSignal);
	processEvents.on("SIGTERM", onSignal);

	try {
		if (options.provider === "pixiu")
			return await runPixiuCli(
				options,
				resolvedPath,
				activeSignal,
				log,
				logErr,
				deps.getAccessHeaderFn,
			);
		if (options.provider === "apple-health")
			return await runHealthCli(
				options,
				resolvedPath,
				activeSignal,
				log,
				logErr,
				deps.getAccessHeaderFn,
			);
		// 1. Parse whole GPX file locally first
		if (!options.json) {
			log(`[1/3] 开始读取并解析轨迹文件: ${resolvedPath}`);
		}

		let stream: ReturnType<typeof createReadStream> | undefined;
		let streamClosed: Promise<void> | undefined;
		let plan: FootprintPlan;
		try {
			activeSignal.throwIfAborted();
			stream = createReadStream(resolvedPath, { signal: activeSignal });
			streamClosed = finished(stream).catch(() => {});
			plan = await parseFootprint(stream, {
				totalBytes: fileSize,
				signal: activeSignal,
				onProgress: (p) => {
					if (!options.json && p.totalBytes && p.totalBytes > 0) {
						const pct = Math.round((p.bytesRead / p.totalBytes) * 100);
						process.stdout.write(`\r      解析进度: ${pct}% (${p.pointCount} 个点)`);
					}
				},
			});
			if (!options.json) {
				process.stdout.write("\n");
			}
		} catch (e) {
			logErr(`解析 GPX 文件失败: ${e instanceof Error ? e.message : String(e)}`);
			return 1;
		} finally {
			stream?.destroy();
			await streamClosed;
		}

		const stats = {
			totalDays: plan.days.length,
			pointCount: plan.pointCount,
			firstAt: new Date(plan.firstAt).toISOString(),
			lastAt: new Date(plan.lastAt).toISOString(),
			bytesRead: plan.bytesRead,
			payloadBytes: plan.payloadBytes,
		};

		if (options.dryRun) {
			if (options.json) {
				log(JSON.stringify({ dryRun: true, stats }, null, 2));
			} else {
				log(`\n=== Dry Run 校验成功 ===`);
				log(`- 覆盖 UTC 日数: ${stats.totalDays}`);
				log(`- 轨迹点总数: ${stats.pointCount}`);
				log(`- 时间跨度: ${stats.firstAt} ~ ${stats.lastAt}`);
				log(`- 读取原始大小: ${(stats.bytesRead / 1024 / 1024).toFixed(2)} MB`);
				log(`- 紧凑日包体积: ${(stats.payloadBytes / 1024 / 1024).toFixed(2)} MB`);
				log(`\n未向服务端写入任何数据。`);
			}
			return 0;
		}

		// 2. Setup Client & Headers
		const target = options.target as DataTarget;
		const isProductionTarget = target === "production";
		const defaultRawUrl = isProductionTarget ? "https://life.hexly.ai" : "http://127.0.0.1:7011";
		const rawBaseUrl = options.baseUrl ?? defaultRawUrl;

		let baseUrl: string;
		let isLocalApi: boolean;
		try {
			const normalized = validateAndNormalizeBaseUrl(rawBaseUrl);
			baseUrl = normalized.url;
			isLocalApi = normalized.isLocalApi;
		} catch (e) {
			logErr(e instanceof Error ? e.message : String(e));
			return 1;
		}

		const getHeaders = async (): Promise<HeadersInit> => {
			if (isProductionTarget && !isLocalApi) {
				const fetchAuth = deps.getAccessHeaderFn ?? getCloudflareAccessHeader;
				return fetchAuth(baseUrl);
			}
			return {};
		};

		const client = createFootprintClient({
			baseUrl,
			getHeaders,
		});

		if (!options.json) {
			log(`[2/3] 连接目标服务并核对环境: ${baseUrl}`);
		}

		let confirmedTarget: DataTarget;
		try {
			confirmedTarget = await client.target(activeSignal);
		} catch (e) {
			logErr(`无法连接目标服务或获取 target: ${e instanceof Error ? e.message : String(e)}`);
			return 1;
		}

		if (confirmedTarget !== target) {
			logErr(
				`目标环境校验失败：命令行参数指定为 "${target}"，但服务节点返回配置为 "${confirmedTarget}"。放弃导入。`,
			);
			return 1;
		}

		if (!options.json) {
			log(`      目标校验通过: ${confirmedTarget}`);
			log(`[3/3] 开始分批提交日包数据...`);
		}

		const fileName = basename(resolvedPath);

		try {
			const receipt: FootprintImportReceipt = await uploadFootprintPlan(client, plan, {
				fileName,
				channel: "cli",
				target,
				signal: activeSignal,
				onProgress: (p) => {
					if (!options.json) {
						process.stdout.write(
							`\r      已确认: ${p.committedDays}/${plan.days.length} 日 (${p.committedPoints}/${plan.pointCount} 点)`,
						);
					}
				},
			});

			if (!options.json) {
				process.stdout.write("\n");
				log(`\n=== 导入完成 ===`);
				log(`- 状态: ${receipt.status}`);
				log(
					`- 提交天数: ${receipt.committedDays} (新增: ${receipt.insertedDays}, 更新: ${receipt.updatedDays}, 无变化: ${receipt.unchangedDays})`,
				);
				log(`- 提交轨迹点: ${receipt.committedPoints}`);
			} else {
				log(JSON.stringify({ success: true, target, baseUrl, stats, receipt }, null, 2));
			}
			return 0;
		} catch (e) {
			if (!options.json) {
				process.stdout.write("\n");
			}
			logErr(`导入过程出错: ${e instanceof Error ? e.message : String(e)}`);
			return 1;
		}
	} finally {
		processEvents.removeListener("SIGINT", onSignal);
		processEvents.removeListener("SIGTERM", onSignal);
	}
}

async function runPixiuCli(
	options: ImportCliOptions,
	path: string,
	signal: AbortSignal,
	log: (message: string) => void,
	logErr: (message: string) => void,
	getAccess?: (url: string) => Promise<Record<string, string>>,
): Promise<number> {
	try {
		const { createPixiuClient, readPixiuFiles, uploadPixiuPlan } = await import(
			"../src/services/pixiu-client"
		);
		const paths = statSync(path).isDirectory()
			? (await readdir(path, { withFileTypes: true }))
					.filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name))
					.map((entry) => resolve(path, entry.name))
					.sort()
			: [path];
		const files: File[] = [];
		for (const file of paths) files.push(new File([await openAsBlob(file)], basename(file)));
		const plan = await readPixiuFiles(files, signal);
		const stats = {
			totalDays: plan.days.length,
			recordCount: plan.recordCount,
			dataRows: plan.days.length,
			firstDate: plan.firstDate,
			lastDate: plan.lastDate,
			timeZone: "Asia/Shanghai",
			bytesRead: plan.bytesRead,
			payloadBytes: plan.payloadBytes,
			fileCount: plan.fileNames.length,
		};
		if (options.dryRun) {
			log(JSON.stringify({ dryRun: true, stats }, null, 2));
			return 0;
		}
		const target = options.target as DataTarget;
		const { url, isLocalApi } = validateAndNormalizeBaseUrl(
			options.baseUrl ??
				(target === "production" ? "https://life.hexly.ai" : "http://127.0.0.1:7011"),
		);
		const client = createPixiuClient({
			baseUrl: url,
			getHeaders: async () =>
				target === "production" && !isLocalApi ? (getAccess ?? getCloudflareAccessHeader)(url) : {},
		});
		const receipt = await uploadPixiuPlan(client, plan, {
			target,
			channel: "cli",
			signal,
			onProgress: (result) => {
				if (!options.json)
					log(
						`已确认 ${result.committedDays}/${plan.days.length} 天，${result.committedPoints}/${plan.recordCount} 条`,
					);
			},
		});
		log(JSON.stringify({ success: true, target, baseUrl: url, stats, receipt }, null, 2));
		return 0;
	} catch (error) {
		logErr(`貔貅导入失败：${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
}

async function runHealthCli(
	options: ImportCliOptions,
	path: string,
	signal: AbortSignal,
	log: (message: string) => void,
	logErr: (message: string) => void,
	getAccess?: (url: string) => Promise<Record<string, string>>,
): Promise<number> {
	const { createDiskHealthStaging, openHealthDirectory } = await import("./health-staging");
	const { parseHealthExport } = await import("../src/models/apple-health");
	const { openHealthZip } = await import("../src/services/health-archive");
	const { createHealthClient, uploadHealthPlan } = await import("../src/services/health-client");
	const staging = await createDiskHealthStaging();
	let archive: Awaited<ReturnType<typeof openHealthZip>> | null = null;
	let lastReport = 0;
	const onProgress = (progress: import("../src/models/health-types").HealthProgress) => {
		if (options.json || Date.now() - lastReport < 3000) return;
		lastReport = Date.now();
		log(
			`${progress.phase}: ${progress.completed}/${progress.total}，${progress.recordCount.toLocaleString()} 条记录`,
		);
	};
	try {
		signal.throwIfAborted();
		archive = statSync(path).isFile() ? await openHealthZip(await openAsBlob(path)) : null;
		const files = archive?.files ?? (await openHealthDirectory(path));
		const plan = await parseHealthExport(files, staging, { signal, onProgress });
		const stats = {
			totalDays: plan.days.length,
			recordCount: plan.recordCount,
			xmlRecordCount: plan.xmlRecordCount,
			dimensionCount: plan.dimensionCount,
			seriesCount: plan.seriesCount,
			fileCount: plan.files.length,
			fileParts: plan.files.reduce((sum, file) => sum + file.parts.length, 0),
			routePointCount: plan.routePointCount,
			ecgSampleCount: plan.ecgSampleCount,
			payloadBytes: plan.payloadBytes,
			warnings: plan.warnings,
		};
		if (options.dryRun) {
			log(JSON.stringify({ dryRun: true, stats }, null, 2));
			return 0;
		}
		const target = options.target as DataTarget;
		const { url, isLocalApi } = validateAndNormalizeBaseUrl(
			options.baseUrl ??
				(target === "production" ? "https://life.hexly.ai" : "http://127.0.0.1:7011"),
		);
		const client = createHealthClient({
			baseUrl: url,
			getHeaders: async () =>
				target === "production" && !isLocalApi ? (getAccess ?? getCloudflareAccessHeader)(url) : {},
		});
		const receipt = await uploadHealthPlan(client, plan, {
			fileName: basename(path),
			target,
			channel: "cli",
			signal,
			onProgress,
		});
		log(JSON.stringify({ success: true, target, baseUrl: url, stats, receipt }, null, 2));
		return 0;
	} catch (error) {
		logErr(`健康导入失败：${error instanceof Error ? error.message : String(error)}`);
		return 1;
	} finally {
		await archive?.close();
		await staging.clear();
	}
}

if (import.meta.main) {
	const code = await runImportCli(process.argv.slice(2));
	process.exit(code);
}
