import { describe, expect, it, vi } from "vitest";
import type { FootprintImportReceipt } from "../../../../src/models/data-management";
import type { FootprintPlan } from "../../../../src/models/footprint";
import {
	abortError,
	createFootprintImportHost,
	createFootprintWorker,
	FootprintBrowserSession,
	type FootprintImportHostDeps,
	type FootprintWorkerIn,
	type FootprintWorkerOut,
	previewFromPlan,
} from "../../../../src/services/footprint-browser";
import { createFootprintClient } from "../../../../src/services/footprint-client";

const plan: FootprintPlan = {
	days: [
		{
			utcDay: Date.UTC(2026, 8, 13),
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points: [],
			},
			recordCount: 2,
			firstAt: Date.UTC(2026, 8, 13, 1),
			lastAt: Date.UTC(2026, 8, 13, 2),
			payloadBytes: 80,
			contentHash: "abc",
			summary: { hourCounts: Array.from({ length: 24 }, () => 0) },
		},
	],
	pointCount: 2,
	firstAt: Date.UTC(2026, 8, 13, 1),
	lastAt: Date.UTC(2026, 8, 13, 2),
	bytesRead: 40,
	payloadBytes: 80,
};

const receipt: FootprintImportReceipt = {
	sessionId: "s1",
	status: "complete",
	committedDays: 1,
	committedPoints: 2,
	insertedDays: 1,
	updatedDays: 0,
	unchangedDays: 0,
};

function fakeFile(): File {
	return new File(["gpx"], "track.gpx");
}

describe("previewFromPlan", () => {
	it("drops payloads and keeps day totals", () => {
		const preview = previewFromPlan(plan);
		expect(preview.pointCount).toBe(2);
		expect(preview.days[0]).toMatchObject({ utcDay: plan.days[0]?.utcDay, recordCount: 2 });
		expect(preview.days[0]).not.toHaveProperty("data");
	});
});

