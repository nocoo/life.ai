import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getCloudflareAccessHeader,
	parseArgs,
	runImportCli,
	validateAndNormalizeBaseUrl,
} from "../../../scripts/import-data";
import type { FootprintImportReceipt } from "../../../src/models/data-management";
import * as footprintClientModule from "../../../src/services/footprint-client";

describe("import-data CLI argument parsing", () => {
	it("parses valid arguments", () => {
		const opts = parseArgs([
			"--provider",
			"footprint",
			"--file",
			"track.gpx",
			"--target",
			"production",
			"--base-url",
			"http://127.0.0.1:7011",
			"--dry-run",
			"--json",
		]);
		expect(opts).toEqual({
			provider: "footprint",
			filePath: "track.gpx",
			target: "production",
			baseUrl: "http://127.0.0.1:7011",
			dryRun: true,
			json: true,
		});
	});

	it("parses inline = style arguments", () => {
		const opts = parseArgs([
			"--provider=footprint",
			"--file=track.gpx",
			"--target=local",
			"--base-url=http://127.0.0.1:7011",
		]);
		expect(opts).toEqual({
			provider: "footprint",
			filePath: "track.gpx",
			target: "local",
			baseUrl: "http://127.0.0.1:7011",
		});
	});

	it("rejects unknown flags or typos", () => {
		expect(() => parseArgs(["--dryrun"])).toThrow('未知或不支持的命令行参数: "--dryrun"');
		expect(() => parseArgs(["--target", "local", "--unknown"])).toThrow("未知或不支持的命令行参数");
	});

	it("rejects missing values for flags requiring arguments", () => {
		expect(() => parseArgs(["--provider"])).toThrow("缺少有效值");
		expect(() => parseArgs(["--provider", "--file"])).toThrow("缺少有效值");
		expect(() => parseArgs(["--file"])).toThrow("缺少有效值");
		expect(() => parseArgs(["--target"])).toThrow("缺少有效值");
		expect(() => parseArgs(["--base-url"])).toThrow("缺少有效值");
		expect(() => parseArgs(["--provider="])).toThrow("缺少有效值");
		expect(() => parseArgs(["--file="])).toThrow("缺少有效值");
		expect(() => parseArgs(["--target="])).toThrow("缺少有效值");
		expect(() => parseArgs(["--base-url="])).toThrow("缺少有效值");
	});

	it("rejects invalid target", () => {
		expect(() => parseArgs(["--target", "invalid"])).toThrow("无效的 target 参数");
		expect(() => parseArgs(["--target=staging"])).toThrow("无效的 target 参数");
	});
});

describe("validateAndNormalizeBaseUrl", () => {
	it("accepts valid http and https URLs and normalizes trailing slash", () => {
		expect(validateAndNormalizeBaseUrl("http://127.0.0.1:7011/")).toEqual({
			url: "http://127.0.0.1:7011",
			isLocalApi: true,
		});
		expect(validateAndNormalizeBaseUrl("https://life.hexly.ai/")).toEqual({
			url: "https://life.hexly.ai",
			isLocalApi: false,
		});
	});

	it("recognizes exact local hostnames including life.dev.hexly.ai", () => {
		expect(validateAndNormalizeBaseUrl("https://life.dev.hexly.ai").isLocalApi).toBe(true);
		expect(validateAndNormalizeBaseUrl("http://localhost:7011").isLocalApi).toBe(true);
		expect(validateAndNormalizeBaseUrl("http://127.0.0.1:7011").isLocalApi).toBe(true);
		expect(validateAndNormalizeBaseUrl("http://[::1]:7011").isLocalApi).toBe(true);

		// Must not admit lookalikes
		expect(validateAndNormalizeBaseUrl("https://localhost.attacker.com").isLocalApi).toBe(false);
		expect(validateAndNormalizeBaseUrl("https://127.0.0.1.attacker.com").isLocalApi).toBe(false);
	});

	it("rejects credentials, query parameters, hash, or bad schemes", () => {
		expect(() => validateAndNormalizeBaseUrl("ftp://life.hexly.ai")).toThrow("协议必须是");
		expect(() => validateAndNormalizeBaseUrl("http://user:pass@127.0.0.1:7011")).toThrow(
			"凭据信息",
		);
		expect(() => validateAndNormalizeBaseUrl("http://127.0.0.1:7011?token=123")).toThrow(
			"query 参数",
		);
		expect(() => validateAndNormalizeBaseUrl("http://127.0.0.1:7011#section")).toThrow("hash 标识");
		expect(() => validateAndNormalizeBaseUrl("not a url")).toThrow("无效的 base-url 格式");
		expect(() => validateAndNormalizeBaseUrl("https://life.hexly.ai/api")).toThrow("不能包含路径");
		expect(() => validateAndNormalizeBaseUrl("http://life.hexly.ai")).toThrow("HTTPS");
	});
});

