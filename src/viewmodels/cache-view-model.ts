import { createStore } from "zustand/vanilla";
import { CACHE_NAMES, type CacheKind, type CacheOverview, type CacheQuery } from "../models/cache";
import { clearCache, fetchCacheOverview } from "../services/cache-service";
import { isAbortError } from "../services/http";
import { type LoadStatus, toErrorMessage } from "./errors";
import { formatAbsoluteTime } from "./format";

interface CacheState {
	query: CacheQuery | null;
	overview: CacheOverview | null;
	status: LoadStatus;
	clearing: CacheKind | null;
	error: string | null;
	message: string | null;
	load: (query: CacheQuery) => Promise<void>;
	clear: (kind: CacheKind) => Promise<void>;
	reset: () => void;
}

let controller: AbortController | null = null;
let generation = 0;
const initial = () => ({
	query: null,
	overview: null,
	status: "idle" as LoadStatus,
	clearing: null,
	error: null,
	message: null,
});

export function cacheUpdatedLabel(timestamp: number | null): string {
	return timestamp === null
		? "尚无缓存"
		: `最近缓存 ${formatAbsoluteTime(new Date(timestamp).toISOString())}`;
}

export const cacheStore = createStore<CacheState>((set, get) => ({
	...initial(),
	async load(query) {
		if (get().clearing) return;
		controller?.abort();
		controller = new AbortController();
		const current = ++generation;
		set({ query, overview: null, status: "loading", error: null, message: null });
		try {
			const overview = await fetchCacheOverview(query, controller.signal);
			if (current === generation) set({ overview, status: "ready" });
		} catch (error) {
			if (current === generation && !isAbortError(error))
				set({ status: "error", error: toErrorMessage(error) });
		}
	},
	async clear(kind) {
		const { query, status, clearing } = get();
		if (!query || status !== "ready" || clearing) return;
		const current = generation;
		set({ clearing: kind, error: null, message: null });
		try {
			const result = await clearCache(kind, query);
			if (current === generation)
				set({
					overview: result.overview,
					message: `已清除 ${result.cleared} 条${CACHE_NAMES[kind]}缓存。`,
				});
		} catch (error) {
			if (current === generation) set({ error: toErrorMessage(error) });
		} finally {
			if (current === generation) set({ clearing: null });
		}
	},
	reset() {
		controller?.abort();
		controller = null;
		generation++;
		set(initial());
	},
}));
