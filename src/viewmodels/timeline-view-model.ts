import { createStore } from "zustand/vanilla";
import { buildDayTimeline, localDateKey, localDayWindow, shiftLocalDate } from "../models/time";
import type { DayTimeline, Source } from "../models/types";
import { fetchAllEvents } from "../services/events-service";
import { isAbortError } from "../services/http";
import { fetchSources } from "../services/sources-service";
import { type LoadStatus, toErrorMessage } from "./errors";

export const ALL_SOURCES = "all";

export interface TimelineViewState {
	day: string;
	sourceId: string;
	sources: Source[];
	timeline: DayTimeline | null;
	status: LoadStatus;
	error: string | null;
	load: () => Promise<void>;
	selectDay: (day: string) => Promise<void>;
	shiftDay: (amount: number) => Promise<void>;
	goToday: () => Promise<void>;
	selectSource: (sourceId: string) => Promise<void>;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialTimelineState(): Pick<
	TimelineViewState,
	"day" | "sourceId" | "sources" | "timeline" | "status" | "error"
> {
	return {
		day: localDateKey(),
		sourceId: ALL_SOURCES,
		sources: [],
		timeline: null,
		status: "idle",
		error: null,
	};
}

export const timelineStore = createStore<TimelineViewState>((set, get) => ({
	...initialTimelineState(),
	async load() {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		const { day, sourceId } = get();
		set({ status: "loading", error: null, timeline: null });
		try {
			const window = localDayWindow(day);
			const source = sourceId === ALL_SOURCES ? null : sourceId;
			const [sources, events] = await Promise.all([
				fetchSources(controller.signal),
				fetchAllEvents({
					start: window.start,
					end: window.end,
					source,
					signal: controller.signal,
				}),
			]);
			if (generation !== loadGeneration) {
				return;
			}
			set({
				sources,
				timeline: buildDayTimeline(day, events),
				status: "ready",
				error: null,
			});
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			set({
				status: "error",
				error: toErrorMessage(error),
			});
		}
	},
	async selectDay(day: string) {
		if (!day || day === get().day) {
			if (get().status === "idle") {
				await get().load();
			}
			return;
		}
		set({ day });
		await get().load();
	},
	async shiftDay(amount: number) {
		set({ day: shiftLocalDate(get().day, amount) });
		await get().load();
	},
	async goToday() {
		await get().selectDay(localDateKey());
	},
	async selectSource(sourceId: string) {
		const next = sourceId || ALL_SOURCES;
		if (next === get().sourceId && get().status !== "idle") {
			return;
		}
		set({ sourceId: next });
		await get().load();
	},
	async retry() {
		await get().load();
	},
	reset() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		set(initialTimelineState());
	},
}));

export function isSelectedToday(day: string): boolean {
	return day === localDateKey();
}

export function selectedSourceName(sources: Source[], sourceId: string): string {
	if (sourceId === ALL_SOURCES) {
		return "全部来源";
	}
	return sources.find((source) => source.id === sourceId)?.name ?? sourceId;
}
