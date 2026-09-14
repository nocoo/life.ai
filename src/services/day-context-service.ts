import {
	type DayContextQuery,
	type DaySun,
	type DayWeather,
	readDaySun,
	readDayWeather,
} from "../models/day-context";
import { shiftLocalDate } from "../models/time";

async function publicJson(url: URL, signal: AbortSignal): Promise<unknown> {
	const response = await fetch(url, {
		signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
		credentials: "omit",
		referrerPolicy: "no-referrer",
		redirect: "error",
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(
			response.status === 429 ? "公共数据服务繁忙，请稍后重试。" : "公共数据服务暂时不可用。",
		);
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("公共数据服务没有返回内容。");
	const decoder = new TextDecoder();
	let bytes = 0;
	let body = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > 128 * 1024) {
				await reader.cancel();
				throw new Error("公共数据响应过大。");
			}
			body += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
	return JSON.parse(body + decoder.decode()) as unknown;
}

export async function fetchDayWeather(
	query: DayContextQuery,
	signal: AbortSignal,
): Promise<DayWeather | null> {
	const today = new Date().toISOString().slice(0, 10);
	const startDate = query.start.slice(0, 10);
	const endDate = query.end.slice(0, 10); // Include the ending hour's preceding-hour rain total.
	const lastForecastDate = shiftLocalDate(today, 15);
	if (startDate > lastForecastDate || endDate < "1940-01-01") return null;
	const historical = endDate < shiftLocalDate(today, -5);
	const url = new URL(
		historical
			? "https://archive-api.open-meteo.com/v1/archive"
			: "https://api.open-meteo.com/v1/forecast",
	);
	url.search = new URLSearchParams({
		latitude: String(query.latitude),
		longitude: String(query.longitude),
		start_date: startDate < "1940-01-01" ? "1940-01-01" : startDate,
		end_date: endDate > lastForecastDate ? lastForecastDate : endDate,
		hourly: "temperature_2m,weather_code,precipitation,wind_speed_10m",
		timezone: "GMT",
		timeformat: "unixtime",
		temperature_unit: "celsius",
		wind_speed_unit: "kmh",
		precipitation_unit: "mm",
	}).toString();
	return readDayWeather(
		await publicJson(url, signal),
		query,
		historical ? "historical" : "forecast",
	);
}

export async function fetchDaySun(query: DayContextQuery, signal: AbortSignal): Promise<DaySun> {
	const url = new URL("https://api.sunrise-sunset.org/v2");
	url.search = new URLSearchParams({
		lat: String(query.latitude),
		lng: String(query.longitude),
		// Solar dates can straddle UTC midnight in either direction. One range request covers both edges.
		date_start: shiftLocalDate(query.start.slice(0, 10), -1),
		date_end: shiftLocalDate(new Date(Date.parse(query.end) - 1).toISOString().slice(0, 10), 1),
		tz: "UTC",
		time_format: "unix",
	}).toString();
	return readDaySun(await publicJson(url, signal), query);
}
