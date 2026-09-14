import { createStore } from "zustand/vanilla";
import type { TrackPoint } from "../models/day-insights";
import { fetchEcgWaveform, fetchWorkoutRoute } from "../services/health-evidence";
import { isAbortError } from "../services/http";
import { type LoadStatus, toErrorMessage } from "./errors";

export function createHealthEvidenceStore(deps = { fetchEcgWaveform, fetchWorkoutRoute }) {
	let controller: AbortController | null = null;
	let generation = 0;
	return createStore<{
		status: LoadStatus;
		error: string | null;
		points: TrackPoint[];
		waveform: number[];
		samplingHz: number | null;
		load: (kind: "route" | "ecg", paths: string[]) => Promise<void>;
		abort: () => void;
	}>((set) => ({
		status: "idle",
		error: null,
		points: [],
		waveform: [],
		samplingHz: null,
		async load(kind, paths) {
			controller?.abort();
			const current = ++generation;
			controller = new AbortController();
			set({ status: "loading", error: null, points: [], waveform: [], samplingHz: null });
			try {
				if (!paths.length) throw new Error("没有可读取的健康附件。");
				const data =
					kind === "route"
						? { points: await deps.fetchWorkoutRoute(paths, controller.signal) }
						: await deps
								.fetchEcgWaveform(paths[0] as string, controller.signal)
								.then((result) => ({ waveform: result.samples, samplingHz: result.samplingHz }));
				if (current !== generation) return;
				set({ ...data, status: "ready" });
			} catch (error) {
				if (current === generation && !isAbortError(error))
					set({ status: "error", error: toErrorMessage(error) });
			}
		},
		abort() {
			generation++;
			controller?.abort();
			controller = null;
		},
	}));
}
