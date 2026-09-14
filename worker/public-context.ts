import { validateSummaryQuery } from "../src/models/ai.js";
import {
	type DayContextQuery,
	type DaySun,
	type DayWeather,
	readDaySun,
	readDayWeather,
} from "../src/models/day-context.js";
import { shiftLocalDate } from "../src/models/time.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse } from "./utils.js";

const NOMINATIM_USER_AGENT = "Life.ai (https://github.com/nocoo/life.ai; personal life chronicle)";
const NOMINATIM_TIMEOUT_MS = 6_000;
const PUBLIC_API_TIMEOUT_MS = 12_000;
const MAX_PUBLIC_BODY_BYTES = 128 * 1024;
const LEASE_DURATION_MS = 30_000; // Covers bounded poll + fetch
const LEASE_POLL_INTERVAL_MS = 150;
const LEASE_POLL_COUNT = 20;
const NOMINATIM_INTERVAL_MS = 1_000; // Strict 1 request / second policy
const NOMINATIM_MAX_WAIT_MS = 5_000; // Bounded wait before gracefully giving up

const RECENT_WEATHER_TTL_MS = 3 * 3600 * 1000;
const INCOMPLETE_WEATHER_TTL_MS = 30 * 60 * 1000;

export function roundCoordinate(coord: number): number {
	return Number(coord.toFixed(2));
}

export function buildSunCacheKey(query: DayContextQuery): string {
	const lat = roundCoordinate(query.latitude);
	const lon = roundCoordinate(query.longitude);
	return `${query.date}:${query.timeZone}:${lat}:${lon}:${query.start}:${query.end}`;
}

export function buildWeatherCacheKey(query: DayContextQuery): string {
	const lat = roundCoordinate(query.latitude);
	const lon = roundCoordinate(query.longitude);
	return `${query.date}:${query.timeZone}:${lat}:${lon}:${query.start}:${query.end}`;
}

export function buildPlaceCacheKey(latitude: number, longitude: number): string {
	const lat = roundCoordinate(latitude);
	const lon = roundCoordinate(longitude);
	return `${lat}:${lon}`;
}

/**
 * Bounded Workers fetch: no browser credentials/referrerPolicy.
 */
