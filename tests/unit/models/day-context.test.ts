import { describe, expect, it } from "vitest";
import {
	type DayContextQuery,
	readDaySun,
	readDayWeather,
	weatherDescription,
} from "../../../src/models/day-context";

const HOUR = 3_600_000;

function query(overrides: Partial<DayContextQuery> = {}): DayContextQuery {
	return {
		date: "2026-09-13",
		timeZone: "Asia/Shanghai",
		start: "2026-09-12T16:00:00.000Z",
		end: "2026-09-13T16:00:00.000Z",
		latitude: 31.23,
		longitude: 121.47,
		...overrides,
	};
}

function unixHours(startIso: string, endIso: string): number[] {
	const first = Math.floor(Date.parse(startIso) / HOUR) * HOUR;
	const last = Math.ceil(Date.parse(endIso) / HOUR) * HOUR;
	const time: number[] = [];
	for (let instant = first; instant <= last; instant += HOUR) time.push(instant / 1000);
	return time;
}

function weatherValue(
	window: DayContextQuery,
	fill: {
		temperature?: number | null;
		code?: number | null;
		rain?: number | null;
		wind?: number | null;
		at?: (
			iso: string,
			index: number,
		) => {
			temperature?: number | null;
			code?: number | null;
			rain?: number | null;
			wind?: number | null;
		};
	} = {},
) {
	const time = unixHours(window.start, window.end);
	const pick = <T>(fromAt: T | undefined, fromFill: T | undefined, fallback: T): T =>
		fromAt !== undefined ? fromAt : fromFill !== undefined ? fromFill : fallback;
	return {
		hourly: {
			time,
			temperature_2m: time.map((second, index) => {
				const iso = new Date(second * 1000).toISOString();
				return pick(fill.at?.(iso, index)?.temperature, fill.temperature, 18);
			}),
			weather_code: time.map((second, index) => {
				const iso = new Date(second * 1000).toISOString();
				return pick(fill.at?.(iso, index)?.code, fill.code, 0);
			}),
			precipitation: time.map((second, index) => {
				const iso = new Date(second * 1000).toISOString();
				return pick(fill.at?.(iso, index)?.rain, fill.rain, 0);
			}),
			wind_speed_10m: time.map((second, index) => {
				const iso = new Date(second * 1000).toISOString();
				return pick(fill.at?.(iso, index)?.wind, fill.wind, 12);
			}),
		},
	};
}

describe("readDayWeather", () => {
	it("aligns UTC-hour samples to a Shanghai local day and prorates rain to (t-1h, t]", () => {
		const day = query();
		const weather = readDayWeather(
			weatherValue(day, {
				at: (iso) => ({
					temperature: iso === "2026-09-13T03:00:00.000Z" ? 28 : 16,
					rain: iso === "2026-09-12T17:00:00.000Z" ? 2 : 0,
					code: iso === "2026-09-13T03:00:00.000Z" ? 61 : 0,
				}),
			}),
			day,
			"historical",
		);
		expect(weather.expectedSamples).toBe(24);
		expect(weather.sampleCount).toBe(24);
		expect(weather.complete).toBe(true);
		expect(weather.temperatureMin).toBe(16);
		expect(weather.temperatureMax).toBe(28);
		expect(weather.precipitationMm).toBe(2);
		expect(weather.weatherCode).toBe(0);
		expect(weather.kind).toBe("historical");
	});

	it("keeps a 23-hour spring-forward day and a 25-hour fall-back day complete", () => {
		const spring = query({
			date: "2026-03-08",
			timeZone: "America/Los_Angeles",
			start: "2026-03-08T08:00:00.000Z",
			end: "2026-03-09T07:00:00.000Z",
		});
		expect(readDayWeather(weatherValue(spring), spring, "forecast")).toMatchObject({
			expectedSamples: 23,
			complete: true,
		});
		const fall = query({
			date: "2026-11-01",
			timeZone: "America/Los_Angeles",
			start: "2026-11-01T07:00:00.000Z",
			end: "2026-11-02T08:00:00.000Z",
		});
		expect(readDayWeather(weatherValue(fall), fall, "forecast")).toMatchObject({
			expectedSamples: 25,
			complete: true,
		});
	});

	it("prorates half-hour timezone edges and treats missing rain as incomplete", () => {
		const kolkata = query({
			date: "2026-09-13",
			timeZone: "Asia/Kolkata",
			start: "2026-09-12T18:30:00.000Z",
			end: "2026-09-13T18:30:00.000Z",
		});
		const rain = readDayWeather(
			weatherValue(kolkata, {
				at: (iso) => ({
					rain: iso === "2026-09-12T19:00:00.000Z" || iso === "2026-09-13T19:00:00.000Z" ? 2 : 0,
				}),
			}),
			kolkata,
			"forecast",
		);
		expect(rain.expectedSamples).toBe(24);
		expect(rain.precipitationMm).toBe(2);
		expect(rain.complete).toBe(true);
		const missing = weatherValue(kolkata, { rain: 1 });
		missing.hourly.precipitation[missing.hourly.precipitation.length - 1] = null;
		expect(readDayWeather(missing, kolkata, "forecast")).toMatchObject({
			precipitationMm: null,
			complete: false,
		});
	});

	it("treats missing codes and empty temperature columns as incomplete", () => {
		const day = query();
		const weather = readDayWeather(
			weatherValue(day, { at: () => ({ temperature: null, code: null, wind: null }) }),
			day,
			"forecast",
		);
		expect(weather).toMatchObject({
			temperatureMin: null,
			temperatureMean: null,
			windMaxKmh: null,
			weatherCode: null,
			sampleCount: 0,
			complete: false,
		});
	});

	it("rejects unaligned or duplicate hourly timestamps and mismatched columns", () => {
		const day = query();
		const aligned = weatherValue(day);
		expect(() =>
			readDayWeather(
				{ hourly: { ...aligned.hourly, time: aligned.hourly.time.map((second) => second + 1) } },
				day,
				"forecast",
			),
		).toThrow("天气时间未按整点对齐");
		expect(() =>
			readDayWeather(
				{
					hourly: {
						...aligned.hourly,
						time: [...aligned.hourly.time, aligned.hourly.time[0] as number],
						temperature_2m: [...aligned.hourly.temperature_2m, 1],
						weather_code: [...aligned.hourly.weather_code, 0],
						precipitation: [...aligned.hourly.precipitation, 0],
						wind_speed_10m: [...aligned.hourly.wind_speed_10m, 1],
					},
				},
				day,
				"forecast",
			),
		).toThrow("天气时间样本重复");
		expect(() =>
			readDayWeather(
				{ hourly: { ...aligned.hourly, temperature_2m: aligned.hourly.temperature_2m.slice(1) } },
				day,
				"forecast",
			),
		).toThrow("天气数据列长度不一致");
	});
});

