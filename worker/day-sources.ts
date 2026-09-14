import { z } from "zod";
import { type DaySummaryQuery, validateSummaryQuery } from "../src/models/ai.js";
import {
	DAY_SOURCE_NAMES,
	DAY_SOURCE_PROVIDERS,
	type DaySourceProvider,
	type DaySourceSettings,
	type DaySourceStatus,
	type DaySourcesResult,
	dateInTimeZone,
	fireflyDayEvents,
	fireflyPageSchema,
	type GeckoSnapshot,
	geckoHourEvents,
	geckoSnapshotSchema,
} from "../src/models/day-sources.js";
import { shiftLocalDate } from "../src/models/time.js";
import type { LifeEvent } from "../src/models/types.js";
import { decryptApiKey, encryptApiKey } from "./ai.js";
import { withD1Retry } from "./database.js";
import { fetchGitHubAccount, readGitHubDay } from "./github.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody } from "./utils.js";

const GECKO_ENDPOINT = "https://gecko.hexly.ai/api/v1/snapshot";
const FIREFLY_ENDPOINT = "https://lizheng.blog/api/posts";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const FIREFLY_PAGE_SIZE = 20;

export interface SettingsRow {
	provider: DaySourceProvider;
	enabled: number;
	encrypted_api_key: string | null;
	updated_at: number;
	account_id: number | null;
	account_login: string | null;
}
interface CacheRow {
	data_json: string;
	fetched_at: number;
}

export async function readDaySourceSettings(env: WorkerEnv): Promise<SettingsRow[]> {
	return (
		await withD1Retry(() =>
			env.DB.prepare(
				"SELECT provider, enabled, encrypted_api_key, updated_at, account_id, account_login FROM day_source_settings ORDER BY provider",
			).all<SettingsRow>(),
		)
	).results;
}

function publicSettings(rows: SettingsRow[]): DaySourceSettings[] {
	return DAY_SOURCE_PROVIDERS.map((provider) => {
		const row = rows.find((item) => item.provider === provider);
		return {
			provider,
			enabled: row?.enabled === 1,
			hasApiKey: Boolean(row?.encrypted_api_key),
			...(provider === "github" && row?.account_id && row.account_login
				? { account: { id: row.account_id, login: row.account_login } }
				: {}),
		};
	});
}

async function fetchJson(
	url: URL,
	provider: DaySourceProvider,
	signal: AbortSignal,
	apiKey?: string,
): Promise<unknown> {
	const name = DAY_SOURCE_NAMES[provider];
	let response: Response;
	try {
		response = await fetch(url.toString(), {
			signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
			redirect: "manual",
			headers: {
				Accept: "application/json",
				...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
			},
		});
	} catch {
		throw new ApiError(502, "source_unavailable", `${name} 暂时无法连接，请稍后重试。`);
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new ApiError(
			502,
			"source_unavailable",
			response.status === 401 || response.status === 403
				? `${name} 拒绝访问，请检查${provider === "gecko" ? " API Key 或服务访问限制" : "服务状态"}。`
				: `${name} 暂时不可用（${response.status}），请稍后重试。`,
		);
	}
	try {
		return await readJsonBody(response, MAX_BODY_BYTES);
	} catch {
		throw new ApiError(502, "source_invalid_response", `${name} 返回的数据格式无效或内容过大。`);
	}
}

export async function fetchGeckoDay(
	query: DaySummaryQuery,
	apiKey: string,
	signal: AbortSignal,
): Promise<LifeEvent[]> {
	const snapshots = new Map<string, GeckoSnapshot>();
	const get = async (date: string) => {
		const url = new URL(GECKO_ENDPOINT);
		url.searchParams.set("date", date);
		const parsed = geckoSnapshotSchema.safeParse(await fetchJson(url, "gecko", signal, apiKey));
		if (!parsed.success || parsed.data.date !== date)
			throw new ApiError(502, "source_invalid_response", "Gecko 返回的日期或数据格式无效。");
		snapshots.set(date, parsed.data);
		return parsed.data;
	};
	// A past probe discovers the account timezone without requesting a future date.
	const probe =
		query.date > shiftLocalDate(dateInTimeZone(Date.now(), "UTC"), -1)
			? shiftLocalDate(dateInTimeZone(Date.now(), "UTC"), -1)
			: query.date;
	const first = await get(probe);
	const from = dateInTimeZone(Date.parse(query.start), first.timezone);
	const to = dateInTimeZone(Date.parse(query.end) - 1, first.timezone);
	const today = dateInTimeZone(Date.now(), first.timezone);
	for (let date = from; date <= to && date <= today; date = shiftLocalDate(date, 1)) {
		if (!snapshots.has(date)) await get(date);
	}
	return geckoHourEvents([...snapshots.values()], query);
}