async function fetchPublicJson(
	url: URL,
	timeoutMs = PUBLIC_API_TIMEOUT_MS,
	headers: Record<string, string> = {},
): Promise<unknown> {
	const response = await fetch(url.toString(), {
		signal: AbortSignal.timeout(timeoutMs),
		redirect: "manual",
		headers: { Accept: "application/json", ...headers },
	});

	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(
			response.status === 429
				? "公共数据服务繁忙，请稍后重试。"
				: `公共数据服务暂时不可用 (${response.status})。`,
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
			if (bytes > MAX_PUBLIC_BODY_BYTES) {
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

interface CacheRow {
	data_json: string;
	expires_at: number | null;
}

async function readValidCache<T>(
	env: WorkerEnv,
	kind: "sun" | "weather" | "place",
	cacheKey: string,
): Promise<T | null> {
	const row = await env.DB.prepare(
		"SELECT data_json, expires_at FROM public_context_cache WHERE kind = ? AND cache_key = ?",
	)
		.bind(kind, cacheKey)
		.first<CacheRow>();

	if (!row?.data_json) return null;
	const now = Date.now();
	if (row.expires_at !== null && row.expires_at <= now) return null;

	try {
		return JSON.parse(row.data_json) as T;
	} catch {
		return (kind === "place" ? row.data_json : null) as T | null;
	}
}

async function acquireLease(
	env: WorkerEnv,
	kind: "sun" | "weather" | "place",
	cacheKey: string,
): Promise<string | null> {
	const token = crypto.randomUUID();
	const now = Date.now();
	const leasedUntil = now + LEASE_DURATION_MS;

	const result = await env.DB.prepare(
		`INSERT INTO public_context_leases (kind, cache_key, lease_token, leased_until)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(kind, cache_key) DO UPDATE SET
		   lease_token = excluded.lease_token,
		   leased_until = excluded.leased_until
		 WHERE public_context_leases.leased_until < ?`,
	)
		.bind(kind, cacheKey, token, leasedUntil, now)
		.run();

	return (result.meta?.changes ?? 0) > 0 ? token : null;
}

async function releaseLease(
	env: WorkerEnv,
	kind: "sun" | "weather" | "place",
	cacheKey: string,
	token: string,
): Promise<void> {
	await env.DB.prepare(
		"DELETE FROM public_context_leases WHERE kind = ? AND cache_key = ? AND lease_token = ?",
	)
		.bind(kind, cacheKey, token)
		.run();
}

/**
 * Shared coordinator for sun, weather, and place:
 * 1. Read existing valid cache (zero writes if hit).
 * 2. Acquire D1 lease. If unavailable, poll cache for peer completion.
 * 3. Stop external call if lease is never acquired.
 * 4. Re-check cache immediately after acquiring lease.
 * 5. Call fetcher, commit with active token check, and release lease in finally.
 */
async function withCachedLease<T>(
	env: WorkerEnv,
	kind: "sun" | "weather" | "place",
	cacheKey: string,
	fetchAndEvaluate: () => Promise<{ data: T; expiresAt: number | null; shouldCache: boolean }>,
	onLeaseUnavailable: () => Promise<T>,
): Promise<T> {
	const existing = await readValidCache<T>(env, kind, cacheKey);
	if (existing !== null) return existing;

	let leaseToken = await acquireLease(env, kind, cacheKey);

	if (!leaseToken) {
		for (let i = 0; i < LEASE_POLL_COUNT; i++) {
			await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_INTERVAL_MS));
			const peerCached = await readValidCache<T>(env, kind, cacheKey);
			if (peerCached !== null) return peerCached;

			leaseToken = await acquireLease(env, kind, cacheKey);
			if (leaseToken) break;
		}
	}

	if (!leaseToken) {
		return onLeaseUnavailable();
	}

	try {
		// Re-check cache after winning lease (peer might have finished just before lock handoff)
		const rechecked = await readValidCache<T>(env, kind, cacheKey);
		if (rechecked !== null) return rechecked;

		const evaluated = await fetchAndEvaluate();
		if (evaluated.shouldCache) {
			const now = Date.now();
			await env.DB.prepare(
				`INSERT INTO public_context_cache (kind, cache_key, data_json, created_at, expires_at)
				 SELECT ?, ?, ?, ?, ?
				 WHERE EXISTS (
				   SELECT 1 FROM public_context_leases
				   WHERE kind = ? AND cache_key = ? AND lease_token = ? AND leased_until >= ?
				 )
				 ON CONFLICT(kind, cache_key) DO UPDATE SET
				   data_json = excluded.data_json,
				   created_at = excluded.created_at,
				   expires_at = excluded.expires_at`,
			)
				.bind(
					kind,
					cacheKey,
					JSON.stringify(evaluated.data),
					now,
					evaluated.expiresAt,
					kind,
					cacheKey,
					leaseToken,
					now,
				)
				.run();
		}

		return evaluated.data;
	} finally {
		await releaseLease(env, kind, cacheKey, leaseToken).catch(() => {});
	}
}

/**
 * Strict 1 req/s rate limiter for Nominatim:
 * Atoms: next_allowed_at <= now to claim immediately, or bounded wait.
 * Never schedules unbounded future slots. Returns false if capacity exceeded.
 */
async function tryScheduleRateLimitedSlot(
	env: WorkerEnv,
	service: string,
	intervalMs: number,
	maxWaitMs: number,
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime <= maxWaitMs) {
		const now = Date.now();
		const row = await env.DB.prepare(
			"SELECT next_allowed_at FROM public_context_ratelimit WHERE service = ?",
		)
			.bind(service)
			.first<{ next_allowed_at: number }>();

		const nextAllowed = row?.next_allowed_at ?? 0;
		if (nextAllowed <= now) {
			// Slot is open right now, claim it atomically
			const res = await env.DB.prepare(
				`INSERT INTO public_context_ratelimit (service, next_allowed_at)
				 VALUES (?, ?)
				 ON CONFLICT(service) DO UPDATE SET next_allowed_at = excluded.next_allowed_at
				 WHERE public_context_ratelimit.next_allowed_at <= ?`,
			)
				.bind(service, now + intervalMs, now)
				.run();

			if ((res.meta?.changes ?? 0) > 0) return true;
		} else {
			// Slot is busy. Wait up to remaining bounded budget
			const waitNeeded = nextAllowed - now;
			const remainingBudget = maxWaitMs - (Date.now() - startTime);
			if (waitNeeded > remainingBudget) return false;
			await new Promise((resolve) => setTimeout(resolve, Math.min(waitNeeded, 250)));
		}
	}

	return false;
}

