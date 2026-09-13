import { createStore } from "zustand/vanilla";
import type { DaySummaryQuery, DaySummaryResult } from "../models/ai";
import type { DayTimeline } from "../models/types";
import { fetchAiSettings, fetchDaySummary, generateDaySummary } from "../services/ai-service";
import { isAbortError } from "../services/http";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";

export interface DaySummaryViewState {
	query: DaySummaryQuery | null;
	result: DaySummaryResult | null;
	configured: boolean;
	status: LoadStatus;
	generating: boolean;
	error: string | null;
	expired: boolean;
	load: (query: DaySummaryQuery) => Promise<void>;
	generate: () => Promise<void>;
	retry: () => Promise<void>;
	abort: () => void;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialState(): Pick<
	DaySummaryViewState,
	"query" | "result" | "configured" | "status" | "generating" | "error" | "expired"
> {
	return {
		query: null,
		result: null,
		configured: false,
		status: "idle",
		generating: false,
		error: null,
		expired: false,
	};
}

export function summaryQueryFromTimeline(timeline: DayTimeline): DaySummaryQuery {
	return {
		date: timeline.date,
		timeZone: timeline.timezone,
		start: timeline.start,
		end: timeline.end,
	};
}

export function sameSummaryQuery(left: DaySummaryQuery | null, right: DaySummaryQuery): boolean {
	return Boolean(
		left &&
			left.date === right.date &&
			left.timeZone === right.timeZone &&
			left.start === right.start &&
			left.end === right.end,
	);
}

export function splitSummaryParagraphs(content: string): string[] {
	return content
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
}

export const daySummaryStore = createStore<DaySummaryViewState>((set, get) => ({
	...initialState(),
	async load(query) {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		const keepResult = sameSummaryQuery(get().query, query);
		set({
			query,
			status: "loading",
			error: null,
			expired: false,
			generating: false,
			result: keepResult ? get().result : null,
		});
		try {
			const [result, settings] = await Promise.all([
				fetchDaySummary(query, controller.signal),
				fetchAiSettings(controller.signal),
			]);
			if (generation !== loadGeneration) {
				return;
			}
			set({
				result,
				configured: settings.configured,
				status: "ready",
				error: null,
				expired: false,
			});
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			set({
				status: "error",
				error: toErrorMessage(error),
				expired: isAuthFailure(error),
			});
		}
	},
	async generate() {
		const query = get().query;
		if (!query || get().generating) {
			return;
		}
		const generation = loadGeneration;
		set({ generating: true, error: null });
		try {
			const result = await generateDaySummary(query, loadController?.signal);
			if (generation !== loadGeneration) {
				return;
			}
			set({
				generating: false,
				result,
				status: "ready",
				error: null,
			});
		} catch (error) {
			if (generation !== loadGeneration) return;
			if (isAbortError(error)) {
				set({ generating: false });
				return;
			}
			set({
				generating: false,
				error: toErrorMessage(error),
				expired: isAuthFailure(error),
			});
		}
	},
	async retry() {
		const query = get().query;
		if (query) {
			await get().load(query);
		}
	},
	abort() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		set({ status: "idle", generating: false });
	},
	reset() {
		get().abort();
		set(initialState());
	},
}));