/** Firefly currently ignores date filters. Locate the published-time range in its sorted public pages. */
export async function fetchFireflyDay(
	query: DaySummaryQuery,
	signal: AbortSignal,
): Promise<LifeEvent[]> {
	const pages = new Map<number, z.infer<typeof fireflyPageSchema>>();
	const get = async (page: number) => {
		const cached = pages.get(page);
		if (cached) return cached;
		if (pages.size >= 20)
			throw new ApiError(502, "source_incomplete", "Firefly 当日文章过多，请稍后重试。");
		const url = new URL(FIREFLY_ENDPOINT);
		url.searchParams.set("page", String(page));
		url.searchParams.set("page_size", String(FIREFLY_PAGE_SIZE));
		const parsed = fireflyPageSchema.safeParse(await fetchJson(url, "firefly", signal));
		if (!parsed.success)
			throw new ApiError(502, "source_invalid_response", "Firefly 返回的文章格式无效。");
		const data = parsed.data;
		if (
			data.posts.length !==
			Math.min(FIREFLY_PAGE_SIZE, Math.max(0, data.total - (page - 1) * FIREFLY_PAGE_SIZE))
		)
			throw new ApiError(502, "source_incomplete", "Firefly 文章分页不完整，请重试。");
		if (pages.size && data.total !== pages.get(1)?.total)
			throw new ApiError(502, "source_incomplete", "Firefly 文章列表正在更新，请重试。");
		const times = data.posts.map((post) => post.published_at ?? -Infinity);
		if (times.some((time, index) => index > 0 && time > (times[index - 1] ?? Infinity)))
			throw new ApiError(502, "source_invalid_response", "Firefly 文章顺序异常，请重试。");
		pages.set(page, data);
		return data;
	};
	const first = await get(1);
	if (!first.total) return [];
	const start = Date.parse(query.start) / 1000,
		end = Date.parse(query.end) / 1000;
	const lastPage = Math.ceil(first.total / FIREFLY_PAGE_SIZE);
	let low = 1,
		high = (first.posts.at(-1)?.published_at ?? -Infinity) < end ? 1 : lastPage + 1;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		const page = await get(mid);
		if ((page.posts.at(-1)?.published_at ?? -Infinity) >= end) low = mid + 1;
		else high = mid;
	}
	const posts: z.infer<typeof fireflyPageSchema>["posts"] = [];
	for (let page = low; page <= lastPage; page++) {
		const result = await get(page);
		const lastTime = posts.at(-1)?.published_at;
		if (
			lastTime !== undefined &&
			lastTime !== null &&
			(result.posts[0]?.published_at ?? -Infinity) > lastTime
		)
			throw new ApiError(502, "source_incomplete", "Firefly 文章列表正在更新，请重试。");
		posts.push(...result.posts);
		if (!result.posts.length || (result.posts.at(-1)?.published_at ?? -Infinity) < start) break;
	}
	return fireflyDayEvents(posts, query);
}

