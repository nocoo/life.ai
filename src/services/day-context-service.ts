import type { DayContextQuery, DaySun, DayWeather } from "../models/day-context";
import { apiGet } from "./http";

export async function fetchDayWeather(
	query: DayContextQuery,
	signal: AbortSignal,
): Promise<DayWeather | null> {
	return apiGet<DayWeather | null>(
		"/api/context/weather",
		{
			date: query.date,
			timeZone: query.timeZone,
			start: query.start,
			end: query.end,
			latitude: query.latitude,
			longitude: query.longitude,
		},
		signal,
	);
}

export async function fetchDaySun(query: DayContextQuery, signal: AbortSignal): Promise<DaySun> {
	return apiGet<DaySun>(
		"/api/context/sun",
		{
			date: query.date,
			timeZone: query.timeZone,
			start: query.start,
			end: query.end,
			latitude: query.latitude,
			longitude: query.longitude,
		},
		signal,
	);
}
