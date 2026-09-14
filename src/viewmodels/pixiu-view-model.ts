import { createStore } from "zustand/vanilla";
import type { DataTarget, FootprintImportReceipt } from "../models/data-management";
import type { PixiuPlan } from "../models/pixiu";
import { isAbortError } from "../services/http";
import { createPixiuClient, readPixiuFiles, uploadPixiuPlan } from "../services/pixiu-client";
import { toErrorMessage } from "./errors";

export interface PixiuViewState {
	files: File[];
	plan: PixiuPlan | null;
	target: DataTarget | null;
	targetError: string | null;
	status: "idle" | "reading" | "preview" | "uploading" | "success" | "error" | "cancelled";
	receipt: FootprintImportReceipt | null;
	error: string | null;
	loadTarget: () => Promise<void>;
	selectFiles: (files: File[]) => Promise<void>;
	upload: () => Promise<void>;
	reject: (message: string) => void;
	cancel: () => void;
	clear: () => void;
	reset: () => void;
}
const initial = {
	files: [] as File[],
	plan: null,
	target: null,
	targetError: null,
	status: "idle",
	receipt: null,
	error: null,
} as const;
let generation = 0;
let targetGeneration = 0;
let controller: AbortController | null = null;

export const pixiuStore = createStore<PixiuViewState>((set, get) => ({
	...initial,
	async loadTarget() {
		const current = ++targetGeneration;
		set({ targetError: null, target: null });
		try {
			const result = await createPixiuClient().target();
			if (current === targetGeneration) set({ target: result.target });
		} catch (error) {
			if (current === targetGeneration) set({ targetError: toErrorMessage(error) });
		}
	},
	async selectFiles(files) {
		if (get().status === "uploading" || get().status === "reading") return;
		controller?.abort();
		controller = new AbortController();
		const { signal } = controller;
		const current = ++generation;
		set({ files, plan: null, receipt: null, status: "reading", error: null });
		try {
			const plan = await readPixiuFiles(files, signal);
			if (current === generation) set({ plan, status: "preview" });
		} catch (error) {
			if (current === generation)
				set({
					status: isAbortError(error) ? "cancelled" : "error",
					error: isAbortError(error) ? null : toErrorMessage(error),
				});
		}
	},
	async upload() {
		const { plan, target, status } = get();
		if (status === "uploading" || status === "reading") return;
		if (!plan || !target) {
			set({ error: "请先预览文件并确认数据环境", status: "error" });
			return;
		}
		controller?.abort();
		controller = new AbortController();
		const current = ++generation;
		set({ status: "uploading", error: null, receipt: null });
		try {
			const receipt = await uploadPixiuPlan(createPixiuClient(), plan, {
				target,
				channel: "web",
				signal: controller.signal,
				onProgress: (receipt) => {
					if (current === generation) set({ receipt });
				},
			});
			if (current === generation) set({ receipt, status: "success" });
		} catch (error) {
			if (current === generation)
				set({
					status: isAbortError(error) ? "cancelled" : "error",
					error: isAbortError(error) ? null : toErrorMessage(error),
				});
		}
	},
	reject(message) {
		if (get().status !== "reading" && get().status !== "uploading") set({ error: message });
	},
	cancel() {
		if (get().status !== "reading" && get().status !== "uploading") return;
		controller?.abort();
		generation++;
		set({ status: "cancelled", error: null });
	},
	clear() {
		controller?.abort();
		generation++;
		set({ ...initial, target: get().target, targetError: get().targetError });
	},
	reset() {
		get().clear();
		targetGeneration++;
		set(initial);
	},
}));