async function readProvider(
	env: WorkerEnv,
	row: SettingsRow,
	query: DaySummaryQuery,
	mode: "default" | "cached-only" | "refresh",
	signal: AbortSignal,
) {
	const provider = row.provider;
	const bindings = [provider, query.date, query.timeZone, query.start, query.end, row.updated_at];
	let cachedEvents: LifeEvent[] = [];
	let hasCache = false;
	try {
		if (provider === "github")
			return await readGitHubDay(env, row, query, mode === "cached-only", signal);
		const cached = await withD1Retry(() =>
			env.DB.prepare(
				"SELECT data_json, fetched_at FROM day_source_cache WHERE provider = ? AND date = ? AND timezone = ? AND start_at = ? AND end_at = ? AND source_version = ?",
			)
				.bind(...bindings)
				.first<CacheRow>(),
		);
		const ttl = Date.parse(query.end) < Date.now() - 3 * 86400000 ? 3600000 : 120000;
		const fresh = Boolean(cached && Date.now() - cached.fetched_at < ttl);
		if (cached) {
			cachedEvents = JSON.parse(cached.data_json) as LifeEvent[];
			hasCache = true;
		}
		if (mode === "cached-only" || (mode !== "refresh" && fresh))
			return {
				events: cachedEvents,
				status: {
					provider,
					state: cached ? "ready" : "pending",
					stale: !fresh,
				} satisfies DaySourceStatus,
			};
		let apiKey = "";
		if (provider === "gecko") {
			if (!row.encrypted_api_key || !env.AI_SETTINGS_KEY)
				throw new ApiError(
					503,
					"source_key_unavailable",
					"Gecko 密钥不可用，请在数据源设置中重新保存。",
				);
			try {
				apiKey = await decryptApiKey(row.encrypted_api_key, env.AI_SETTINGS_KEY);
			} catch {
				throw new ApiError(
					503,
					"source_key_unavailable",
					"Gecko 密钥不可用，请在数据源设置中重新保存。",
				);
			}
		}
		const events =
			provider === "gecko"
				? await fetchGeckoDay(query, apiKey, signal)
				: await fetchFireflyDay(query, signal);
		const fetchedAt = Date.now();
		await withD1Retry(() =>
			env.DB.prepare(`INSERT INTO day_source_cache (provider, date, timezone, start_at, end_at, source_version, data_json, fetched_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM day_source_settings WHERE provider = ? AND enabled = 1 AND updated_at = ?)
			ON CONFLICT(provider, date, timezone, start_at, end_at) DO UPDATE SET source_version = excluded.source_version, data_json = excluded.data_json, fetched_at = excluded.fetched_at
			WHERE excluded.source_version > day_source_cache.source_version OR (excluded.source_version = day_source_cache.source_version AND excluded.fetched_at >= day_source_cache.fetched_at)`)
				.bind(...bindings, JSON.stringify(events), fetchedAt, provider, row.updated_at)
				.run(),
		);
		return { events, status: { provider, state: "ready", stale: false } satisfies DaySourceStatus };
	} catch (error) {
		return {
			events: cachedEvents,
			status: {
				provider,
				state: "error",
				stale: hasCache,
				message:
					error instanceof ApiError
						? error.message
						: `${DAY_SOURCE_NAMES[provider]} 暂时无法读取，请稍后重试。`,
			} satisfies DaySourceStatus,
		};
	}
}

export async function readDaySources(
	env: WorkerEnv,
	query: DaySummaryQuery,
	mode: "default" | "cached-only" | "refresh" = "default",
	signal = AbortSignal.timeout(45000),
): Promise<DaySourcesResult> {
	const rows = (await readDaySourceSettings(env)).filter((row) => row.enabled === 1);
	const results = await Promise.all(rows.map((row) => readProvider(env, row, query, mode, signal)));
	return {
		events: results
			.flatMap((result) => result.events)
			.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)),
		sources: results.map((result) => result.status),
		configuration: JSON.stringify(
			rows.map((row) => (row.provider === "github" ? `github:${row.account_id}` : row.provider)),
		),
	};
}

