import { createStore } from "zustand/vanilla";
import { buildDayInsights, type DayInsights, type TrackPoint } from "../models/day-insights";
import { buildDayTimeline, localDateKey, localDayWindow, shiftLocalDate } from "../models/time";
import type { DayTimeline, LifeEvent, Source } from "../models/types";
import { fetchAllEvents } from "../services/events-service";
import { isAbortError } from "../services/http";
import { fetchSources } from "../services/sources-service";
import { buildDayStory, type DayStory } from "./day-story";
import { type LoadStatus, toErrorMessage } from "./errors";

export const ALL_SOURCES = "all";

export interface TimelineViewState {
	day: string;
	sourceId: string;
	sources: Source[];
	timeline: DayTimeline | null;
	insights: DayInsights | null;
	story: DayStory | null;
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
let cachedDay = "";
let cachedEvents: LifeEvent[] = [];

function initialTimelineState(): Pick<
	TimelineViewState,
	"day" | "sourceId" | "sources" | "timeline" | "insights" | "story" | "status" | "error"
> {
	return {
		day: localDateKey(),
		sourceId: ALL_SOURCES,
		sources: [],
		timeline: null,
		insights: null,
		story: null,
		status: "idle",
		error: null,
	};
}

export function selectTrackEndpoints(segments: TrackPoint[][]): {
	start: TrackPoint;
	end: TrackPoint;
} | null {
	let start: TrackPoint | null = null;
	let end: TrackPoint | null = null;
	for (const segment of segments) {
		for (const point of segment) {
			if (!start || point.occurredAt < start.occurredAt) {
				start = point;
			}
			if (!end || point.occurredAt > end.occurredAt) {
				end = point;
			}
		}
	}
	return start && end ? { start, end } : null;
}

export function eventsForSource(events: LifeEvent[], sourceId: string): LifeEvent[] {
	if (sourceId === ALL_SOURCES) {
		return events;
	}
	return events.filter((event) => event.sourceId === sourceId);
}

function projectDay(day: string, sourceId: string, events: LifeEvent[]) {
	const window = localDayWindow(day);
	const visible = eventsForSource(events, sourceId);
	const timeline = buildDayTimeline(day, visible);
	const insights = buildDayInsights(visible, window);
	return {
		timeline,
		insights,
		story: buildDayStory(timeline, insights),
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
		set({ status: "loading", error: null, timeline: null, insights: null, story: null });
		try {
			const window = localDayWindow(day);
			const [sources, events] = await Promise.all([
				fetchSources(controller.signal),
				fetchAllEvents({
					start: window.start,
					end: window.end,
					source: null,
					signal: controller.signal,
				}),
			]);
			if (generation !== loadGeneration) {
				return;
			}
			cachedDay = day;
			cachedEvents = events;
			set({
				sources,
				...projectDay(day, sourceId, events),
				status: "ready",
				error: null,
			});
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			cachedDay = "";
			cachedEvents = [];
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
		const { day, status } = get();
		if (status !== "idle" && cachedDay === day) {
			set(projectDay(day, next, cachedEvents));
			return;
		}
		await get().load();
	},
	async retry() {
		await get().load();
	},
	reset() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		cachedDay = "";
		cachedEvents = [];
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
