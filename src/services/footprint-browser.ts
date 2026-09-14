import type { DataTarget, FootprintImportReceipt } from "../models/data-management";
import { type FootprintPlan, parseFootprint } from "../models/footprint";
import { createFootprintClient, uploadFootprintPlan } from "./footprint-client";

export interface FootprintPreviewDay {
	utcDay: number;
	recordCount: number;
	firstAt: number;
	lastAt: number;
	payloadBytes: number;
}

export interface FootprintPreview {
	days: FootprintPreviewDay[];
	pointCount: number;
	firstAt: number;
	lastAt: number;
	bytesRead: number;
	payloadBytes: number;
}

export interface FootprintParseProgress {
	bytesRead: number;
	totalBytes: number;
	pointCount: number;
}

export type FootprintWorkerIn =
	| { type: "start"; file: File }
	| { type: "cancel" }
	| { type: "release" }
	| { type: "upload"; fileName: string; target: DataTarget };

export type FootprintWorkerOut =
	| { type: "progress"; bytesRead: number; totalBytes: number; pointCount: number }
	| { type: "preview"; preview: FootprintPreview }
	| { type: "upload-progress"; receipt: FootprintImportReceipt }
	| { type: "upload-complete"; receipt: FootprintImportReceipt }
	| { type: "error"; message: string }
	| { type: "cancelled" };

export function abortError(message = "已取消"): Error {
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}

export function previewFromPlan(next: FootprintPlan): FootprintPreview {
	return {
		days: next.days.map((day) => ({
			utcDay: day.utcDay,
			recordCount: day.recordCount,
			firstAt: day.firstAt,
			lastAt: day.lastAt,
			payloadBytes: day.payloadBytes,
		})),
		pointCount: next.pointCount,
		firstAt: next.firstAt,
		lastAt: next.lastAt,
		bytesRead: next.bytesRead,
		payloadBytes: next.payloadBytes,
	};
}

async function* fileChunks(file: File): AsyncIterable<Uint8Array> {
	const reader = file.stream().getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				return;
			}
			if (value) {
				yield value;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

export interface FootprintImportHostDeps {
	parseFootprint: typeof parseFootprint;
	createFootprintClient: typeof createFootprintClient;
	uploadFootprintPlan: typeof uploadFootprintPlan;
	readFile?: (file: File) => AsyncIterable<Uint8Array>;
}

export function createFootprintImportHost(
	post: (message: FootprintWorkerOut) => void,
	deps: FootprintImportHostDeps = {
		parseFootprint,
		createFootprintClient,
		uploadFootprintPlan,
		readFile: fileChunks,
	},
) {
	let plan: FootprintPlan | null = null;
	let parseController: AbortController | null = null;
	let uploadController: AbortController | null = null;
	let parseTask: Promise<void> | null = null;
	let uploadTask: Promise<void> | null = null;

	async function runParse(file: File): Promise<void> {
		parseController?.abort();
		const controller = new AbortController();
		parseController = controller;
		plan = null;
		try {
			const next = await deps.parseFootprint((deps.readFile ?? fileChunks)(file), {
				totalBytes: file.size,
				signal: controller.signal,
				onProgress: (progress) => {
					post({
						type: "progress",
						bytesRead: progress.bytesRead,
						totalBytes: file.size,
						pointCount: progress.pointCount,
					});
				},
			});
			if (controller.signal.aborted) {
				post({ type: "cancelled" });
				return;
			}
			plan = next;
			post({ type: "preview", preview: previewFromPlan(next) });
		} catch (error) {
			if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
				post({ type: "cancelled" });
				return;
			}
			post({
				type: "error",
				message: error instanceof Error && error.message.trim() ? error.message : "解析失败",
			});
		}
	}

	async function runUpload(fileName: string, target: DataTarget): Promise<void> {
		if (!plan) {
			post({ type: "error", message: "没有可提交的解析结果。" });
			return;
		}
		uploadController?.abort();
		const controller = new AbortController();
		uploadController = controller;
		const held = plan;
		try {
			const receipt = await deps.uploadFootprintPlan(deps.createFootprintClient(), held, {
				fileName,
				channel: "web",
				target,
				signal: controller.signal,
				onProgress: (next) => post({ type: "upload-progress", receipt: next }),
			});
			if (controller.signal.aborted) {
				post({ type: "cancelled" });
				return;
			}
			post({ type: "upload-complete", receipt });
		} catch (error) {
			if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
				post({ type: "cancelled" });
				return;
			}
			post({
				type: "error",
				message: error instanceof Error && error.message.trim() ? error.message : "提交失败",
			});
		}
	}

	return {
		async handle(message: FootprintWorkerIn): Promise<void> {
			if (message.type === "cancel") {
				parseController?.abort();
				uploadController?.abort();
				return;
			}
			if (message.type === "release") {
				parseController?.abort();
				uploadController?.abort();
				if (parseTask) {
					await parseTask;
				}
				if (uploadTask) {
					await uploadTask;
				}
				plan = null;
				return;
			}
			if (message.type === "upload") {
				uploadTask = runUpload(message.fileName, message.target);
				await uploadTask;
				uploadTask = null;
				return;
			}
			if (message.type !== "start") {
				return;
			}
			parseTask = runParse(message.file);
			await parseTask;
			parseTask = null;
		},
	};
}

