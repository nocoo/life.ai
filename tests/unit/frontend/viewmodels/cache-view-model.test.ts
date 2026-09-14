import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheClearResult, CacheOverview } from "../../../../src/models/cache";

vi.mock("../../../../src/services/cache-service", () => ({
	clearCache: vi.fn(),
	fetchCacheOverview: vi.fn(),
}));

import { clearCache, fetchCacheOverview } from "../../../../src/services/cache-service";
import {
	cacheUpdatedLabel,
	cacheStore as store,
} from "../../../../src/viewmodels/cache-view-model";

const overview: CacheOverview = {
	query: { scope: "day", date: "2026-09-10" },
	entries: [{ kind: "github", count: 1, updatedAt: 1234 }],
};
const empty: CacheOverview = {
	...overview,
	entries: [{ kind: "github", count: 0, updatedAt: null }],
};
beforeEach(() => {
	store.getState().reset();
	vi.mocked(fetchCacheOverview).mockReset().mockResolvedValue(overview);
	vi.mocked(clearCache).mockReset().mockResolvedValue({ cleared: 1, overview: empty });
});
afterEach(() => store.getState().reset());

describe("cache panel state", () => {
	it("loads only metadata, clears the requested scope, and does not silently refetch the day's sources", async () => {
		await store.getState().clear("github");
		expect(clearCache).not.toHaveBeenCalled();
		await store.getState().load(overview.query);
		expect(store.getState()).toMatchObject({ status: "ready", overview });
		await store.getState().clear("github");
		expect(clearCache).toHaveBeenCalledExactlyOnceWith("github", overview.query);
		expect(fetchCacheOverview).toHaveBeenCalledTimes(1);
		expect(store.getState()).toMatchObject({
			overview: empty,
			clearing: null,
			message: "已清除 1 条GitHub缓存。",
		});
		expect(cacheUpdatedLabel(null)).toBe("尚无缓存");
		expect(cacheUpdatedLabel(1234)).toMatch(/^最近缓存 /);
	});
	it("aborts superseded reads and ignores old success, failure and close completion", async () => {
		let resolve!: (value: CacheOverview) => void;
		vi.mocked(fetchCacheOverview).mockReturnValueOnce(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const first = store.getState().load(overview.query);
		await store.getState().clear("github");
		expect(clearCache).not.toHaveBeenCalled();
		const signal = vi.mocked(fetchCacheOverview).mock.calls[0]?.[1];
		await store.getState().load({ scope: "all" });
		expect(signal?.aborted).toBe(true);
		resolve(empty);
		await first;
		expect(store.getState().overview).toEqual(overview);
		let reject!: (error: Error) => void;
		vi.mocked(fetchCacheOverview).mockReturnValueOnce(
			new Promise((_, fail) => {
				reject = fail;
			}),
		);
		const old = store.getState().load(overview.query);
		store.getState().reset();
		reject(new Error("stale failure"));
		await old;
		expect(store.getState()).toMatchObject({ status: "idle", overview: null, error: null });
	});
	it("keeps prior counts on clear failure, allows retry, and reports load failures without treating cancellation as failure", async () => {
		vi.mocked(fetchCacheOverview).mockRejectedValueOnce(new Error("unavailable"));
		await store.getState().load(overview.query);
		expect(store.getState()).toMatchObject({ status: "error", error: "unavailable" });
		vi.mocked(fetchCacheOverview).mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
		await store.getState().load(overview.query);
		expect(store.getState().error).toBeNull();
		await store.getState().load(overview.query);
		vi.mocked(clearCache).mockRejectedValueOnce(new Error("clear failed"));
		await store.getState().clear("github");
		expect(store.getState()).toMatchObject({ overview, error: "clear failed", clearing: null });
		await store.getState().clear("github");
		expect(store.getState()).toMatchObject({ overview: empty, error: null });
	});
	it.each([false, true])(
		"serializes mutations and ignores a closed panel's clear completion (failure=%s)",
		async (fail) => {
			await store.getState().load(overview.query);
			let resolve!: (value: CacheClearResult) => void;
			let reject!: (error: Error) => void;
			vi.mocked(clearCache).mockReturnValueOnce(
				new Promise((done, rejected) => {
					resolve = done;
					reject = rejected;
				}),
			);
			const pending = store.getState().clear("github");
			await store.getState().clear("github");
			await store.getState().load({ scope: "all" });
			expect(clearCache).toHaveBeenCalledTimes(1);
			expect(fetchCacheOverview).toHaveBeenCalledTimes(1);
			store.getState().reset();
			if (fail) reject(new Error("old failure"));
			else resolve({ cleared: 1, overview: empty });
			await pending;
			expect(store.getState()).toMatchObject({
				overview: null,
				message: null,
				error: null,
				clearing: null,
			});
		},
	);
});
