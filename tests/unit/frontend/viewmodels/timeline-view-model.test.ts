import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SleepLocation } from "../../../../src/models/health-location";
import type { DayTimeline, LifeEvent } from "../../../../src/models/types";
import { abortError, eventFixture, sourceFixture } from "../helpers";

const time = vi.hoisted(() => ({
	localDateKey: vi.fn(() => "2026-09-13"),
}));

vi.mock("../../../../src/models/time", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../../src/models/time")>()),
	...time,
}));
vi.mock("../../../../src/services/events-service", () => ({
	fetchAllEvents: vi.fn(),
}));
vi.mock("../../../../src/services/health-evidence", () => ({
	fetchHealthEvents: vi.fn(),
}));
vi.mock("../../../../src/services/health-location", () => ({
	fetchSleepLocations: vi.fn(),
}));
vi.mock("../../../../src/services/sources-service", () => ({
	fetchSources: vi.fn(),
}));

import { fetchAllEvents } from "../../../../src/services/events-service";
import { fetchHealthEvents } from "../../../../src/services/health-evidence";
import { fetchSleepLocations } from "../../../../src/services/health-location";
import { fetchSources } from "../../../../src/services/sources-service";
import {
	ALL_SOURCES,
	eventsForSource,
	isSelectedToday,
	selectedSourceName,
	selectTrackEndpoints,
	timelineStore,
} from "../../../../src/viewmodels/timeline-view-model";

const fetchAllEventsMock = vi.mocked(fetchAllEvents);
const fetchSourcesMock = vi.mocked(fetchSources);
const fetchHealthEventsMock = vi.mocked(fetchHealthEvents);
const fetchSleepLocationsMock = vi.mocked(fetchSleepLocations);
const originalZone = process.env.TZ;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function rawRecords(timeline: DayTimeline | null): LifeEvent[] {
	return [
		...new Map(
			[...(timeline?.allDay ?? []), ...(timeline?.hours.flatMap((slot) => slot.events) ?? [])].map(
				(event) => [event.id, event],
			),
		).values(),
	];
}

function healthEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
	return eventFixture({
		sourceId: "apple-health",
		sourceName: "Apple 健康",
		precision: "second",
		data: {
			type: "HKQuantityTypeIdentifierHeartRate",
			value: "80",
			unit: "count/min",
			sourceName: "Apple Watch",
		},
		...overrides,
	});
}