describe("cloudflared Access helpers", () => {
	it("returns token in cf-access-token header without leaking token", async () => {
		const execMock = vi.fn(async () => ({ stdout: "secret-jwt-token\n", stderr: "" }));
		const header = await getCloudflareAccessHeader("https://life.hexly.ai", { execFn: execMock });
		expect(header).toEqual({ "cf-access-token": "secret-jwt-token" });
		expect(execMock).toHaveBeenCalledWith(
			"cloudflared",
			["access", "token", "-app=https://life.hexly.ai"],
			{ timeout: 10_000 },
		);
	});

	it("fails with actionable message when cloudflared binary is missing (ENOENT)", async () => {
		const execMock = vi.fn(async () => {
			const err = new Error("spawn cloudflared ENOENT");
			Object.assign(err, { code: "ENOENT" });
			throw err;
		});
		await expect(
			getCloudflareAccessHeader("https://life.hexly.ai", { execFn: execMock }),
		).rejects.toThrow("未找到 cloudflared 命令");
	});

	it("never echoes stdout or stderr on failure (token protection)", async () => {
		const execMock = vi.fn(async () => {
			const err = new Error("Failed");
			// Simulate stdout/stderr that might accidentally contain tokens or credentials
			Object.assign(err, { code: 1, stdout: "cf-token-leak", stderr: "sensitive stderr" });
			throw err;
		});
		let thrownMessage = "";
		try {
			await getCloudflareAccessHeader("https://life.hexly.ai", { execFn: execMock });
		} catch (e) {
			thrownMessage = e instanceof Error ? e.message : String(e);
		}
		expect(thrownMessage).toContain("获取 Cloudflare Access Token 失败");
		expect(thrownMessage).toContain("退出代码/错误码: 1");
		expect(thrownMessage).not.toContain("cf-token-leak");
		expect(thrownMessage).not.toContain("sensitive stderr");
	});
});

