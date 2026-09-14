import { createStore } from "zustand/vanilla";
import type { DataTarget, FootprintImportReceipt } from "../models/data-management";
import {
	FootprintBrowserSession,
	type FootprintParseProgress,
	type FootprintPreview,
} from "../services/footprint-browser";
import { apiGet, isAbortError } from "../services/http";
import { toErrorMessage } from "./errors";

export type FootprintStatus =
	| "idle"
	| "reading"
	| "preview"
	| "uploading"
	| "success"
	| "error"
	| "cancelled";

export interface FootprintViewState {
	fileName: string | null;
	fileSize: number | null;
	target: DataTarget | null;
	status: FootprintStatus;
	progress: FootprintParseProgress | null;
	preview: FootprintPreview | null;
	receipt: FootprintImportReceipt | null;
	error: string | null;
	rejection: string | null;
	loadTarget: () => Promise<void>;
	selectFile: (file: File) => Promise<void>;
	rejectFile: (message: string) => void;
	startUpload: () => Promise<void>;
	cancel: () => void;
	retry: () => Promise<void>;
	clear: () => Promise<void>;
	reset: () => Promise<void>;
}

export type FootprintParseFn = (
	file: File,
	onProgress: (progress: FootprintParseProgress) => void,
	signal?: AbortSignal,
) => Promise<FootprintPreview>;

export type FootprintUploadFn = (
	fileName: string,
	target: DataTarget,
	onProgress: (receipt: FootprintImportReceipt) => void,
	signal?: AbortSignal,
) => Promise<FootprintImportReceipt>;

let selectedFile: File | null = null;
let parseGeneration = 0;
let parseController: AbortController | null = null;
let session: FootprintBrowserSession | null = null;
let parseFn: FootprintParseFn | null = null;
let uploadFn: FootprintUploadFn | null = null;

function initialState(): Pick<
	FootprintViewState,
	| "fileName"
	| "fileSize"
	| "target"
	| "status"
	| "progress"
	| "preview"
	| "receipt"
	| "error"
	| "rejection"
> {
	return {
		fileName: null,
		fileSize: null,
		target: null,
		status: "idle",
		progress: null,
		preview: null,
		receipt: null,
		error: null,
		rejection: null,
	};
}

export function setFootprintParseFn(next: FootprintParseFn | null): void {
	parseFn = next;
}

export function setFootprintUploadFn(next: FootprintUploadFn | null): void {
	uploadFn = next;
}

async function defaultParse(
	file: File,
	onProgress: (progress: FootprintParseProgress) => void,
	signal?: AbortSignal,
): Promise<FootprintPreview> {
	await session?.release();
	signal?.throwIfAborted();
	session = new FootprintBrowserSession();
	return session.parse(file, onProgress, signal);
}

async function defaultUpload(
	fileName: string,
	target: DataTarget,
	onProgress: (receipt: FootprintImportReceipt) => void,
	signal?: AbortSignal,
): Promise<FootprintImportReceipt> {
	if (!session) {
		throw new Error("没有可提交的解析结果。");
	}
	return session.upload(fileName, target, onProgress, signal);
}

export function footprintParsePercent(progress: FootprintParseProgress | null): number | undefined {
	if (!progress || progress.totalBytes <= 0) {
		return undefined;
	}
	return Math.max(0, Math.min(100, Math.round((progress.bytesRead / progress.totalBytes) * 100)));
}

export const footprintStore = createStore<FootprintViewState>((set, get) => ({
	...initialState(),
	async loadTarget() {
		try {
			const body = await apiGet<{ target: DataTarget }>("/api/data/target");
			set({ target: body.target });
		} catch {
			set({ target: get().target });
		}
	},
	async selectFile(file: File) {
		if (get().status === "reading" || get().status === "uploading") {
			return;
		}
		selectedFile = file;
		parseController?.abort();
		const controller = new AbortController();
		parseController = controller;
		const generation = ++parseGeneration;
		set({
			fileName: file.name,
			fileSize: file.size,
			status: "reading",
			progress: { bytesRead: 0, totalBytes: file.size, pointCount: 0 },
			preview: null,
			receipt: null,
			error: null,
			rejection: null,
		});
		try {
			const run = parseFn ?? defaultParse;
			const preview = await run(
				file,
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
					bytesRead: preview.bytesRead || file.size,
					totalBytes: file.size,
					pointCount: preview.pointCount,
				},
				error: null,
			});
		} catch (error) {
			if (generation !== parseGeneration) {
				return;
			}
			if (isAbortError(error) || controller.signal.aborted) {
				set({ status: "cancelled", error: null });
				return;
			}
			set({ status: "error", error: toErrorMessage(error) });
		}
	},
	rejectFile(message: string) {
		if (get().status === "reading" || get().status === "uploading") {
			return;
		}
		set({ rejection: message });
	},
	async startUpload() {
		const { fileName, preview, target, status } = get();
		if (status === "uploading" || status === "reading") {
			return;
		}
		if (!fileName || !preview) {
			set({ status: "error", error: "请先完成解析预览。" });
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
				fileName,
				target,
				(next) => {
					if (generation !== parseGeneration) {
						return;
					}
					set({ receipt: next });
				},
				controller.signal,
			);
			if (generation !== parseGeneration) {
				return;
			}
			set({ status: "success", receipt, error: null });
		} catch (error) {
			if (generation !== parseGeneration) {
				return;
			}
			if (isAbortError(error) || controller.signal.aborted) {
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
		if (get().preview && get().fileName && get().status === "error") {
			await get().startUpload();
			return;
		}
		const file = selectedFile;
		if (!file) {
			set({ status: "error", error: "请选择 GPX 文件。" });
			return;
		}
		await get().selectFile(file);
	},
	async clear() {
		if (get().status === "reading" || get().status === "uploading") {
			get().cancel();
		}
		selectedFile = null;
		parseGeneration += 1;
		const current = session;
		session = null;
		set({ ...initialState(), target: get().target });
		await current?.release();
	},
	async reset() {
		parseController?.abort();
		parseController = null;
		selectedFile = null;
		parseGeneration += 1;
		const current = session;
		session = null;
		set(initialState());
		await current?.release();
	},
}));