export async function getDaySun(env: WorkerEnv, query: DayContextQuery): Promise<DaySun> {
	const cacheKey = buildSunCacheKey(query);

	return withCachedLease<DaySun>(
		env,
		"sun",
		cacheKey,
		async () => {
			const lat = roundCoordinate(query.latitude);
			const lon = roundCoordinate(query.longitude);
			const url = new URL("https://api.sunrise-sunset.org/v2");
			url.search = new URLSearchParams({
				lat: String(lat),
				lng: String(lon),
				date_start: shiftLocalDate(query.start.slice(0, 10), -1),
				date_end: shiftLocalDate(new Date(Date.parse(query.end) - 1).toISOString().slice(0, 10), 1),
				tz: "UTC",
				time_format: "unix",
			}).toString();

			const rawJson = await fetchPublicJson(url);
			const sun = readDaySun(rawJson, query);

			// Permanent caching requires complete valid solar events
			const hasEvents =
				sun.events.some((event) => event.kind === "sunrise") &&
				sun.events.some((event) => event.kind === "sunset");
			const isPolar = sun.status === "midnight_sun" || sun.status === "polar_night";
			const shouldCache = isPolar || (sun.status === "normal" && hasEvents);

			return { data: sun, expiresAt: null, shouldCache };
		},
		async () => {
			throw new ApiError(503, "service_unavailable", "公共数据查询繁忙，请稍后重试。");
		},
	);
}

export async function getDayWeather(
	env: WorkerEnv,
	query: DayContextQuery,
): Promise<DayWeather | null> {
	const today = new Date().toISOString().slice(0, 10);
	const startDate = query.start.slice(0, 10);
	const endDate = query.end.slice(0, 10);
	const lastForecastDate = shiftLocalDate(today, 15);
	if (startDate > lastForecastDate || endDate < "1940-01-01") return null;

	const cacheKey = buildWeatherCacheKey(query);

	return withCachedLease<DayWeather | null>(
		env,
		"weather",
		cacheKey,
		async () => {
			const now = Date.now();
			const historical = endDate < shiftLocalDate(today, -5);
			const lat = roundCoordinate(query.latitude);
			const lon = roundCoordinate(query.longitude);
			const url = new URL(
				historical
					? "https://archive-api.open-meteo.com/v1/archive"
					: "https://api.open-meteo.com/v1/forecast",
			);

			url.search = new URLSearchParams({
				latitude: String(lat),
				longitude: String(lon),
				start_date: startDate < "1940-01-01" ? "1940-01-01" : startDate,
				end_date: endDate > lastForecastDate ? lastForecastDate : endDate,
				hourly: "temperature_2m,weather_code,precipitation,wind_speed_10m",
				timezone: "GMT",
				timeformat: "unixtime",
				temperature_unit: "celsius",
				wind_speed_unit: "kmh",
				precipitation_unit: "mm",
			}).toString();

			const rawJson = await fetchPublicJson(url);
			const weather = readDayWeather(rawJson, query, historical ? "historical" : "forecast");

			let expiresAt: number | null = null;
			if (historical) {
				expiresAt = weather.complete ? null : now + INCOMPLETE_WEATHER_TTL_MS;
			} else {
				expiresAt = now + RECENT_WEATHER_TTL_MS;
			}

			return { data: weather, expiresAt, shouldCache: true };
		},
		async () => {
			throw new ApiError(503, "service_unavailable", "公共天气服务繁忙，请稍后重试。");
		},
	);
}

