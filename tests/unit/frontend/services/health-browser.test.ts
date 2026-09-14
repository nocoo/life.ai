import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	HealthImportReceipt,
	HealthPlan,
	HealthProgress,
} from "../../../../src/models/health-types";
import {
	createHealthWorker,
	HealthBrowserSession,
	type HealthPreview,
	type HealthWorkerIn,
	type HealthWorkerOut,
	healthPreview,
} from "../../../../src/services/health-browser";
import * as staging from "../../../../src/services/health-staging";

const preview: HealthPreview = {
	dayCount: 2,
	recordCount: 10,
	xmlRecordCount: 9,
	dimensionCount: 3,
	seriesCount: 5,
	fileCount: 1,
	routePointCount: 30,
	ecgSampleCount: 4,
	payloadBytes: 100,
	firstAt: 1,
	lastAt: 30,
	warnings: ["原文件已保存"],
};
const receipt: HealthImportReceipt = {
	sessionId: "health",
	status: "complete",
	committedDays: 2,
	committedRecords: 10,
	insertedDays: 2,
	updatedDays: 0,
	unchangedDays: 0,
};
const progress: HealthProgress = {
	phase: "packing",
	bytesRead: 100,
	totalBytes: 100,
	recordCount: 10,
	completed: 1,
	total: 2,
};
const file = () => new File(["<HealthData/>"], "export.xml");