describe("createFootprintImportHost", () => {
	it("posts preview after parse and keeps the plan for upload", async () => {
		const posted: FootprintWorkerOut[] = [];
		const parseFootprint = vi.fn<FootprintImportHostDeps["parseFootprint"]>(
			async (_input, options) => {
				options?.onProgress?.({ bytesRead: 10, pointCount: 1, totalBytes: 40 });
				return plan;
			},
		);
		const uploadFootprintPlan = vi.fn(async () => receipt);
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint,
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan,
			readFile: async function* () {
				yield new Uint8Array([1]);
			},
		});
		await host.handle({ type: "start", file: fakeFile() });
		expect(posted.some((message) => message.type === "progress")).toBe(true);
		expect(posted.some((message) => message.type === "preview")).toBe(true);
		posted.length = 0;
		await host.handle({ type: "upload", fileName: "track.gpx", target: "local" });
		expect(uploadFootprintPlan).toHaveBeenCalled();
		expect(posted).toContainEqual({ type: "upload-complete", receipt });
	});

	it("rejects upload errors to the page instead of hanging", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async () => plan,
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: async () => {
				throw new Error("conflict");
			},
			readFile: async function* () {},
		});
		await host.handle({ type: "start", file: fakeFile() });
		posted.length = 0;
		await host.handle({ type: "upload", fileName: "track.gpx", target: "local" });
		expect(posted).toEqual([{ type: "error", message: "conflict" }]);
	});

	it("covers empty progress counts and unknown messages", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async (_input, options) => {
				options?.onProgress?.({ bytesRead: 3, pointCount: 0, totalBytes: 8 });
				throw "nope";
			},
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: vi.fn(),
			readFile: async function* () {},
		});
		await host.handle({ type: "start", file: fakeFile() });
		expect(posted.some((message) => message.type === "progress")).toBe(true);
		expect(posted).toContainEqual({ type: "error", message: "解析失败" });
		await host.handle({ type: "noop" } as unknown as FootprintWorkerIn);
	});

	it("reports parse failure and missing plan on upload", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async () => {
				throw new Error("bad xml");
			},
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: vi.fn(),
			readFile: async function* () {},
		});
		await host.handle({ type: "start", file: fakeFile() });
		expect(posted).toEqual([{ type: "error", message: "bad xml" }]);
		posted.length = 0;
		await host.handle({ type: "upload", fileName: "track.gpx", target: "local" });
		expect(posted).toEqual([{ type: "error", message: "没有可提交的解析结果。" }]);
		await host.handle({ type: "cancel" });
	});

	it("uses file chunks and treats aborted success as cancelled", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async (input) => {
				for await (const chunk of input) {
					expect(chunk.byteLength).toBeGreaterThan(0);
				}
				await host.handle({ type: "cancel" });
				return plan;
			},
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: async () => receipt,
		});
		await host.handle({ type: "start", file: fakeFile() });
		expect(posted.some((message) => message.type === "cancelled")).toBe(true);
		posted.length = 0;
		const ready = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async () => plan,
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: async () => {
				await ready.handle({ type: "cancel" });
				return receipt;
			},
			readFile: async function* () {},
		});
		await ready.handle({ type: "start", file: fakeFile() });
		posted.length = 0;
		await ready.handle({ type: "upload", fileName: "track.gpx", target: "local" });
		expect(posted).toEqual([{ type: "cancelled" }]);
	});

	it("maps empty errors and aborted uploads", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async () => {
				throw new Error("   ");
			},
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: async () => {
				const error = new Error("aborted");
				error.name = "AbortError";
				throw error;
			},
			readFile: async function* () {},
		});
		await host.handle({ type: "start", file: fakeFile() });
		expect(posted).toEqual([{ type: "error", message: "解析失败" }]);
	});

	it("cancels parse when the signal aborts", async () => {
		const posted: FootprintWorkerOut[] = [];
		const host = createFootprintImportHost((message) => posted.push(message), {
			parseFootprint: async (_input, options) => {
				options?.signal?.throwIfAborted();
				await new Promise<void>((_, reject) => {
					options?.signal?.addEventListener("abort", () => {
						const error = new Error("aborted");
						error.name = "AbortError";
						reject(error);
					});
				});
				return plan;
			},
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: vi.fn(),
			readFile: async function* () {},
		});
		const started = host.handle({ type: "start", file: fakeFile() });
		await host.handle({ type: "cancel" });
		await started;
		expect(posted).toEqual([{ type: "cancelled" }]);
	});

	it("waits for upload cleanup before dropping the plan on release", async () => {
		let finishUpload: () => void = () => {};
		let sawPlan = false;
		const host = createFootprintImportHost(() => {}, {
			parseFootprint: async () => plan,
			createFootprintClient: vi.fn(createFootprintClient),
			uploadFootprintPlan: async (_client, held, options) => {
				await new Promise<void>((resolve) => {
					finishUpload = resolve;
					options?.signal?.addEventListener("abort", () => resolve());
				});
				sawPlan = held.pointCount === 2;
				return { ...receipt, status: "cancelled" };
			},
			readFile: async function* () {},
		});
		await host.handle({ type: "start", file: fakeFile() });
		const uploading = host.handle({ type: "upload", fileName: "track.gpx", target: "local" });
		const releasing = host.handle({ type: "release" });
		finishUpload();
		await Promise.all([uploading, releasing]);
		expect(sawPlan).toBe(true);
	});
});