function extractPlaceName(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const obj = data as { address?: Record<string, unknown>; display_name?: unknown };
	const addr = obj.address;

	const str = (val: unknown): string => (typeof val === "string" ? val.trim() : "");

	if (addr && typeof addr === "object") {
		const city =
			str(addr.city) ||
			str(addr.town) ||
			str(addr.village) ||
			str(addr.municipality) ||
			str(addr.county);
		const district = str(addr.city_district) || str(addr.suburb) || str(addr.district);
		const state = str(addr.state) || str(addr.province);

		if (city && district && city !== district) return `${city} ${district}`;
		if (state && city && state !== city) return `${state} ${city}`;
		if (city) return city;
		if (district) return district;
		if (state) return state;
	}

	const rawDisplay = str(obj.display_name);
	return rawDisplay ? (rawDisplay.split(",")[0]?.trim() ?? null) : null;
}

export async function getPlaceLabel(
	env: WorkerEnv,
	coords: { latitude: number; longitude: number },
): Promise<string | null> {
	if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return null;
	if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return null;

	const lat = roundCoordinate(coords.latitude);
	const lon = roundCoordinate(coords.longitude);
	const cacheKey = buildPlaceCacheKey(lat, lon);

	return withCachedLease<string | null>(
		env,
		"place",
		cacheKey,
		async () => {
			const slotAcquired = await tryScheduleRateLimitedSlot(
				env,
				"nominatim",
				NOMINATIM_INTERVAL_MS,
				NOMINATIM_MAX_WAIT_MS,
			);
			if (!slotAcquired) return { data: null, expiresAt: null, shouldCache: false };

			const url = new URL("https://nominatim.openstreetmap.org/reverse");
			url.search = new URLSearchParams({
				format: "jsonv2",
				lat: String(lat),
				lon: String(lon),
				zoom: "12",
				"accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
			}).toString();

			const rawJson = await fetchPublicJson(url, NOMINATIM_TIMEOUT_MS, {
				"User-Agent": NOMINATIM_USER_AGENT,
			});

			const label = extractPlaceName(rawJson);
			return { data: label, expiresAt: null, shouldCache: Boolean(label) };
		},
		async () => null,
	).catch(() => null);
}

export function validateContextQuery(url: URL): DayContextQuery {
	const date = url.searchParams.get("date")?.trim() ?? "";
	const timeZone = url.searchParams.get("timeZone")?.trim() ?? "";
	const start = url.searchParams.get("start")?.trim() ?? "";
	const end = url.searchParams.get("end")?.trim() ?? "";
	const latStr = url.searchParams.get("latitude")?.trim();
	const lonStr = url.searchParams.get("longitude")?.trim();

	let validatedQuery: ReturnType<typeof validateSummaryQuery>;
	try {
		validatedQuery = validateSummaryQuery({ date, timeZone, start, end });
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "无效的日期或时间范围";
		throw new ApiError(400, "invalid_query", msg);
	}

	if (!latStr || !lonStr) {
		throw new ApiError(400, "invalid_query", "latitude 与 longitude 必须提供");
	}
	const latitude = Number(latStr);
	const longitude = Number(lonStr);
	if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
		throw new ApiError(400, "invalid_query", "latitude 超出有效范围 [-90, 90]");
	}
	if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
		throw new ApiError(400, "invalid_query", "longitude 超出有效范围 [-180, 180]");
	}

	return {
		date: validatedQuery.date,
		timeZone: validatedQuery.timeZone,
		start: validatedQuery.start,
		end: validatedQuery.end,
		latitude,
		longitude,
	};
}

export async function handleContextRequest(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<Response> {
	if (request.method !== "GET") {
		throw new ApiError(405, "method_not_allowed", "Method Not Allowed");
	}

	const pathname = url.pathname;
	if (pathname === "/api/context/sun") {
		const query = validateContextQuery(url);
		const sun = await getDaySun(env, query);
		return jsonResponse({ data: sun });
	}

	if (pathname === "/api/context/weather") {
		const query = validateContextQuery(url);
		const weather = await getDayWeather(env, query);
		return jsonResponse({ data: weather });
	}

	throw new ApiError(404, "not_found", "Not Found");
}
