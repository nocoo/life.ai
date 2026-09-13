import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildDayTimeline,
	localDateKey,
	localDayWindow,
	normalizeTimestamp,
	shiftLocalDate,
	timestampAtPrecision,
} from "../../../src/models/time";
import type { LifeEvent } from "../../../src/models/types";

const originalZone = process.env.TZ;
afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
	vi.useRealTimers();
});

function event(override: Partial<LifeEvent> = {}): LifeEvent {
	return {
		id: "one",
		sourceId: "journal",
		sourceName: "实录",
		sourceKind: "import",
		occurredAt: "2026-09-13T00:00:00.000Z",
		endAt: null,
		precision: "hour",
		title: "阅读",
		content: "",
		data: null,
		updatedAt: "2026-09-13T00:00:00.000Z",
		...override,
	};
}

describe("UTC normalization", () => {
	it.each([
		["2026-09-13", "2026-09-13T00:00:00.000Z"],
		[" 2026-09-13T08 ", "2026-09-13T08:00:00.000Z"],
		["2026-09-13 08:15", "2026-09-13T08:15:00.000Z"],
		["2026-09-13T08:15:12.1Z", "2026-09-13T08:15:12.100Z"],
		["2026-09-13 08:15:12 +0800", "2026-09-13T00:15:12.000Z"],
		["2026-09-13T00:00:00-03:30", "2026-09-13T03:30:00.000Z"],
		["2026-09-13T08:15:12.123456789z", "2026-09-13T08:15:12.123Z"],
		["0000-02-29T00:00:00Z", "0000-02-29T00:00:00.000Z"],
		["0099-01-01", "0099-01-01T00:00:00.000Z"],
	])("normalizes %s explicitly", (input, expected) => {
		process.env.TZ = "Pacific/Honolulu";
		expect(normalizeTimestamp(input)).toBe(expected);
	});

	it.each([
		"",
		"tomorrow",
		"2026-02-29",
		"2026-00-10",
		"2026-13-01",
		"2026-04-31",
		"2026-01-00",
		"2026-1-1",
		"September 13, 2026",
		"2026-09-13T24:00:00Z",
		"2026-09-13T12:60:00Z",
		"2026-09-13T12:00:60Z",
		"2026-09-13T12:00:00+24:00",
		"2026-09-13T12:00:00+01:60",
		"2026-09-13T12:00:00+08",
		"2026-09-13T12:00:00Z trailing",
	])("rejects malformed or impossible %s", (input) => {
		expect(() => normalizeTimestamp(input)).toThrow();
	});
	it("rejects non-string values at a runtime boundary", () => {
		expect(() => normalizeTimestamp(null as never)).toThrow();
	});
	it("floors precision after converting the offset to UTC", () => {
		const input = "2026-09-13T00:35:47.234+08:00";
		expect(timestampAtPrecision(input, "day")).toBe("2026-09-12T00:00:00.000Z");
		expect(timestampAtPrecision(input, "hour")).toBe("2026-09-12T16:00:00.000Z");
		expect(timestampAtPrecision(input, "minute")).toBe("2026-09-12T16:35:00.000Z");
		expect(timestampAtPrecision(input, "second")).toBe("2026-09-12T16:35:47.000Z");
	});
});

describe("local calendar boundaries", () => {
	it("uses current local date and keeps calendar shifts independent of DST", () => {
		process.env.TZ = "Asia/Shanghai";
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-12T18:00:00Z"));
		expect(localDateKey()).toBe("2026-09-13");
		expect(localDateKey(new Date("0099-01-01T00:00:00Z"))).toBe("0099-01-01");
		expect(shiftLocalDate("2026-12-31", 1)).toBe("2027-01-01");
		expect(shiftLocalDate("2024-03-01", -1)).toBe("2024-02-29");
		expect(() => shiftLocalDate("2026-09-13", 0.5)).toThrow();
		expect(() => shiftLocalDate("2026-9-13", 1)).toThrow();
		expect(() => localDateKey(new Date("invalid"))).toThrow();
		expect(localDayWindow("2026-09-13")).toEqual({
			start: "2026-09-12T16:00:00.000Z",
			end: "2026-09-13T16:00:00.000Z",
		});
	});
	it("accepts a non-integer-hour local offset", () => {
		process.env.TZ = "Asia/Kathmandu";
		const timeline = buildDayTimeline("2026-09-13", []);
		expect(timeline.start).toBe("2026-09-12T18:15:00.000Z");
		expect(timeline.hours).toHaveLength(24);
		expect(
			timeline.hours.every((slot) => slot.state === "normal" && slot.instants.length === 1),
		).toBe(true);
	});
});

