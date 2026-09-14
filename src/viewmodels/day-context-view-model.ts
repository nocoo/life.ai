import { createStore } from "zustand/vanilla";
import type { DayContextQuery, DaySun, DayWeather, SolarEvent } from "../models/day-context";
import type { DayPlaces } from "../models/day-places";
import type { DayTimeline } from "../models/types";
import { fetchDaySun, fetchDayWeather } from "../services/day-context-service";
import { toErrorMessage } from "./errors";

type ContextStatus = "idle" | "loading" | "ready" | "error" | "unavailable";
export interface SolarMoment extends SolarEvent {
	hour: number;
	clock: string;
	label: string;
}

export interface DayContextState {
	query: DayContextQuery | null;
	weather: DayWeather | null;
	sun: DaySun | null;
	solar: SolarMoment[];
	weatherStatus: ContextStatus;
	sunStatus: ContextStatus;
	weatherError: string | null;
	sunError: string | null;
	load: (query: DayContextQuery | null) => Promise<void>;
	retry: () => Promise<void>;
	abort: () => void;
}

export function dayContextQuery(timeline: DayTimeline, places: DayPlaces): DayContextQuery | null {
	const point = places.representativePlace?.anchor ?? places.allDayPoints[0];
	if (!point) return null;
	return {
		date: timeline.date,
		timeZone: timeline.timezone,
		start: timeline.start,
		end: timeline.end,
		latitude: Number(point.latitude.toFixed(2)),
		longitude: Number(point.longitude.toFixed(2)),
	};
}

export function sameDayContext(a: DayContextQuery | null, b: DayContextQuery | null): boolean {
	return (
		a?.start === b?.start &&
		a?.end === b?.end &&
		a?.timeZone === b?.timeZone &&
		a?.latitude === b?.latitude &&
		a?.longitude === b?.longitude
	);
}

export function solarMoments(sun: DaySun, query: DayContextQuery): SolarMoment[] {
	const formatter = new Intl.DateTimeFormat("zh-CN", {
		timeZone: query.timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	return sun.events.map((event) => {
		const parts = formatter.formatToParts(new Date(event.occurredAt));
		const hour = Number(parts.find((part) => part.type === "hour")?.value);
		return {
			...event,
			hour,
			clock: formatter.format(new Date(event.occurredAt)),
			label: event.kind === "sunrise" ? "日出" : "日落",
		};
	});
}

let generation = 0;
let controller: AbortController | null = null;
const initial = {
	query: null,
	weather: null,
	sun: null,
	solar: [],
	weatherStatus: "idle",
	sunStatus: "idle",
	weatherError: null,
	sunError: null,
} as const;

export const dayContextStore = createStore<DayContextState>((set, get) => ({
	...initial,
	solar: [],
	async load(query) {
		controller?.abort();
		const current = ++generation;
		controller = new AbortController();
		const { signal } = controller;
		set({
			...initial,
			solar: [],
			query,
			weatherStatus: query ? "loading" : "idle",
			sunStatus: query ? "loading" : "idle",
		});
		if (!query) return;
		await Promise.all([
			fetchDayWeather(query, signal)
				.then((weather) => {
					if (current === generation)
						set({ weather, weatherStatus: weather ? "ready" : "unavailable" });
				})
				.catch((error: unknown) => {
					if (current === generation && !signal.aborted)
						set({ weatherStatus: "error", weatherError: toErrorMessage(error) });
				}),
			fetchDaySun(query, signal)
				.then((sun) => {
					if (current === generation)
						set({ sun, solar: solarMoments(sun, query), sunStatus: "ready" });
				})
				.catch((error: unknown) => {
					if (current === generation && !signal.aborted)
						set({ sunStatus: "error", sunError: toErrorMessage(error) });
				}),
		]);
	},
	async retry() {
		await get().load(get().query);
	},
	abort() {
		controller?.abort();
		controller = null;
		generation++;
		set({ ...initial, solar: [] });
	},
}));
