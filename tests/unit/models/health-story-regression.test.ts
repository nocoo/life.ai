import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHealthStory } from "../../../src/models/health-insights";
import type { JsonValue, LifeEvent } from "../../../src/models/types";

const window = { start: "2026-09-13T00:00:00.000Z", end: "2026-09-14T00:00:00.000Z" };
const originalZone = process.env.TZ;

beforeEach(() => {
	process.env.TZ = "UTC";
});
afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

function event(id: string, at: string, data: JsonValue, endAt: string | null = null): LifeEvent {
	return {
		id,
		occurredAt: at,
		endAt,
		precision: "second",
		sourceId: "apple-health",
		sourceName: "Apple 健康",
		sourceKind: "import",
		title: "健康记录",
		content: "",
		data,
		updatedAt: window.end,
	};
}

function quantity(
	id: string,
	type: string,
	value: number,
	unit: string,
	at: string,
	end: string | null = null,
	sourceName = "Apple Watch",
): LifeEvent {
	return event(
		id,
		at,
		{
			type: `HKQuantityTypeIdentifier${type}`,
			value: String(value),
			unit,
			sourceName,
			_healthKind: "Record",
		},
		end,
	);
}

function workout(
	id: string,
	start: string,
	end: string,
	duration: number,
	sourceName = "Apple Watch",
): LifeEvent {
	return event(
		id,
		start,
		{
			_healthKind: "Workout",
			workoutActivityType: "HKWorkoutActivityTypeCycling",
			duration: String(duration),
			durationUnit: "min",
			sourceName,
		},
		end,
	);
}

function sleep(id: string, start: string, end: string, sourceName = "Apple Watch"): LifeEvent {
	return event(
		id,
		start,
		{
			_healthKind: "Record",
			type: "HKCategoryTypeIdentifierSleepAnalysis",
			value:
				sourceName === "Apple Watch"
					? "HKCategoryValueSleepAnalysisAsleepCore"
					: "HKCategoryValueSleepAnalysisAsleep",
			sourceName,
		},
		end,
	);
}

describe("hourly health activity regressions", () => {
	it("tells a step-only hour without requiring a distance estimate or inventing a GPS journey", () => {
		const story = buildHealthStory(
			[
				quantity(
					"indoor-steps",
					"StepCount",
					680,
					"count",
					"2026-09-13T09:15:00.000Z",
					"2026-09-13T09:25:00.000Z",
				),
			],
			window,
		);
		expect(story.day.steps).toBe(680);
		expect(story.day.distanceMeters).toBeNull();
		expect(story.moments).toEqual([
			expect.objectContaining({
				kind: "walk",
				occurredAt: "2026-09-13T09:00:00.000Z",
				hour: 9,
				detail: "680 步",
				context: [],
			}),
		]);
		expect(story.workouts).toEqual([]);
	});

	it("retains each active walking and climbing hour instead of reducing a day's movement to its largest hour", () => {
		const story = buildHealthStory(
			[
				quantity("morning-steps", "StepCount", 700, "count", "2026-09-13T08:10:00.000Z"),
				quantity(
					"morning-distance",
					"DistanceWalkingRunning",
					400,
					"m",
					"2026-09-13T08:15:00.000Z",
				),
				quantity("morning-stairs", "FlightsClimbed", 1, "count", "2026-09-13T08:18:00.000Z"),
				quantity("late-steps", "StepCount", 1100, "count", "2026-09-13T10:40:00.000Z"),
				quantity("noon-stairs", "FlightsClimbed", 2, "count", "2026-09-13T12:05:00.000Z"),
				quantity(
					"afternoon-distance",
					"DistanceWalkingRunning",
					0.5,
					"km",
					"2026-09-13T15:20:00.000Z",
				),
				quantity("small-stair-sample", "FlightsClimbed", 0.5, "count", "2026-09-13T16:10:00.000Z"),
			],
			window,
		);
		const walks = story.moments.filter((moment) => moment.kind === "walk");
		const climbs = story.moments.filter((moment) => moment.kind === "climb");
		expect(walks.map((moment) => [moment.hour, moment.detail])).toEqual([
			[8, "700 步 · 400 m"],
			[10, "1100 步"],
			[15, "500 m"],
		]);
		expect(climbs.map((moment) => moment.hour)).toEqual([8, 12]);
		expect(story.day).toMatchObject({ steps: 1800, distanceMeters: 900, flights: 3.5 });
		const instants = story.moments.map((moment) => Date.parse(moment.occurredAt));
		expect(instants).toEqual([...instants].sort((a, b) => a - b));
	});

	it("keeps low movement in daily totals while avoiding a card for every small sample", () => {
		const story = buildHealthStory(
			[
				quantity("quiet-steps", "StepCount", 299, "count", "2026-09-13T08:20:00.000Z"),
				quantity("quiet-distance", "DistanceWalkingRunning", 199, "m", "2026-09-13T08:25:00.000Z"),
				quantity("quiet-stairs", "FlightsClimbed", 0.9, "count", "2026-09-13T08:30:00.000Z"),
			],
			window,
		);
		expect(story.day).toMatchObject({ steps: 299, distanceMeters: 199, flights: 0.9 });
		expect(story.moments).toEqual([]);
		const boundary = buildHealthStory(
			[
				quantity("steps", "StepCount", 300, "count", "2026-09-13T09:20:00.000Z"),
				quantity("distance", "DistanceWalkingRunning", 200, "m", "2026-09-13T10:20:00.000Z"),
				quantity("stairs", "FlightsClimbed", 1, "count", "2026-09-13T11:20:00.000Z"),
			],
			window,
		);
		expect(boundary.moments.map((moment) => [moment.kind, moment.hour])).toEqual([
			["walk", 9],
			["walk", 10],
			["climb", 11],
		]);
	});

	it("distributes a cross-hour record into both hours and uses the selected sensor rather than stacking phone samples", () => {
		const start = "2026-09-13T09:50:00.000Z";
		const end = "2026-09-13T10:10:00.000Z";
		const story = buildHealthStory(
			[
				quantity("watch", "StepCount", 600, "count", start, end),
				quantity("phone", "StepCount", 560, "count", start, end, "iPhone"),
			],
			window,
		);
		expect(story.day.steps).toBe(600);
		expect(story.moments.map((moment) => [moment.occurredAt, moment.detail])).toEqual([
			["2026-09-13T09:00:00.000Z", "300 步"],
			["2026-09-13T10:00:00.000Z", "300 步"],
		]);
		const quiet = buildHealthStory(
			[
				quantity("watch-quiet", "StepCount", 250, "count", start, end),
				quantity("phone-larger", "StepCount", 2000, "count", start, end, "iPhone"),
			],
			window,
		);
		expect(quiet.day.steps).toBe(250);
		expect(quiet.moments).toEqual([]);
	});
});

