import { beforeAll, describe, expect, it, vi } from "vitest";
import { packHealthDay } from "../../../../src/models/apple-health";
import type {
	HealthImportReceipt,
	HealthPlan,
	HealthProgress,
	HealthStaging,
} from "../../../../src/models/health-types";
import {
	type HealthWorkerIn,
	type HealthWorkerOut,
	healthPreview,
} from "../../../../src/services/health-browser";
import { createHealthClient } from "../../../../src/services/health-client";
import {
	bindHealthWorker,
	createHealthImportHost,
} from "../../../../src/services/health-import.worker";

type Dependencies = NonNullable<Parameters<typeof createHealthImportHost>[1]>;
let plan: HealthPlan;
const receipt: HealthImportReceipt = {
	sessionId: "health",
	status: "complete",
	committedDays: 1,
	committedRecords: 1,
	insertedDays: 1,
	updatedDays: 0,
	unchangedDays: 0,
};
const progress: HealthProgress = {
	phase: "analyzing",
	bytesRead: 30,
	totalBytes: 30,
	recordCount: 1,
	completed: 0,
	total: 1,
};
beforeAll(async () => {
	const day = await packHealthDay(Date.UTC(2026, 8, 13), [
		{
			name: "Record",
			attributes: {
				type: "HKQuantityTypeIdentifierHeartRate",
				startDate: "2026-09-13T01:00:00Z",
				value: "80",
				unit: "count/min",
			},
		},
	]);
	plan = {
		days: [day],
		files: [],
		recordCount: 1,
		xmlRecordCount: 1,
		dimensionCount: 1,
		seriesCount: 1,
		routePointCount: 0,
		ecgSampleCount: 0,
		payloadBytes: day.payloadBytes,
		warnings: [],
	};
});
function start(id = 1, name = "export.xml"): Extract<HealthWorkerIn, { type: "start" }> {
	return {
		type: "start",
		id,
		stagingName: "health-worker-test",
		files: [{ file: new File(["health source"], name), path: name }],
	};
}
function dependencies() {
	const staging: HealthStaging = {
		append: vi.fn(),
		days: vi.fn(),
		read: vi.fn(),
		clear: vi.fn(async () => {}),
	};
	const archive = {
		files: [
			{ path: "apple_health_export/export.xml", size: 3, stream: () => new Blob(["xml"]).stream() },
		],
		close: vi.fn(async () => {}),
	};
	const deps = {
		parseHealthExport: vi.fn<Dependencies["parseHealthExport"]>().mockResolvedValue(plan),
		openHealthZip: vi.fn<Dependencies["openHealthZip"]>().mockResolvedValue(archive),
		createHealthStaging: vi.fn<Dependencies["createHealthStaging"]>().mockResolvedValue(staging),
		createHealthClient: vi.fn<Dependencies["createHealthClient"]>(createHealthClient),
		uploadHealthPlan: vi.fn<Dependencies["uploadHealthPlan"]>().mockResolvedValue(receipt),
	};
	return { deps, staging, archive };
}

