import type { DataTarget } from "../models/data-management";
import type { HealthImportReceipt, HealthPlan, HealthProgress } from "../models/health-types";
import { deleteHealthStaging } from "./health-staging";

export interface HealthPreview {
	dayCount: number;
	recordCount: number;
	xmlRecordCount: number;
	dimensionCount: number;
	seriesCount: number;
	fileCount: number;
	routePointCount: number;
	ecgSampleCount: number;
	payloadBytes: number;
	firstAt: number;
	lastAt: number;
	warnings: string[];
}

export function healthPreview(plan: HealthPlan): HealthPreview {
	return {
		dayCount: plan.days.length,
		recordCount: plan.recordCount,
		xmlRecordCount: plan.xmlRecordCount,
		dimensionCount: plan.dimensionCount,
		seriesCount: plan.seriesCount,
		fileCount: plan.files.length,
		routePointCount: plan.routePointCount,
		ecgSampleCount: plan.ecgSampleCount,
		payloadBytes: plan.payloadBytes,
		firstAt: Math.min(...plan.days.map((day) => day.firstAt)),
		lastAt: Math.max(...plan.days.map((day) => day.lastAt)),
		warnings: plan.warnings,
	};
}

export type HealthWorkerIn =
	| { type: "start"; id: number; files: { file: File; path: string }[]; stagingName: string }
	| { type: "upload"; id: number; target: DataTarget }
	| { type: "cancel" };
export type HealthWorkerOut =
	| { type: "progress"; id: number; progress: HealthProgress }
	| { type: "preview"; id: number; preview: HealthPreview }
	| { type: "complete"; id: number; receipt: HealthImportReceipt }
	| { type: "error"; id: number; message: string; aborted: boolean };

export function createHealthWorker(): Worker {
	return new Worker(new URL("./health-import.worker.ts", import.meta.url), { type: "module" });
}

export class HealthBrowserSession {
	private worker: Worker | null = null;
	private stagingName: string | null = null;
	private sequence = 0;
	private inflight: Promise<unknown> | null = null;
	private rejectPending: (() => void) | null = null;
	constructor(private readonly spawn: () => Worker = createHealthWorker) {}

	async parse(
		files: File[],
		onProgress: (progress: HealthProgress) => void,
		signal?: AbortSignal,
	): Promise<HealthPreview> {
		signal?.throwIfAborted();
		await this.release();
		signal?.throwIfAborted();
		this.worker = this.spawn();
		this.stagingName = `life-health-${crypto.randomUUID()}`;
		return this.run<HealthPreview>(
			{
				type: "start",
				id: ++this.sequence,
				stagingName: this.stagingName,
				files: files.map((file) => ({ file, path: file.webkitRelativePath || file.name })),
			},
			onProgress,
			signal,
		);
	}

	async upload(
		target: DataTarget,
		onProgress: (progress: HealthProgress) => void,
		signal?: AbortSignal,
	): Promise<HealthImportReceipt> {
		await this.inflight?.catch(() => {});
		return this.run<HealthImportReceipt>(
			{ type: "upload", id: ++this.sequence, target },
			onProgress,
			signal,
		);
	}

	private async run<T>(
		message: Exclude<HealthWorkerIn, { type: "cancel" }>,
		onProgress: (progress: HealthProgress) => void,
		signal?: AbortSignal,
	): Promise<T> {
		signal?.throwIfAborted();
		const worker = this.worker;
		if (!worker) throw new Error("请先选择并整理健康导出文件。");
		const stop = () => worker.postMessage({ type: "cancel" } satisfies HealthWorkerIn);
		signal?.addEventListener("abort", stop, { once: true });
		const work = new Promise<T>((resolve, reject) => {
			this.rejectPending = () => reject(new DOMException("已取消", "AbortError"));
			worker.onmessage = (event: MessageEvent<HealthWorkerOut>) => {
				const response = event.data;
				if (response.id !== message.id) return;
				if (response.type === "progress") {
					try {
						onProgress(response.progress);
					} catch (error) {
						stop();
						reject(error);
					}
				} else if (response.type === "preview") resolve(response.preview as T);
				else if (response.type === "complete") resolve(response.receipt as T);
				else
					reject(
						response.aborted
							? new DOMException("已取消", "AbortError")
							: new Error(response.message),
					);
			};
			worker.onerror = (event) => reject(new Error(event.message || "健康数据处理线程失败。"));
			worker.postMessage(message);
		});
		this.inflight = work;
		try {
			return await work;
		} finally {
			signal?.removeEventListener("abort", stop);
			if (this.inflight === work) {
				this.inflight = null;
				this.rejectPending = null;
			}
		}
	}

	cancel(): void {
		this.worker?.postMessage({ type: "cancel" } satisfies HealthWorkerIn);
	}

	async release(): Promise<void> {
		const worker = this.worker;
		if (!worker) return;
		this.worker = null;
		worker.postMessage({ type: "cancel" } satisfies HealthWorkerIn);
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (this.inflight)
			await Promise.race([
				this.inflight.catch(() => {}),
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, 6000);
				}),
			]);
		clearTimeout(timer);
		this.rejectPending?.();
		this.rejectPending = null;
		this.inflight = null;
		worker.onmessage = null;
		worker.onerror = null;
		worker.terminate();
		const name = this.stagingName;
		this.stagingName = null;
		if (name) await deleteHealthStaging(name);
	}
}