export async function handleGetDaySources(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<Response> {
	let query: DaySummaryQuery;
	try {
		query = validateSummaryQuery(Object.fromEntries(url.searchParams));
	} catch {
		throw new ApiError(400, "invalid_query", "请选择有效日期与时区。");
	}
	return jsonResponse({
		data: await readDaySources(
			env,
			query,
			"default",
			AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
		),
	});
}

const inputSchema = z
	.object({
		enabled: z.boolean(),
		apiKey: z
			.string()
			.trim()
			.max(4096)
			.regex(/^[^\p{Cc}]*$/u)
			.optional(),
	})
	.strict();
export async function handleDaySourceSettings(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<Response> {
	const suffix = url.pathname.slice("/api/settings/sources".length);
	if (!suffix) {
		if (request.method !== "GET")
			throw new ApiError(405, "method_not_allowed", "Method not allowed");
		return jsonResponse({ data: publicSettings(await readDaySourceSettings(env)) });
	}
	const provider = DAY_SOURCE_PROVIDERS.find(
		(value) => suffix === `/${value}` || suffix === `/${value}/test`,
	);
	if (!provider) throw new ApiError(404, "not_found", "数据源不存在。");
	if (suffix.endsWith("/test")) {
		if (request.method !== "POST")
			throw new ApiError(405, "method_not_allowed", "Method not allowed");
		const body = await readJsonBody<unknown>(request, 8192);
		let query: DaySummaryQuery;
		try {
			query = validateSummaryQuery(body);
		} catch {
			throw new ApiError(400, "invalid_query", "请选择有效日期与时区。");
		}
		const row = (await readDaySourceSettings(env)).find(
			(value) => value.provider === provider && value.enabled === 1,
		);
		if (!row) throw new ApiError(400, "source_disabled", "请先添加并启用数据源。");
		const result = await readProvider(
			env,
			row,
			query,
			"refresh",
			AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
		);
		return jsonResponse({
			data: {
				provider,
				success: result.status.state === "ready",
				eventCount: result.events.length,
				date: query.date,
				message: result.status.message,
			},
		});
	}
	if (request.method === "DELETE") {
		await env.DB.batch([
			env.DB.prepare("DELETE FROM day_source_settings WHERE provider = ?").bind(provider),
			env.DB.prepare("DELETE FROM day_source_cache WHERE provider = ?").bind(provider),
		]);
		return jsonResponse({ data: publicSettings(await readDaySourceSettings(env)) });
	}
	if (request.method !== "PUT") throw new ApiError(405, "method_not_allowed", "Method not allowed");
	const parsed = inputSchema.safeParse(await readJsonBody<unknown>(request, 8192));
	if (!parsed.success) throw new ApiError(400, "invalid_settings", "数据源配置无效。");
	const { enabled, apiKey } = parsed.data;
	if (provider === "firefly" && apiKey)
		throw new ApiError(400, "invalid_settings", "Firefly 是公开数据源，无须密钥。");
	const previous = (await readDaySourceSettings(env)).find((row) => row.provider === provider);
	let encrypted = previous?.encrypted_api_key ?? null;
	let accountId = previous?.account_id ?? null;
	let accountLogin = previous?.account_login ?? null;
	if (provider === "gecko" && apiKey) {
		if (!/^gk_[a-f\d]{64}$/i.test(apiKey))
			throw new ApiError(400, "invalid_settings", "请填写有效的 Gecko API Key。");
		if (!env.AI_SETTINGS_KEY)
			throw new ApiError(503, "source_key_unavailable", "密钥存储暂不可用，请稍后重试。");
		encrypted = await encryptApiKey(apiKey, env.AI_SETTINGS_KEY);
	}
	if (provider === "gecko" && enabled && !encrypted)
		throw new ApiError(400, "invalid_settings", "请先填写 Gecko API Key。");
	if (provider === "github" && apiKey) {
		if (!env.AI_SETTINGS_KEY)
			throw new ApiError(503, "source_key_unavailable", "密钥存储暂不可用，请稍后重试。");
		const account = await fetchGitHubAccount(apiKey, request.signal);
		encrypted = await encryptApiKey(apiKey, env.AI_SETTINGS_KEY);
		accountId = account.id;
		accountLogin = account.login;
	}
	if (provider === "github" && enabled && (!encrypted || !accountId || !accountLogin))
		throw new ApiError(400, "invalid_settings", "请先填写 GitHub PAT。");
	await env.DB.batch([
		env.DB.prepare(`INSERT INTO day_source_settings (provider, enabled, encrypted_api_key, updated_at, account_id, account_login) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled, encrypted_api_key = excluded.encrypted_api_key, account_id = excluded.account_id, account_login = excluded.account_login, updated_at = MAX(excluded.updated_at, day_source_settings.updated_at + 1)`).bind(
			provider,
			enabled ? 1 : 0,
			encrypted,
			Date.now(),
			accountId,
			accountLogin,
		),
		env.DB.prepare("DELETE FROM day_source_cache WHERE provider = ?").bind(provider),
	]);
	return jsonResponse({ data: publicSettings(await readDaySourceSettings(env)) });
}