beforeEach(() => {
	process.env.TZ = "UTC";
	fetchHealthEventsMock.mockReset();
	fetchSleepLocationsMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
	timelineStore.getState().reset();
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

describe("timelineStore", () => {
	beforeEach(() => {
		timelineStore.getState().reset();
		fetchAllEventsMock.mockReset();
		fetchSourcesMock.mockReset();
		time.localDateKey.mockReturnValue("2026-09-13");
	});

	it("loads the previous night and next morning while projecting only the selected day", async () => {
		fetchSourcesMock.mockResolvedValue([sourceFixture()]);
		fetchAllEventsMock.mockResolvedValue([eventFixture()]);
		await timelineStore.getState().load();
		expect(fetchAllEventsMock).toHaveBeenCalledWith({
			start: "2026-09-12T00:00:00.000Z",
			end: "2026-09-14T12:00:00.000Z",
			source: null,
			healthView: "story",
			signal: expect.any(AbortSignal),
		});
		expect(timelineStore.getState().status).toBe("ready");
		expect(timelineStore.getState().timeline?.totalEvents).toBe(1);
		expect(timelineStore.getState().sources).toHaveLength(1);
		expect(timelineStore.getState().timeline).toMatchObject({
			start: "2026-09-13T00:00:00.000Z",
			end: "2026-09-14T00:00:00.000Z",
		});
		expect(fetchHealthEventsMock).not.toHaveBeenCalled();
	});

	it("recomputes map statistics when the source filter changes", async () => {
		const health = eventFixture({ id: "h", sourceId: "src-health" });
		const other = eventFixture({ id: "o", sourceId: "src-other" });
		fetchSourcesMock.mockResolvedValue([sourceFixture()]);
		fetchAllEventsMock.mockResolvedValue([health, other]);
		await timelineStore.getState().load();
		expect(fetchAllEventsMock).toHaveBeenCalledWith(expect.objectContaining({ source: null }));
		expect(timelineStore.getState().insights?.eventCount).toBe(2);
		fetchAllEventsMock.mockClear();
		await timelineStore.getState().selectSource("src-health");
		expect(fetchAllEventsMock).not.toHaveBeenCalled();
		expect(timelineStore.getState().sourceId).toBe("src-health");
		expect(timelineStore.getState().insights?.eventCount).toBe(1);
		expect(timelineStore.getState().timeline?.totalEvents).toBe(1);
	});

	it("does not reload the same source", async () => {
		fetchSourcesMock.mockResolvedValue([]);
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().load();
		fetchAllEventsMock.mockClear();
		await timelineStore.getState().selectSource(ALL_SOURCES);
		expect(fetchAllEventsMock).not.toHaveBeenCalled();
		await timelineStore.getState().selectSource("");
		expect(fetchAllEventsMock).not.toHaveBeenCalled();
	});

	it("switches record tabs without fetching or rebuilding the day", async () => {
		fetchSourcesMock.mockResolvedValue([sourceFixture()]);
		fetchAllEventsMock.mockResolvedValue([eventFixture()]);
		await timelineStore.getState().load();
		const { timeline, insights, story } = timelineStore.getState();
		fetchAllEventsMock.mockClear();
		fetchSourcesMock.mockClear();
		expect(timelineStore.getState().tab).toBe("timeline");
		for (const tab of ["locations", "records", "timeline"] as const) {
			timelineStore.getState().selectTab(tab);
			expect(timelineStore.getState().tab).toBe(tab);
			expect(timelineStore.getState().timeline).toBe(timeline);
			expect(timelineStore.getState().insights).toBe(insights);
			expect(timelineStore.getState().story).toBe(story);
		}
		timelineStore.getState().selectTab("invalid" as "timeline");
		expect(timelineStore.getState().tab).toBe("timeline");
		expect(fetchAllEventsMock).not.toHaveBeenCalled();
		expect(fetchSourcesMock).not.toHaveBeenCalled();
	});

	it("keeps the selected record tab across days and source filters, and resets on reset", async () => {
		fetchSourcesMock.mockResolvedValue([sourceFixture()]);
		fetchAllEventsMock.mockResolvedValue([eventFixture()]);
		timelineStore.getState().selectTab("locations");
		await timelineStore.getState().selectDay("2026-09-14");
		expect(timelineStore.getState().tab).toBe("locations");
		await timelineStore.getState().selectSource("src-health");
		expect(timelineStore.getState().tab).toBe("locations");
		timelineStore.getState().reset();
		expect(timelineStore.getState().tab).toBe("timeline");
	});

	it("moves between days", async () => {
		fetchSourcesMock.mockResolvedValue([]);
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().shiftDay(-1);
		expect(timelineStore.getState().day).toBe("2026-09-12");
		await timelineStore.getState().selectDay("2026-09-10");
		expect(timelineStore.getState().day).toBe("2026-09-10");
		await timelineStore.getState().selectDay("2026-09-10");
		await timelineStore.getState().goToday();
		expect(timelineStore.getState().day).toBe("2026-09-13");
	});

	it("loads when selecting the current day from idle", async () => {
		fetchSourcesMock.mockResolvedValue([]);
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().selectDay("2026-09-13");
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
		timelineStore.getState().reset();
		await timelineStore.getState().selectSource("src-health");
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(2);
	});

	it("surfaces load errors and retries", async () => {
		fetchSourcesMock.mockRejectedValue(new Error("offline"));
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().load();
		expect(timelineStore.getState()).toMatchObject({ status: "error", error: "offline" });
		fetchSourcesMock.mockResolvedValue([]);
		await timelineStore.getState().retry();
		expect(timelineStore.getState().status).toBe("ready");
	});

	it("ignores aborted loads", async () => {
		fetchSourcesMock.mockRejectedValue(abortError());
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().load();
		expect(timelineStore.getState().status).toBe("loading");
	});
});

describe("timeline helpers", () => {
	it("labels today and source filters", () => {
		expect(isSelectedToday("2026-09-13")).toBe(true);
		expect(isSelectedToday("2026-09-12")).toBe(false);
		expect(selectedSourceName([], ALL_SOURCES)).toBe("全部来源");
		expect(selectedSourceName([sourceFixture()], "src-health")).toBe("Apple Health");
		expect(selectedSourceName([], "missing")).toBe("missing");
		const health = eventFixture({ sourceId: "src-health" });
		const other = eventFixture({ id: "o", sourceId: "src-other" });
		expect(eventsForSource([health, other], ALL_SOURCES)).toHaveLength(2);
		expect(eventsForSource([health, other], "src-health")).toEqual([health]);
		expect(selectTrackEndpoints([])).toBeNull();
		const early = {
			latitude: 1,
			longitude: 1,
			occurredAt: "2026-09-13T01:00:00Z",
			precision: "second" as const,
			sourceId: "a",
			sourceName: "a",
			elevation: null,
			speed: null,
		};
		const late = { ...early, sourceId: "b", occurredAt: "2026-09-13T09:00:00Z", latitude: 2 };
		expect(selectTrackEndpoints([[late], [early]])).toEqual({ start: early, end: late });
	});
});

describe("timeline map preferences", () => {
	beforeEach(() => {
		timelineStore.getState().reset();
		vi.mocked(fetchSources).mockResolvedValue([]);
		vi.mocked(fetchAllEvents).mockResolvedValue([]);
	});
	it("restores automatic expansion on each new day and preserves the choice within a day", async () => {
		await timelineStore.getState().load();
		timelineStore.getState().selectMapMode("none");
		await timelineStore.getState().selectDay(timelineStore.getState().day);
		expect(timelineStore.getState().mapMode).toBe("none");
		await timelineStore.getState().shiftDay(1);
		expect(timelineStore.getState().mapMode).toBe("auto");
		timelineStore.getState().selectMapMode("all");
		await timelineStore.getState().selectDay("2026-10-01");
		expect(timelineStore.getState().mapMode).toBe("auto");
	});
	it("regroups cached points without HTTP requests and ignores invalid presentation settings", async () => {
		timelineStore.getState().selectRadius(10);
		expect(timelineStore.getState().story).toBeNull();
		await timelineStore.getState().load();
		vi.mocked(fetchAllEvents).mockClear();
		timelineStore.getState().selectRadius(5);
		expect(timelineStore.getState().story?.places.radiusKm).toBe(5);
		timelineStore.getState().selectRadius(5);
		timelineStore.getState().selectRadius(7 as 5);
		timelineStore.getState().selectMapMode("invalid" as "all");
		expect(timelineStore.getState().radiusKm).toBe(5);
		expect(timelineStore.getState().mapMode).toBe("auto");
		expect(fetchAllEvents).not.toHaveBeenCalled();
	});
});

describe("health projection and context", () => {
	beforeEach(() => {
		timelineStore.getState().reset();
		fetchSourcesMock.mockReset().mockResolvedValue([sourceFixture({ id: "apple-health" })]);
		fetchAllEventsMock.mockReset();
	});

	it("uses the whole waking night for totals while keeping other-day events out of the day", async () => {
		const night = healthEvent({
			id: "night",
			occurredAt: "2026-09-12T22:00:00.000Z",
			endAt: "2026-09-13T06:00:00.000Z",
			data: {
				type: "HKCategoryTypeIdentifierSleepAnalysis",
				value: "3",
				sourceName: "Apple Watch",
			},
		});
		const tonight = {
			...night,
			id: "tonight",
			occurredAt: "2026-09-13T22:00:00.000Z",
			endAt: "2026-09-14T06:00:00.000Z",
		};
		const previousGps = eventFixture({
			id: "gps-before-bed",
			sourceId: "footprint",
			occurredAt: "2026-09-12T23:00:00.000Z",
			data: { latitude: 31.2, longitude: 121.4 },
		});
		const morningGps = { ...previousGps, id: "gps-wake", occurredAt: "2026-09-13T06:00:00.000Z" };
		fetchAllEventsMock.mockResolvedValue([night, tonight, previousGps, morningGps]);
		await timelineStore.getState().load();
		const state = timelineStore.getState();
		expect(state.health?.nights).toHaveLength(1);
		expect(state.health?.sleep).toMatchObject({
			fellAsleepAt: night.occurredAt,
			wokeAt: night.endAt,
			asleepMinutes: 480,
		});
		expect(state.health?.bedtimes).toHaveLength(1);
		expect(state.insights?.health.sleepMinutes).toBe(480);
		expect(state.insights?.gps.pointCount).toBe(1);
		expect(
			rawRecords(state.timeline)
				.map((event) => event.id)
				.sort(),
		).toEqual(["gps-wake", "night", "tonight"]);
		expect(state.story?.hours[6]?.health?.find((item) => item.kind === "sleep")).toMatchObject({
			kind: "sleep",
			map: { gps: { pointCount: 2 } },
		});
		expect(fetchHealthEventsMock).not.toHaveBeenCalled();

		await timelineStore.getState().selectSource("footprint");
		expect(timelineStore.getState().health).toBeNull();
		expect(timelineStore.getState().insights?.health.sleepMinutes).toBeNull();
		expect(timelineStore.getState().insights?.gps.pointCount).toBe(1);
		timelineStore.getState().selectRadius(10);
		expect(timelineStore.getState().story?.places.radiusKm).toBe(10);
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
	});

	it("derives UTC context from the actual local window on a DST change", async () => {
		process.env.TZ = "America/New_York";
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().selectDay("2026-11-01");
		expect(fetchAllEventsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				start: "2026-10-31T04:00:00.000Z",
				end: "2026-11-02T17:00:00.000Z",
				healthView: "story",
			}),
		);
		expect(timelineStore.getState().timeline).toMatchObject({
			start: "2026-11-01T04:00:00.000Z",
			end: "2026-11-02T05:00:00.000Z",
		});
		expect(timelineStore.getState().timeline?.hours[1]?.state).toBe("repeated");
	});

	it("ignores an older day's success after a newer day has loaded", async () => {
		const older = deferred<LifeEvent[]>();
		const newer = deferred<LifeEvent[]>();
		fetchAllEventsMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		const first = timelineStore.getState().load();
		const signal = fetchAllEventsMock.mock.calls[0]?.[0].signal;
		const second = timelineStore.getState().selectDay("2026-09-14");
		expect(signal?.aborted).toBe(true);
		const nextEvent = healthEvent({ id: "new-day", occurredAt: "2026-09-14T08:00:00.000Z" });
		newer.resolve([nextEvent]);
		await second;
		older.resolve([healthEvent({ id: "old-day" })]);
		await first;
		expect(timelineStore.getState().day).toBe("2026-09-14");
		expect(rawRecords(timelineStore.getState().timeline)).toEqual([nextEvent]);
	});

	it("ignores a stale load failure after reset and reloads an empty day selection from idle", async () => {
		const pending = deferred<LifeEvent[]>();
		fetchAllEventsMock.mockReturnValueOnce(pending.promise);
		const load = timelineStore.getState().load();
		timelineStore.getState().reset();
		pending.reject(new Error("old request failed"));
		await load;
		expect(timelineStore.getState()).toMatchObject({ status: "idle", error: null, timeline: null });
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().selectDay("");
		expect(timelineStore.getState().status).toBe("ready");
	});

	it("preserves a source filter changed while the same day is refreshing", async () => {
		const journal = eventFixture({ id: "note", sourceId: "journal", data: null });
		const heart = healthEvent({ id: "heart" });
		fetchAllEventsMock.mockResolvedValueOnce([heart, journal]);
		await timelineStore.getState().load();
		const refresh = deferred<LifeEvent[]>();
		fetchAllEventsMock.mockReturnValueOnce(refresh.promise);
		const loading = timelineStore.getState().retry();
		await timelineStore.getState().selectSource("journal");
		refresh.resolve([heart, journal]);
		await loading;
		expect(timelineStore.getState().sourceId).toBe("journal");
		expect(rawRecords(timelineStore.getState().timeline)).toEqual([journal]);
		expect(timelineStore.getState().health).toBeNull();
	});
});

