import { describe, expect, it, vi } from "vitest";
import { clearCache, fetchCacheOverview } from "../../../../src/services/cache-service";
import { jsonResponse, stubFetch } from "../helpers";

describe("cache HTTP boundary", () => {
	it("carries explicit day/all scope, cancellation and same-origin credentials, and never requests upstream data", async () => {
		const fetch = vi.fn(async () => jsonResponse(200, { data: {} }));
		stubFetch(fetch);
		const signal = new AbortController().signal;
		await fetchCacheOverview({ scope: "day", date: "2026-09-10" }, signal);
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/cache?scope=day&date=2026-09-10",
			expect.objectContaining({
				method: "GET",
				signal,
				credentials: "same-origin",
				cache: "no-store",
			}),
		);
		await clearCache("github", { scope: "day", date: "2026-09-10" });
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/cache/github?scope=day&date=2026-09-10",
			expect.objectContaining({ method: "DELETE" }),
		);
		await clearCache("place", { scope: "all" });
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/cache/place?scope=all",
			expect.objectContaining({ method: "DELETE" }),
		);
	});
});
