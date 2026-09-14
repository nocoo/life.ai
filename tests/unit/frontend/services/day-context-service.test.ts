import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayContextQuery } from "../../../../src/models/day-context";
import { fetchDaySun, fetchDayWeather } from "../../../../src/services/day-context-service";
import { abortError, jsonResponse, stubFetch } from "../helpers";

const NOW = "2026-09-14T12:00:00.000Z";

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

function hourlyBody(startIso: string, endIso: string) {
	const hour = 3_600_000;
	const first = Math.floor(Date.parse(startIso) / hour) * hour;
	const last = Math.ceil(Date.parse(endIso) / hour) * hour;
	const time: number[] = [];
	for (let instant = first; instant <= last; instant += hour) time.push(instant / 1000);
	return {
		hourly: {
			time,
			temperature_2m: time.map(() => 20),
			weather_code: time.map(() => 1),
			precipitation: time.map(() => 0),
			wind_speed_10m: time.map(() => 8),
		},
	};
}

function sunBody() {
	return {
		days: [
			{
				date: "2026-09-12",
				sunrise: Date.parse("2026-09-12T21:54:00.000Z") / 1000,
				sunset: Date.parse("2026-09-13T10:25:00.000Z") / 1000,
				sun_status: "normal",
			},
		],
	};
}

describe("day-context-service", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("uses forecast for recent dates and archive once the window is older than five days", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("archive-api.open-meteo.com")) {
				return jsonResponse(
					200,
					hourlyBody("2026-01-01T16:00:00.000Z", "2026-01-02T16:00:00.000Z"),
				);
			}
			return jsonResponse(200, hourlyBody("2026-09-12T16:00:00.000Z", "2026-09-13T16:00:00.000Z"));
		});
		stubFetch(fetchMock);
		const recent = await fetchDayWeather(query(), new AbortController().signal);
		expect(recent?.kind).toBe("forecast");
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.open-meteo.com/v1/forecast");
		const old = query({
			date: "2026-01-01",
			start: "2025-12-31T16:00:00.000Z",
			end: "2026-01-01T16:00:00.000Z",
		});
		const historical = await fetchDayWeather(old, new AbortController().signal);
		expect(historical?.kind).toBe("historical");
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("archive-api.open-meteo.com/v1/archive");
	});

	it("clamps a window that crosses the archive start or forecast horizon", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.hostname === "archive-api.open-meteo.com") {
				expect(url.searchParams.get("start_date")).toBe("1940-01-01");
				return jsonResponse(
					200,
					hourlyBody("1940-01-01T00:00:00.000Z", "1940-01-02T00:00:00.000Z"),
				);
			}
			expect(url.searchParams.get("end_date")).toBe("2026-09-29");
			return jsonResponse(200, hourlyBody("2026-09-28T00:00:00.000Z", "2026-09-29T00:00:00.000Z"));
		});
		stubFetch(fetchMock);
		await fetchDayWeather(
			query({ start: "1939-12-31T12:00:00.000Z", end: "1940-01-02T00:00:00.000Z" }),
			new AbortController().signal,
		);
		await fetchDayWeather(
			query({ start: "2026-09-28T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" }),
			new AbortController().signal,
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not call weather hosts outside the archive/forecast range", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, {}));
		stubFetch(fetchMock);
		await expect(
			fetchDayWeather(
				query({ start: "1939-12-01T00:00:00.000Z", end: "1939-12-02T00:00:00.000Z" }),
				new AbortController().signal,
			),
		).resolves.toBeNull();
		await expect(
			fetchDayWeather(
				query({ start: "2026-10-20T00:00:00.000Z", end: "2026-10-21T00:00:00.000Z" }),
				new AbortController().signal,
			),
		).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("requests adjacent UTC solar dates and maps a public unix payload", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			expect(url.origin).toBe("https://api.sunrise-sunset.org");
			expect(url.searchParams.get("tz")).toBe("UTC");
			expect(url.searchParams.get("time_format")).toBe("unix");
			expect(url.searchParams.get("date_start")).toBe("2026-09-11");
			expect(url.searchParams.get("date_end")).toBe("2026-09-14");
			return jsonResponse(200, sunBody());
		});
		stubFetch(fetchMock);
		const sun = await fetchDaySun(query(), new AbortController().signal);
		expect(sun.events).toHaveLength(2);
		expect(sun.status).toBe("normal");
	});

	it("maps bounded HTTP failures and oversized or empty public bodies", async () => {
		stubFetch(vi.fn(async () => jsonResponse(429, { error: true })));
		await expect(fetchDaySun(query(), new AbortController().signal)).rejects.toThrow(
			"公共数据服务繁忙，请稍后重试。",
		);
		stubFetch(vi.fn(async () => jsonResponse(503, { error: true })));
		await expect(fetchDaySun(query(), new AbortController().signal)).rejects.toThrow(
			"公共数据服务暂时不可用。",
		);
		stubFetch(vi.fn(async () => new Response(null, { status: 200 })));
		await expect(fetchDaySun(query(), new AbortController().signal)).rejects.toThrow(
			"公共数据服务没有返回内容。",
		);
		stubFetch(vi.fn(async () => new Response("x".repeat(129 * 1024), { status: 200 })));
		await expect(fetchDaySun(query(), new AbortController().signal)).rejects.toThrow(
			"公共数据响应过大。",
		);
		stubFetch(vi.fn(async () => new Response("{", { status: 200 })));
		await expect(fetchDaySun(query(), new AbortController().signal)).rejects.toThrow();
	});

	it("aborts in-flight public reads", async () => {
		stubFetch(
			vi.fn(async (_input, init) => {
				await new Promise<void>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(abortError()));
				});
				return jsonResponse(200, sunBody());
			}),
		);
		const controller = new AbortController();
		const pending = fetchDaySun(query(), controller.signal);
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});
});
