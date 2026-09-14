import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateFootprintDay } from "../../../../src/models/footprint";
import type { SleepNight } from "../../../../src/models/health-insights";
import { createFootprintClient } from "../../../../src/services/footprint-client";
import { fetchSleepLocations } from "../../../../src/services/health-location";
import { jsonResponse } from "../helpers";

const start = "2026-09-12T16:00:00.000Z";
const originalZone = process.env.TZ;
const fetchMock = vi.fn<typeof fetch>();

function night(id: string, longitude: number | null): SleepNight {
	return {
		id,
		fellAsleepAt: "2026-09-12T22:00:00.000Z",
		wokeAt: "2026-09-13T06:00:00.000Z",
		inBedMinutes: null,
		asleepMinutes: 480,
		awakeMinutes: null,
		stages: [],
		timeline: [],
		sources: [],
		evidence: [],
		place:
			longitude === null
				? null
				: {
						latitude: 0,
						longitude,
						sampleCount: 2,
						firstAt: "2026-09-12T22:00:00.000Z",
						lastAt: "2026-09-13T06:00:00.000Z",
						radiusMeters: 20,
						summary: "附近有两次位置记录",
					},
	};
}

beforeEach(() => {
	process.env.TZ = "UTC";
	fetchMock.mockReset().mockRejectedValue(new Error("unexpected HTTP request"));
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

describe("fetchSleepLocations", () => {
	it("does not load a month of GPS without any current sleep-location evidence", async () => {
		expect(await fetchSleepLocations([], start)).toEqual({});
		expect(await fetchSleepLocations([night("unlocated", null)], start)).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("makes one UTC-window query for all located nights and matches the returned historical evidence independently", async () => {
		const historical = await validateFootprintDay({
			utcDay: Date.parse("2026-09-10T00:00:00.000Z"),
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points: [
					[0, 0, 0, null, null, null],
					[7200, 0, 0, null, null, null],
				],
			},
		});
		fetchMock.mockResolvedValue(
			jsonResponse(200, { data: { days: [{ ...historical, updatedAt: 0 }] } }),
		);
		const nights = [night("nearby", 0), night("unlocated", null), night("distant", 100)];
		const snapshot = structuredClone(nights);
		const controller = new AbortController();
		const result = await fetchSleepLocations(nights, start, controller.signal);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const parsed = new URL(url, "http://localhost");
		expect(parsed.pathname).toBe("/api/data/footprint/days");
		expect(parsed.searchParams.get("start")).toBe("2026-08-13T16:00:00.000Z");
		expect(parsed.searchParams.get("end")).toBe(start);
		expect(init.method).toBe("GET");
		expect(init.signal?.aborted).toBe(false);
		expect(Object.keys(result)).toEqual(["nearby", "distant"]);
		expect(result.nearby).toMatchObject({ kind: "unknown", matchedNights: 1, observedNights: 1 });
		expect(result.distant).toMatchObject({ kind: "unknown", matchedNights: 0, observedNights: 1 });
		expect(nights).toEqual(snapshot);
	});

	it("passes a data-read failure to the caller so the timeline can retain its recorded sleep card", async () => {
		fetchMock.mockRejectedValue(new Error("GPS history offline"));
		await expect(fetchSleepLocations([night("located", 0)], start)).rejects.toMatchObject({
			status: 0,
			code: "network",
		});
	});

	it("checks cancellation even if a supplied client completes after its request was aborted", async () => {
		const controller = new AbortController();
		const client = createFootprintClient();
		const days = vi.spyOn(client, "days").mockImplementation(async () => {
			controller.abort();
			return { days: [] };
		});
		await expect(
			fetchSleepLocations([night("located", 0)], start, controller.signal, client),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(days).toHaveBeenCalledWith("2026-08-13T16:00:00.000Z", start, controller.signal);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