class FakeWorker {
	onmessage: ((event: MessageEvent<HealthWorkerOut>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	inbox: HealthWorkerIn[] = [];
	terminated = false;
	automatic = true;
	postMessage(message: HealthWorkerIn) {
		this.inbox.push(message);
		if (!this.automatic || message.type === "cancel") return;
		queueMicrotask(() => {
			this.reply({ type: "progress", id: message.id, progress });
			this.reply(
				message.type === "start"
					? { type: "preview", id: message.id, preview }
					: { type: "complete", id: message.id, receipt },
			);
		});
	}
	reply(message: HealthWorkerOut) {
		this.onmessage?.({ data: message } as MessageEvent<HealthWorkerOut>);
	}
	terminate() {
		this.terminated = true;
	}
}

beforeEach(() => vi.spyOn(staging, "deleteHealthStaging").mockResolvedValue());
afterEach(() => vi.useRealTimers());

describe("browser health preview", () => {
	it("keeps summary metadata and original extrema while excluding compressed bodies", () => {
		const plan = {
			days: [
				{ firstAt: 20, lastAt: 30, data: { secret: "body" } },
				{ firstAt: 1, lastAt: 3 },
			],
			files: [{}],
			recordCount: 10,
			xmlRecordCount: 9,
			dimensionCount: 3,
			seriesCount: 5,
			routePointCount: 30,
			ecgSampleCount: 4,
			payloadBytes: 100,
			warnings: ["原文件已保存"],
		} as unknown as HealthPlan;
		expect(healthPreview(plan)).toEqual(preview);
		expect(healthPreview(plan)).not.toHaveProperty("days");
		expect(healthPreview(plan)).not.toHaveProperty("files");
	});
});

describe("health browser Worker session", () => {
	it("uses the module worker factory and transfers a directory's relative paths with only summaries returning", async () => {
		const worker = new FakeWorker();
		const workerFactory = vi.fn(function WorkerFactory(_url: URL, _options: WorkerOptions) {
			return worker;
		});
		vi.stubGlobal("Worker", workerFactory);
		expect(createHealthWorker()).toBe(worker);
		const session = new HealthBrowserSession();
		const onProgress = vi.fn();
		const relative = new File(["gpx"], "ride.gpx");
		Object.defineProperty(relative, "webkitRelativePath", {
			value: "apple_health_export/workout-routes/ride.gpx",
		});
		expect(await session.parse([file(), relative], onProgress)).toEqual(preview);
		expect(workerFactory.mock.calls[0]?.[0].pathname).toMatch(/health-import\.worker\.ts$/);
		expect(workerFactory.mock.calls[0]?.[1]).toEqual({ type: "module" });
		expect(worker.inbox[0]).toMatchObject({
			type: "start",
			id: 1,
			files: [{ path: "export.xml" }, { path: "apple_health_export/workout-routes/ride.gpx" }],
		});
		expect(onProgress).toHaveBeenCalledWith(progress);
		expect(await session.upload("local", onProgress)).toEqual(receipt);
		expect(worker.inbox[1]).toEqual({ type: "upload", id: 2, target: "local" });
		session.cancel();
		await session.release();
		await session.release();
		expect(worker.terminated).toBe(true);
		expect(worker.onmessage).toBeNull();
		expect(worker.onerror).toBeNull();
		expect(staging.deleteHealthStaging).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(/^life-health-/),
		);
	});
	it("rejects a missing parse and pre-aborted parse/upload without spawning", async () => {
		const spawn = vi.fn();
		const session = new HealthBrowserSession(spawn);
		await expect(session.upload("local", () => {})).rejects.toThrow("请先选择");
		await expect(session.parse([file()], () => {}, AbortSignal.abort())).rejects.toMatchObject({
			name: "AbortError",
		});
		await expect(session.upload("local", () => {}, AbortSignal.abort())).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(spawn).not.toHaveBeenCalled();
		session.cancel();
		await session.release();
	});
	it("ignores stale response IDs and waits for the matching terminal response", async () => {
		const worker = new FakeWorker();
		worker.automatic = false;
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const onProgress = vi.fn();
		const parsed = session.parse([file()], onProgress);
		await Promise.resolve();
		worker.reply({ type: "progress", id: 0, progress });
		worker.reply({ type: "preview", id: 0, preview });
		expect(onProgress).not.toHaveBeenCalled();
		worker.reply({ type: "progress", id: 1, progress });
		worker.reply({ type: "preview", id: 1, preview });
		expect(await parsed).toEqual(preview);
		expect(onProgress).toHaveBeenCalledOnce();
		await session.release();
	});
	it("waits for an in-flight parse before sending upload", async () => {
		const worker = new FakeWorker();
		worker.automatic = false;
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const parsed = session.parse([file()], () => {});
		await Promise.resolve();
		const uploaded = session.upload("production", () => {});
		await Promise.resolve();
		expect(worker.inbox).toHaveLength(1);
		worker.automatic = true;
		worker.reply({ type: "preview", id: 1, preview });
		await Promise.all([parsed, uploaded]);
		expect(worker.inbox[1]).toEqual({ type: "upload", id: 2, target: "production" });
		await session.release();
	});
	it("settles an upload queued behind a failed parse instead of leaving its caller pending", async () => {
		const worker = new FakeWorker();
		worker.automatic = false;
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const parsed = session.parse([file()], () => {});
		const parseFailed = expect(parsed).rejects.toThrow("invalid XML");
		await Promise.resolve();
		const uploaded = session.upload("local", () => {});
		const uploadFailed = expect(uploaded).rejects.toThrow("missing plan");
		worker.reply({ type: "error", id: 1, message: "invalid XML", aborted: false });
		await parseFailed;
		expect(worker.inbox.at(-1)).toMatchObject({ type: "upload", id: 2 });
		worker.reply({ type: "error", id: 2, message: "missing plan", aborted: false });
		await uploadFailed;
		await session.release();
	});
	it.each([false, true])(
		"returns Worker failures with the correct cancellation semantics (aborted=%s)",
		async (aborted) => {
			const worker = new FakeWorker();
			worker.automatic = false;
			const session = new HealthBrowserSession(() => worker as unknown as Worker);
			const work = session.parse([file()], () => {});
			const assertion = aborted
				? expect(work).rejects.toMatchObject({ name: "AbortError" })
				: expect(work).rejects.toThrow("bad xml");
			await Promise.resolve();
			worker.reply({ type: "error", id: 1, message: "bad xml", aborted });
			await assertion;
			await session.release();
		},
	);
	it.each(["worker crashed", ""])(
		"surfaces thread errors including missing browser messages: %j",
		async (message) => {
			const worker = new FakeWorker();
			worker.automatic = false;
			const session = new HealthBrowserSession(() => worker as unknown as Worker);
			const work = session.parse([file()], () => {});
			const assertion = expect(work).rejects.toThrow(message || "健康数据处理线程失败");
			await Promise.resolve();
			worker.onerror?.({ message } as ErrorEvent);
			await assertion;
			await session.release();
		},
	);
	it("cancels the Worker when a progress listener fails and preserves the listener error", async () => {
		const worker = new FakeWorker();
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const error = new Error("view detached");
		await expect(
			session.parse([file()], () => {
				throw error;
			}),
		).rejects.toBe(error);
		expect(worker.inbox.some((message) => message.type === "cancel")).toBe(true);
		await session.release();
	});
	it("forwards abort and waits for cooperative Worker cleanup before rejecting", async () => {
		const worker = new FakeWorker();
		worker.automatic = false;
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const controller = new AbortController();
		const work = session.parse([file()], () => {}, controller.signal);
		const assertion = expect(work).rejects.toMatchObject({ name: "AbortError" });
		await Promise.resolve();
		controller.abort();
		expect(worker.inbox.at(-1)).toEqual({ type: "cancel" });
		worker.reply({ type: "error", id: 1, message: "cancelled", aborted: true });
		await assertion;
		await session.release();
	});
	it("bounds shutdown of a stuck Worker, rejects pending callers and deletes temporary storage", async () => {
		vi.useFakeTimers();
		const worker = new FakeWorker();
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		await session.parse([file()], () => {});
		worker.automatic = false;
		const uploaded = session.upload("local", () => {});
		const assertion = expect(uploaded).rejects.toMatchObject({ name: "AbortError" });
		await vi.advanceTimersByTimeAsync(0);
		const released = session.release();
		await vi.advanceTimersByTimeAsync(5999);
		expect(worker.terminated).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await Promise.all([released, assertion]);
		expect(worker.terminated).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		expect(staging.deleteHealthStaging).toHaveBeenCalledOnce();
	});
	it("waits for cooperative cancellation without waiting for the shutdown timeout", async () => {
		vi.useFakeTimers();
		const worker = new FakeWorker();
		worker.automatic = false;
		const session = new HealthBrowserSession(() => worker as unknown as Worker);
		const parsed = session.parse([file()], () => {});
		const assertion = expect(parsed).rejects.toMatchObject({ name: "AbortError" });
		await vi.advanceTimersByTimeAsync(0);
		const release = session.release();
		worker.reply({ type: "error", id: 1, aborted: true, message: "cancelled" });
		await Promise.all([release, assertion]);
		expect(worker.terminated).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("does not launch replacement work after cancellation during the previous Worker's release", async () => {
		vi.useFakeTimers();
		const worker = new FakeWorker();
		worker.automatic = false;
		const spawn = vi.fn(() => worker as unknown as Worker);
		const session = new HealthBrowserSession(spawn);
		const old = session.parse([file()], () => {});
		const oldRejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
		await vi.advanceTimersByTimeAsync(0);
		const controller = new AbortController();
		const replacement = session.parse([file()], () => {}, controller.signal);
		const replacementRejected = expect(replacement).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await vi.advanceTimersByTimeAsync(6000);
		await Promise.all([oldRejected, replacementRejected]);
		expect(spawn).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
});