describe("runImportCli execution", () => {
	let tempDir: string;
	let validGpxFile: string;

	const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LifeTest">
  <trk>
    <trkseg>
      <trkpt lat="31.2304" lon="121.4737">
        <ele>10.5</ele>
        <time>2026-09-13T08:00:00Z</time>
        <speed>1.2</speed>
        <course>90</course>
      </trkpt>
      <trkpt lat="31.2305" lon="121.4738">
        <ele>11.0</ele>
        <time>2026-09-13T08:01:00Z</time>
        <speed>1.3</speed>
        <course>92</course>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "life-cli-test-"));
		validGpxFile = join(tempDir, "valid.gpx");
		writeFileSync(validGpxFile, sampleGpx, "utf8");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("validates missing or invalid provider", async () => {
		const errors: string[] = [];
		const code1 = await runImportCli([], { errorFn: (m) => errors.push(m) });
		expect(code1).toBe(1);
		expect(errors[0]).toContain("缺少必填参数: --provider");

		errors.length = 0;
		const code2 = await runImportCli(["--provider", "unknown"], { errorFn: (m) => errors.push(m) });
		expect(code2).toBe(1);
		expect(errors[0]).toContain("不受支持的 provider");
	});

	it("validates missing or non-existent file", async () => {
		const errors: string[] = [];
		const code1 = await runImportCli(["--provider", "footprint"], {
			errorFn: (m) => errors.push(m),
		});
		expect(code1).toBe(1);
		expect(errors[0]).toContain("缺少必填参数: --file");

		errors.length = 0;
		const code2 = await runImportCli(
			["--provider", "footprint", "--file", "nonexistent-file.gpx"],
			{ errorFn: (m) => errors.push(m) },
		);
		expect(code2).toBe(1);
		expect(errors[0]).toContain("指定的文件不存在");
	});

	it("validates required target when not dry-run", async () => {
		const errors: string[] = [];
		const code = await runImportCli(["--provider", "footprint", "--file", validGpxFile], {
			errorFn: (m) => errors.push(m),
		});
		expect(code).toBe(1);
		expect(errors[0]).toContain("必须显式指定 --target");
	});

	it("executes dry-run successfully in text and JSON mode", async () => {
		const logs: string[] = [];
		const code = await runImportCli(
			["--provider", "footprint", "--file", validGpxFile, "--dry-run"],
			{ logFn: (m) => logs.push(m) },
		);
		expect(code).toBe(0);
		expect(logs.some((l) => l.includes("Dry Run 校验成功"))).toBe(true);

		logs.length = 0;
		const jsonCode = await runImportCli(
			["--provider", "footprint", "--file", validGpxFile, "--dry-run", "--json"],
			{ logFn: (m) => logs.push(m) },
		);
		expect(jsonCode).toBe(0);
		const parsed = JSON.parse(logs[0] as string);
		expect(parsed.dryRun).toBe(true);
		expect(parsed.stats.pointCount).toBe(2);
		expect(parsed.stats.totalDays).toBe(1);
	});

	it("reports GPX parsing error", async () => {
		const badGpx = join(tempDir, "bad.gpx");
		writeFileSync(badGpx, "invalid xml not gpx", "utf8");
		const errors: string[] = [];
		const code = await runImportCli(["--provider", "footprint", "--file", badGpx, "--dry-run"], {
			errorFn: (m) => errors.push(m),
		});
		expect(code).toBe(1);
		expect(errors[0]).toContain("解析 GPX 文件失败");
	});

	it("fails when remote target differs from CLI argument", async () => {
		const errors: string[] = [];
		const fakeClient = {
			target: vi.fn(async () => "local" as const),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		vi.spyOn(footprintClientModule, "createFootprintClient").mockReturnValue(fakeClient);

		const code = await runImportCli(
			[
				"--provider",
				"footprint",
				"--file",
				validGpxFile,
				"--target",
				"production",
				"--base-url",
				"http://127.0.0.1:7011",
			],
			{ errorFn: (m) => errors.push(m) },
		);

		expect(code).toBe(1);
		expect(errors[0]).toContain("目标环境校验失败");
	});

	it("performs full import with target matching and includes target/baseUrl in JSON output without tokens", async () => {
		const logs: string[] = [];
		const fakeReceipt: FootprintImportReceipt = {
			sessionId: "sess-test",
			status: "complete",
			committedDays: 1,
			committedPoints: 2,
			insertedDays: 1,
			updatedDays: 0,
			unchangedDays: 0,
		};

		const fakeClient = {
			target: vi.fn(async () => "production" as const),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		vi.spyOn(footprintClientModule, "createFootprintClient").mockReturnValue(fakeClient);
		vi.spyOn(footprintClientModule, "uploadFootprintPlan").mockResolvedValue(fakeReceipt);

		const code = await runImportCli(
			[
				"--provider",
				"footprint",
				"--file",
				validGpxFile,
				"--target",
				"production",
				"--base-url",
				"http://127.0.0.1:7011",
				"--json",
			],
			{ logFn: (m) => logs.push(m) },
		);

		expect(code).toBe(0);
		const out = JSON.parse(logs[0] as string);
		expect(out.success).toBe(true);
		expect(out.target).toBe("production");
		expect(out.baseUrl).toBe("http://127.0.0.1:7011");
		expect(out.receipt.sessionId).toBe("sess-test");
		expect(JSON.stringify(out)).not.toContain("cf-access-token");
	});

	it("aborts when signal is triggered", async () => {
		const sigintListeners = process.listenerCount("SIGINT");
		const sigtermListeners = process.listenerCount("SIGTERM");
		const abortController = new AbortController();
		abortController.abort();
		const errors: string[] = [];
		const code = await runImportCli(
			[
				"--provider",
				"footprint",
				"--file",
				validGpxFile,
				"--target",
				"production",
				"--base-url",
				"http://127.0.0.1:7011",
			],
			{
				signal: abortController.signal,
				errorFn: (m) => errors.push(m),
			},
		);
		expect(code).toBe(1);
		expect(errors[0]).toContain("解析 GPX 文件失败");
		expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
		expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
	});
	it("honors SIGTERM with an injected signal and removes process handlers", async () => {
		const controller = new AbortController();
		const before = process.listeners("SIGTERM");
		const client = {
			target: vi.fn(async (signal?: AbortSignal) => {
				const handler = process.listeners("SIGTERM").find((listener) => !before.includes(listener));
				handler?.("SIGTERM");
				signal?.throwIfAborted();
				return "production" as const;
			}),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		vi.spyOn(footprintClientModule, "createFootprintClient").mockReturnValue(client);
		const errors: string[] = [];
		const code = await runImportCli(
			[
				"--provider",
				"footprint",
				"--file",
				validGpxFile,
				"--target",
				"production",
				"--base-url",
				"http://127.0.0.1:7011",
				"--json",
			],
			{ signal: controller.signal, errorFn: (error) => errors.push(error), logFn: vi.fn() },
		);
		expect(code).toBe(1);
		expect(errors[0]).toContain("无法连接目标服务");
		expect(controller.signal.aborted).toBe(false);
		expect(process.listeners("SIGTERM")).toEqual(before);
		expect(client.begin).not.toHaveBeenCalled();
	});
});