class FakeWorker {
	onmessage: ((event: MessageEvent<FootprintWorkerOut>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	terminated = false;
	inbox: FootprintWorkerIn[] = [];

	mode: "ok" | "parse-error" | "parse-cancel" | "upload-error" | "onerror" | "hang" = "ok";

	postMessage(message: FootprintWorkerIn): void {
		this.inbox.push(message);
		if (message.type === "cancel" || message.type === "release") {
			queueMicrotask(() => {
				this.onmessage?.({ data: { type: "cancelled" } } as MessageEvent<FootprintWorkerOut>);
			});
			return;
		}
		if (message.type === "start") {
			if (this.mode === "hang") {
				return;
			}
			queueMicrotask(() => {
				if (this.mode === "onerror") {
					this.onerror?.({ message: "" } as ErrorEvent);
					return;
				}
				if (this.mode === "parse-error") {
					this.onmessage?.({
						data: { type: "error", message: "parse failed" },
					} as MessageEvent<FootprintWorkerOut>);
					return;
				}
				if (this.mode === "parse-cancel") {
					this.onmessage?.({ data: { type: "cancelled" } } as MessageEvent<FootprintWorkerOut>);
					return;
				}
				this.onmessage?.({
					data: { type: "progress", bytesRead: 10, totalBytes: 40, pointCount: 1 },
				} as MessageEvent<FootprintWorkerOut>);
				this.onmessage?.({
					data: { type: "preview", preview: previewFromPlan(plan) },
				} as MessageEvent<FootprintWorkerOut>);
			});
			return;
		}
		if (message.type === "upload") {
			if (this.mode === "hang") {
				return;
			}
			queueMicrotask(() => {
				if (this.mode === "onerror") {
					this.onerror?.({ message: "" } as ErrorEvent);
					return;
				}
				if (this.mode === "upload-error") {
					this.onmessage?.({
						data: { type: "error", message: "upload failed" },
					} as MessageEvent<FootprintWorkerOut>);
					return;
				}
				this.onmessage?.({
					data: { type: "upload-progress", receipt: { ...receipt, status: "running" } },
				} as MessageEvent<FootprintWorkerOut>);
				this.onmessage?.({
					data: { type: "upload-complete", receipt },
				} as MessageEvent<FootprintWorkerOut>);
			});
		}
	}

	terminate(): void {
		this.terminated = true;
	}
}

describe("FootprintBrowserSession", () => {
	it("bounds a stuck worker shutdown, rejects pending work and clears the timer", async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const session = new FootprintBrowserSession(() => worker as unknown as Worker);
			const parsing = session.parse(fakeFile(), () => {});
			await vi.advanceTimersByTimeAsync(0);
			await parsing;
			vi.spyOn(worker, "postMessage").mockImplementation(() => {});
			const pending = session.upload("track.gpx", "local", () => {});
			const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
			await vi.advanceTimersByTimeAsync(0);
			const release = session.release();
			await vi.advanceTimersByTimeAsync(5999);
			expect(worker.terminated).toBe(false);
			await vi.advanceTimersByTimeAsync(2);
			await Promise.all([release, rejected]);
			expect(worker.terminated).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
	it("does not start another worker when cancelled while releasing the previous parse", async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			vi.spyOn(worker, "postMessage").mockImplementation(() => {});
			const spawn = vi.fn(() => worker as unknown as Worker);
			const session = new FootprintBrowserSession(spawn);
			const first = session.parse(fakeFile(), () => {});
			const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
			await vi.advanceTimersByTimeAsync(0);
			const controller = new AbortController();
			const next = session.parse(fakeFile(), () => {}, controller.signal);
			const nextRejected = expect(next).rejects.toMatchObject({ name: "AbortError" });
			controller.abort();
			await vi.advanceTimersByTimeAsync(6001);
			await Promise.all([firstRejected, nextRejected]);
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
	it("cancels in-flight parse via AbortSignal", async () => {
		const worker = new FakeWorker();
		worker.mode = "hang";
		const session = new FootprintBrowserSession(() => worker as unknown as Worker);
		const parseSignal = new AbortController();
		const parsing = session.parse(fakeFile(), () => {}, parseSignal.signal);
		await Promise.resolve();
		parseSignal.abort();
		expect(worker.inbox.some((message) => message.type === "cancel")).toBe(true);
		worker.mode = "parse-cancel";
		worker.postMessage({ type: "cancel" });
		await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
		const uploadWorker = new FakeWorker();
		const uploading = new FootprintBrowserSession(() => uploadWorker as unknown as Worker);
		await uploading.parse(fakeFile(), () => {});
		uploadWorker.mode = "hang";
		const uploadSignal = new AbortController();
		const pendingUpload = uploading.upload("track.gpx", "local", () => {}, uploadSignal.signal);
		await Promise.resolve();
		uploadSignal.abort();
		expect(uploadWorker.inbox.some((message) => message.type === "cancel")).toBe(true);
		uploadWorker.mode = "parse-cancel";
		uploadWorker.postMessage({ type: "cancel" });
		await expect(pendingUpload).rejects.toMatchObject({ name: "AbortError" });
	});

	it("rejects parse and upload when already aborted", async () => {
		const session = new FootprintBrowserSession(() => new FakeWorker() as unknown as Worker);
		const controller = new AbortController();
		controller.abort();
		await expect(session.parse(fakeFile(), () => {}, controller.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
		await expect(
			session.upload("track.gpx", "local", () => {}, controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("parses and uploads through the worker without transferring raw days", async () => {
		const worker = new FakeWorker();
		const session = new FootprintBrowserSession(() => worker as unknown as Worker);
		const seenProgress: number[] = [];
		const preview = await session.parse(fakeFile(), (progress) =>
			seenProgress.push(progress.pointCount),
		);
		expect(preview.pointCount).toBe(2);
		expect(seenProgress).toEqual([1]);
		const uploaded = await session.upload("track.gpx", "local", () => {});
		expect(uploaded.committedDays).toBe(1);
		expect(worker.inbox.map((message) => message.type)).toEqual(["start", "upload"]);
		session.cancel();
		await session.release();
		expect(worker.terminated).toBe(true);
	});

	it("surfaces worker parse and upload failures", async () => {
		const parseWorker = new FakeWorker();
		parseWorker.mode = "parse-error";
		const parseSession = new FootprintBrowserSession(() => parseWorker as unknown as Worker);
		await expect(parseSession.parse(fakeFile(), () => {})).rejects.toThrow("parse failed");
		const uploadSession = new FootprintBrowserSession(() => new FakeWorker() as unknown as Worker);
		await expect(uploadSession.upload("track.gpx", "local", () => {})).rejects.toThrow(
			"没有可提交的解析结果。",
		);
		const failUpload = new FakeWorker();
		const session = new FootprintBrowserSession(() => failUpload as unknown as Worker);
		await session.parse(fakeFile(), () => {});
		failUpload.mode = "upload-error";
		await expect(session.upload("track.gpx", "local", () => {})).rejects.toThrow("upload failed");
		await session.release();
		await new FootprintBrowserSession().release();
	});

	it("rejects when the worker reports cancel", async () => {
		const worker = new FakeWorker();
		worker.mode = "parse-cancel";
		const session = new FootprintBrowserSession(() => worker as unknown as Worker);
		await expect(session.parse(fakeFile(), () => {})).rejects.toMatchObject({ name: "AbortError" });
	});

	it("exports abortError for cancelled work", () => {
		expect(abortError().name).toBe("AbortError");
	});

	it("rejects worker onerror during parse and upload", async () => {
		const worker = new FakeWorker();
		worker.mode = "onerror";
		const session = new FootprintBrowserSession(() => worker as unknown as Worker);
		await expect(session.parse(fakeFile(), () => {})).rejects.toThrow("解析线程失败");
		const uploadWorker = new FakeWorker();
		const uploading = new FootprintBrowserSession(() => uploadWorker as unknown as Worker);
		await uploading.parse(fakeFile(), () => {});
		uploadWorker.mode = "onerror";
		await expect(uploading.upload("track.gpx", "local", () => {})).rejects.toThrow("提交线程失败");
	});

	it("constructs a module worker factory", () => {
		expect(typeof createFootprintWorker).toBe("function");
		try {
			const worker = createFootprintWorker();
			worker.terminate();
		} catch {
			// Node may not implement Vite worker URLs.
		}
	});

	it("binds the dedicated worker entry", async () => {
		const { bindFootprintWorker } = await import(
			"../../../../src/services/footprint-import.worker"
		);
		const scope = {
			onmessage: null as ((event: MessageEvent<FootprintWorkerIn>) => void) | null,
			postMessage: (_message: FootprintWorkerOut) => {},
		};
		bindFootprintWorker(scope);
		expect(typeof scope.onmessage).toBe("function");
		const { maybeBindDedicatedWorker } = await import(
			"../../../../src/services/footprint-import.worker"
		);
		vi.stubGlobal("self", scope);
		maybeBindDedicatedWorker();
		vi.unstubAllGlobals();
	});
});