describe("lazy health records", () => {
	const journal = eventFixture({ id: "journal", sourceId: "journal", data: null });
	const heart = healthEvent({ id: "heart" });
	const bodyMass = healthEvent({
		id: "mass",
		data: { type: "HKQuantityTypeIdentifierBodyMass", value: "70", unit: "kg" },
	});

	beforeEach(() => {
		timelineStore.getState().reset();
		fetchSourcesMock.mockReset().mockResolvedValue([sourceFixture({ id: "apple-health" })]);
		fetchAllEventsMock.mockReset().mockResolvedValue([heart, journal]);
	});

	it("fetches all health dimensions only on the records tab, merges by ID and reuses the day cache", async () => {
		const pending = deferred<LifeEvent[]>();
		fetchHealthEventsMock.mockReturnValue(pending.promise);
		await timelineStore.getState().load();
		const original = timelineStore.getState();
		timelineStore.getState().selectTab("locations");
		expect(fetchHealthEventsMock).not.toHaveBeenCalled();
		timelineStore.getState().selectTab("records");
		expect(timelineStore.getState().recordsStatus).toBe("loading");
		expect(fetchHealthEventsMock).toHaveBeenCalledWith(
			"2026-09-13T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
			expect.any(AbortSignal),
		);
		timelineStore.getState().selectTab("records");
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(1);
		const refreshed = { ...heart, content: "complete raw evidence" };
		pending.resolve([refreshed, bodyMass]);
		await vi.waitFor(() => expect(timelineStore.getState().recordsStatus).toBe("ready"));
		const records = rawRecords(timelineStore.getState().recordsTimeline);
		expect(records).toHaveLength(3);
		expect(records.find((event) => event.id === "heart")).toEqual(refreshed);
		expect(records.find((event) => event.id === "mass")).toEqual(bodyMass);
		expect(timelineStore.getState().timeline).toBe(original.timeline);
		expect(timelineStore.getState().story).toBe(original.story);
		expect(timelineStore.getState().insights).toBe(original.insights);
		for (const tab of ["timeline", "records", "locations", "records"] as const)
			timelineStore.getState().selectTab(tab);
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(1);
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
	});

	it("filters cached raw records without losing coincident samples or refetching", async () => {
		fetchHealthEventsMock.mockResolvedValue([heart, bodyMass]);
		await timelineStore.getState().load();
		await timelineStore.getState().loadRecords();
		timelineStore.getState().selectTab("records");
		await timelineStore.getState().selectSource("apple-health");
		expect(
			rawRecords(timelineStore.getState().recordsTimeline)
				.map((event) => event.id)
				.sort(),
		).toEqual(["heart", "mass"]);
		await timelineStore.getState().selectSource("journal");
		expect(rawRecords(timelineStore.getState().recordsTimeline)).toEqual([journal]);
		await timelineStore.getState().selectSource(ALL_SOURCES);
		timelineStore.getState().selectRadius(10);
		expect(rawRecords(timelineStore.getState().recordsTimeline)).toHaveLength(3);
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(1);
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
	});

	it("uses the latest source selection when a full-dimension request finishes", async () => {
		const pending = deferred<LifeEvent[]>();
		fetchHealthEventsMock.mockReturnValue(pending.promise);
		await timelineStore.getState().load();
		const loading = timelineStore.getState().loadRecords();
		timelineStore.getState().selectTab("records");
		await timelineStore.getState().selectSource("journal");
		pending.resolve([heart, bodyMass]);
		await loading;
		expect(timelineStore.getState().sourceId).toBe("journal");
		expect(rawRecords(timelineStore.getState().recordsTimeline)).toEqual([journal]);
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(1);
	});

	it("automatically loads records for a new day when that tab stays selected", async () => {
		fetchHealthEventsMock.mockResolvedValueOnce([heart, bodyMass]).mockResolvedValueOnce([]);
		timelineStore.getState().selectTab("records");
		expect(fetchHealthEventsMock).not.toHaveBeenCalled();
		await timelineStore.getState().load();
		expect(timelineStore.getState().recordsTimeline?.totalEvents).toBe(3);
		fetchAllEventsMock.mockResolvedValue([]);
		await timelineStore.getState().selectDay("2026-09-14");
		expect(timelineStore.getState()).toMatchObject({ tab: "records", recordsStatus: "ready" });
		expect(timelineStore.getState().recordsTimeline?.totalEvents).toBe(0);
		expect(fetchHealthEventsMock).toHaveBeenLastCalledWith(
			"2026-09-14T00:00:00.000Z",
			"2026-09-15T00:00:00.000Z",
			expect.any(AbortSignal),
		);
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(2);
	});

	it.each(["resolve", "reject"] as const)(
		"ignores stale raw-record %s after changing days",
		async (finish) => {
			const pending = deferred<LifeEvent[]>();
			fetchHealthEventsMock.mockReturnValue(pending.promise);
			await timelineStore.getState().load();
			const loading = timelineStore.getState().loadRecords();
			const signal = fetchHealthEventsMock.mock.calls[0]?.[2];
			fetchAllEventsMock.mockResolvedValue([]);
			await timelineStore.getState().selectDay("2026-09-14");
			expect(signal?.aborted).toBe(true);
			if (finish === "resolve") pending.resolve([bodyMass]);
			else pending.reject(new Error("late response"));
			await loading;
			expect(timelineStore.getState()).toMatchObject({
				day: "2026-09-14",
				recordsStatus: "idle",
				recordsTimeline: null,
				recordsError: null,
			});
		},
	);

	it("aborts and forgets pending record work on reset", async () => {
		const pending = deferred<LifeEvent[]>();
		fetchHealthEventsMock.mockReturnValue(pending.promise);
		await timelineStore.getState().load();
		const loading = timelineStore.getState().loadRecords();
		const signal = fetchHealthEventsMock.mock.calls[0]?.[2];
		timelineStore.getState().reset();
		expect(signal?.aborted).toBe(true);
		pending.resolve([bodyMass]);
		await loading;
		expect(timelineStore.getState()).toMatchObject({
			recordsStatus: "idle",
			recordsTimeline: null,
			timeline: null,
		});
	});

	it("keeps the reading tree ready when raw records fail, then retries independently", async () => {
		fetchHealthEventsMock
			.mockRejectedValueOnce(new Error("raw data offline"))
			.mockResolvedValueOnce([bodyMass]);
		await timelineStore.getState().load();
		const original = timelineStore.getState().story;
		await timelineStore.getState().loadRecords();
		expect(timelineStore.getState()).toMatchObject({
			status: "ready",
			error: null,
			recordsStatus: "error",
			recordsError: "raw data offline",
		});
		expect(timelineStore.getState().story).toBe(original);
		await timelineStore.getState().loadRecords();
		expect(timelineStore.getState()).toMatchObject({ recordsStatus: "ready", recordsError: null });
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
	});

	it("does not surface cancellation as a raw-record error", async () => {
		fetchHealthEventsMock.mockRejectedValue(abortError());
		await timelineStore.getState().load();
		await timelineStore.getState().loadRecords();
		expect(timelineStore.getState().recordsError).toBeNull();
		expect(timelineStore.getState().status).toBe("ready");
	});

	it.each([
		{ sources: [] },
		{ sources: [sourceFixture({ id: "apple-health", recordCount: 0 })] },
		{ sources: [sourceFixture({ id: "footprint" })] },
	])(
		"reuses the ordinary timeline when no health samples exist ($sources)",
		async ({ sources }) => {
			fetchSourcesMock.mockResolvedValue(sources);
			fetchAllEventsMock.mockResolvedValue([journal]);
			await timelineStore.getState().load();
			await timelineStore.getState().loadRecords();
			expect(timelineStore.getState().recordsTimeline).toBe(timelineStore.getState().timeline);
			expect(timelineStore.getState().recordsStatus).toBe("ready");
			expect(fetchHealthEventsMock).not.toHaveBeenCalled();
		},
	);
});