describe("workout matching regressions", () => {
	it("does not mistake a small overlap of paused workouts for two copies of one workout", () => {
		const story = buildHealthStory(
			[
				workout("morning", "2026-09-13T09:00:00.000Z", "2026-09-13T10:00:00.000Z", 20),
				workout("later", "2026-09-13T09:40:00.000Z", "2026-09-13T10:40:00.000Z", 20, "cycling app"),
			],
			window,
		);
		expect(story.workouts).toHaveLength(2);
		expect(story.workouts.every((group) => group.duplicates.length === 0)).toBe(true);
		expect(story.workouts.map((group) => group.canonical.durationMinutes)).toEqual([20, 20]);
	});

	it("matches the same wall interval while preserving wearable active duration and a bounded overlap ratio", () => {
		const story = buildHealthStory(
			[
				workout("watch", "2026-09-13T09:00:00.000Z", "2026-09-13T10:00:00.000Z", 20),
				workout("app", "2026-09-13T09:00:00.000Z", "2026-09-13T10:00:00.000Z", 60, "cycling app"),
			],
			window,
		);
		expect(story.workouts).toHaveLength(1);
		expect(story.workouts[0]).toMatchObject({
			canonical: { id: "watch", durationMinutes: 20 },
			duplicates: [
				expect.objectContaining({ id: "app", duplicateOf: "watch", durationMinutes: 60 }),
			],
			overlapRatio: 1,
		});
	});

	it("preserves short sessions nested within a long workout while still identifying a full-session duplicate", () => {
		const events = [
			workout("long-watch", "2026-09-13T09:00:00.000Z", "2026-09-13T12:00:00.000Z", 120),
			workout(
				"long-app",
				"2026-09-13T09:01:00.000Z",
				"2026-09-13T11:59:00.000Z",
				178,
				"cycling app",
			),
			workout(
				"short-first",
				"2026-09-13T10:00:00.000Z",
				"2026-09-13T10:10:00.000Z",
				10,
				"interval recorder",
			),
			workout(
				"short-second",
				"2026-09-13T11:00:00.000Z",
				"2026-09-13T11:10:00.000Z",
				10,
				"interval recorder",
			),
		];
		const snapshot = structuredClone(events);
		const story = buildHealthStory(events, window);
		expect(story.workouts.map((group) => group.canonical.id)).toEqual([
			"long-watch",
			"short-first",
			"short-second",
		]);
		expect(story.workouts[0]?.duplicates.map((session) => session.id)).toEqual(["long-app"]);
		expect(story.workouts[0]?.overlapRatio).toBeCloseTo(178 / 180);
		expect(story.workouts.slice(1).every((group) => group.duplicates.length === 0)).toBe(true);
		expect(events).toEqual(snapshot);
	});
});

