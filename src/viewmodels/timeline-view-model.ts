import { createStore } from "zustand/vanilla";
import { buildDayInsights, type DayInsights, type TrackPoint } from "../models/day-insights";
import { buildHealthStory, type HealthStory } from "../models/health-insights";
import type { SleepLocation } from "../models/health-location";
import { applyHealthStoryInsights } from "../models/health-quantities";
import { buildDayTimeline, localDateKey, localDayWindow, shiftLocalDate } from "../models/time";
import type { DayTimeline, LifeEvent, Source } from "../models/types";
import { fetchAllEvents } from "../services/events-service";
import { fetchHealthEvents } from "../services/health-evidence";
import { fetchSleepLocations } from "../services/health-location";
import { isAbortError } from "../services/http";
import { fetchSources } from "../services/sources-service";
import { buildDayStory, type DayStory } from "./day-story";
import { type LoadStatus, toErrorMessage } from "./errors";
import { buildHealthTimeline } from "./health-timeline";

export const ALL_SOURCES = "all";
export type TimelineMapMode = "auto" | "all" | "none";
export type TimelinePageTab = "timeline" | "locations" | "finance" | "records";

export interface TimelineViewState {
	day: string;
	sourceId: string;
	sources: Source[];
	timeline: DayTimeline | null;
	insights: DayInsights | null;
	story: DayStory | null;
	health: HealthStory | null;
	recordsTimeline: DayTimeline | null;
	recordsStatus: LoadStatus;
	recordsError: string | null;
	radiusKm: 5 | 10;
	mapMode: TimelineMapMode;
	tab: TimelinePageTab;
	status: LoadStatus;
	error: string | null;
	load: () => Promise<void>;
	loadRecords: () => Promise<void>;
	selectDay: (day: string) => Promise<void>;
	shiftDay: (amount: number) => Promise<void>;
	goToday: () => Promise<void>;
	selectSource: (sourceId: string) => Promise<void>;
	selectRadius: (radiusKm: 5 | 10) => void;
	selectMapMode: (mapMode: TimelineMapMode) => void;
	selectTab: (tab: TimelinePageTab) => void;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;
let cachedDay = "";
let cachedEvents: LifeEvent[] = [];
let cachedLocations: Record<string, SleepLocation> = {};
let cachedRawEvents: LifeEvent[] | null = null;
let recordsController: AbortController | null = null;
let recordsGeneration = 0;

function initialTimelineState(): Pick<
	TimelineViewState,
	| "day"
	| "sourceId"
	| "sources"
	| "timeline"
	| "insights"
	| "story"
	| "health"
	| "recordsTimeline"
	| "recordsStatus"
	| "recordsError"
	| "radiusKm"
	| "mapMode"
	| "tab"
	| "status"
	| "error"
> {
	return {
		day: localDateKey(),
		sourceId: ALL_SOURCES,
		sources: [],
		timeline: null,
		insights: null,
		story: null,
		health: null,
		recordsTimeline: null,
		recordsStatus: "idle",
		recordsError: null,
		radiusKm: 5,
		mapMode: "auto",
		tab: "timeline",
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

function projectDay(day: string, sourceId: string, events: LifeEvent[], radiusKm: 5 | 10) {
	const window = localDayWindow(day);
	const visible = eventsForSource(events, sourceId);
	const timeline = buildDayTimeline(day, visible);
	const insights = buildDayInsights(visible, window);
	const health = visible.some((event) => event.sourceId === "apple-health")
		? buildHealthStory(visible, window)
		: null;
	if (health) applyHealthStoryInsights(insights, health);
	return {
		timeline,
		insights,
		health,
		story: health
			? buildHealthTimeline(timeline, insights, health, visible, radiusKm, cachedLocations)
			: buildDayStory(timeline, insights, radiusKm),
		recordsTimeline: cachedRawEvents
			? buildDayTimeline(day, eventsForSource(cachedRawEvents, sourceId))
			: null,
	};
}

export const timelineStore = createStore<TimelineViewState>((set, get) => ({
	...initialTimelineState(),
	async load() {
		loadController?.abort();
		recordsController?.abort();
		recordsGeneration++;
		cachedRawEvents = null;
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		const { day } = get();
		set({
			status: "loading",
			error: null,
			timeline: null,
			insights: null,
			story: null,
			health: null,
			recordsTimeline: null,
			recordsStatus: "idle",
			recordsError: null,
		});
		try {
			const window = localDayWindow(day);
			const [sources, events] = await Promise.all([
				fetchSources(controller.signal),
				fetchAllEvents({
					start: new Date(Date.parse(window.start) - 86_400_000).toISOString(),
					end: new Date(Date.parse(window.end) + 12 * 3_600_000).toISOString(),
					source: null,
					healthView: "story",
					signal: controller.signal,
				}),
			]);
			if (generation !== loadGeneration) {
				return;
			}
			cachedDay = day;
			cachedEvents = events;
			cachedLocations = {};
			set({
				sources,
				...projectDay(day, get().sourceId, events, get().radiusKm),
				status: "ready",
				error: null,
			});
			const health = get().health;
			if (health?.nights.some((night) => night.place)) {
				try {
					const locations = await fetchSleepLocations(
						health.nights,
						window.start,
						controller.signal,
					);
					if (generation !== loadGeneration) return;
					cachedLocations = locations;
					// Enrich only sleep cards: routes and the rest of the timeline keep their identity.
					const story = get().story;
					if (story)
						set({
							story: {
								...story,
								hours: story.hours.map((hour) => ({
									...hour,
									health: hour.health?.map((item) =>
										item.kind === "sleep" ? { ...item, location: locations[item.id] } : item,
									),
								})),
							},
						});
				} catch {
					/* Location inference is optional; recorded sleep remains readable. */
				}
			}
			if (generation !== loadGeneration) return;
			if (get().tab === "records") await get().loadRecords();
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
	async loadRecords() {
		const { day, sourceId, timeline, sources, recordsStatus } = get();
		if (!timeline || recordsStatus === "loading") return;
		if (cachedRawEvents) {
			set({
				recordsTimeline: buildDayTimeline(day, eventsForSource(cachedRawEvents, sourceId)),
				recordsStatus: "ready",
			});
			return;
		}
		if (!sources.some((source) => source.id === "apple-health" && source.recordCount > 0)) {
			set({ recordsTimeline: timeline, recordsStatus: "ready" });
			return;
		}
		recordsController?.abort();
		const controller = new AbortController();
		recordsController = controller;
		const generation = ++recordsGeneration;
		set({ recordsStatus: "loading", recordsError: null });
		try {
			const window = localDayWindow(day);
			const healthEvents = await fetchHealthEvents(window.start, window.end, controller.signal);
			if (generation !== recordsGeneration) return;
			const merged = new Map(cachedEvents.map((event) => [event.id, event]));
			for (const event of healthEvents) merged.set(event.id, event);
			cachedRawEvents = [...merged.values()];
			set({
				recordsTimeline: buildDayTimeline(day, eventsForSource(cachedRawEvents, get().sourceId)),
				recordsStatus: "ready",
			});
		} catch (error) {
			if (generation === recordsGeneration && !isAbortError(error))
				set({ recordsStatus: "error", recordsError: toErrorMessage(error) });
		}
	},
	async selectDay(day: string) {
		if (!day || day === get().day) {
			if (get().status === "idle") {
				await get().load();
			}
			return;
		}
		set({ day, mapMode: "auto" });
		await get().load();
	},
	async shiftDay(amount: number) {
		set({ day: shiftLocalDate(get().day, amount), mapMode: "auto" });
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
			set(projectDay(day, next, cachedEvents, get().radiusKm));
			if (get().tab === "records") await get().loadRecords();
			return;
		}
		await get().load();
	},
	selectRadius(radiusKm) {
		if ((radiusKm !== 5 && radiusKm !== 10) || radiusKm === get().radiusKm) return;
		const { day, sourceId } = get();
		set({
			radiusKm,
			...(cachedDay === day ? projectDay(day, sourceId, cachedEvents, radiusKm) : {}),
		});
	},
	selectMapMode(mapMode) {
		if (mapMode === "auto" || mapMode === "all" || mapMode === "none") set({ mapMode });
	},
	selectTab(tab) {
		if (tab === "timeline" || tab === "locations" || tab === "finance" || tab === "records") {
			set({ tab });
			if (tab === "records") void get().loadRecords();
		}
	},
	async retry() {
		await get().load();
	},
	reset() {
		loadController?.abort();
		loadController = null;
		recordsController?.abort();
		recordsController = null;
		recordsGeneration++;
		cachedRawEvents = null;
		loadGeneration += 1;
		cachedDay = "";
		cachedEvents = [];
		cachedLocations = {};
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