describe("timeline projection", () => {
	it("uses half-open intervals, preserves day precision, and does not count an interval twice", () => {
		process.env.TZ = "Asia/Shanghai";
		const records = [
			event({ id: "b", occurredAt: "2026-09-12T15:30:00Z", endAt: "2026-09-12T18:00:00Z" }),
			event({ id: "a", occurredAt: "2026-09-12T16:00:00Z" }),
			event({ id: "day", precision: "day", sourceId: "pixiu" }),
			event({ id: "before", occurredAt: "2026-09-12T15:00:00Z", endAt: "2026-09-12T16:00:00Z" }),
			event({ id: "after", occurredAt: "2026-09-13T16:00:00Z" }),
			event({ id: "yesterday", precision: "day", occurredAt: "2026-09-12T00:00:00Z" }),
			event({ id: "zero", occurredAt: "2026-09-12T18:00:00Z", endAt: "2026-09-12T18:00:00Z" }),
			event({ id: "c", occurredAt: "2026-09-12T16:00:00Z" }),
		];
		const timeline = buildDayTimeline("2026-09-13", records);
		expect(timeline.hours.map((slot) => slot.label)).toEqual(
			Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`),
		);
		expect(timeline.hours[0]?.events.map((record) => record.id)).toEqual(["b", "a", "c"]);
		expect(timeline.hours[1]?.events.map((record) => record.id)).toEqual(["b"]);
		expect(timeline.hours[2]?.events.map((record) => record.id)).toEqual(["zero"]);
		expect(timeline.allDay.map((record) => record.id)).toEqual(["day"]);
		expect(timeline.totalEvents).toBe(5);
		expect(timeline.activeHours).toBe(3);
		expect(timeline.sourceCount).toBe(2);
		expect(records[0]?.id).toBe("b");
	});

	it("keeps 24 labels on a 23-hour spring day without inventing the missing hour", () => {
		process.env.TZ = "America/New_York";
		const timeline = buildDayTimeline("2026-03-08", [
			event({ occurredAt: "2026-03-08T07:00:00Z" }),
		]);
		expect(Date.parse(timeline.end) - Date.parse(timeline.start)).toBe(23 * 3600_000);
		expect(timeline.hours[2]).toMatchObject({ instants: [], events: [], state: "missing" });
		expect(timeline.hours[3]?.events).toHaveLength(1);
	});
	it("puts both real 01:00 hours into the repeated clock label", () => {
		process.env.TZ = "America/New_York";
		const timeline = buildDayTimeline("2026-11-01", [
			event({ id: "early", occurredAt: "2026-11-01T05:30:00Z" }),
			event({ id: "late", occurredAt: "2026-11-01T06:30:00Z" }),
		]);
		expect(Date.parse(timeline.end) - Date.parse(timeline.start)).toBe(25 * 3600_000);
		expect(timeline.hours[1]?.state).toBe("repeated");
		expect(timeline.hours[1]?.instants).toHaveLength(2);
		expect(timeline.hours[1]?.events.map((record) => record.id)).toEqual(["early", "late"]);
	});
	it("handles half-hour DST transitions and a skipped calendar day", () => {
		process.env.TZ = "Australia/Lord_Howe";
		expect(buildDayTimeline("2026-04-05", []).hours[1]?.state).toBe("repeated");
		expect(buildDayTimeline("2026-10-04", []).hours[2]?.state).toBe("missing");
		process.env.TZ = "Pacific/Apia";
		const timeline = buildDayTimeline("2011-12-30", []);
		expect(timeline.start).toBe(timeline.end);
		expect(timeline.hours.every((slot) => slot.state === "missing")).toBe(true);
	});
});
