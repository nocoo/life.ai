import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDayInsights } from "../../../../src/models/day-insights";
import {
	FOOTPRINT_DAY_MS,
	type FootprintPoint,
	validateFootprintDay,
} from "../../../../src/models/footprint";
import { fetchAllEvents, fetchEventPage } from "../../../../src/services/events-service";
import { eventFixture, jsonResponse, stubFetch } from "../helpers";

async function gpsDay(utcDay: number, points: FootprintPoint[]) {
	return {
		...(await validateFootprintDay({
			utcDay,
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points,
			},
		})),
		updatedAt: utcDay,
	};
}

describe("events service", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("requests a single page with optional source and cursor", async () => {
		const page = { events: [eventFixture()], nextCursor: null };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe(
				"/api/events?start=2026-09-13T00%3A00%3A00.000Z&end=2026-09-14T00%3A00%3A00.000Z&source=src-health&cursor=abc",
			);
			return jsonResponse(200, { data: page });
		});
		stubFetch(fetchMock);
		await expect(
			fetchEventPage({
				start: "2026-09-13T00:00:00.000Z",
				end: "2026-09-14T00:00:00.000Z",
				source: "src-health",
				cursor: "abc",
			}),
		).resolves.toEqual(page);
	});

	it("omits source when fetching all sources", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).not.toContain("source=");
			return jsonResponse(200, { data: { events: [], nextCursor: null } });
		});
		stubFetch(fetchMock);
		await fetchAllEvents({
			start: "2026-09-13T00:00:00.000Z",
			end: "2026-09-14T00:00:00.000Z",
		});
	});

	it("follows cursors until the last page", async () => {
		const first = eventFixture({ id: "1" });
		const second = eventFixture({ id: "2" });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { data: { events: [first], nextCursor: "n1" } }))
			.mockResolvedValueOnce(jsonResponse(200, { data: { events: [second], nextCursor: null } }));
		stubFetch(fetchMock);
		await expect(
			fetchAllEvents({
				start: "2026-09-13T00:00:00.000Z",
				end: "2026-09-14T00:00:00.000Z",
			}),
		).resolves.toEqual([first, second]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("decodes first-page GPS days once, clips the local day, preserves duplicates and merges UTC order", async () => {
		const midnight = Date.parse("2026-09-13T00:00:00Z");
		const footprintDays = [
			await gpsDay(midnight - FOOTPRINT_DAY_MS, [
				[57599, 0, 0, null, null, null],
				[57600, 0, 0, null, null, null],
				[57600, 0, 0, null, null, null],
			]),
			await gpsDay(midnight, [
				[1, 0, 0, null, null, null],
				[57600, 0, 0, null, null, null],
			]),
		];
		const early = eventFixture({ id: "early", occurredAt: "2026-09-12T16:01:00.000Z" });
		const late = eventFixture({ id: "late", occurredAt: "2026-09-13T15:59:00.000Z" });
		stubFetch(
			vi
				.fn()
				.mockResolvedValueOnce(
					jsonResponse(200, { data: { events: [late], footprintDays, nextCursor: "next" } }),
				)
				.mockResolvedValueOnce(
					jsonResponse(200, { data: { events: [early], footprintDays, nextCursor: null } }),
				),
		);
		const events = await fetchAllEvents({
			start: "2026-09-12T16:00:00Z",
			end: "2026-09-13T16:00:00Z",
		});
		expect(events).toHaveLength(5);
		expect(events.map((event) => event.occurredAt)).toEqual([
			"2026-09-12T16:00:00.000Z",
			"2026-09-12T16:00:00.000Z",
			early.occurredAt,
			"2026-09-13T00:00:01.000Z",
			late.occurredAt,
		]);
		expect(new Set(events.map((event) => event.id)).size).toBe(5);
	});

	it("keeps provider filtering and normalizes offsetless clipping boundaries as UTC", async () => {
		const midnight = Date.parse("2026-09-13T00:00:00Z");
		const footprintDays = [await gpsDay(midnight, [[3600, 0, 0, null, null, null]])];
		stubFetch(
			vi.fn(async () =>
				jsonResponse(200, { data: { events: [], footprintDays, nextCursor: null } }),
			),
		);
		const query = { start: "2026-09-13T00:00:00", end: "2026-09-13T02:00:00" };
		expect(await fetchAllEvents({ ...query, source: "journal" })).toEqual([]);
		expect(await fetchAllEvents({ ...query, source: "footprint" })).toHaveLength(1);
	});

	it("preserves canonical track order when more than ten points share the same timestamp", async () => {
		const midnight = Date.parse("2026-09-13T00:00:00Z");
		const points: FootprintPoint[] = [
			[0, 0, 0, null, null, null],
			...Array.from(
				{ length: 12 },
				(_, index): FootprintPoint => [60, 0, index / 100_000, null, null, null],
			),
			[120, 0, 12 / 100_000, null, null, null],
		];
		stubFetch(
			vi.fn(async () =>
				jsonResponse(200, {
					data: { events: [], footprintDays: [await gpsDay(midnight, points)], nextCursor: null },
				}),
			),
		);
		const window = { start: "2026-09-13T00:00:00Z", end: "2026-09-14T00:00:00Z" };
		const events = await fetchAllEvents(window);
		const longitudes = points.map((point) => point[2]);
		expect(events.map((event) => (event.data as { longitude: number }).longitude)).toEqual(
			longitudes,
		);
		expect(
			buildDayInsights(events, window)
				.gps.segments.flat()
				.map((point) => point.longitude),
		).toEqual(longitudes);
	});

	it("stops on a repeated cursor", async () => {
		stubFetch(
			vi.fn(async () =>
				jsonResponse(200, { data: { events: [eventFixture()], nextCursor: "loop" } }),
			),
		);
		await expect(
			fetchAllEvents({
				start: "2026-09-13T00:00:00.000Z",
				end: "2026-09-14T00:00:00.000Z",
			}),
		).rejects.toMatchObject({ code: "cursor_loop" });
	});

	it("stops when the page budget is exceeded", async () => {
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				const cursor = new URL(url, "https://life.hexly.ai").searchParams.get("cursor") ?? "start";
				return jsonResponse(200, {
					data: { events: [], nextCursor: `${cursor}-next` },
				});
			}),
		);
		await expect(
			fetchAllEvents({
				start: "2026-09-13T00:00:00.000Z",
				end: "2026-09-14T00:00:00.000Z",
				maxPages: 2,
			}),
		).rejects.toMatchObject({ code: "too_many_pages" });
	});
});
