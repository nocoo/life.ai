import { createStore } from "zustand/vanilla";
import { importFile } from "../models/import";
import type { ImportProgress, ImportRecord, ImportSourceId } from "../models/types";
import { isAbortError } from "../services/http";
import { postImportBatch } from "../services/imports-service";
import { toErrorMessage } from "./errors";

export type ImportStatus = "idle" | "preview" | "running" | "success" | "error" | "cancelled";

export interface ImportSourceMeta {
	id: ImportSourceId;
	label: string;
	accept: string;
	hint: string;
}

export const IMPORT_SOURCE_MAP: Record<ImportSourceId, ImportSourceMeta> = {
	"apple-health": {
		id: "apple-health",
		label: "Apple Health",
		accept: ".xml,text/xml,application/xml",
		hint: "HealthKit 导出 XML",
	},
	footprint: {
		id: "footprint",
		label: "footprint",
		accept: ".gpx,application/gpx+xml,application/xml,text/xml",
		hint: "足迹 GPX",
	},
	pixiu: {
		id: "pixiu",
		label: "貔貅",
		accept: ".csv,text/csv",
		hint: "貔貅记账 CSV",
	},
	journal: {
		id: "journal",
		label: "日记",
		accept: ".json,.ndjson,application/json,application/x-ndjson,text/plain",
		hint: "通用日记 JSON / NDJSON",
	},
};

export const IMPORT_SOURCES: ImportSourceMeta[] = [
	IMPORT_SOURCE_MAP.pixiu,
	IMPORT_SOURCE_MAP.journal,
];

export interface ImportViewState {
	source: ImportSourceId;
	fileName: string | null;
	fileSize: number | null;
	status: ImportStatus;
	progress: ImportProgress | null;
	processed: number;
	accepted: number;
	error: string | null;
	rejection: string | null;
	setSource: (source: ImportSourceId) => void;
	selectFile: (file: File) => void;
	rejectFile: (message: string) => void;
	start: () => Promise<void>;
	cancel: () => void;
	retry: () => Promise<void>;
	clear: () => void;
	reset: () => void;
}

let selectedFile: File | null = null;
let importController: AbortController | null = null;
let importGeneration = 0;

function emptyProgress(): ImportProgress {
	return { bytesRead: 0, totalBytes: 0, processed: 0, accepted: 0 };
}

function initialImportState(): Pick<
	ImportViewState,
	| "source"
	| "fileName"
	| "fileSize"
	| "status"
	| "progress"
	| "processed"
	| "accepted"
	| "error"
	| "rejection"
> {
	return {
		source: "pixiu",
		fileName: null,
		fileSize: null,
		status: "idle",
		progress: null,
		processed: 0,
		accepted: 0,
		error: null,
		rejection: null,
	};
}

function clearSelectedFile(): void {
	selectedFile = null;
}

export function importSourceMeta(id: ImportSourceId): ImportSourceMeta {
	return IMPORT_SOURCE_MAP[id];
}

export const importStore = createStore<ImportViewState>((set, get) => ({
	...initialImportState(),
	setSource(source: ImportSourceId) {
		if (source === "apple-health" || source === "footprint") return;
		if (get().status === "running") {
			return;
		}
		importController?.abort();
		clearSelectedFile();
		set({
			source,
			fileName: null,
			fileSize: null,
			status: "idle",
			progress: null,
			processed: 0,
			accepted: 0,
			error: null,
			rejection: null,
		});
	},
	selectFile(file: File) {
		if (get().status === "running") {
			return;
		}
		selectedFile = file;
		set({
			fileName: file.name,
			fileSize: file.size,
			status: "preview",
			progress: null,
			processed: 0,
			accepted: 0,
			error: null,
			rejection: null,
		});
	},
	rejectFile(message: string) {
		if (get().status === "running") {
			return;
		}
		set({ rejection: message });
	},
	async start() {
		const file = selectedFile;
		if (!file) {
			set({ status: "error", error: "请选择要导入的文件。" });
			return;
		}
		if (get().status === "running") {
			return;
		}
		importController?.abort();
		const controller = new AbortController();
		importController = controller;
		const generation = ++importGeneration;
		const { source } = get();
		set({
			status: "running",
			error: null,
			rejection: null,
			progress: { ...emptyProgress(), totalBytes: file.size },
			processed: 0,
			accepted: 0,
		});
		try {
			const result = await importFile(
				file,
				source,
				async (records: ImportRecord[]) => {
					await postImportBatch(source, records, controller.signal);
				},
				(progress) => {
					if (generation !== importGeneration) {
						return;
					}
					set({
						progress,
						processed: progress.processed,
						accepted: progress.accepted,
					});
				},
				controller.signal,
			);
			if (generation !== importGeneration) {
				return;
			}
			set({
				status: "success",
				processed: result.processed,
				accepted: result.accepted,
				progress: {
					bytesRead: file.size,
					totalBytes: file.size,
					processed: result.processed,
					accepted: result.accepted,
				},
				error: null,
			});
		} catch (error) {
			if (generation !== importGeneration) {
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
		if (get().status !== "running") {
			return;
		}
		importGeneration += 1;
		importController?.abort();
		importController = null;
		set({ status: "cancelled", error: null });
	},
	async retry() {
		if (!selectedFile) {
			set({ status: "error", error: "请选择要导入的文件。" });
			return;
		}
		await get().start();
	},
	clear() {
		if (get().status === "running") {
			get().cancel();
		}
		clearSelectedFile();
		importGeneration += 1;
		set({
			fileName: null,
			fileSize: null,
			status: "idle",
			progress: null,
			processed: 0,
			accepted: 0,
			error: null,
			rejection: null,
		});
	},
	reset() {
		importController?.abort();
		importController = null;
		importGeneration += 1;
		clearSelectedFile();
		set(initialImportState());
	},
}));

export function importProgressPercent(progress: ImportProgress | null): number | undefined {
	if (!progress || progress.totalBytes <= 0) {
		return undefined;
	}
	return Math.max(0, Math.min(100, Math.round((progress.bytesRead / progress.totalBytes) * 100)));
}