describe("health import Worker host", () => {
	it("passes directory streams and progress through, keeps the full plan inside the Worker for upload", async () => {
		const { deps, staging } = dependencies();
		const posted: HealthWorkerOut[] = [];
		deps.parseHealthExport.mockImplementation(async (files, target, options) => {
			expect(target).toBe(staging);
			expect(files).toHaveLength(2);
			const first = files[0];
			if (!first) throw new Error("fixture");
			expect(await new Response(first.stream()).text()).toBe("health source");
			expect(first.size).toBe(13);
			options?.onProgress?.(progress);
			return plan;
		});
		deps.uploadHealthPlan.mockImplementation(async (_client, held, options) => {
			expect(held).toBe(plan);
			options.onProgress?.({ ...progress, phase: "uploading" });
			return receipt;
		});
		const host = createHealthImportHost((message) => posted.push(message), deps);
		const message = start();
		message.files.push({
			file: new File(["route"], "route.gpx"),
			path: "workout-routes/route.gpx",
		});
		await host.handle(message);
		expect(posted).toEqual([
			{ type: "progress", id: 1, progress },
			{ type: "preview", id: 1, preview: healthPreview(plan) },
		]);
		expect(staging.clear).toHaveBeenCalledOnce();
		expect(deps.openHealthZip).not.toHaveBeenCalled();
		await host.handle({ type: "upload", id: 2, target: "production" });
		expect(deps.uploadHealthPlan).toHaveBeenCalledWith(
			expect.any(Object),
			plan,
			expect.objectContaining({
				fileName: "apple_health_export",
				target: "production",
				channel: "web",
				signal: expect.any(AbortSignal),
			}),
		);
		expect(posted.at(-1)).toEqual({ type: "complete", id: 2, receipt });
	});
	it("publishes the ZIP preview only after both cleanups, allowing immediate upload from the terminal callback", async () => {
		const { deps, staging, archive } = dependencies();
		const posted: HealthWorkerOut[] = [];
		let close: () => void = () => {};
		let clear: () => void = () => {};
		archive.close.mockImplementation(
			() =>
				new Promise((resolve) => {
					close = resolve;
				}),
		);
		vi.mocked(staging.clear).mockImplementation(
			() =>
				new Promise((resolve) => {
					clear = resolve;
				}),
		);
		let upload: Promise<void> | undefined;
		const host = createHealthImportHost((message) => {
			posted.push(message);
			if (message.type === "preview")
				upload = host.handle({ type: "upload", id: 3, target: "local" });
		}, deps);
		const parsing = host.handle(start(1, "导出.ZIP"));
		await vi.waitFor(() => expect(archive.close).toHaveBeenCalled());
		expect(posted).toEqual([]);
		expect(deps.parseHealthExport.mock.calls[0]?.[0]).toBe(archive.files);
		await host.handle({ type: "upload", id: 2, target: "local" });
		expect(posted[0]).toMatchObject({ type: "error", id: 2, message: "上一项处理尚未结束。" });
		close();
		await Promise.resolve();
		expect(posted).toHaveLength(1);
		clear();
		await parsing;
		await upload;
		expect(posted.slice(1)).toEqual([
			{ type: "preview", id: 1, preview: healthPreview(plan) },
			{ type: "complete", id: 3, receipt },
		]);
		expect(deps.uploadHealthPlan.mock.calls[0]?.[2].fileName).toBe("导出.ZIP");
	});
	it("reports missing input or a missing plan without attempting network writes", async () => {
		const { deps } = dependencies();
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		await host.handle({ type: "cancel" });
		await host.handle({ ...start(), files: [] });
		await host.handle({ type: "upload", id: 2, target: "local" });
		expect(posted).toEqual([
			{ type: "error", id: 1, message: "请选择完整 Apple 健康导出。", aborted: false },
			{ type: "error", id: 2, message: "没有可提交的健康解析结果。", aborted: false },
		]);
		expect(deps.createHealthStaging).not.toHaveBeenCalled();
		expect(deps.uploadHealthPlan).not.toHaveBeenCalled();
	});
	it.each([new Error("invalid XML"), "unknown failure"])(
		"cleans up after parser failure and surfaces a safe terminal error: %s",
		async (failure) => {
			const { deps, staging, archive } = dependencies();
			deps.parseHealthExport.mockRejectedValue(failure);
			const posted: HealthWorkerOut[] = [];
			const host = createHealthImportHost((message) => posted.push(message), deps);
			await host.handle(start(1, "export.zip"));
			expect(posted).toEqual([
				{
					type: "error",
					id: 1,
					message: failure instanceof Error ? failure.message : "健康数据处理失败。",
					aborted: false,
				},
			]);
			expect(staging.clear).toHaveBeenCalledOnce();
			expect(archive.close).toHaveBeenCalledOnce();
		},
	);
	it("forgets the old plan when a replacement export fails", async () => {
		const { deps } = dependencies();
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		await host.handle(start());
		deps.parseHealthExport.mockRejectedValue(new Error("replacement failed"));
		await host.handle(start(2));
		await host.handle({ type: "upload", id: 3, target: "local" });
		expect(posted.at(-1)).toMatchObject({
			type: "error",
			id: 3,
			message: "没有可提交的健康解析结果。",
		});
		expect(deps.uploadHealthPlan).not.toHaveBeenCalled();
	});
	it("cancels an active parse, still cleans up and never reports a cancelled plan as ready", async () => {
		const { deps, staging } = dependencies();
		let resolve: (value: HealthPlan) => void = () => {};
		deps.parseHealthExport.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		const parsing = host.handle(start());
		await vi.waitFor(() => expect(deps.parseHealthExport).toHaveBeenCalled());
		await host.handle({ type: "cancel" });
		expect(deps.parseHealthExport.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
		resolve(plan);
		await parsing;
		expect(posted).toEqual([expect.objectContaining({ type: "error", id: 1, aborted: true })]);
		expect(staging.clear).toHaveBeenCalledOnce();
	});
	it("waits for cancelled upload cleanup before emitting its terminal error", async () => {
		const { deps } = dependencies();
		let reject: (error: Error) => void = () => {};
		deps.uploadHealthPlan.mockImplementation(
			() =>
				new Promise((_, failed) => {
					reject = failed;
				}),
		);
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		await host.handle(start());
		posted.length = 0;
		const uploading = host.handle({ type: "upload", id: 2, target: "local" });
		await host.handle({ type: "cancel" });
		expect(posted).toEqual([]);
		reject(new DOMException("cancelled", "AbortError"));
		await uploading;
		expect(posted).toEqual([{ type: "error", id: 2, message: "cancelled", aborted: true }]);
	});
	it("reports cleanup failure and preserves an earlier parser error when both fail", async () => {
		const { deps, staging, archive } = dependencies();
		vi.mocked(staging.clear).mockRejectedValue(new Error("delete denied"));
		archive.close.mockRejectedValue(new Error("archive close failed"));
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		await host.handle(start(1, "data.zip"));
		expect(posted[0]).toMatchObject({
			type: "error",
			message: "无法清理健康暂存数据，请重新选择文件。",
		});
		deps.parseHealthExport.mockRejectedValue(new Error("invalid XML"));
		await host.handle(start(2, "data.zip"));
		expect(posted[1]).toMatchObject({ type: "error", message: "invalid XML" });
		expect(archive.close).toHaveBeenCalledTimes(2);
	});
	it("clears staging when ZIP opening fails", async () => {
		const { deps, staging, archive } = dependencies();
		deps.openHealthZip.mockRejectedValue(new Error("invalid archive"));
		const posted: HealthWorkerOut[] = [];
		const host = createHealthImportHost((message) => posted.push(message), deps);
		await host.handle(start(1, "data.zip"));
		expect(posted[0]).toMatchObject({ type: "error", message: "invalid archive" });
		expect(staging.clear).toHaveBeenCalledOnce();
		expect(archive.close).not.toHaveBeenCalled();
	});
	it("binds a Worker scope to terminal replies without a parser or upload plan", async () => {
		const scope = {
			onmessage: null as ((event: MessageEvent<HealthWorkerIn>) => void) | null,
			postMessage: vi.fn(),
		};
		bindHealthWorker(scope);
		scope.onmessage?.({
			data: { type: "upload", id: 9, target: "local" },
		} as MessageEvent<HealthWorkerIn>);
		await vi.waitFor(() =>
			expect(scope.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "error", id: 9 }),
			),
		);
	});
	it("registers itself in a dedicated Worker global", async () => {
		vi.resetModules();
		const scope = {
			onmessage: null as ((event: MessageEvent<HealthWorkerIn>) => void) | null,
			postMessage: vi.fn(),
		};
		vi.stubGlobal("self", scope);
		await import("../../../../src/services/health-import.worker");
		expect(scope.onmessage).toBeTypeOf("function");
		scope.onmessage?.({
			data: { type: "upload", id: 1, target: "local" },
		} as MessageEvent<HealthWorkerIn>);
		await vi.waitFor(() =>
			expect(scope.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "error", id: 1 }),
			),
		);
	});
});
