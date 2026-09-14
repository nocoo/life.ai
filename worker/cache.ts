import {
	CACHE_KINDS,
	type CacheEntry,
	type CacheKind,
	type CacheOverview,
	type CacheQuery,
	cacheQuerySchema,
} from "../src/models/cache.js";
import { withD1Retry } from "./database.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse } from "./utils.js";

/** All identifiers come from this fixed allowlist; only values are bound from the request. */
function cacheSelection(kind: CacheKind, query: CacheQuery) {
	const bindings: string[] = [];
	let table: string;
	let timestamp: string;
	let where: string;
	if (kind === "github") {
		table = "github_day_cache";
		timestamp = "fetched_at";
		// In-flight first reads are coordination rows, not completed snapshots to erase.
		where = "data_json IS NOT NULL";
	} else if (kind === "gecko" || kind === "firefly") {
		table = "day_source_cache";
		timestamp = "fetched_at";
		where = "provider = ?";
		bindings.push(kind);
	} else {
		table = "public_context_cache";
		timestamp = "created_at";
		where = "kind = ?";
		bindings.push(kind);
	}
	if (query.scope === "day" && kind !== "place") {
		if (table === "public_context_cache") {
			// Sun/weather keys start with YYYY-MM-DD:, bounded so the primary-key index is usable.
			where += " AND cache_key >= ? AND cache_key < ?";
			bindings.push(`${query.date}:`, `${query.date};`);
		} else {
			where += " AND date = ?";
			bindings.push(query.date);
		}
	}
	return { table, timestamp, where, bindings };
}

async function readCacheOverview(env: WorkerEnv, query: CacheQuery): Promise<CacheOverview> {
	const results = await withD1Retry(() =>
		env.DB.batch<Omit<CacheEntry, "kind">>(
			CACHE_KINDS.map((kind) => {
				const { table, timestamp, where, bindings } = cacheSelection(kind, query);
				return env.DB.prepare(
					`SELECT COUNT(*) AS count, MAX(${timestamp}) AS updatedAt FROM ${table} WHERE ${where}`,
				).bind(...bindings);
			}),
		),
	);
	return {
		query,
		entries: results.map((result, index) => ({
			kind: CACHE_KINDS[index] as CacheKind,
			...(result.results[0] as Omit<CacheEntry, "kind">),
		})),
	};
}

export async function handleCacheRequest(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<Response> {
	const suffix = url.pathname.slice("/api/cache".length);
	const kind = CACHE_KINDS.find((value) => suffix === `/${value}`);
	if (suffix && !kind) throw new ApiError(404, "not_found", "缓存类型不存在。");
	if (request.method !== (kind ? "DELETE" : "GET"))
		throw new ApiError(405, "method_not_allowed", "Method not allowed");
	const parsed = cacheQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) throw new ApiError(400, "invalid_query", "请选择缓存日期或所有日期。");
	const query = parsed.data;
	if (!kind) return jsonResponse({ data: await readCacheOverview(env, query) });
	const { table, where, bindings } = cacheSelection(kind, query);
	const result = await env.DB.prepare(`DELETE FROM ${table} WHERE ${where}`)
		.bind(...bindings)
		.run();
	return jsonResponse({
		data: { cleared: result.meta.changes, overview: await readCacheOverview(env, query) },
	});
}
