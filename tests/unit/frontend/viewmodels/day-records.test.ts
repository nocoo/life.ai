import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayTimeline, JsonValue, LifeEvent } from "../../../../src/models/types";
import {
	buildDayRecords,
	dayRecordField,
	dayRecordSummary,
	dayRecordTime,
} from "../../../../src/viewmodels/day-records";
import { eventFixture } from "../helpers";

const originalZone = process.env.TZ;

beforeEach(() => {
	process.env.TZ = "UTC";
});

afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

function timelineFixture(hours: LifeEvent[][] = [], allDay: LifeEvent[] = []): DayTimeline {
	return {
		date: "2026-09-13",
		start: "2026-09-13T00:00:00.000Z",
		end: "2026-09-14T00:00:00.000Z",
		timezone: "UTC",
		hours: Array.from({ length: 24 }, (_, hour) => ({
			hour,
			label: `${String(hour).padStart(2, "0")}:00`,
			instants: [],
			events: hours[hour] ?? [],
			state: "normal",
		})),
		allDay,
		totalEvents: new Set([...hours.flat(), ...allDay].map((event) => event.id)).size,
		activeHours: hours.filter((events) => events.length > 0).length,
		sourceCount: 1,
	};
}

describe("buildDayRecords", () => {
	it("retains original financial fields without formatting decimals or exposing structured values", () => {
		const row = buildDayRecords(
			timelineFixture(
				[],
				[
					eventFixture({
						sourceId: "pixiu",
						data: { 流出金额: "12.30", 备注: "a,b\n第二行", zero: 0, nested: { private: true } },
					}),
				],
			),
			"finance",
		)[0];
		assert(row);
		expect(dayRecordField(row, "流出金额")).toBe("12.30");
		expect(dayRecordField(row, "备注")).toBe("a,b\n第二行");
		expect(dayRecordField(row, "zero")).toBe("0");
		expect(dayRecordField(row, "missing")).toBe("");
		expect(dayRecordField(row, "nested")).toBe("");
		for (const data of [null, [], "legacy"]) {
			expect(dayRecordField({ ...row, event: { ...row.event, data } }, "流出金额")).toBe("");
		}
	});
	it("returns empty rows for either kind when the day has no records", () => {
		expect(buildDayRecords(timelineFixture(), "locations")).toEqual([]);
		expect(buildDayRecords(timelineFixture(), "records")).toEqual([]);
		expect(buildDayRecords(timelineFixture(), "finance")).toEqual([]);
	});

	it("deduplicates IDs across hours and all-day slots without mutating or copying events", () => {
		const interval = eventFixture({ id: "interval", endAt: "2026-09-13T05:00:00Z" });
		const allDay = eventFixture({
			id: "all-day",
			precision: "day",
			occurredAt: "2026-09-13",
		});
		const timeline = timelineFixture([[interval, allDay], [{ ...interval }]], [allDay, allDay]);
		const original = structuredClone(timeline);
		const rows = buildDayRecords(timeline, "records");
		expect(rows.map((row) => row.event.id)).toEqual(["all-day", "interval"]);
		expect(rows[0]?.event).toBe(allDay);
		expect(rows[1]?.event).toBe(interval);
		expect(timeline).toEqual(original);
	});

	it("sorts real UTC instants and treats offsetless times as UTC in a non-UTC browser", () => {
		process.env.TZ = "America/Los_Angeles";
		const events = [
			eventFixture({ id: "negative-offset", occurredAt: "2026-09-13T00:30:00-01:00" }),
			eventFixture({ id: "no-offset", occurredAt: "2026-09-13T01:00:00" }),
			eventFixture({ id: "plus-nine", occurredAt: "2026-09-13T09:30:00+09:00" }),
			eventFixture({ id: "plus-eight", occurredAt: "2026-09-13T08:00:00+08:00" }),
		];
		const rows = buildDayRecords(timelineFixture([events]), "records");
		expect(rows.map((row) => row.event.id)).toEqual([
			"plus-eight",
			"plus-nine",
			"no-offset",
			"negative-offset",
		]);
		expect(rows[2]?.instant).toBe(Date.parse("2026-09-13T01:00:00Z"));
	});

	it("keeps different GPS events with the same timestamp and orders ties by ID", () => {
		const events = ["point-b", "point-a"].map((id) =>
			eventFixture({ id, sourceId: "footprint", data: { latitude: 0, longitude: 0 } }),
		);
		const rows = buildDayRecords(timelineFixture([events, events]), "locations");
		expect(rows.map((row) => row.event.id)).toEqual(["point-a", "point-b"]);
		expect(rows[0]?.instant).toBe(rows[1]?.instant);
	});

	it("names numeric legacy coordinates without modifying their raw values or turning blanks into zero", () => {
		const events = ["31.000", "", " ", null, "invalid", "Infinity"].map((latitude, index) =>
			eventFixture({
				id: `legacy-${index}`,
				sourceId: "footprint",
				data: { latitude, longitude: "121.0" },
			}),
		);
		const rows = buildDayRecords(timelineFixture([events]), "locations", [
			{ id: "home", label: "家", latitude: 31, longitude: 121, radiusMeters: 100 },
			{ id: "equator", label: "赤道", latitude: 0, longitude: 121, radiusMeters: 100 },
		]);
		expect(rows.map((row) => row.placeLabel)).toEqual(["家", null, null, null, null, null]);
		expect(rows[0]?.latitude).toBe("31.000");
		expect(rows[0]?.longitude).toBe("121.0");
		expect(rows[0]?.event).toBe(events[0]);
	});

	it("uses story classification, including Connect locations and workout/sleep/finance precedence", () => {
		const records = [
			eventFixture({ id: "gps", sourceId: "footprint", data: null }),
			eventFixture({
				id: "connect-gps",
				sourceKind: "connect",
				data: { lat: 0, lng: 0 },
			}),
			eventFixture({
				id: "workout",
				data: { workoutActivityType: "HKWorkoutActivityTypeWalking", latitude: 0, longitude: 0 },
			}),
			eventFixture({
				id: "sleep",
				data: { type: "HKCategoryTypeIdentifierSleepAnalysis", points: [] },
			}),
			eventFixture({ id: "money", sourceId: "pixiu", data: { lat: 0, lon: 0 } }),
			eventFixture({ id: "health", sourceId: "apple-health" }),
			eventFixture({ id: "connect-note", sourceKind: "connect", data: null }),
			eventFixture({ id: "note", sourceId: "journal", data: null }),
		];
		const timeline = timelineFixture([records]);
		expect(buildDayRecords(timeline, "locations").map((row) => row.event.id)).toEqual([
			"connect-gps",
			"gps",
		]);
		expect(buildDayRecords(timeline, "records").map((row) => row.event.id)).toEqual([
			"connect-note",
			"health",
			"note",
			"sleep",
			"workout",
		]);
		expect(buildDayRecords(timeline, "finance").map((row) => row.event.id)).toEqual(["money"]);
	});

	it("preserves exact coordinates, zero values and native negative speed/course values", () => {
		const event = eventFixture({
			sourceId: "footprint",
			data: {
				latitude: 0,
				lat: 1,
				longitude: 1.123456789,
				lon: 2,
				lng: 3,
				elevation: -25.5,
				ele: 20,
				speed: -1,
				course: 0,
			},
		});
		expect(buildDayRecords(timelineFixture([[event]]), "locations")[0]).toMatchObject({
			latitude: 0,
			longitude: 1.123456789,
			elevation: -25.5,
			speed: -1,
			course: 0,
			pointCount: null,
		});
		const zero = eventFixture({
			sourceId: "footprint",
			data: { latitude: 0, longitude: 0, elevation: 0, speed: 0, course: -1 },
		});
		expect(buildDayRecords(timelineFixture([[zero]]), "locations")[0]).toMatchObject({
			latitude: 0,
			longitude: 0,
			elevation: 0,
			speed: 0,
			course: -1,
		});
	});

	it("reads legacy aliases without changing raw numeric strings", () => {
		const event = eventFixture({
			data: {
				latitude: null,
				lat: "0.000000",
				longitude: null,
				lon: "-1.123456789",
				lng: "2",
				elevation: null,
				ele: "-25",
				speed: "-1",
				course: "0",
			},
		});
		expect(buildDayRecords(timelineFixture([[event]]), "locations")[0]).toMatchObject({
			latitude: "0.000000",
			longitude: "-1.123456789",
			elevation: "-25",
			speed: "-1",
			course: "0",
		});
		const lng = eventFixture({ data: { lat: 0, lng: 1 } });
		expect(buildDayRecords(timelineFixture([[lng]]), "locations")[0]?.longitude).toBe(1);
	});

	it.each(["points", "trackPoints"])("keeps legacy %s arrays in one untouched event", (key) => {
		const points: JsonValue[] = [
			{ lat: 0, lon: 0, speed: -1 },
			{ lat: 1, lon: 1 },
			{ lat: 2, lon: 2 },
		];
		const event = eventFixture({
			id: "legacy-track",
			title: "原始轨迹",
			content: "完整正文",
			data: { [key]: points, nativeMetadata: { enabled: false, nullable: null } },
		});
		const stringify = vi.spyOn(JSON, "stringify");
		const rows = buildDayRecords(timelineFixture([[event], [event]]), "locations");
		expect(stringify).not.toHaveBeenCalled();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.pointCount).toBe(3);
		expect(rows[0]?.event).toBe(event);
		expect(rows[0]?.latitude).toBeNull();
	});

	it("keeps an empty legacy track and uses the first valid array field", () => {
		const empty = eventFixture({ data: { points: [], trackPoints: [{ lat: 0, lon: 0 }] } });
		expect(buildDayRecords(timelineFixture([[empty]]), "locations")[0]?.pointCount).toBe(0);
		const fallback = eventFixture({ data: { points: false, trackPoints: [] } });
		expect(buildDayRecords(timelineFixture([[fallback]]), "locations")[0]?.pointCount).toBe(0);
	});

	it.each<JsonValue>([
		null,
		"raw text",
		0,
		true,
		[],
		{ latitude: {}, longitude: false, elevation: [], speed: true, course: null },
	])("keeps missing or non-scalar coordinate fields inspectable: %j", (data) => {
		const event = eventFixture({ sourceId: "footprint", data });
		const rows = buildDayRecords(timelineFixture([[event]]), "locations");
		expect(rows[0]).toMatchObject({
			latitude: null,
			longitude: null,
			elevation: null,
			speed: null,
			course: null,
			pointCount: null,
		});
		expect(rows[0]?.event).toBe(event);
	});

	it("retains invalid historical times after valid records", () => {
		const timeline = timelineFixture([
			[
				eventFixture({ id: "invalid-b", occurredAt: "bad time" }),
				eventFixture({ id: "invalid-a", occurredAt: "2026-02-30" }),
				eventFixture({ id: "valid" }),
			],
		]);
		const rows = buildDayRecords(timeline, "records");
		expect(rows.map((row) => row.event.id)).toEqual(["valid", "invalid-a", "invalid-b"]);
		assert(rows[2]);
		expect(dayRecordTime(rows[2])).toBe("bad time");
	});
});

