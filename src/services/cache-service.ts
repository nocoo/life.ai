import type { CacheClearResult, CacheKind, CacheOverview, CacheQuery } from "../models/cache";
import { apiGet, apiRequest } from "./http";

export function fetchCacheOverview(
	query: CacheQuery,
	signal?: AbortSignal,
): Promise<CacheOverview> {
	return apiGet("/api/cache", { ...query }, signal);
}

export function clearCache(kind: CacheKind, query: CacheQuery): Promise<CacheClearResult> {
	return apiRequest(`/api/cache/${kind}`, { method: "DELETE" }, { ...query });
}