describe("sleep source and waking-day regressions", () => {
	it("uses the selected wearable's wake time even when an overlapping app record extends into the following day", () => {
		const events = [
			sleep("watch", "2026-09-13T20:00:00.000Z", "2026-09-13T23:45:00.000Z"),
			sleep("app", "2026-09-13T19:30:00.000Z", "2026-09-14T00:15:00.000Z", "AutoSleep"),
		];
		const snapshot = structuredClone(events);
		const story = buildHealthStory(events, window);
		expect(story.nights).toHaveLength(1);
		expect(story.sleep).toMatchObject({
			fellAsleepAt: "2026-09-13T20:00:00.000Z",
			wokeAt: "2026-09-13T23:45:00.000Z",
			asleepMinutes: 225,
		});
		expect(story.sleep?.sources).toContainEqual(
			expect.objectContaining({ sourceName: "Apple Watch", role: "selected" }),
		);
		expect(story.sleep?.sources).toContainEqual(
			expect.objectContaining({ sourceName: "AutoSleep", role: "overlap" }),
		);
		expect(story.bedtimes).toEqual([]);
		const tomorrow = buildHealthStory(events, {
			start: window.end,
			end: "2026-09-15T00:00:00.000Z",
		});
		expect(tomorrow.nights).toEqual([]);
		expect(events).toEqual(snapshot);
	});

	it("shows a bedtime today and the complete night tomorrow when the wearable actually wakes after midnight", () => {
		const events = [
			sleep("watch", "2026-09-13T20:00:00.000Z", "2026-09-14T00:15:00.000Z"),
			sleep("app", "2026-09-13T19:30:00.000Z", "2026-09-13T23:45:00.000Z", "AutoSleep"),
		];
		const today = buildHealthStory(events, window);
		expect(today.nights).toEqual([]);
		expect(today.bedtimes).toEqual([
			expect.objectContaining({ occurredAt: "2026-09-13T20:00:00.000Z", title: "今晚入睡" }),
		]);
		const tomorrow = buildHealthStory(events, {
			start: window.end,
			end: "2026-09-15T00:00:00.000Z",
		});
		expect(tomorrow.nights).toHaveLength(1);
		expect(tomorrow.sleep).toMatchObject({
			fellAsleepAt: "2026-09-13T20:00:00.000Z",
			wokeAt: "2026-09-14T00:15:00.000Z",
			asleepMinutes: 255,
		});
	});
});

describe("blood pressure timestamp regressions", () => {
	it.each(["Asia/Shanghai", "America/Los_Angeles"])(
		"treats offset-free child times as UTC while running in %s",
		(zone) => {
			process.env.TZ = zone;
			const at = "2026-09-13T09:15:30.000Z";
			const correlation = event("pressure", at, {
				_healthKind: "Correlation",
				type: "HKCorrelationTypeIdentifierBloodPressure",
				sourceName: "Omron",
				sourceVersion: "2",
				_healthChildren: [
					{
						name: "Record",
						attributes: {
							type: "HKQuantityTypeIdentifierBloodPressureSystolic",
							sourceName: "Omron",
							unit: "mmHg",
							value: "190",
							startDate: "2026-09-13 09:15:30 +0800",
						},
					},
					{
						name: "Record",
						attributes: {
							type: "HKQuantityTypeIdentifierBloodPressureSystolic",
							sourceName: "Omron",
							unit: "mmHg",
							value: "120",
							startDate: "2026-09-13 09:15:30",
						},
					},
					{
						name: "Record",
						attributes: {
							type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
							sourceName: "Omron",
							unit: "mmHg",
							value: "80",
							start_date: "2026-09-13T09:15:30",
						},
					},
				],
			});
			const explicitOffset = event("pressure-offset", "2026-09-13T10:15:30.000Z", {
				_healthKind: "Correlation",
				type: "HKCorrelationTypeIdentifierBloodPressure",
				sourceName: "Omron",
				_healthChildren: [
					{
						name: "Record",
						attributes: {
							type: "HKQuantityTypeIdentifierBloodPressureSystolic",
							unit: "mmHg",
							value: "118",
							startDate: "2026-09-13 18:15:30 +0800",
						},
					},
					{
						name: "Record",
						attributes: {
							type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
							unit: "mmHg",
							value: "79",
							startDate: "2026-09-13 03:15:30 -0700",
						},
					},
				],
			});
			const story = buildHealthStory([correlation, explicitOffset], window);
			expect(story.bloodPressure).toEqual([
				expect.objectContaining({
					id: "pressure",
					occurredAt: at,
					systolic: 120,
					diastolic: 80,
					sourceName: "Omron",
				}),
				expect.objectContaining({ id: "pressure-offset", systolic: 118, diastolic: 79 }),
			]);
		},
	);

	it("ignores malformed child dates instead of inventing a pair or failing the whole daily story", () => {
		const at = "2026-09-13T09:15:30.000Z";
		const story = buildHealthStory(
			[
				event("pressure", at, {
					_healthKind: "Correlation",
					type: "HKCorrelationTypeIdentifierBloodPressure",
					sourceName: "Omron",
					_healthChildren: [
						{
							name: "Record",
							attributes: {
								type: "HKQuantityTypeIdentifierBloodPressureSystolic",
								unit: "mmHg",
								value: "120",
								startDate: "2026-09-13 09:15:30",
							},
						},
						{
							name: "Record",
							attributes: {
								type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
								unit: "mmHg",
								value: "80",
								startDate: "2026-09-13 25:15:30",
							},
						},
					],
				}),
			],
			window,
		);
		expect(story.bloodPressure).toEqual([
			expect.objectContaining({ occurredAt: at, systolic: 120, diastolic: null }),
		]);
	});
});