describe("dayRecordTime", () => {
	it.each([
		["day", "2026-09-13", "全天"],
		["hour", "2026-09-13T01:00:00", "09:00"],
		["minute", "2026-09-13T01:23:45Z", "09:23"],
		["second", "2026-09-13T01:23:45Z", "09:23:45"],
	] as const)(
		"presents %s precision locally without changing the original timestamp",
		(precision, occurredAt, expected) => {
			process.env.TZ = "Asia/Shanghai";
			const event = eventFixture({ precision, occurredAt });
			const [row] = buildDayRecords(timelineFixture([[event]]), "records");
			assert(row);
			expect(dayRecordTime(row)).toBe(expected);
			expect(row?.event.occurredAt).toBe(occurredAt);
		},
	);
});

describe("dayRecordSummary", () => {
	it("prefers content and bounds its preview without modifying the full record", () => {
		expect(dayRecordSummary(eventFixture({ content: "  下班回家  " }))).toBe("下班回家");
		const content = "记录".repeat(100);
		const event = eventFixture({ content });
		expect(dayRecordSummary(event)).toBe(`${content.slice(0, 180)}…`);
		expect(event.content).toBe(content);
	});

	it("uses existing field labels for up to three summary fields", () => {
		const event = eventFixture({
			data: { type: "HKQuantityTypeIdentifierStepCount", value: 0, unit: "count", device: "watch" },
		});
		expect(dayRecordSummary(event)).toBe("类型：步数 · 数值：0 · 单位：count");
		expect(dayRecordSummary(eventFixture({ content: " ", data: null }))).toBe("—");
		expect(dayRecordSummary(eventFixture({ data: false }))).toBe("数据：否");
	});
});
