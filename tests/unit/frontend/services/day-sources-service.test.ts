import { describe, expect, it, vi } from "vitest";
import {
	fetchDaySourceSettings,
	fetchDaySources,
	removeDaySource,
	saveDaySourceSettings,
	testDaySource,
} from "../../../../src/services/day-sources-service";
import { jsonResponse, stubFetch } from "../helpers";

describe("day source HTTP boundary", () => {
	it("uses only the private local API and preserves query, methods and cancellation", async () => {
		const response = { saved: true };
		const fetch = vi.fn(async () => jsonResponse(200, { data: response }));
		stubFetch(fetch);
		const signal = new AbortController().signal;
		const query = {
			date: "2026-09-10",
			timeZone: "Asia/Shanghai",
			start: "2026-09-09T16:00:00.000Z",
			end: "2026-09-10T16:00:00.000Z",
		};
		await expect(fetchDaySourceSettings(signal)).resolves.toEqual(response);
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/settings/sources",
			expect.objectContaining({ signal }),
		);
		await saveDaySourceSettings("gecko", { enabled: true, apiKey: "fixture-key" });
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/settings/sources/gecko",
			expect.objectContaining({
				method: "PUT",
				body: JSON.stringify({ enabled: true, apiKey: "fixture-key" }),
			}),
		);
		await removeDaySource("firefly");
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/settings/sources/firefly",
			expect.objectContaining({ method: "DELETE" }),
		);
		await testDaySource("gecko", query);
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/settings/sources/gecko/test",
			expect.objectContaining({ method: "POST", body: JSON.stringify(query) }),
		);
		await fetchDaySources(query, signal);
		expect(fetch).toHaveBeenLastCalledWith(
			`/api/day-sources?${new URLSearchParams(query)}`,
			expect.objectContaining({ signal }),
		);
	});
});
