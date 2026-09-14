import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildDayInsights,
	gpsDistanceMeters,
	type TrackPoint,
} from "../../../../src/models/day-insights";
import { buildHealthStory, type HealthStory } from "../../../../src/models/health-insights";
import type { SleepLocation } from "../../../../src/models/health-location";
import { buildDayTimeline, localDayWindow } from "../../../../src/models/time";
import type { JsonValue, LifeEvent } from "../../../../src/models/types";
import { storyHourEntries } from "../../../../src/viewmodels/day-story";
import { buildHealthTimeline, routeMapInsights } from "../../../../src/viewmodels/health-timeline";
import { eventFixture } from "../helpers";

const day = "2026-09-13";
const window = { start: `${day}T00:00:00.000Z`, end: "2026-09-14T00:00:00.000Z" };
const originalZone = process.env.TZ;

beforeEach(() => {
	process.env.TZ = "UTC";
});
afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

function healthEvent(
	id: string,
	at: string,
	data: JsonValue,
	overrides: Partial<LifeEvent> = {},
): LifeEvent {
	return eventFixture({
		id,
		sourceId: "apple-health",
		sourceName: "Apple 健康",
		precision: "second",
		occurredAt: at,
		data,
		...overrides,
	});
}

function gps(id: string, at: string, longitude = 121.4): LifeEvent {
	return eventFixture({
		id,
		sourceId: "footprint",
		sourceName: "Footprint",
		precision: "second",
		occurredAt: at,
		data: { latitude: 31.2, longitude },
	});
}

function sleep(id: string, start: string, end: string): LifeEvent {
	return healthEvent(
		id,
		start,
		{ type: "HKCategoryTypeIdentifierSleepAnalysis", value: "3", sourceName: "Apple Watch" },
		{ endAt: end },
	);
}

function workout(
	id: string,
	start: string,
	end: string | null,
	sourceName = "Apple Watch",
	paths: string[] = [],
): LifeEvent {
	return healthEvent(
		id,
		start,
		{
			_healthKind: "Workout",
			workoutActivityType: "HKWorkoutActivityTypeCycling",
			sourceName,
			duration: "30",
			durationUnit: "min",
			_healthChildren: [
				{
					name: "WorkoutRoute",
					attributes: {},
					children: paths.map((path) => ({ name: "FileReference", attributes: { path } })),
				},
			],
		},
		{ endAt: end },
	);
}

function point(at: string, longitude = 0, overrides: Partial<TrackPoint> = {}): TrackPoint {
	return {
		occurredAt: at,
		latitude: 0,
		longitude,
		precision: "second",
		sourceId: "apple-health",
		sourceName: "运动路线",
		elevation: null,
		speed: null,
		...overrides,
	};
}

function project(
	events: LifeEvent[],
	extra: Partial<HealthStory> = {},
	date = day,
	locations?: Record<string, SleepLocation>,
) {
	const timeline = buildDayTimeline(date, events);
	const insights = buildDayInsights(events, timeline);
	const health = { ...buildHealthStory(events, timeline), ...extra };
	const story = buildHealthTimeline(timeline, insights, health, events, 5, locations);
	return {
		timeline,
		insights,
		health,
		story,
		items: story.hours.flatMap((hour) => hour.health ?? []),
	};
}