describe("optional sleep location evidence", () => {
	const residence: SleepLocation = {
		kind: "residence",
		label: "可能在常住地",
		detail: "近一个月有 8 夜停留在附近",
		matchedNights: 8,
		observedNights: 10,
	};
	const night = healthEvent({
		id: "night",
		occurredAt: "2026-09-12T22:00:00.000Z",
		endAt: "2026-09-13T06:00:00.000Z",
		data: { type: "HKCategoryTypeIdentifierSleepAnalysis", value: "3", sourceName: "Apple Watch" },
	});
	const sleepGps = eventFixture({
		id: "gps-before-bed",
		sourceId: "footprint",
		occurredAt: "2026-09-12T21:45:00.000Z",
		data: { latitude: 31.2, longitude: 121.4 },
	});
	const morningGps = { ...sleepGps, id: "gps-wake", occurredAt: "2026-09-13T06:00:00.000Z" };
	const ecg = healthEvent({
		id: "ecg",
		occurredAt: "2026-09-13T08:00:00.000Z",
		data: { _healthKind: "Electrocardiogram" },
	});
	const journal = eventFixture({ id: "note", sourceId: "journal", data: null });

	beforeEach(() => {
		timelineStore.getState().reset();
		fetchSourcesMock.mockReset().mockResolvedValue([sourceFixture({ id: "apple-health" })]);
		fetchAllEventsMock.mockReset().mockResolvedValue([night, sleepGps, morningGps, ecg, journal]);
	});

	it("enriches only the sleep card after the day becomes readable and retains evidence while regrouping", async () => {
		const evidence = deferred<Record<string, SleepLocation>>();
		fetchSleepLocationsMock.mockReturnValue(evidence.promise);
		const loading = timelineStore.getState().load();
		await vi.waitFor(() => expect(timelineStore.getState().status).toBe("ready"));
		const previous = timelineStore.getState();
		const sleepId = previous.health?.nights[0]?.id as string;
		const originalEcg = previous.story?.hours[8]?.health?.[0];
		expect(fetchSleepLocationsMock).toHaveBeenCalledWith(
			previous.health?.nights,
			"2026-09-13T00:00:00.000Z",
			expect.any(AbortSignal),
		);
		expect(previous.story?.hours[6]?.health?.[0]).toMatchObject({
			kind: "sleep",
			location: undefined,
		});
		evidence.resolve({ [sleepId]: residence });
		await loading;
		expect(timelineStore.getState().story?.hours[6]?.health?.[0]).toMatchObject({
			kind: "sleep",
			location: residence,
		});
		expect(timelineStore.getState().timeline).toBe(previous.timeline);
		expect(timelineStore.getState().insights).toBe(previous.insights);
		expect(timelineStore.getState().story?.hours[8]?.health?.[0]).toBe(originalEcg);
		expect(timelineStore.getState().story?.hours[6]?.visits).toBe(previous.story?.hours[6]?.visits);
		timelineStore.getState().selectRadius(10);
		expect(timelineStore.getState().story?.hours[6]?.health?.[0]).toMatchObject({
			location: residence,
		});
		expect(fetchSleepLocationsMock).toHaveBeenCalledTimes(1);
	});

	it("allows raw records to finish and keeps sleep readable when optional location evidence fails", async () => {
		fetchSleepLocationsMock.mockRejectedValue(new Error("historical GPS unavailable"));
		fetchHealthEventsMock.mockResolvedValue([]);
		timelineStore.getState().selectTab("records");
		await timelineStore.getState().load();
		expect(timelineStore.getState()).toMatchObject({
			status: "ready",
			error: null,
			recordsStatus: "ready",
			recordsError: null,
		});
		expect(timelineStore.getState().story?.hours[6]?.health?.[0]).toMatchObject({
			kind: "sleep",
			location: undefined,
		});
		expect(fetchHealthEventsMock).toHaveBeenCalledTimes(1);
	});

	it.each(["resolve", "reject"] as const)(
		"ignores a historical-location %s for a day that has been replaced",
		async (finish) => {
			const evidence = deferred<Record<string, SleepLocation>>();
			fetchSleepLocationsMock.mockReturnValue(evidence.promise);
			const loading = timelineStore.getState().load();
			await vi.waitFor(() => expect(fetchSleepLocationsMock).toHaveBeenCalledTimes(1));
			const sleepId = timelineStore.getState().health?.nights[0]?.id as string;
			const signal = fetchSleepLocationsMock.mock.calls[0]?.[2];
			fetchAllEventsMock.mockResolvedValue([]);
			await timelineStore.getState().selectDay("2026-09-14");
			const next = timelineStore.getState();
			expect(signal?.aborted).toBe(true);
			if (finish === "resolve") evidence.resolve({ [sleepId]: residence });
			else evidence.reject(new Error("late location error"));
			await loading;
			expect(timelineStore.getState().story).toBe(next.story);
			expect(timelineStore.getState()).toMatchObject({
				day: "2026-09-14",
				status: "ready",
				error: null,
				health: null,
			});
		},
	);

	it("does not restore a hidden health card when the source changes while location evidence is pending", async () => {
		const evidence = deferred<Record<string, SleepLocation>>();
		fetchSleepLocationsMock.mockReturnValue(evidence.promise);
		const loading = timelineStore.getState().load();
		await vi.waitFor(() => expect(fetchSleepLocationsMock).toHaveBeenCalledTimes(1));
		const sleepId = timelineStore.getState().health?.nights[0]?.id as string;
		await timelineStore.getState().selectSource("journal");
		evidence.resolve({ [sleepId]: residence });
		await loading;
		expect(timelineStore.getState().health).toBeNull();
		expect(timelineStore.getState().story?.hours.flatMap((hour) => hour.health ?? [])).toEqual([]);
		await timelineStore.getState().selectSource(ALL_SOURCES);
		expect(timelineStore.getState().story?.hours[6]?.health?.[0]).toMatchObject({
			kind: "sleep",
			location: residence,
		});
		expect(fetchAllEventsMock).toHaveBeenCalledTimes(1);
		expect(fetchSleepLocationsMock).toHaveBeenCalledTimes(1);
	});
});
