import { createStore } from "zustand/vanilla";
import type { DataTarget } from "../models/data-management";
import type { HealthImportReceipt, HealthProgress } from "../models/health-types";
import { HealthBrowserSession, type HealthPreview } from "../services/health-browser";
import { apiGet, isAbortError } from "../services/http";
import { type LoadStatus, toErrorMessage } from "./errors";

export type HealthStatus =
	| "idle"
	| "reading"
	| "preview"
	| "uploading"
	| "success"
	| "error"
	| "cancelled";

export interface HealthViewState {
	fileCount: number;
	totalSize: number | null;
	sourceSummary: string | null;
	target: DataTarget | null;
	targetStatus: LoadStatus;
	targetError: string | null;
	status: HealthStatus;
	progress: HealthProgress | null;
	preview: HealthPreview | null;
	receipt: HealthImportReceipt | null;
	error: string | null;
	rejection: string | null;
	loadTarget: () => Promise<void>;
	selectFiles: (files: File[]) => Promise<void>;
	rejectFiles: (message: string) => void;
	startUpload: () => Promise<void>;
	cancel: () => void;
	retry: () => Promise<void>;
	clear: () => Promise<void>;
	reset: () => Promise<void>;
}

export type HealthParseFn = (
	files: File[],
	onProgress: (progress: HealthProgress) => void,
	signal?: AbortSignal,
) => Promise<HealthPreview>;

export type HealthUploadFn = (
	target: DataTarget,
	onProgress: (progress: HealthProgress) => void,
	signal?: AbortSignal,
) => Promise<HealthImportReceipt>;

let targetGeneration = 0;
let selectedFiles: File[] | null = null;
let parseGeneration = 0;
let parseController: AbortController | null = null;
let session: HealthBrowserSession | null = null;
let parseFn: HealthParseFn | null = null;
let uploadFn: HealthUploadFn | null = null;

function initialState(): Pick<
	HealthViewState,
	| "fileCount"
	| "totalSize"
	| "sourceSummary"
	| "target"
	| "targetStatus"
	| "targetError"
	| "status"
	| "progress"
	| "preview"
	| "receipt"
	| "error"
	| "rejection"
> {
	return {
		fileCount: 0,
		totalSize: null,
		sourceSummary: null,
		target: null,
		targetStatus: "idle",
		targetError: null,
		status: "idle",
		progress: null,
		preview: null,
		receipt: null,
		error: null,
		rejection: null,
	};
}

export function setHealthParseFn(next: HealthParseFn | null): void {
	parseFn = next;
}

export function setHealthUploadFn(next: HealthUploadFn | null): void {
	uploadFn = next;
}

async function defaultParse(
	files: File[],
	onProgress: (progress: HealthProgress) => void,
	signal?: AbortSignal,
): Promise<HealthPreview> {
	await session?.release();
	signal?.throwIfAborted();
	session = new HealthBrowserSession();
	return session.parse(files, onProgress, signal);
}

async function defaultUpload(
	target: DataTarget,
	onProgress: (progress: HealthProgress) => void,
	signal?: AbortSignal,
): Promise<HealthImportReceipt> {
	if (!session) {
		throw new Error("没有可提交的健康数据。");
	}
	return session.upload(target, onProgress, signal);
}

export function healthProgressPercent(progress: HealthProgress | null): number | undefined {
	if (!progress) {
		return undefined;
	}
	if (progress.phase === "complete") {
		return 100;
	}
	if (progress.total > 0) {
		return Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)));
	}
	if (progress.totalBytes > 0) {
		return Math.max(0, Math.min(100, Math.round((progress.bytesRead / progress.totalBytes) * 100)));
	}
	return undefined;
}

export function describeSelectedFiles(files: File[]): {
	fileCount: number;
	totalSize: number;
	sourceSummary: string;
} {
	const fileCount = files.length;
	const totalSize = files.reduce((sum, f) => sum + f.size, 0);

	if (fileCount === 1) {
		const f = files[0];
		return {
			fileCount,
			totalSize,
			sourceSummary: f ? f.name : "",
		};
	}

	const firstPath = files[0]?.webkitRelativePath;
	if (firstPath) {
		const topDir = firstPath.split("/")[0];
		if (topDir) {
			return {
				fileCount,
				totalSize,
				sourceSummary: `${topDir}/ (${fileCount.toLocaleString()} 个文件)`,
			};
		}
	}

	return {
		fileCount,
		totalSize,
		sourceSummary: `${fileCount.toLocaleString()} 个导出文件`,
	};
}