describe("routeMapInsights", () => {
	it("clips to a half-open UTC interval, preserving native segment boundaries and the base day's totals", () => {
		const base = buildDayInsights([], window);
		const before = point("2026-09-12T23:59:59.000Z");
		const start = point(window.start);
		const next = point("2026-09-13T00:01:00.000Z", 0.01);
		const separate = point("2026-09-13T00:02:00.000Z", 1);
		const atEnd = point("2026-09-13T00:03:00.000Z", 1.1);
		const segments = [
			[before, start, next],
			[separate, atEnd],
		];
		const snapshot = structuredClone({ base, segments });
		const map = routeMapInsights(base, segments, window.start, atEnd.occurredAt);
		expect(map.gps).toMatchObject({
			pointCount: 3,
			firstAt: start.occurredAt,
			lastAt: separate.occurredAt,
			segments: [[start, next], [separate]],
		});
		expect(map.gps.distanceMeters).toBeCloseTo(gpsDistanceMeters(start, next), 6);
		expect(map.health).toBe(base.health);
		expect(map.workouts).toBe(base.workouts);
		expect({ base, segments }).toEqual(snapshot);
	});

	it("breaks lines at route markers, large gaps, non-increasing timestamps and the date line", () => {
		const base = buildDayInsights([], window);
		const a = point("2026-09-13T00:00:00.000Z", 0);
		const b = point("2026-09-13T00:30:00.000Z", 0.01);
		const c = point("2026-09-13T01:00:00.001Z", 1);
		const d = point("2026-09-13T01:00:00.001Z", 2);
		const e = point("2026-09-13T00:59:59.000Z", 3);
		const f = point("2026-09-13T01:01:00.000Z", 179, { breakBefore: true });
		const g = point("2026-09-13T01:02:00.000Z", -179);
		const h = point("2026-09-13T01:03:00.000Z", -178.99);
		const map = routeMapInsights(base, [[a, b, c, d, e, f, g, h]], window.start, window.end);
		expect(map.gps.segments).toEqual([[a, b], [c], [d], [e], [f], [g, h]]);
		expect(map.gps.distanceMeters).toBeCloseTo(
			gpsDistanceMeters(a, b) + gpsDistanceMeters(g, h),
			6,
		);
		expect(map.gps.pointCount).toBe(8);
	});

	it("does not bridge removed points or infer chronological bounds from input ordering", () => {
		const later = point("2026-09-13T00:20:00.000Z", 0.03);
		const earlier = point("2026-09-13T00:10:00.000Z", 0.02);
		const excluded = point("2026-09-12T23:59:00.000Z", 0.01);
		const first = point("2026-09-13T00:05:00.000Z");
		const map = routeMapInsights(
			buildDayInsights([], window),
			[[later, excluded, earlier], [first]],
			window.start,
			window.end,
		);
		expect(map.gps).toEqual({
			pointCount: 3,
			segments: [[later], [earlier], [first]],
			distanceMeters: 0,
			firstAt: first.occurredAt,
			lastAt: later.occurredAt,
		});
	});

	it("returns an empty map with no invented endpoints when no point belongs to the selected interval", () => {
		const map = routeMapInsights(
			buildDayInsights([], window),
			[[], [point(window.end)]],
			window.start,
			window.end,
		);
		expect(map.gps).toEqual({
			pointCount: 0,
			segments: [],
			distanceMeters: 0,
			firstAt: null,
			lastAt: null,
		});
	});
});

