import { z } from "zod";

export interface DayContextQuery {
	date: string;
	timeZone: string;
	start: string;
	end: string;
	latitude: number;
	longitude: number;
}

export interface DayWeather {
	temperatureMin: number | null;
	temperatureMax: number | null;
	temperatureMean: number | null;
	precipitationMm: number | null;
	windMaxKmh: number | null;
	weatherCode: number | null;
	sampleCount: number;
	expectedSamples: number;
	complete: boolean;
	kind: "historical" | "forecast";
}

export interface SolarEvent {
	kind: "sunrise" | "sunset";
	occurredAt: string;
}

export interface DaySun {
	events: SolarEvent[];
	daylightMinutes: number | null;
	status: "normal" | "midnight_sun" | "polar_night";
}

const HOUR = 3_600_000;
const unixSeconds = z.number().min(-8_640_000_000_000).max(8_640_000_000_000);
const numbers = z.array(z.number().nullable()).max(168);
const weatherSchema = z.object({
	hourly: z.object({
		time: z.array(unixSeconds).max(168),
		temperature_2m: numbers,
		weather_code: numbers,
		precipitation: numbers,
		wind_speed_10m: numbers,
	}),
});
const sunSchema = z.object({
	days: z
		.array(
			z.object({
				date: z.string(),
				sunrise: unixSeconds.nullable(),
				sunset: unixSeconds.nullable(),
				sun_status: z.enum(["normal", "midnight_sun", "polar_night"]),
			}),
		)
		.min(1)
		.max(7),
});

function hourKey(second: number): number {
	if (!Number.isInteger(second) || second % 3600 !== 0) {
		throw new Error("天气时间未按整点对齐");
	}
	return second * 1000;
}

/** Hourly UTC samples avoid the provider's fixed historical timezone offset. */
export function readDayWeather(
	value: unknown,
	query: DayContextQuery,
	kind: DayWeather["kind"],
): DayWeather {
	const { hourly } = weatherSchema.parse(value);
	if (Object.values(hourly).some((column) => column.length !== hourly.time.length)) {
		throw new Error("天气数据列长度不一致");
	}
	const start = Date.parse(query.start);
	const end = Date.parse(query.end);
	const rows = new Map(hourly.time.map((second, index) => [hourKey(second), index]));
	if (rows.size !== hourly.time.length) throw new Error("天气时间样本重复");
	const temperatures: number[] = [];
	const winds: number[] = [];
	const codes = new Map<number, number>();
	let expectedSamples = 0;
	let complete = true;
	for (let instant = Math.ceil(start / HOUR) * HOUR; instant < end; instant += HOUR) {
		expectedSamples++;
		const index = rows.get(instant);
		const temperature = index === undefined ? null : hourly.temperature_2m[index];
		const wind = index === undefined ? null : hourly.wind_speed_10m[index];
		const code = index === undefined ? null : hourly.weather_code[index];
		if (temperature !== null && temperature !== undefined) temperatures.push(temperature);
		else complete = false;
		if (wind !== null && wind !== undefined && wind >= 0) winds.push(wind);
		else complete = false;
		if (code !== null && code !== undefined && Number.isInteger(code) && code >= 0)
			codes.set(code, (codes.get(code) ?? 0) + 1);
		else complete = false;
	}
	let precipitation = 0;
	let rainCoverage = 0;
	for (const [instant, index] of rows) {
		// Open-Meteo precipitation at t represents the preceding hour (t-1h, t].
		const overlap = Math.max(0, Math.min(end, instant) - Math.max(start, instant - HOUR));
		const rain = hourly.precipitation[index];
		if (rain !== undefined && rain !== null && rain >= 0 && overlap > 0) {
			precipitation += (rain * overlap) / HOUR;
			rainCoverage += overlap;
		}
	}
	const rainComplete = rainCoverage === end - start;
	return {
		temperatureMin: temperatures.length ? Math.min(...temperatures) : null,
		temperatureMax: temperatures.length ? Math.max(...temperatures) : null,
		temperatureMean: temperatures.length
			? temperatures.reduce((sum, item) => sum + item, 0) / temperatures.length
			: null,
		precipitationMm: rainComplete ? precipitation : null,
		windMaxKmh: winds.length ? Math.max(...winds) : null,
		weatherCode: [...codes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null,
		sampleCount: temperatures.length,
		expectedSamples,
		complete: complete && rainComplete,
		kind,
	};
}

/** Collect adjacent solar dates, then clip absolute instants to the user's real local-day window. */
export function readDaySun(value: unknown, query: DayContextQuery): DaySun {
	const { days } = sunSchema.parse(value);
	const unique = new Map<string, { kind: SolarEvent["kind"]; occurredAt: string; at: number }>();
	for (const day of days) {
		if (day.sun_status !== "normal") continue;
		for (const kind of ["sunrise", "sunset"] as const) {
			const second = day[kind];
			if (second === null) continue;
			const at = second * 1000;
			unique.set(`${kind}:${at}`, { kind, occurredAt: new Date(at).toISOString(), at });
		}
	}
	const all = [...unique.values()].sort(
		(left, right) => left.at - right.at || left.kind.localeCompare(right.kind),
	);
	const start = Date.parse(query.start);
	const end = Date.parse(query.end);
	const events = all
		.filter((event) => event.at >= start && event.at < end)
		.map(({ kind, occurredAt }) => ({ kind, occurredAt }));
	const status = days.every((day) => day.sun_status === "midnight_sun")
		? "midnight_sun"
		: days.every((day) => day.sun_status === "polar_night")
			? "polar_night"
			: "normal";
	const previous = all.filter((event) => event.at <= start).at(-1);
	const next = all.find((event) => event.at > start);
	let light = previous
		? previous.kind === "sunrise"
		: next
			? next.kind === "sunset"
			: status === "midnight_sun";
	let cursor = start;
	let daylightMs = 0;
	for (const event of events) {
		const instant = Date.parse(event.occurredAt);
		if (light) daylightMs += instant - cursor;
		light = event.kind === "sunrise";
		cursor = instant;
	}
	if (light) daylightMs += end - cursor;
	return {
		events,
		status,
		daylightMinutes: !all.length && status === "normal" ? null : daylightMs / 60_000,
	};
}

export function weatherDescription(code: number | null): string {
	if (code === 0) return "晴";
	if (code === 1 || code === 2) return "晴间多云";
	if (code === 3) return "阴";
	if (code === 45 || code === 48) return "雾";
	if (code === 51 || code === 53 || code === 55) return "毛毛雨";
	if (code === 56 || code === 57 || code === 66 || code === 67) return "冻雨";
	if (code === 61 || code === 63 || code === 65) return "雨";
	if (code === 71 || code === 73 || code === 75 || code === 77) return "雪";
	if (code === 80 || code === 81 || code === 82) return "阵雨";
	if (code === 85 || code === 86) return "阵雪";
	if (code === 95 || code === 96 || code === 99) return "雷雨";
	return "天气资料不足";
}
