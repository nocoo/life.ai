import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, eventFixture, sourceFixture } from "../helpers";

const time = vi.hoisted(() => ({
	localDateKey: vi.fn(() => "2026-09-13"),
	shiftLocalDate: vi.fn((day: string, amount: number) => {
		const parts = day.split("-").map(Number);
		const year = parts[0] ?? 0;
		const month = parts[1] ?? 1;
		const date = parts[2] ?? 1;
		const next = new Date(year, month - 1, date + amount);
		return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
	}),
	localDayWindow: vi.fn((day: string) => ({
		start: `${day}T00:00:00.000Z`,
		end: `${day}T24:00:00.000Z`,
	})),
	buildDayTimeline: vi.fn((day: string, events: unknown[]) => ({
		date: day,
		start: `${day}T00:00:00.000Z`,
		end: `${day}T24:00:00.000Z`,
		timezone: "UTC",
		hours: [],
		allDay: [],
		totalEvents: Array.isArray(events) ? events.length : 0,
		activeHours: 0,
		sourceCount: 0,
	})),
	normalizeTimestamp: vi.fn((value: string) => value),
}));

vi.mock("../../../../src/models/time", () => time);
vi.mock("../../../../src/models/day-insights", () => ({
	buildDayInsights: vi.fn((events: unknown[]) => ({
		eventCount: Array.isArray(events) ? events.length : 0,
		gps: { pointCount: 0, segments: [], distanceMeters: 0, firstAt: null, lastAt: null },
		health: {
			steps: null,
			distanceMeters: null,
			flights: null,
			waterMl: null,
			energyKcal: null,
			exerciseMinutes: null,
			standHours: null,
			sleepMinutes: null,
			sleepStages: [],
			heartRate: null,
		},
		workoutCount: 0,
		workouts: [],
		finance: [],
	})),
}));
vi.mock("../../../../src/services/events-service", () => ({
	fetchAllEvents: vi.fn(),
}));
vi.mock("../../../../src/services/sources-service", () => ({
	fetchSources: vi.fn(),
}));

import { fetchAllEvents } from "../../../../src/services/events-service";
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

describe("timelineStore", () => {
	beforeEach(() => {
		timelineStore.getState().reset();
		fetchAllEventsMock.mockReset();
		fetchSourcesMock.mockReset();
		time.localDateKey.mockReturnValue("2026-09-13");
	});

	it("loads the local day window", async () => {
		fetchSourcesMock.mockResolvedValue([sourceFixture()]);
		fetchAllEventsMock.mockResolvedValue([eventFixture()]);
		await timelineStore.getState().load();
		expect(fetchAllEventsMock).toHaveBeenCalledWith({
			start: "2026-09-13T00:00:00.000Z",
			end: "2026-09-13T24:00:00.000Z",
			source: null,
			signal: expect.any(AbortSignal),
		});
		expect(timelineStore.getState().status).toBe("ready");
		expect(timelineStore.getState().timeline?.totalEvents).toBe(1);
		expect(timelineStore.getState().sources).toHaveLength(1);
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