describe("health timeline cards", () => {
	it("keeps all-day totals off the trunk and leaves original events available to raw record tabs", () => {
		const daily = healthEvent(
			"activity",
			window.start,
			{ _healthKind: "ActivitySummary", activeEnergyBurned: "200" },
			{ precision: "day" },
		);
		const health = healthEvent(
			"steps",
			"2026-09-13T12:00:00.000Z",
			{ type: "HKQuantityTypeIdentifierStepCount", value: "70", unit: "count" },
			{ endAt: "2026-09-13T14:00:00.000Z" },
		);
		const allDayNote = eventFixture({
			id: "holiday",
			sourceId: "journal",
			precision: "day",
			occurredAt: window.start,
			data: null,
		});
		const note = eventFixture({
			id: "visit",
			sourceId: "journal",
			occurredAt: "2026-09-13T12:00:00.000Z",
			endAt: "2026-09-13T14:00:00.000Z",
			data: null,
		});
		const events = [daily, health, allDayNote, note];
		const original = structuredClone(events);
		const result = project(events);
		expect(result.story.allDay.flatMap((branch) => branch.events)).toEqual([daily, allDayNote]);
		expect(
			result.story.hours.flatMap((hour) => hour.branches.flatMap((branch) => branch.events)),
		).toEqual([note]);
		expect(result.story.hours[13]?.continuing).toEqual([
			expect.objectContaining({ id: "visit", anchorHour: 12 }),
		]);
		expect(result.story.hours[0]?.health).toBeUndefined();
		expect(result.timeline.totalEvents).toBe(4);
		expect(result.timeline.allDay).toEqual([daily, allDayNote]);
		expect(result.timeline.hours[13]?.events).toContain(health);
		expect(events).toEqual(original);
	});

	it("renders ECG and paired blood pressure once at their actual minute", () => {
		const at = "2026-09-13T08:12:30.000Z";
		const ecg = healthEvent("ecg", at, {
			_healthKind: "Electrocardiogram",
			filePath: "electrocardiograms/one.csv",
			classification: "SinusRhythm",
			averageHeartRate: "62",
			samplingHz: "512",
			sampleCount: "15360",
			durationSeconds: "30",
			unit: "µV",
		});
		const systolic = healthEvent("systolic", "2026-09-13T08:15:00.000Z", {
			type: "HKQuantityTypeIdentifierBloodPressureSystolic",
			sourceName: "cuff",
			value: "120",
			unit: "mmHg",
		});
		const diastolic = healthEvent("diastolic", systolic.occurredAt, {
			type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
			sourceName: "cuff",
			value: "80",
			unit: "mmHg",
		});
		const result = project([ecg, systolic, diastolic]);
		expect(result.items.map((item) => item.kind)).toEqual(["ecg", "pressure"]);
		expect(result.story.hours[8]?.health).toHaveLength(2);
		expect(result.items[0]).toMatchObject({
			kind: "ecg",
			occurredAt: at,
			ecg: {
				filePath: "electrocardiograms/one.csv",
				samplingHz: "512",
				averageHeartRate: "62",
				unit: "µV",
			},
		});
		expect(result.items[1]).toMatchObject({
			kind: "pressure",
			occurredAt: systolic.occurredAt,
			reading: { systolic: 120, diastolic: 80, eventIds: ["systolic", "diastolic"] },
		});
		expect(result.story.hours[8]?.branches).toEqual([]);
		expect(result.story.hours[8]?.activity).toBeGreaterThanOrEqual(0.5);
	});

	it("promotes rare observations with a clock time and excludes other days and date-only observations", () => {
		const at = "2026-09-13T07:23:00.000Z";
		const mass = healthEvent("mass", at, {
			type: "HKQuantityTypeIdentifierBodyMass",
			value: "70",
			unit: "kg",
		});
		const events = [
			mass,
			{ ...mass, id: "yesterday", occurredAt: "2026-09-12T23:59:59.999Z" },
			{ ...mass, id: "tomorrow", occurredAt: window.end },
			{ ...mass, id: "date-only", occurredAt: window.start, precision: "day" as const },
			healthEvent("unstructured", at, null),
			healthEvent("array", at, []),
			healthEvent("string", at, "private note"),
			healthEvent("nonstring-type", at, { type: 12 }),
		];
		const result = project(events);
		expect(result.items).toEqual([
			{
				kind: "observation",
				id: "mass",
				occurredAt: at,
				event: mass,
				title: "体重",
				details: [
					{ term: "数值", value: "70" },
					{ term: "单位", value: "kg" },
				],
				notes: expect.arrayContaining([expect.stringContaining("Apple 健康")]),
			},
		]);
		expect(result.story.hours[0]?.health).toBeUndefined();
		expect(result.timeline.allDay).toHaveLength(1);
	});

	it("projects only measurement details while retaining complete original observations for the raw tab", () => {
		const at = "2026-09-13T07:23:00.000Z";
		const mass = healthEvent("mass", at, {
			type: "HKQuantityTypeIdentifierBodyMass",
			value: 70.123456,
			unit: "kg",
			sourceName: "Withings",
			sourceVersion: "7.4.0",
			creationDate: "2026-09-13 08:00:00 +0000",
			startDate: "2026-09-13 07:23:00 +0000",
			endDate: "2026-09-13 07:23:00 +0000",
			device: "<HKDevice: exported hardware descriptor>",
			_healthKind: "Record",
			_healthChildren: [
				{ name: "MetadataEntry", attributes: { key: "HKWasUserEntered", value: "0" } },
			],
		});
		const reminder = healthEvent("reminder", at, {
			type: "HKCategoryTypeIdentifierLowHeartRateEvent",
			unit: "count/min",
		});
		const events = [mass, reminder];
		const snapshot = structuredClone(events);
		const result = project(events);
		const measurement = result.items.find((item) => item.id === mass.id);
		expect(measurement?.kind).toBe("observation");
		if (measurement?.kind !== "observation") return;
		expect(measurement.details).toEqual([
			{ term: "数值", value: "70.1235" },
			{ term: "单位", value: "kg" },
		]);
		expect(measurement.notes).toEqual(
			expect.arrayContaining([expect.stringContaining("Withings")]),
		);
		expect(result.items.find((item) => item.id === reminder.id)).toMatchObject({
			kind: "observation",
			details: [],
			notes: expect.arrayContaining([expect.stringContaining("Apple 健康")]),
		});
		expect(measurement.event).toBe(mass);
		expect(measurement.event.data).toBe(mass.data);
		expect(result.timeline.hours[7]?.events.find((event) => event.id === mass.id)).toBe(mass);
		expect(events).toEqual(snapshot);
	});

	it("hides internal category values and their units without losing zero measurements or raw values", () => {
		const at = "2026-09-13T07:23:00.000Z";
		const alert = healthEvent("audio-alert", at, {
			type: "HKCategoryTypeIdentifierAudioExposureEvent",
			value: "HKCategoryValueEnvironmentalAudioExposureEventMomentaryLimit",
			unit: "dBASPL",
			sourceName: "Apple Watch",
		});
		const zeros = [0, "0"].map((value, index) =>
			healthEvent(`zero-${index}`, at, {
				type: "HKQuantityTypeIdentifierBodyMass",
				value,
				unit: "kg",
			}),
		);
		const events = [alert, ...zeros];
		const snapshot = structuredClone(events);
		const result = project(events);
		expect(result.items.find((item) => item.id === alert.id)).toMatchObject({
			kind: "observation",
			details: [],
			notes: expect.arrayContaining([expect.stringContaining("Apple Watch")]),
		});
		for (const zero of zeros)
			expect(result.items.find((item) => item.id === zero.id)).toMatchObject({
				kind: "observation",
				details: [
					{ term: "数值", value: "0" },
					{ term: "单位", value: "kg" },
				],
			});
		for (const event of events) {
			const item = result.items.find((candidate) => candidate.id === event.id);
			expect(item?.kind).toBe("observation");
			if (item?.kind !== "observation") continue;
			expect(item.event).toBe(event);
			expect(item.event.data).toBe(event.data);
		}
		expect(events).toEqual(snapshot);
	});

	it("puts one full sleep card at wake-up, adds continuation links and a separate bedtime tonight", () => {
		const night = sleep("night", "2026-09-12T22:00:00.000Z", "2026-09-13T06:20:00.000Z");
		const tonight = sleep("tonight", "2026-09-13T22:30:00.000Z", "2026-09-14T06:00:00.000Z");
		const beforeBed = gps("before-bed", "2026-09-12T21:30:00.000Z");
		const atWake = gps("at-wake", "2026-09-13T06:20:00.000Z", 121.4001);
		const earlier = gps("too-early", "2026-09-12T21:00:00.000Z");
		const later = gps("too-late", "2026-09-13T07:00:00.000Z");
		const health = buildHealthStory([night, tonight, beforeBed, atWake], window);
		const id = health.nights[0]?.id as string;
		const location: SleepLocation = {
			kind: "residence",
			label: "可能在常住地",
			detail: "近一个月 8 夜停留在附近",
			matchedNights: 8,
			observedNights: 9,
		};
		const result = project([night, tonight, beforeBed, atWake, earlier, later], {}, day, {
			[id]: location,
		});
		expect(result.items.map((item) => item.kind)).toEqual(["sleep", "bedtime"]);
		const wake = result.story.hours[6]?.health?.[0];
		expect(wake).toMatchObject({
			kind: "sleep",
			occurredAt: night.endAt,
			night: { fellAsleepAt: night.occurredAt, asleepMinutes: 500 },
			location,
			map: { gps: { pointCount: 2, firstAt: beforeBed.occurredAt, lastAt: atWake.occurredAt } },
		});
		for (let hour = 0; hour < 6; hour++)
			expect(result.story.hours[hour]?.continuing).toContainEqual(
				expect.objectContaining({ id, kind: "sleep", anchorHour: 6 }),
			);
		expect(result.story.hours[6]?.continuing).not.toContainEqual(expect.objectContaining({ id }));
		expect(result.story.hours[7]?.continuing).not.toContainEqual(expect.objectContaining({ id }));
		expect(result.story.hours[22]?.health?.[0]).toMatchObject({
			kind: "bedtime",
			occurredAt: tonight.occurredAt,
			title: "今晚入睡",
		});
	});

	it("keeps sleep without GPS evidence readable and does not invent a map", () => {
		const result = project([sleep("nap", "2026-09-13T13:10:00.000Z", "2026-09-13T13:40:00.000Z")]);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			kind: "sleep",
			map: null,
			occurredAt: "2026-09-13T13:40:00.000Z",
		});
		expect(result.story.hours.flatMap((hour) => hour.continuing)).toEqual([]);
	});

	it("merges overlapping workout providers and removes the same interval from hourly Footprint maps", () => {
		const start = "2026-09-13T09:00:00.000Z";
		const end = "2026-09-13T09:30:00.000Z";
		const apple = workout("watch", start, end);
		const duplicate = workout("app", start, end, "cycling app");
		const events = [
			apple,
			duplicate,
			gps("before", "2026-09-13T08:55:00.000Z"),
			gps("a", "2026-09-13T09:10:00.000Z", 121.401),
			gps("b", "2026-09-13T09:20:00.000Z", 121.402),
			gps("endpoint", end, 121.403),
			gps("after", "2026-09-13T09:35:00.000Z", 121.404),
		];
		const result = project(events);
		const item = result.items.find((candidate) => candidate.kind === "workout");
		expect(result.items.filter((candidate) => candidate.kind === "workout")).toHaveLength(1);
		expect(item).toMatchObject({
			kind: "workout",
			group: {
				canonical: { eventId: "watch" },
				duplicates: [expect.objectContaining({ eventId: "app" })],
			},
			map: { gps: { pointCount: 3, firstAt: "2026-09-13T09:10:00.000Z", lastAt: end } },
			routePaths: [],
		});
		expect(
			result.story.hours
				.flatMap((hour) => hour.visits.flatMap((visit) => visit.visit.points))
				.map((point) => point.occurredAt),
		).toEqual(["2026-09-13T08:55:00.000Z", "2026-09-13T09:35:00.000Z"]);
		expect(result.insights.gps.pointCount).toBe(5);
		expect(result.story.places.visits.reduce((count, visit) => count + visit.pointCount, 0)).toBe(
			5,
		);
		expect(result.timeline.totalEvents).toBe(events.length);
	});

	it("normalizes and deduplicates native route paths, falling back to a duplicate provider when needed", () => {
		const start = "2026-09-13T10:00:00.000Z";
		const end = "2026-09-13T10:30:00.000Z";
		const apple = workout("watch", start, end);
		const app = workout("app", start, end, "route recorder", [
			"/workout-routes/a.gpx",
			"workout-routes/a.gpx",
			"./workout-routes/a.gpx",
		]);
		const result = project([apple, app]);
		expect(result.items[0]).toMatchObject({
			kind: "workout",
			routePaths: ["workout-routes/a.gpx"],
			map: { gps: { pointCount: 0 } },
		});
		const primary = project([
			workout("with-native-route", start, end, "Apple Watch", ["/workout-routes/watch.gpx"]),
			app,
		]);
		expect(primary.items[0]).toMatchObject({ routePaths: ["workout-routes/watch.gpx"] });
	});

	it("clips workouts at local day boundaries and does not invent an end for an untimed duration", () => {
		const overnight = project([
			workout("overnight", "2026-09-12T23:45:00.000Z", "2026-09-13T00:15:00.000Z"),
			gps("first", window.start),
			gps("endpoint", "2026-09-13T00:15:00.000Z"),
		]);
		expect(overnight.items[0]).toMatchObject({
			kind: "workout",
			occurredAt: window.start,
			start: window.start,
			end: "2026-09-13T00:15:00.001Z",
			map: { gps: { pointCount: 2 } },
		});
		const late = project([workout("late", "2026-09-13T23:45:00.000Z", "2026-09-14T00:15:00.000Z")]);
		expect(late.items[0]).toMatchObject({ kind: "workout", end: window.end });
		const noEnd = project([workout("duration-only", "2026-09-13T10:00:00.000Z", null)]);
		expect(noEnd.items[0]).toMatchObject({
			kind: "workout",
			map: { gps: { pointCount: 0 } },
			routePaths: [],
			end: "2026-09-13T10:00:00.001Z",
		});
	});

	it("combines health moments with solar and narrative entries by UTC instant inside the local hour", () => {
		const at = "2026-09-13T08:15:00.000Z";
		const note = eventFixture({
			id: "note",
			sourceId: "journal",
			occurredAt: "2026-09-13T08:20:00.000Z",
			data: null,
		});
		const result = project([note], {
			moments: [
				{
					id: "peak",
					occurredAt: at,
					hour: 8,
					kind: "heartPeak",
					title: "心跳加速",
					detail: "测量片段",
					bpm: 135,
					context: [],
					evidence: [],
				},
			],
		});
		const row = result.story.hours[8];
		expect(row).toBeDefined();
		if (!row) return;
		const entries = storyHourEntries(row, [
			{
				kind: "sunrise",
				occurredAt: "2026-09-13T08:10:00.000Z",
				hour: 8,
				clock: "08:10",
				label: "日出",
			},
		]);
		expect(entries.map((entry) => entry.kind)).toEqual(["solar", "health", "branch"]);
		expect(entries[1]).toMatchObject({
			kind: "health",
			at,
			health: { kind: "moment", moment: { bpm: 135 } },
		});
	});

	it("shows both repeated local-clock readings during a DST fall-back hour", () => {
		process.env.TZ = "America/New_York";
		const first = healthEvent("ecg-edt", "2026-11-01T05:30:00.000Z", {
			_healthKind: "Electrocardiogram",
		});
		const second = healthEvent("ecg-est", "2026-11-01T06:30:00.000Z", {
			_healthKind: "Electrocardiogram",
		});
		const result = project([second, first], {}, "2026-11-01");
		expect(localDayWindow("2026-11-01")).toEqual({
			start: "2026-11-01T04:00:00.000Z",
			end: "2026-11-02T05:00:00.000Z",
		});
		expect(result.story.hours[1]?.slot.state).toBe("repeated");
		expect(result.story.hours[1]?.health?.map((item) => item.id)).toEqual(["ecg-edt", "ecg-est"]);
		expect(result.items).toHaveLength(2);
	});
});