describe("readDaySun", () => {
	it("keeps a sunrise that equals the window start even when ISO strings differ at the boundary", () => {
		const start = "2026-09-12T16:00:00Z";
		const end = "2026-09-13T16:00:00Z";
		const sunrise = Date.parse("2026-09-12T16:00:00.000Z") / 1000;
		const sunset = Date.parse("2026-09-13T10:00:00.000Z") / 1000;
		const sun = readDaySun(
			{ days: [{ date: "2026-09-13", sunrise, sunset, sun_status: "normal" }] },
			query({ start, end }),
		);
		expect(sun.events.map((event) => event.kind)).toEqual(["sunrise", "sunset"]);
		expect(sun.events[0]?.occurredAt).toBe("2026-09-12T16:00:00.000Z");
		expect(sun.daylightMinutes).toBe(18 * 60);
	});

	it("excludes a sunset exactly at the exclusive end and still counts light up to that boundary", () => {
		const day = query({ start: "2026-09-12T16:00:00Z", end: "2026-09-13T16:00:00Z" });
		const sunrise = Date.parse(day.start) / 1000 + 3600;
		const sunset = Date.parse(day.end) / 1000;
		const sun = readDaySun(
			{ days: [{ date: "2026-09-13", sunrise, sunset, sun_status: "normal" }] },
			day,
		);
		expect(sun.events).toEqual([{ kind: "sunrise", occurredAt: "2026-09-12T17:00:00.000Z" }]);
		expect(sun.daylightMinutes).toBe(23 * 60);
	});

	it("treats polar night and midnight sun as status without fake 00:00 nodes", () => {
		const day = query();
		const midnight = Date.parse(day.start) / 1000;
		const night = readDaySun(
			{
				days: [
					{ date: "2026-01-01", sunrise: midnight, sunset: midnight, sun_status: "polar_night" },
					{ date: "2026-01-02", sunrise: null, sunset: null, sun_status: "polar_night" },
				],
			},
			day,
		);
		expect(night).toEqual({ events: [], status: "polar_night", daylightMinutes: 0 });
		const polarDay = readDaySun(
			{
				days: [{ date: "2026-06-21", sunrise: null, sunset: null, sun_status: "midnight_sun" }],
			},
			day,
		);
		expect(polarDay.status).toBe("midnight_sun");
		expect(polarDay.events).toEqual([]);
		expect(polarDay.daylightMinutes).toBe(24 * 60);
	});

	it("keeps a lone sunset and reports missing solar data when a normal day has no instants", () => {
		const day = query();
		const sunset = Date.parse("2026-09-13T10:00:00.000Z") / 1000;
		const dusk = readDaySun(
			{ days: [{ date: "2026-09-13", sunrise: null, sunset, sun_status: "normal" }] },
			day,
		);
		expect(dusk.events).toEqual([{ kind: "sunset", occurredAt: "2026-09-13T10:00:00.000Z" }]);
		expect(dusk.daylightMinutes).toBeGreaterThan(0);
		const empty = readDaySun(
			{ days: [{ date: "2026-09-13", sunrise: null, sunset: null, sun_status: "normal" }] },
			day,
		);
		expect(empty).toEqual({ events: [], status: "normal", daylightMinutes: null });
	});

	it("rejects malformed solar payloads", () => {
		expect(() => readDaySun({ days: [] }, query())).toThrow();
		expect(() =>
			readDaySun(
				{ days: [{ date: "2026-09-13", sunrise: 1, sunset: 2, sun_status: "dusk" }] },
				query(),
			),
		).toThrow();
	});
});

describe("weatherDescription", () => {
	it("maps known WMO codes and missing data", () => {
		expect(weatherDescription(0)).toBe("晴");
		expect(weatherDescription(2)).toBe("晴间多云");
		expect(weatherDescription(3)).toBe("阴");
		expect(weatherDescription(45)).toBe("雾");
		expect(weatherDescription(51)).toBe("毛毛雨");
		expect(weatherDescription(56)).toBe("冻雨");
		expect(weatherDescription(61)).toBe("雨");
		expect(weatherDescription(71)).toBe("雪");
		expect(weatherDescription(80)).toBe("阵雨");
		expect(weatherDescription(85)).toBe("阵雪");
		expect(weatherDescription(95)).toBe("雷雨");
		expect(weatherDescription(null)).toBe("天气资料不足");
		expect(weatherDescription(123)).toBe("天气资料不足");
	});
});
