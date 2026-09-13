import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllEvents, fetchEventPage } from "../../../../src/services/events-service";
import { eventFixture, jsonResponse, stubFetch } from "../helpers";

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