export function createFootprintWorker(): Worker {
	return new Worker(new URL("./footprint-import.worker.ts", import.meta.url), { type: "module" });
}

function listenAbort(signal: AbortSignal | undefined, onAbort: () => void): () => void {
	if (!signal) {
		return () => {};
	}
	signal.addEventListener("abort", onAbort);
	return () => signal.removeEventListener("abort", onAbort);
}

export class FootprintBrowserSession {
	private worker: Worker | null = null;
	private inflight: Promise<unknown> | null = null;
	private rejectInflight: (() => void) | null = null;

	constructor(private readonly spawn: () => Worker = createFootprintWorker) {}

	async parse(
		file: File,
		onProgress: (progress: FootprintParseProgress) => void,
		signal?: AbortSignal,
	): Promise<FootprintPreview> {
		if (signal?.aborted) {
			return Promise.reject(abortError());
		}
		await this.release();
		if (signal?.aborted) {
			return Promise.reject(abortError());
		}
		const worker = this.spawn();
		this.worker = worker;
		const work = new Promise<FootprintPreview>((resolve, reject) => {
			const stop = listenAbort(signal, () => {
				worker.postMessage({ type: "cancel" } satisfies FootprintWorkerIn);
			});
			this.rejectInflight = () => {
				stop();
				reject(abortError());
			};
			worker.onmessage = (event: MessageEvent<FootprintWorkerOut>) => {
				const message = event.data;
				if (message.type === "progress") {
					onProgress(message);
					return;
				}
				if (message.type === "preview") {
					stop();
					resolve(message.preview);
					return;
				}
				if (message.type === "cancelled") {
					stop();
					reject(abortError());
					return;
				}
				if (message.type === "error") {
					stop();
					reject(new Error(message.message));
				}
			};
			worker.onerror = (event) => {
				stop();
				reject(new Error(event.message || "解析线程失败"));
			};
			worker.postMessage({ type: "start", file } satisfies FootprintWorkerIn);
		});
		this.inflight = work;
		try {
			return await work;
		} finally {
			if (this.inflight === work) {
				this.inflight = null;
				this.rejectInflight = null;
			}
		}
	}

	async upload(
		fileName: string,
		target: DataTarget,
		onProgress: (receipt: FootprintImportReceipt) => void,
		signal?: AbortSignal,
	): Promise<FootprintImportReceipt> {
		if (signal?.aborted) {
			return Promise.reject(abortError());
		}
		await this.inflight?.catch(() => {});
		signal?.throwIfAborted();
		const worker = this.worker;
		if (!worker) {
			return Promise.reject(new Error("没有可提交的解析结果。"));
		}
		const work = new Promise<FootprintImportReceipt>((resolve, reject) => {
			const stop = listenAbort(signal, () => {
				worker.postMessage({ type: "cancel" } satisfies FootprintWorkerIn);
			});
			this.rejectInflight = () => {
				stop();
				reject(abortError());
			};
			worker.onmessage = (event: MessageEvent<FootprintWorkerOut>) => {
				const message = event.data;
				if (message.type === "upload-progress") {
					onProgress(message.receipt);
					return;
				}
				if (message.type === "upload-complete") {
					stop();
					resolve(message.receipt);
					return;
				}
				if (message.type === "cancelled") {
					stop();
					reject(abortError());
					return;
				}
				if (message.type === "error") {
					stop();
					reject(new Error(message.message));
				}
			};
			worker.onerror = (event) => {
				stop();
				reject(new Error(event.message || "提交线程失败"));
			};
			worker.postMessage({ type: "upload", fileName, target } satisfies FootprintWorkerIn);
		});
		this.inflight = work;
		try {
			return await work;
		} finally {
			if (this.inflight === work) {
				this.inflight = null;
				this.rejectInflight = null;
			}
		}
	}

	cancel(): void {
		this.worker?.postMessage({ type: "cancel" } satisfies FootprintWorkerIn);
	}

	async release(): Promise<void> {
		const worker = this.worker;
		if (!worker) {
			return;
		}
		worker.postMessage({ type: "cancel" } satisfies FootprintWorkerIn);
		worker.postMessage({ type: "release" } satisfies FootprintWorkerIn);
		const pending = this.inflight;
		const rejectPending = this.rejectInflight;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			if (pending) {
				await Promise.race([
					pending.catch(() => {}),
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, 6000);
					}),
				]);
			}
		} finally {
			clearTimeout(timer);
			rejectPending?.();
			worker.onmessage = null;
			worker.onerror = null;
			worker.terminate();
			if (this.worker === worker) this.worker = null;
			if (this.inflight === pending) {
				this.inflight = null;
				this.rejectInflight = null;
			}
		}
	}
}
