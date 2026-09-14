import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayContextQuery } from "../../src/models/day-context.js";
import {
	buildPlaceCacheKey,
	buildSunCacheKey,
	buildWeatherCacheKey,
	getDaySun,
	getDayWeather,
	getPlaceLabel,
	handleContextRequest,
	roundCoordinate,
	validateContextQuery,
} from "../../worker/public-context.js";
import type { WorkerEnv } from "../../worker/types.js";
import { sqliteD1 } from "../helpers/sqlite-d1.js";

const query: DayContextQuery = {
	date: "2026-09-13",
	timeZone: "Asia/Shanghai",
	start: "2026-09-12T16:00:00.000Z",
	end: "2026-09-13T16:00:00.000Z",
	latitude: 31.2345,
	longitude: 121.4745,
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function sunApiPayload() {
	return {
		days: [
			{
				date: "2026-09-12",
				sunrise: Date.parse("2026-09-12T21:40:00.000Z") / 1000,
				sunset: Date.parse("2026-09-13T10:05:00.000Z") / 1000,
				sun_status: "normal",
			},
		],
	};
}

function hourlyWeatherPayload(startIso: string, endIso: string, complete = true) {
	const hour = 3_600_000;
	const first = Math.floor(Date.parse(startIso) / hour) * hour;
	const last = Math.ceil(Date.parse(endIso) / hour) * hour;
	const time: number[] = [];
	for (let instant = first; instant <= last; instant += hour) time.push(instant / 1000);
	return {
		hourly: {
			time,
			temperature_2m: time.map((_, i) => (complete || i > 0 ? 22 : null)),
			weather_code: time.map(() => 1),
			precipitation: time.map(() => 0),
			wind_speed_10m: time.map(() => 10),
		},
	};
}

describe("public-context worker backend", () => {
	let env: WorkerEnv;
	let sqlite: ReturnType<typeof sqliteD1>["sqlite"];

	beforeEach(() => {
		const setup = sqliteD1();
		env = setup.env;
		sqlite = setup.sqlite;
		vi.useFakeTimers({ now: new Date("2026-09-14T12:00:00.000Z"), toFake: ["Date"] });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		sqlite.close();
	});

	describe("coordinate and key helpers", () => {
		it("rounds coordinates to 2 decimal places", () => {
			expect(roundCoordinate(31.23456)).toBe(31.23);
			expect(roundCoordinate(121.4789)).toBe(121.48);
		});

		it("constructs stable cache keys", () => {
			expect(buildSunCacheKey(query)).toBe(
				"2026-09-13:Asia/Shanghai:31.23:121.47:2026-09-12T16:00:00.000Z:2026-09-13T16:00:00.000Z",
			);
			expect(buildWeatherCacheKey(query)).toBe(
				"2026-09-13:Asia/Shanghai:31.23:121.47:2026-09-12T16:00:00.000Z:2026-09-13T16:00:00.000Z",
			);
			expect(buildPlaceCacheKey(31.2345, 121.4789)).toBe("31.23:121.48");
		});
	});

	describe("validateContextQuery", () => {
		it("validates valid query url", () => {
			const url = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z&latitude=31.23&longitude=121.47",
			);
			const parsed = validateContextQuery(url);
			expect(parsed).toEqual({
				date: "2026-09-13",
				timeZone: "Asia/Shanghai",
				start: "2026-09-12T16:00:00.000Z",
				end: "2026-09-13T16:00:00.000Z",
				latitude: 31.23,
				longitude: 121.47,
			});
		});

		it("rejects invalid date format", () => {
			const url = new URL("https://life.hexly.ai/api/context/sun?date=invalid&timeZone=UTC");
			expect(() => validateContextQuery(url)).toThrow("请选择有效日期与时区");
		});

		it("rejects mismatch between UTC window and local calendar date", () => {
			const urlMismatch = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-13T00:00:00.000Z&end=2026-09-14T00:00:00.000Z&latitude=31.23&longitude=121.47",
			);
			expect(() => validateContextQuery(urlMismatch)).toThrow("UTC 时间范围与所选本地日期不一致");
		});

		it("rejects missing or out-of-range coordinates", () => {
			const urlNoCoords = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z",
			);
			expect(() => validateContextQuery(urlNoCoords)).toThrow("必须提供");

			const urlBadLat = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z&latitude=999&longitude=0",
			);
			expect(() => validateContextQuery(urlBadLat)).toThrow("latitude 超出有效范围");

			const urlBadLon = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z&latitude=30&longitude=999",
			);
			expect(() => validateContextQuery(urlBadLon)).toThrow("longitude 超出有效范围");
		});
	});

	describe("getDaySun with D1 permanent caching & validation", () => {
		it("fetches solar API on cache miss, caches in D1 permanently, and never refetches on subsequent calls", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				expect(url).toContain("https://api.sunrise-sunset.org/v2");
				return jsonResponse(sunApiPayload());
			});
			vi.stubGlobal("fetch", fetchMock);

			const sun1 = await getDaySun(env, query);
			expect(sun1.events.length).toBeGreaterThan(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			const row = await env.DB.prepare(
				"SELECT kind, cache_key, data_json, expires_at FROM public_context_cache WHERE kind = 'sun'",
			).first<{ kind: string; cache_key: string; data_json: string; expires_at: number | null }>();
			expect(row?.kind).toBe("sun");
			expect(row?.expires_at).toBeNull();

			const sun2 = await getDaySun(env, query);
			expect(sun2).toEqual(sun1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("does not permanently cache when normal sun returns 0 events (incomplete data)", async () => {
			const emptySunPayload = {
				days: [
					{
						date: "2026-09-12",
						sunrise: null,
						sunset: null,
						sun_status: "normal",
					},
				],
			};
			const fetchMock = vi.fn(async () => jsonResponse(emptySunPayload));
			vi.stubGlobal("fetch", fetchMock);

			const sun = await getDaySun(env, query);
			expect(sun.events.length).toBe(0);

			const count = await env.DB.prepare(
				"SELECT COUNT(*) AS count FROM public_context_cache WHERE kind = 'sun'",
			).first<{ count: number }>();
			expect(count?.count).toBe(0);
		});

		it("does not write corrupt or failure responses to D1", async () => {
			const fetchMock = vi.fn(async () => jsonResponse({ status: "error" }, 500));
			vi.stubGlobal("fetch", fetchMock);

			await expect(getDaySun(env, query)).rejects.toThrow();

			const count = await env.DB.prepare(
				"SELECT COUNT(*) AS count FROM public_context_cache WHERE kind = 'sun'",
			).first<{ count: number }>();
			expect(count?.count).toBe(0);
		});

		it.each(["sunrise", "sunset"] as const)(
			"retries a response missing %s, then permanently reuses the complete result",
			async (missing) => {
				const partial = sunApiPayload();
				partial.days = partial.days.map((day) => ({ ...day, [missing]: 0 }));
				const fetchMock = vi
					.fn()
					.mockResolvedValueOnce(jsonResponse(partial))
					.mockResolvedValueOnce(jsonResponse(sunApiPayload()));
				vi.stubGlobal("fetch", fetchMock);
				expect((await getDaySun(env, query)).events).toHaveLength(1);
				expect(
					sqlite
						.prepare("SELECT COUNT(*) AS count FROM public_context_cache WHERE kind = 'sun'")
						.get(),
				).toEqual({ count: 0 });
				const complete = await getDaySun(env, query);
				expect(complete.events).toHaveLength(2);
				const saved = sqlite.prepare("SELECT * FROM public_context_cache WHERE kind = 'sun'").get();
				vi.setSystemTime(new Date("2027-09-14T12:00:00Z"));
				expect(await getDaySun(env, query)).toEqual(complete);
				expect(
					sqlite.prepare("SELECT * FROM public_context_cache WHERE kind = 'sun'").get(),
				).toEqual(saved);
				expect(fetchMock).toHaveBeenCalledTimes(2);
			},
		);

		it("uses Workers-compatible manual redirects and never follows or caches an upstream redirect", async () => {
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.redirect).toBe("manual");
				return new Response(null, {
					status: 302,
					headers: { Location: "https://other.example/solar" },
				});
			});
			vi.stubGlobal("fetch", fetchMock);
			await expect(getDaySun(env, query)).rejects.toThrow("302");
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(sqlite.prepare("SELECT COUNT(*) AS count FROM public_context_cache").get()).toEqual({
				count: 0,
			});
			expect(sqlite.prepare("SELECT COUNT(*) AS count FROM public_context_leases").get()).toEqual({
				count: 0,
			});
		});
	});

	describe("getDayWeather with D1 caching (historical vs forecast)", () => {
		it("caches forecast weather with 3h expiration and reuses cache across repeated requests", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				expect(url).toContain("api.open-meteo.com/v1/forecast");
				return jsonResponse(hourlyWeatherPayload(query.start, query.end));
			});
			vi.stubGlobal("fetch", fetchMock);

			const weather1 = await getDayWeather(env, query);
			expect(weather1?.kind).toBe("forecast");
			expect(fetchMock).toHaveBeenCalledTimes(1);

			const row = await env.DB.prepare(
				"SELECT expires_at FROM public_context_cache WHERE kind = 'weather'",
			).first<{ expires_at: number | null }>();
			expect(row?.expires_at).toBeGreaterThan(Date.now());

			const weather2 = await getDayWeather(env, query);
			expect(weather2).toEqual(weather1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("caches historical complete weather permanently (expires_at = null)", async () => {
			const oldQuery: DayContextQuery = {
				...query,
				date: "2025-01-01",
				start: "2024-12-31T16:00:00.000Z",
				end: "2025-01-01T16:00:00.000Z",
			};
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				expect(url).toContain("archive-api.open-meteo.com/v1/archive");
				return jsonResponse(hourlyWeatherPayload(oldQuery.start, oldQuery.end, true));
			});
			vi.stubGlobal("fetch", fetchMock);

			const weather = await getDayWeather(env, oldQuery);
			expect(weather?.kind).toBe("historical");
			expect(weather?.complete).toBe(true);

			const row = await env.DB.prepare(
				"SELECT expires_at FROM public_context_cache WHERE kind = 'weather' AND cache_key = ?",
			)
				.bind(buildWeatherCacheKey(oldQuery))
				.first<{ expires_at: number | null }>();
			expect(row?.expires_at).toBeNull();
		});

		it("short-caches historical weather if incomplete so it can self-heal later", async () => {
			const oldQuery: DayContextQuery = {
				...query,
				date: "2025-01-01",
				start: "2024-12-31T16:00:00.000Z",
				end: "2025-01-01T16:00:00.000Z",
			};
			const fetchMock = vi.fn(async () =>
				jsonResponse(hourlyWeatherPayload(oldQuery.start, oldQuery.end, false)),
			);
			vi.stubGlobal("fetch", fetchMock);

			const weather = await getDayWeather(env, oldQuery);
			expect(weather?.complete).toBe(false);

			const row = await env.DB.prepare(
				"SELECT expires_at FROM public_context_cache WHERE kind = 'weather' AND cache_key = ?",
			)
				.bind(buildWeatherCacheKey(oldQuery))
				.first<{ expires_at: number | null }>();
			expect(row?.expires_at).toBeGreaterThan(Date.now());
		});

		it("returns null for dates outside weather support range without fetching", async () => {
			const outOfRangeQuery: DayContextQuery = {
				...query,
				date: "1930-01-01",
				start: "1929-12-31T16:00:00.000Z",
				end: "1930-01-01T16:00:00.000Z",
			};
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const weather = await getDayWeather(env, outOfRangeQuery);
			expect(weather).toBeNull();
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	describe("getPlaceLabel with Nominatim rate limiting, type-safe address & caching", () => {
		it("coarsens coordinates, queries Nominatim with User-Agent, enforces 1 req/s, and caches permanently", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input));
				expect(url.origin).toBe("https://nominatim.openstreetmap.org");
				expect(url.pathname).toBe("/reverse");
				expect(url.searchParams.get("lat")).toBe("31.23");
				expect(url.searchParams.get("lon")).toBe("121.47");
				expect(url.searchParams.get("zoom")).toBe("12");

				const headers = init?.headers as Record<string, string>;
				expect(headers?.["User-Agent"]).toBe(
					"Life.ai (https://github.com/nocoo/life.ai; personal life chronicle)",
				);

				return jsonResponse({
					address: {
						city: "上海市",
						district: "黄浦区",
						state: "上海市",
					},
					display_name: "黄浦区, 上海市, 中国",
				});
			});
			vi.stubGlobal("fetch", fetchMock);

			const label1 = await getPlaceLabel(env, { latitude: 31.2345, longitude: 121.4745 });
			expect(label1).toBe("上海市 黄浦区");
			expect(fetchMock).toHaveBeenCalledTimes(1);

			const cached = await env.DB.prepare(
				"SELECT data_json, expires_at FROM public_context_cache WHERE kind = 'place' AND cache_key = '31.23:121.47'",
			).first<{ data_json: string; expires_at: number | null }>();
			expect(cached?.expires_at).toBeNull();
			expect(cached?.data_json ? JSON.parse(cached.data_json) : null).toBe("上海市 黄浦区");

			const ratelimit = await env.DB.prepare(
				"SELECT next_allowed_at FROM public_context_ratelimit WHERE service = 'nominatim'",
			).first<{ next_allowed_at: number }>();
			expect(ratelimit?.next_allowed_at).toBeGreaterThan(0);

			const label2 = await getPlaceLabel(env, { latitude: 31.2311, longitude: 121.4722 });
			expect(label2).toBe("上海市 黄浦区");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("safely handles non-string and numeric address attributes without throw", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					jsonResponse({
						address: {
							city: 12345, // invalid non-string
							suburb: "安全子区",
						},
						display_name: 99999, // invalid non-string
					}),
				),
			);
			const label = await getPlaceLabel(env, { latitude: 22.3, longitude: 114.1 });
			expect(label).toBe("安全子区");
		});

		it("returns null when rate limiter wait budget is exhausted and does not call fetch", async () => {
			// Pre-set next_allowed_at far into the future beyond 5000ms budget
			await env.DB.prepare(
				"INSERT INTO public_context_ratelimit (service, next_allowed_at) VALUES ('nominatim', ?)",
			)
				.bind(Date.now() + 10_000)
				.run();

			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const label = await getPlaceLabel(env, { latitude: 31.23, longitude: 121.47 });
			expect(label).toBeNull();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns null on network/timeout failure and does not cache failure as success", async () => {
			const fetchMock = vi.fn(async () => {
				throw new Error("timeout");
			});
			vi.stubGlobal("fetch", fetchMock);

			const label = await getPlaceLabel(env, { latitude: 31.23, longitude: 121.47 });
			expect(label).toBeNull();

			const count = await env.DB.prepare(
				"SELECT COUNT(*) as cnt FROM public_context_cache WHERE kind = 'place'",
			).first<{ cnt: number }>();
			expect(count?.cnt).toBe(0);
		});

		it("returns null for invalid coordinates without fetching", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			expect(await getPlaceLabel(env, { latitude: NaN, longitude: 121.47 })).toBeNull();
			expect(await getPlaceLabel(env, { latitude: 120, longitude: 121.47 })).toBeNull();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("extracts district and state fallbacks in place name parsing", async () => {
			await env.DB.prepare("DELETE FROM public_context_ratelimit").run();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					jsonResponse({
						address: { suburb: "某某郊区" },
					}),
				),
			);
			expect(await getPlaceLabel(env, { latitude: 10, longitude: 20 })).toBe("某某郊区");

			await env.DB.prepare("DELETE FROM public_context_ratelimit").run();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					jsonResponse({
						address: { state: "某某省" },
					}),
				),
			);
			expect(await getPlaceLabel(env, { latitude: 10, longitude: 21 })).toBe("某某省");

			await env.DB.prepare("DELETE FROM public_context_ratelimit").run();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					jsonResponse({
						address: {},
						display_name: "某海域, 太平洋",
					}),
				),
			);
			expect(await getPlaceLabel(env, { latitude: 10, longitude: 22 })).toBe("某海域");
		});
	});

	describe("lease contention and concurrency guarantees", () => {
		it("stops external call and throws 503 when lease is permanently unacquirable for sun/weather", async () => {
			const cacheKey = buildSunCacheKey(query);
			// Hold lease indefinitely
			await env.DB.prepare(
				"INSERT INTO public_context_leases (kind, cache_key, lease_token, leased_until) VALUES ('sun', ?, 'held', ?)",
			)
				.bind(cacheKey, Date.now() + 60_000)
				.run();

			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			await expect(getDaySun(env, query)).rejects.toMatchObject({
				status: 503,
				code: "service_unavailable",
			});
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("re-reads cache after lease acquisition and avoids second fetch if peer finished before token handoff", async () => {
			let fetchCount = 0;
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					fetchCount++;
					return jsonResponse(sunApiPayload());
				}),
			);

			// First call executes and writes
			await getDaySun(env, query);
			expect(fetchCount).toBe(1);

			// Second call: verify no fetch
			await getDaySun(env, query);
			expect(fetchCount).toBe(1);
		});

		it("waits on lease when another worker is fetching and reads cached result when ready", async () => {
			const cacheKey = buildSunCacheKey(query);
			await env.DB.prepare(
				"INSERT INTO public_context_leases (kind, cache_key, lease_token, leased_until) VALUES ('sun', ?, 'peer-token', ?)",
			)
				.bind(cacheKey, Date.now() + 10_000)
				.run();

			setTimeout(async () => {
				await env.DB.prepare(
					"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at) VALUES ('sun', ?, ?, ?)",
				)
					.bind(
						cacheKey,
						JSON.stringify({ events: [], daylightMinutes: 0, status: "midnight_sun" }),
						Date.now(),
					)
					.run();
			}, 50);

			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const sun = await getDaySun(env, query);
			expect(sun.status).toBe("midnight_sun");
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("waits on weather lease and recovers cached weather", async () => {
			const cacheKey = buildWeatherCacheKey(query);
			await env.DB.prepare(
				"INSERT INTO public_context_leases (kind, cache_key, lease_token, leased_until) VALUES ('weather', ?, 'peer-token', ?)",
			)
				.bind(cacheKey, Date.now() + 10_000)
				.run();

			const expectedWeather = {
				temperatureMin: 15,
				temperatureMax: 25,
				temperatureMean: 20,
				precipitationMm: 0,
				windMaxKmh: 10,
				weatherCode: 1,
				sampleCount: 24,
				expectedSamples: 24,
				complete: true,
				kind: "forecast" as const,
			};

			setTimeout(async () => {
				await env.DB.prepare(
					"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at, expires_at) VALUES ('weather', ?, ?, ?, ?)",
				)
					.bind(cacheKey, JSON.stringify(expectedWeather), Date.now(), Date.now() + 3600_000)
					.run();
			}, 50);

			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const weather = await getDayWeather(env, query);
			expect(weather).toEqual(expectedWeather);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("waits on place lease and recovers cached place", async () => {
			const cacheKey = "31.23:121.47";
			await env.DB.prepare(
				"INSERT INTO public_context_leases (kind, cache_key, lease_token, leased_until) VALUES ('place', ?, 'peer-token', ?)",
			)
				.bind(cacheKey, Date.now() + 10_000)
				.run();

			setTimeout(async () => {
				await env.DB.prepare(
					"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at) VALUES ('place', ?, ?, ?)",
				)
					.bind(cacheKey, JSON.stringify("外滩"), Date.now())
					.run();
			}, 50);

			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const place = await getPlaceLabel(env, { latitude: 31.23, longitude: 121.47 });
			expect(place).toBe("外滩");
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	describe("handleContextRequest HTTP endpoint router", () => {
		it("handles GET /api/context/sun", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(sunApiPayload())),
			);
			const request = new Request("https://life.hexly.ai/api/context/sun");
			const url = new URL(
				"https://life.hexly.ai/api/context/sun?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z&latitude=31.23&longitude=121.47",
			);

			const response = await handleContextRequest(request, env, url);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { data: { status: string; events: unknown[] } };
			expect(body.data.status).toBe("normal");
			expect(body.data.events.length).toBeGreaterThan(0);
		});

		it("handles GET /api/context/weather", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(hourlyWeatherPayload(query.start, query.end))),
			);
			const request = new Request("https://life.hexly.ai/api/context/weather");
			const url = new URL(
				"https://life.hexly.ai/api/context/weather?date=2026-09-13&timeZone=Asia/Shanghai&start=2026-09-12T16:00:00.000Z&end=2026-09-13T16:00:00.000Z&latitude=31.23&longitude=121.47",
			);

			const response = await handleContextRequest(request, env, url);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { data: { kind: string; temperatureMean: number } };
			expect(body.data.temperatureMean).toBe(22);
		});

		it("rejects non-GET methods with 405", async () => {
			const request = new Request("https://life.hexly.ai/api/context/sun", { method: "POST" });
			const url = new URL("https://life.hexly.ai/api/context/sun");
			await expect(handleContextRequest(request, env, url)).rejects.toMatchObject({
				status: 405,
				code: "method_not_allowed",
			});
		});

		it("rejects unknown path with 404", async () => {
			const request = new Request("https://life.hexly.ai/api/context/unknown");
			const url = new URL("https://life.hexly.ai/api/context/unknown");
			await expect(handleContextRequest(request, env, url)).rejects.toMatchObject({
				status: 404,
				code: "not_found",
			});
		});

		it("handles rate limit (429) and stream read errors from public fetch", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("busy", { status: 429 })),
			);
			await expect(getDaySun(env, query)).rejects.toThrow("公共数据服务繁忙");

			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					const huge = new Uint8Array(150 * 1024);
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(huge);
								controller.close();
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}),
			);
			await expect(getDaySun(env, query)).rejects.toThrow("公共数据响应过大");
		});

		it("covers bad JSON in cache gracefully", async () => {
			await env.DB.prepare(
				"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at) VALUES ('sun', ?, 'invalid-json', 123)",
			)
				.bind(buildSunCacheKey(query))
				.run();
			await env.DB.prepare(
				"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at) VALUES ('weather', ?, 'invalid-json', 123)",
			)
				.bind(buildWeatherCacheKey(query))
				.run();
			await env.DB.prepare(
				"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at) VALUES ('place', '50:50', 'not-json-or-raw', 123)",
			).run();

			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL) => {
					const str = String(input);
					if (str.includes("sunrise-sunset")) return jsonResponse(sunApiPayload());
					if (str.includes("open-meteo"))
						return jsonResponse(hourlyWeatherPayload(query.start, query.end));
					return jsonResponse({});
				}),
			);

			const sun = await getDaySun(env, query);
			expect(sun.status).toBe("normal");

			const weather = await getDayWeather(env, query);
			expect(weather?.kind).toBe("forecast");

			const place = await getPlaceLabel(env, { latitude: 50, longitude: 50 });
			expect(place).toBe("not-json-or-raw");
		});
	});
});