export const healthStore = createStore<HealthViewState>((set, get) => ({
	...initialState(),
	async loadTarget() {
		const generation = ++targetGeneration;
		set({ targetStatus: "loading", targetError: null });
		try {
			const body = await apiGet<{ target: DataTarget }>("/api/data/target");
			if (generation === targetGeneration) {
				set({ target: body.target, targetStatus: "ready" });
			}
		} catch (error) {
			if (generation === targetGeneration) {
				set({ targetStatus: "error", targetError: toErrorMessage(error) });
			}
		}
	},
	async selectFiles(files: File[]) {
		if (get().status === "reading" || get().status === "uploading") {
			return;
		}
		if (!files || files.length === 0) {
			return;
		}

		// Validation: if user selected a single XML file, warn about missing route and ECG attachments
		if (files.length === 1) {
			const name = (files[0]?.name ?? "").toLowerCase();
			if (name.endsWith(".xml")) {
				set({
					rejection:
						"请选择包含完整导出的 ZIP 压缩包，或选择包含导出内容的整个文件夹。只选单独的 XML 文件会丢失运动轨迹（GPX）和心电图（ECG）等附件。",
				});
				return;
			}
		}

		selectedFiles = files;
		parseController?.abort();
		const controller = new AbortController();
		parseController = controller;
		const generation = ++parseGeneration;

		const { fileCount, totalSize, sourceSummary } = describeSelectedFiles(files);
		set({
			fileCount,
			totalSize,
			sourceSummary,
			status: "reading",
			progress: {
				phase: "analyzing",
				bytesRead: 0,
				totalBytes: totalSize,
				recordCount: 0,
				completed: 0,
				total: fileCount,
			},
			preview: null,
			receipt: null,
			error: null,
			rejection: null,
		});

		try {
			const run = parseFn ?? defaultParse;
			const preview = await run(
				files,
				(progress) => {
					if (generation !== parseGeneration) {
						return;
					}
					set({ progress });
				},
				controller.signal,
			);
			if (generation !== parseGeneration) {
				return;
			}
			set({
				status: "preview",
				preview,
				progress: {
					phase: "complete",
					bytesRead: totalSize,
					totalBytes: totalSize,
					recordCount: preview.recordCount,
					completed: fileCount,
					total: fileCount,
				},
				error: null,
			});
		} catch (error) {
			const isCancel = isAbortError(error) || controller.signal.aborted;
			if (generation !== parseGeneration) {
				return;
			}
			if (isCancel) {
				set({ status: "cancelled", error: null });
				return;
			}
			set({ status: "error", error: toErrorMessage(error) });
		}
	},
	rejectFiles(message: string) {
		if (get().status === "reading" || get().status === "uploading") {
			return;
		}
		set({ rejection: message });
	},
	async startUpload() {
		const { preview, target, status } = get();
		if (status === "uploading" || status === "reading") {
			return;
		}
		if (!preview) {
			set({ status: "error", error: "请先完成健康数据解析预览。" });
			return;
		}
		if (!target) {
			set({ status: "error", error: "无法确认当前数据环境。" });
			return;
		}
		parseController?.abort();
		const controller = new AbortController();
		parseController = controller;
		const generation = ++parseGeneration;
		set({ status: "uploading", error: null, receipt: null });

		try {
			const run = uploadFn ?? defaultUpload;
			const receipt = await run(
				target,
				(next) => {
					if (generation !== parseGeneration) {
						return;
					}
					set({ progress: next });
				},
				controller.signal,
			);
			if (generation !== parseGeneration) {
				return;
			}
			set({ status: "success", receipt, error: null });
		} catch (error) {
			const isCancel = isAbortError(error) || controller.signal.aborted;
			if (generation !== parseGeneration) {
				return;
			}
			if (isCancel) {
				set({ status: "cancelled", error: null });
				return;
			}
			set({ status: "error", error: toErrorMessage(error) });
		}
	},
	cancel() {
		if (get().status !== "reading" && get().status !== "uploading") {
			return;
		}
		parseGeneration += 1;
		parseController?.abort();
		parseController = null;
		session?.cancel();
		set({ status: "cancelled", error: null });
	},
	async retry() {
		if (get().preview && get().status === "error") {
			await get().startUpload();
			return;
		}
		const files = selectedFiles;
		if (!files || files.length === 0) {
			set({ status: "error", error: "请选择 Apple Health 导出数据包或文件夹。" });
			return;
		}
		await get().selectFiles(files);
	},
	async clear() {
		if (get().status === "reading" || get().status === "uploading") {
			get().cancel();
		}
		selectedFiles = null;
		parseGeneration += 1;
		const current = session;
		session = null;
		set({
			...initialState(),
			target: get().target,
			targetStatus: get().targetStatus,
			targetError: get().targetError,
		});
		await current?.release();
	},
	async reset() {
		targetGeneration++;
		parseController?.abort();
		parseController = null;
		selectedFiles = null;
		parseGeneration += 1;
		const current = session;
		session = null;
		set(initialState());
		await current?.release();
	},
}));
