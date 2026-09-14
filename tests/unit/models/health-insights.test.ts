import { describe, expect, it } from "vitest";
import {
	buildHealthStory,
	ecgWaveformWindow,
	readHealthXml,
	resolveEcgHertz,
} from "../../../src/models/health-insights";
import type { JsonValue, LifeEvent } from "../../../src/models/types";

const window = { start: "2026-09-13T00:00:00.000Z", end: "2026-09-14T00:00:00.000Z" };
let sequence = 0;

function event(data: JsonValue, changes: Partial<LifeEvent> = {}): LifeEvent {
	const sourceId = changes.sourceId ?? "apple-health";
	const sensor = changes.sourceName;
	const record =
		data && typeof data === "object" && !Array.isArray(data)
			? {
					...(sourceId === "apple-health" && sensor && typeof data.sourceName !== "string"
						? { sourceName: sensor }
						: {}),
					...data,
				}
			: data;
	const { sourceName: _sensor, sourceId: _sourceId, ...rest } = changes;
	return {
		id: `evt-${++sequence}`,
		sourceKind: "import",
		occurredAt: window.start,
		endAt: null,
		precision: "second",
		title: "记录",
		content: "",
		data: record,
		updatedAt: window.start,
		...rest,
		sourceId,
		sourceName: sourceId === "apple-health" ? "Apple 健康" : (sensor ?? "GPS"),
	};
}

function sleep(
	value: string,
	start: string,
	end: string,
	sourceName = "Apple Watch",
	changes: Partial<LifeEvent> = {},
): LifeEvent {
	return event(
		{ type: "HKCategoryTypeIdentifierSleepAnalysis", value, _healthKind: "Record" },
		{ occurredAt: start, endAt: end, sourceName, title: "睡眠", ...changes },
	);
}

function quantity(
	type: string,
	value: JsonValue,
	unit: string,
	at: string,
	extra: Partial<LifeEvent> = {},
) {
	return event(
		{ type: `HKQuantityTypeIdentifier${type}`, value, unit, _healthKind: "Record" },
		{ occurredAt: at, ...extra },
	);
}

function gps(at: string, latitude: number, longitude: number): LifeEvent {
	return event(
		{ latitude, longitude, time: at },
		{ sourceId: "footprint", sourceName: "GPS", occurredAt: at, title: "轨迹" },
	);
}

describe("buildHealthStory sleep", () => {
	it("attributes a cross-midnight night to the wake-up day and does not split at 00:00", () => {
		const story = buildHealthStory(
			[
				sleep(
					"HKCategoryValueSleepAnalysisAsleepCore",
					"2026-09-12T21:50:00Z",
					"2026-09-12T22:00:00Z",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepCore",
					"2026-09-12T22:00:00Z",
					"2026-09-13T01:00:00Z",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepDeep",
					"2026-09-13T01:00:00Z",
					"2026-09-13T03:00:00Z",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepREM",
					"2026-09-13T03:30:00Z",
					"2026-09-13T06:00:00Z",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepCore",
					"2026-09-13T22:30:00Z",
					"2026-09-14T06:00:00Z",
				),
			],
			window,
		);
		expect(story.sleep?.fellAsleepAt).toBe("2026-09-12T21:50:00.000Z");
		expect(story.sleep?.wokeAt).toBe("2026-09-13T06:00:00.000Z");
		expect(story.sleep?.asleepMinutes).toBe(7 * 60 + 40);
		expect(story.nights).toHaveLength(1);
		expect(story.bedtimes).toEqual([
			{
				id: "bedtime-2026-09-13T22:30:00.000Z",
				occurredAt: "2026-09-13T22:30:00.000Z",
				title: "今晚入睡",
			},
		]);
		expect(story.sleep?.evidence.some((item) => item.includes("T21:50"))).toBe(false);
		expect(story.sleep?.timeline.map((item) => item.kind)).toEqual(["core", "deep", "rem"]);
		expect(Date.parse(story.sleep?.timeline[1]?.endAt ?? "")).toBeLessThan(
			Date.parse(story.sleep?.timeline[2]?.startAt ?? ""),
		);
	});

	it("keeps in-bed, asleep and awake distinct and does not add AutoSleep on top of Watch stages", () => {
		const story = buildHealthStory(
			[
				sleep(
					"HKCategoryValueSleepAnalysisInBed",
					"2026-09-12T21:30:00Z",
					"2026-09-13T06:30:00Z",
					"iPhone",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepCore",
					"2026-09-12T22:00:00Z",
					"2026-09-13T02:00:00Z",
				),
				sleep("HKCategoryValueSleepAnalysisAwake", "2026-09-13T02:00:00Z", "2026-09-13T02:20:00Z"),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepREM",
					"2026-09-13T02:20:00Z",
					"2026-09-13T06:00:00Z",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleep",
					"2026-09-12T22:00:00Z",
					"2026-09-13T06:00:00Z",
					"AutoSleep",
				),
			],
			window,
		);
		expect(story.sleep?.asleepMinutes).toBe(7 * 60 + 40);
		expect(story.sleep?.awakeMinutes).toBe(20);
		expect(story.sleep?.inBedMinutes).toBe(9 * 60);
		expect(story.sleep?.asleepMinutes).toBeLessThan(8 * 60 + 8 * 60);
		expect(
			story.sleep?.sources.some(
				(note) => note.detail.includes("AutoSleep") && note.detail.includes("没有重复计算"),
			),
		).toBe(true);
		expect(
			story.sleep?.sources.some(
				(note) => note.role === "selected" && note.sourceName === "Apple Watch",
			),
		).toBe(true);
	});

	it("infers a stay from nearby Footprint samples and stays silent without them", () => {
		const withPlace = buildHealthStory(
			[
				event(
					{
						type: "HKCategoryTypeIdentifierSleepAnalysis",
						value: "3",
						_healthKind: "Record",
						device: "Apple Watch",
					},
					{ occurredAt: "2026-09-12T23:00:00Z", endAt: "2026-09-13T06:00:00Z" },
				),
				gps("2026-09-12T22:50:00Z", 31.23, 121.47),
				gps("2026-09-12T23:10:00Z", 31.2304, 121.4703),
			],
			window,
		);
		expect(withPlace.sleep?.place?.sampleCount).toBe(2);
		expect(withPlace.sleep?.place?.summary).toContain("停留轨迹");
		expect(withPlace.sleep?.place?.summary).not.toMatch(/酒店|情绪/);
		const missing = buildHealthStory(
			[sleep("3", "2026-09-12T23:00:00Z", "2026-09-13T06:00:00Z")],
			window,
		);
		expect(missing.sleep?.place).toBeNull();
		expect(missing.sleep?.evidence.some((item) => item.includes("附近没有足够的轨迹"))).toBe(true);
		const scattered = buildHealthStory(
			[
				sleep("3", "2026-09-12T23:00:00Z", "2026-09-13T06:00:00Z"),
				gps("2026-09-12T22:50:00Z", 31.23, 121.47),
				gps("2026-09-12T23:10:00Z", 31.4, 121.7),
			],
			window,
		);
		expect(scattered.sleep?.place).toBeNull();
	});
});

describe("buildHealthStory day and moments", () => {
	it("summarizes vitals without inventing missing series", () => {
		const story = buildHealthStory(
			[
				quantity("OxygenSaturation", 0.97, "%", "2026-09-13T08:00:00Z"),
				quantity("OxygenSaturation", 96, "%", "2026-09-13T12:00:00Z"),
				quantity("RespiratoryRate", 14, "count/min", "2026-09-13T08:05:00Z"),
				quantity("HeartRateVariabilitySDNN", 42, "ms", "2026-09-13T08:06:00Z"),
				quantity("RestingHeartRate", 54, "count/min", "2026-09-13T07:00:00Z"),
				quantity("StepCount", 4000, "count", "2026-09-13T10:00:00Z"),
				quantity("DistanceWalkingRunning", 2.5, "km", "2026-09-13T10:00:00Z"),
				quantity("FlightsClimbed", 6, "count", "2026-09-13T10:10:00Z"),
				quantity("ActiveEnergyBurned", 320, "kcal", "2026-09-13T10:00:00Z"),
			],
			window,
		);
		expect(story.day.oxygen?.mean).toBeCloseTo(96.5);
		expect(story.day.respiratory?.mean).toBe(14);
		expect(story.day.hrv?.mean).toBe(42);
		expect(story.day.restingHeartRate).toBe(54);
		expect(story.day.steps).toBe(4000);
		expect(story.day.distanceMeters).toBe(2500);
		expect(story.day.flights).toBe(6);
		expect(story.sleep).toBeNull();
	});

	it("does not stack overlapping Watch and iPhone sensor totals when provider label is Apple 健康", () => {
		const story = buildHealthStory(
			[
				quantity("StepCount", 4000, "count", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "Apple Watch",
				}),
				quantity("StepCount", 3500, "count", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "iPhone",
				}),
				quantity("DistanceWalkingRunning", 800, "m", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "Apple Watch",
				}),
				quantity("DistanceWalkingRunning", 200, "m", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "iPhone",
				}),
				quantity("ActiveEnergyBurned", 120, "kcal", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "Apple Watch",
				}),
				quantity("ActiveEnergyBurned", 80, "kcal", "2026-09-13T10:00:00Z", {
					endAt: "2026-09-13T11:00:00Z",
					sourceName: "AutoSleep",
				}),
			],
			window,
		);
		expect(story.day.steps).toBe(4000);
		expect(story.day.distanceMeters).toBe(800);
		expect(story.day.energyKcal).toBe(120);
		expect(story.moments.some((item) => item.kind === "walk" && item.detail.includes("800"))).toBe(
			true,
		);
	});

	it("uses ActivitySummary energy only when no in-window energy samples exist", () => {
		const fallback = buildHealthStory(
			[
				event(
					{
						_healthKind: "ActivitySummary",
						activeEnergyBurned: "210",
						activeEnergyBurnedUnit: "kcal",
					},
					{ occurredAt: "2026-09-13T00:00:00Z", precision: "day" },
				),
			],
			window,
		);
		expect(fallback.day.energyKcal).toBe(210);
		const preferred = buildHealthStory(
			[
				quantity("ActiveEnergyBurned", 80, "kcal", "2026-09-13T11:00:00Z"),
				event(
					{
						_healthKind: "ActivitySummary",
						activeEnergyBurned: "210",
						activeEnergyBurnedUnit: "kcal",
					},
					{ occurredAt: "2026-09-13T00:00:00Z", precision: "day" },
				),
			],
			window,
		);
		expect(preferred.day.energyKcal).toBe(80);
	});

	it("builds heart peaks with workout and walk context, without medical language", () => {
		const story = buildHealthStory(
			[
				quantity("HeartRate", 70, "count/min", "2026-09-13T07:00:00Z"),
				quantity("HeartRate", 72, "count/min", "2026-09-13T07:10:00Z"),
				quantity("HeartRate", 148, "count/min", "2026-09-13T07:40:00Z"),
				quantity("DistanceWalkingRunning", 800, "m", "2026-09-13T07:40:00Z"),
				quantity("FlightsClimbed", 4, "count", "2026-09-13T07:41:00Z"),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeRunning",
						duration: 30,
						durationUnit: "min",
						totalDistance: 4000,
						totalDistanceUnit: "m",
						totalEnergyBurned: 280,
						totalEnergyBurnedUnit: "kcal",
					},
					{
						occurredAt: "2026-09-13T07:30:00Z",
						endAt: "2026-09-13T08:00:00Z",
						sourceName: "Apple Watch",
					},
				),
				gps("2026-09-13T07:35:00Z", 31.23, 121.47),
				gps("2026-09-13T07:50:00Z", 31.2305, 121.4704),
			],
			window,
		);
		const peak = story.moments.find((item) => item.kind === "heartPeak");
		expect(peak?.bpm).toBe(148);
		expect(peak?.context.some((item) => item.includes("跑步"))).toBe(true);
		expect(peak?.evidence.some((item) => item.includes("不是诊断"))).toBe(true);
		expect(story.moments.some((item) => item.kind === "walk")).toBe(true);
		expect(story.moments.some((item) => item.kind === "climb")).toBe(true);
		expect(story.day.heartRate?.max).toBe(148);
	});
});

describe("buildHealthStory workouts", () => {
	it("reads nested WorkoutStatistics and keeps overlapping Strava as a duplicate", () => {
		const children: JsonValue = [
			{
				name: "WorkoutStatistics",
				attributes: {
					type: "HKQuantityTypeIdentifierHeartRate",
					average: "142",
					unit: "count/min",
				},
			},
			{
				name: "MetadataEntry",
				attributes: { key: "HKIndoorWorkout", value: "0" },
				children: [
					{
						name: "WorkoutStatistics",
						attributes: {
							type: "HKQuantityTypeIdentifierActiveEnergyBurned",
							sum: "240",
							unit: "kcal",
						},
					},
					{
						name: "WorkoutRoute",
						children: [{ name: "FileReference", attributes: { path: "workout-routes/run.gpx" } }],
					},
				],
			},
		];
		const watch = event(
			{
				_healthKind: "Workout",
				workoutActivityType: "HKWorkoutActivityTypeRunning",
				duration: 32,
				durationUnit: "min",
				totalDistance: 5000,
				totalDistanceUnit: "m",
				totalEnergyBurned: 300,
				totalEnergyBurnedUnit: "kcal",
				_healthChildren: children,
			},
			{
				id: "watch-run",
				occurredAt: "2026-09-13T07:30:00Z",
				endAt: "2026-09-13T08:02:00Z",
				sourceName: "Apple Watch",
			},
		);
		const strava = event(
			{
				_healthKind: "Workout",
				workoutActivityType: "HKWorkoutActivityTypeRunning",
				duration: 31,
				durationUnit: "min",
				totalDistance: 4980,
				totalDistanceUnit: "m",
			},
			{
				id: "strava-run",
				occurredAt: "2026-09-13T07:31:00Z",
				endAt: "2026-09-13T08:02:00Z",
				sourceName: "Strava",
			},
		);
		const story = buildHealthStory([watch, strava, watch], window);
		expect(story.workouts).toHaveLength(1);
		expect(story.workouts[0]?.canonical.sourceName).toBe("Apple Watch");
		expect(story.workouts[0]?.duplicates.map((item) => item.sourceName)).toEqual(["Strava"]);
		expect(story.workouts[0]?.overlapRatio).toBeGreaterThan(0.65);
		expect(story.workouts[0]?.canonical.statistics.map((item) => item.label)).toEqual([
			"心率",
			"活动能量",
		]);
		expect(story.workouts[0]?.canonical.routePaths).toEqual(["workout-routes/run.gpx"]);
	});

	it("prefers exported active duration and fills distance from WorkoutStatistics", () => {
		const story = buildHealthStory(
			[
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeRunning",
						duration: 20,
						durationUnit: "min",
						_healthChildren: [
							{
								name: "WorkoutStatistics",
								attributes: {
									type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
									sum: "3.2",
									unit: "km",
								},
							},
							{
								name: "WorkoutStatistics",
								attributes: {
									type: "HKQuantityTypeIdentifierActiveEnergyBurned",
									sum: "180",
									unit: "kcal",
								},
							},
							{ name: "FileReference", attributes: { path: "routes/a.gpx" } },
							{ name: "FileReference", attributes: { path: "routes/a.gpx" } },
						],
					},
					{
						occurredAt: "2026-09-13T18:00:00Z",
						endAt: "2026-09-13T18:40:00Z",
						sourceName: "Apple Watch",
					},
				),
			],
			window,
		);
		expect(story.workouts[0]?.canonical.durationMinutes).toBe(20);
		expect(story.workouts[0]?.canonical.distanceMeters).toBe(3200);
		expect(story.workouts[0]?.canonical.energyKcal).toBe(180);
		expect(story.workouts[0]?.canonical.routePaths).toEqual(["routes/a.gpx"]);
		const paused = buildHealthStory(
			[
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeYoga",
						duration: 0,
						durationUnit: "min",
						_healthChildren: [{ name: "FileReference", attributes: { path: "  " } }],
					},
					{
						occurredAt: "2026-09-13T12:00:00Z",
						endAt: "2026-09-13T12:15:00Z",
						sourceName: "Apple Watch",
					},
				),
			],
			window,
		);
		expect(paused.workouts[0]?.canonical.durationMinutes).toBe(15);
		expect(paused.workouts[0]?.canonical.routePaths).toEqual([]);
	});

	it("does not merge different activities or non-overlapping sessions", () => {
		const story = buildHealthStory(
			[
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeYoga",
						duration: 20,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T09:00:00Z",
						endAt: "2026-09-13T09:20:00Z",
						sourceName: "Apple Watch",
					},
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeWalking",
						duration: 20,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T09:00:00Z",
						endAt: "2026-09-13T09:20:00Z",
						sourceName: "Strava",
					},
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeYoga",
						duration: 20,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T18:00:00Z",
						endAt: "2026-09-13T18:20:00Z",
						sourceName: "Strava",
					},
				),
			],
			window,
		);
		expect(story.workouts).toHaveLength(3);
		expect(story.workouts.every((group) => group.duplicates.length === 0)).toBe(true);
		const apps = buildHealthStory(
			[
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeCycling",
						duration: 40,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T14:00:00Z",
						endAt: "2026-09-13T14:40:00Z",
						sourceName: "Zwift",
					},
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeCycling",
						duration: 36,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T14:01:00Z",
						endAt: "2026-09-13T14:37:00Z",
						sourceName: "Peloton",
					},
				),
			],
			window,
		);
		expect(apps.workouts).toHaveLength(1);
		expect(apps.workouts[0]?.canonical.sourceName).toBe("Zwift");
	});
});

describe("buildHealthStory edges", () => {
	it("keeps a nap as a second night and ignores in-bed-only clusters", () => {
		const story = buildHealthStory(
			[
				sleep(
					"HKCategoryValueSleepAnalysisAsleepCore",
					"2026-09-12T22:00:00Z",
					"2026-09-13T06:00:00Z",
					"手表",
				),
				sleep(
					"HKCategoryValueSleepAnalysisAsleepUnspecified",
					"2026-09-13T13:00:00Z",
					"2026-09-13T13:40:00Z",
					"iPhone",
				),
				sleep(
					"HKCategoryValueSleepAnalysisInBed",
					"2026-09-13T20:00:00Z",
					"2026-09-13T20:20:00Z",
					"iPhone",
				),
			],
			window,
		);
		expect(story.nights).toHaveLength(2);
		expect(story.sleep?.asleepMinutes).toBe(8 * 60);
		expect(story.nights[1]?.asleepMinutes).toBe(40);
	});

	it("ignores unusable samples, unnamed workouts, and out-of-window vitals", () => {
		const story = buildHealthStory(
			[
				event(
					{ type: "HKCategoryTypeIdentifierSleepAnalysis", value: "1" },
					{ occurredAt: "bad", endAt: "bad" },
				),
				sleep("1", "2026-09-13T10:00:00Z", "2026-09-13T10:00:00Z"),
				event(
					{ type: "HKCategoryTypeIdentifierSleepAnalysis", value: "1" },
					{ sourceId: "journal", sourceName: "日记" },
				),
				event(
					{ latitude: 200, longitude: 0, time: "2026-09-13T10:00:00Z" },
					{ sourceId: "footprint" },
				),
				event(
					{
						points: [
							{ lat: "31.2", lon: "121.5", ts: "2026-09-13T10:01:00Z" },
							{ lat: "nope", lon: "121.5" },
						],
					},
					{ sourceId: "footprint", occurredAt: "2026-09-13T10:01:00Z" },
				),
				quantity("HeartRate", 80, "bpm", "2026-09-12T10:00:00Z"),
				quantity("HeartRateVariabilitySDNN", 0.04, "s", "2026-09-13T09:00:00Z"),
				quantity("StepCount", -3, "count", "2026-09-13T09:00:00Z"),
				quantity("OxygenSaturation", 0, "%", "2026-09-13T09:00:00Z"),
				event({ _healthKind: "Workout" }, { occurredAt: "2026-09-13T15:00:00Z" }),
				event(
					{ _healthKind: "Workout", duration: 12, durationUnit: "min" },
					{ occurredAt: "2026-09-13T16:00:00Z" },
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeCycling",
						duration: 40,
						durationUnit: "min",
						_healthChildren: [
							{
								name: "WorkoutStatistics",
								attributes: {
									type: "HKQuantityTypeIdentifierDistanceCycling",
									sum: "12",
									unit: "km",
								},
							},
							{
								name: "WorkoutStatistics",
								attributes: { type: "HKQuantityTypeIdentifierStepCount", sum: "0", unit: "count" },
							},
							{
								name: "WorkoutStatistics",
								attributes: {
									type: "HKQuantityTypeIdentifierSomethingElse",
									sum: "1",
									unit: "count",
								},
							},
							{
								name: "WorkoutStatistics",
								attributes: { type: "HKQuantityTypeIdentifierHeartRate" },
							},
						],
					},
					{
						occurredAt: "2026-09-13T17:00:00Z",
						endAt: "2026-09-13T17:40:00Z",
						sourceName: "Strava",
					},
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeCycling",
						duration: 35,
						durationUnit: "min",
					},
					{
						occurredAt: "2026-09-13T17:02:00Z",
						endAt: "2026-09-13T17:37:00Z",
						sourceName: "iPhone",
					},
				),
				event({ type: 12, value: 1 }, { occurredAt: "2026-09-13T11:00:00Z" }),
				event(null, { occurredAt: "2026-09-13T11:00:00Z" }),
			],
			window,
		);
		expect(story.sleep).toBeNull();
		expect(story.day.hrv?.mean).toBe(40);
		expect(story.day.steps).toBeNull();
		expect(story.workouts.some((group) => group.canonical.title === "骑行")).toBe(true);
		expect(
			story.workouts.some(
				(group) =>
					group.canonical.statistics.some((item) => item.label === "距离") ||
					group.duplicates.some((item) => item.statistics.some((stat) => stat.label === "距离")),
			),
		).toBe(true);
		expect(story.workouts.some((group) => group.canonical.title === "其他运动")).toBe(true);
	});

	it("clips spanning quantities and accepts alternate GPS/energy units", () => {
		const story = buildHealthStory(
			[
				quantity("DistanceWalkingRunning", 2, "mi", "2026-09-12T23:30:00Z", {
					endAt: "2026-09-13T00:30:00Z",
				}),
				quantity("ActiveEnergyBurned", 418.4, "kJ", "2026-09-13T12:00:00Z"),
				quantity("HeartRate", 90, "count/min", "2026-09-13T12:00:00Z"),
				quantity("RespiratoryRate", 12, "count/min", "2026-09-13T12:01:00Z"),
				event(
					{
						trackPoints: [{ latitude: 31.2, longitude: 121.5, timestamp: "2026-09-13T12:02:00Z" }],
					},
					{ sourceId: "footprint", occurredAt: "2026-09-13T12:02:00Z" },
				),
				event(
					{ type: "HKCorrelationTypeIdentifierFood", value: "1" },
					{ occurredAt: "2026-09-13T12:03:00Z" },
				),
			],
			window,
		);
		expect(story.day.distanceMeters).toBeCloseTo(1609.344);
		expect(story.day.energyKcal).toBeCloseTo(100);
		expect(story.moments.some((item) => item.kind === "heartPeak")).toBe(false);
	});

	it("records unmatched units, unknown sleep values, and a peak without extra context", () => {
		const story = buildHealthStory(
			[
				sleep("not-a-stage", "2026-09-12T22:00:00Z", "2026-09-13T06:00:00Z"),
				sleep("1", "2026-09-13T08:00:00Z", "2026-09-13T08:00:00Z"),
				quantity("DistanceWalkingRunning", 3, "parsec", "2026-09-13T10:00:00Z"),
				quantity("FlightsClimbed", 2, "floors", "2026-09-13T10:00:00Z"),
				quantity("ActiveEnergyBurned", 9, "joule", "2026-09-13T10:00:00Z"),
				quantity("HeartRate", 70, "count/min", "2026-09-13T11:00:00Z"),
				quantity("HeartRate", 71, "count/min", "2026-09-13T11:10:00Z"),
				quantity("HeartRate", 120, "count/min", "2026-09-13T11:20:00Z"),
				quantity("OxygenSaturation", "nope", "%", "2026-09-13T11:00:00Z"),
				quantity("RespiratoryRate", 10, "breaths", "2026-09-13T11:00:00Z"),
				quantity("HeartRateVariabilitySDNN", 9, "sec", "2026-09-13T11:00:00Z"),
				quantity("RestingHeartRate", 50, "hz", "2026-09-13T11:00:00Z"),
				quantity("DistanceWalkingRunning", 300, "m", "2026-09-13T04:00:00Z"),
				quantity("DistanceWalkingRunning", 250, "m", "2026-09-13T18:00:00Z"),
				quantity("FlightsClimbed", 2, "count", "2026-09-13T04:00:00Z"),
				quantity("FlightsClimbed", 1, "count", "2026-09-13T18:00:00Z"),
				gps("2026-09-13T04:05:00Z", 31.2, 121.5),
				gps("2026-09-13T04:10:00Z", 31.35, 121.7),
				event(
					{
						_healthKind: "ActivitySummary",
						activeEnergyBurned: "x",
						activeEnergyBurnedUnit: "kcal",
					},
					{ occurredAt: "2026-09-13T00:00:00Z", precision: "day" },
				),
				event(
					{ latitude: 31.2, lng: 121.5, occurredAt: "2026-09-13T12:00:00Z" },
					{ sourceId: "footprint", occurredAt: "2026-09-13T12:00:00Z" },
				),
				event(
					{ lat: 31.2, lon: 121.5, time: 12 },
					{ sourceId: "footprint", occurredAt: "not-a-time" },
				),
				event(
					{
						_healthKind: "Workout",
						workoutActivityType: "HKWorkoutActivityTypeRockClimbing",
						duration: 15,
						durationUnit: "min",
						_healthChildren: [
							{ name: "WorkoutStatistics", attributes: { sum: "3" } },
							{
								name: "WorkoutStatistics",
								attributes: { type: "HKQuantityTypeIdentifierStepCount", average: "8" },
							},
						],
					},
					{ occurredAt: "2026-09-13T19:00:00Z", endAt: "2026-09-13T19:15:00Z" },
				),
			],
			window,
		);
		expect(story.sleep).toBeNull();
		expect(story.day.distanceMeters).toBe(550);
		expect(story.day.flights).toBe(3);
		expect(story.day.energyKcal).toBeNull();
		expect(story.day.oxygen).toBeNull();
		expect(
			story.moments.some((item) => item.kind === "heartPeak" && item.context.length === 0),
		).toBe(true);
		expect(story.workouts.some((group) => group.canonical.title === "RockClimbing")).toBe(true);
	});
});

describe("buildHealthStory blood pressure", () => {
	it("pairs Correlation children and keeps duplicate top-level records on one reading", () => {
		const children: JsonValue = [
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierBloodPressureSystolic",
					value: "118",
					unit: "mmHg",
					sourceName: "Omron",
					startDate: "2026-09-13T08:00:00.000Z",
				},
			},
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
					value: "76",
					unit: "mmHg",
					sourceName: "Omron",
					startDate: "2026-09-13T08:00:00.000Z",
				},
			},
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
					value: "90",
					unit: "mmHg",
					sourceName: "Omron",
					startDate: "2026-09-13T09:00:00.000Z",
				},
			},
		];
		const story = buildHealthStory(
			[
				event(
					{
						_healthKind: "Correlation",
						type: "HKCorrelationTypeIdentifierBloodPressure",
						_healthChildren: children,
					},
					{ id: "bp-corr", occurredAt: "2026-09-13T08:00:00.000Z", sourceName: "Omron" },
				),
				quantity("BloodPressureSystolic", 118, "mmHg", "2026-09-13T08:00:00.000Z", {
					id: "bp-sys",
					sourceName: "Omron",
				}),
				quantity("BloodPressureDiastolic", 76, "mmHg", "2026-09-13T08:00:00.000Z", {
					id: "bp-dia",
					sourceName: "Omron",
				}),
			],
			window,
		);
		expect(story.bloodPressure).toHaveLength(1);
		expect(story.bloodPressure[0]).toMatchObject({
			systolic: 118,
			diastolic: 76,
			unit: "mmHg",
			sourceName: "Omron",
		});
		expect(story.bloodPressure[0]?.eventIds.sort()).toEqual(["bp-corr", "bp-dia", "bp-sys"]);
		expect(story.bloodPressure[0]?.diastolic).not.toBe(90);
	});

	it("does not pair different times or devices, and leaves ambiguous sides unknown", () => {
		const story = buildHealthStory(
			[
				quantity("BloodPressureSystolic", 120, "mmHg", "2026-09-13T10:00:00Z", {
					sourceName: "Omron",
				}),
				quantity("BloodPressureDiastolic", 80, "mmHg", "2026-09-13T10:05:00Z", {
					sourceName: "Omron",
				}),
				quantity("BloodPressureSystolic", 130, "mmHg", "2026-09-13T11:00:00Z", {
					sourceName: "Omron",
				}),
				quantity("BloodPressureDiastolic", 85, "mmHg", "2026-09-13T11:00:00Z", {
					sourceName: "Withings",
				}),
				quantity("BloodPressureSystolic", 16, "kPa", "2026-09-13T12:00:00Z", {
					sourceName: "Clinic",
				}),
				quantity("BloodPressureDiastolic", 10, "kPa", "2026-09-13T12:00:00Z", {
					sourceName: "Clinic",
				}),
				quantity("BloodPressureSystolic", 110, "mmHg", "2026-09-13T13:00:00Z", {
					id: "sys-a",
					sourceName: "Omron",
				}),
				quantity("BloodPressureSystolic", 112, "mmHg", "2026-09-13T13:00:00Z", {
					id: "sys-b",
					sourceName: "Omron",
				}),
				quantity("BloodPressureDiastolic", 70, "mmHg", "2026-09-13T13:00:00Z", {
					sourceName: "Omron",
				}),
			],
			window,
		);
		expect(story.bloodPressure.some((item) => item.systolic === 120 && item.diastolic === 80)).toBe(
			false,
		);
		expect(story.bloodPressure.some((item) => item.systolic === 130 && item.diastolic === 85)).toBe(
			false,
		);
		const kpa = story.bloodPressure.find((item) => item.sourceName === "Clinic");
		expect(kpa?.systolic).toBeCloseTo(120, 0);
		expect(kpa?.diastolic).toBeCloseTo(75, 0);
		expect(
			story.bloodPressure.filter((item) => item.occurredAt === "2026-09-13T13:00:00.000Z"),
		).toHaveLength(3);
		expect(
			story.bloodPressure.every(
				(item) =>
					item.occurredAt !== "2026-09-13T13:00:00.000Z" ||
					item.systolic === null ||
					item.diastolic === null,
			),
		).toBe(true);
	});

	it("rejects Correlation children from another device and keeps a lone systolic unknown", () => {
		const story = buildHealthStory(
			[
				event(
					{
						_healthKind: "Correlation",
						type: "HKCorrelationTypeIdentifierBloodPressure",
						sourceVersion: "1",
						_healthChildren: [
							{
								name: "MetadataEntry",
								attributes: { key: "HKWasUserEntered", value: "0" },
							},
							{
								name: "Record",
								attributes: {
									type: "HKQuantityTypeIdentifierBloodPressureSystolic",
									value: "125",
									unit: "mmhg",
									sourceName: "Omron",
									sourceVersion: "2",
									startDate: "2026-09-13T08:00:00.000Z",
								},
							},
							{
								name: "Record",
								attributes: { value: "80", unit: "mmHg" },
							},
							{
								name: "Record",
								attributes: {
									type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
									value: "70",
									unit: "mmHg",
									start_date: "not-a-date",
								},
							},
						],
					},
					{ occurredAt: "2026-09-13T08:00:00.000Z", sourceName: "Omron" },
				),
				event(
					{
						_healthKind: "Correlation",
						type: "HKCorrelationTypeIdentifierBloodPressure",
					},
					{ occurredAt: "not-a-time", sourceName: "Omron" },
				),
				quantity("BloodPressureSystolic", 108, "mmHg", "2026-09-13T15:00:00Z", {
					sourceName: "Omron",
				}),
				quantity("BloodPressureSystolic", 90, "psi", "2026-09-13T16:00:00Z", {
					sourceName: "Omron",
				}),
				event(
					{
						_healthKind: "Correlation",
						type: "HKCorrelationTypeIdentifierBloodPressure",
						_healthChildren: [
							{
								name: "Record",
								attributes: {
									type: "HKQuantityTypeIdentifierBloodPressureSystolic",
									value: "111",
									unit: "",
								},
							},
							{
								name: "Record",
								attributes: {
									type: "HKQuantityTypeIdentifierBloodPressureDiastolic",
									value: "9.3",
									unit: "kpa",
								},
							},
						],
					},
					{ occurredAt: "2026-09-13T17:00:00.000Z", sourceName: "Clinic" },
				),
			],
			window,
		);
		expect(story.bloodPressure.some((item) => item.systolic === 125)).toBe(false);
		expect(
			story.bloodPressure.some(
				(item) => item.systolic === 108 && item.diastolic === null && item.unit === "mmHg",
			),
		).toBe(true);
		expect(story.bloodPressure.some((item) => item.systolic === 90)).toBe(false);
		expect(
			story.bloodPressure.some(
				(item) => item.systolic === 111 && item.diastolic !== null && item.sourceName === "Clinic",
			),
		).toBe(true);
	});
});

describe("buildHealthStory electrocardiogram", () => {
	it("keeps ECG metadata strings and does not invent a diagnosis", () => {
		const story = buildHealthStory(
			[
				event(
					{
						_healthKind: "Electrocardiogram",
						type: "Electrocardiogram",
						filePath: "electrocardiograms/ecg_2026-09-13.csv",
						samplingHz: "512",
						classification: "HKElectrocardiogramClassificationSinusRhythm",
						averageHeartRate: "64",
						unit: "µV",
						durationSeconds: "30",
						sampleCount: "15360",
					},
					{ id: "ecg-1", occurredAt: "2026-09-13T07:12:00.000Z" },
				),
				event(
					{
						_healthKind: "Electrocardiogram",
						type: "Electrocardiogram",
						filePath: "electrocardiograms/ecg_blank.csv",
						samplingHz: "512",
						classification: "",
						averageHeartRate: "",
						unit: "",
						durationSeconds: "",
						sampleCount: "",
					},
					{ id: "ecg-2", occurredAt: "2026-09-13T21:00:00.000Z" },
				),
				event(
					{
						_healthKind: "Electrocardiogram",
						type: "Electrocardiogram",
						filePath: "skip.csv",
						classification: "AtrialFibrillation",
					},
					{ occurredAt: "2026-09-14T00:00:00.000Z" },
				),
			],
			window,
		);
		expect(story.ecg).toHaveLength(2);
		expect(story.ecg[0]).toMatchObject({
			filePath: "electrocardiograms/ecg_2026-09-13.csv",
			samplingHz: "512",
			classification: "HKElectrocardiogramClassificationSinusRhythm",
			classificationLabel: "窦性心律",
			averageHeartRate: "64",
			durationSeconds: "30",
		});
		expect(story.ecg[0]?.evidence.some((item) => item.includes("不是诊断"))).toBe(true);
		expect(story.ecg[1]?.classificationLabel).toBe("未知");
		expect(story.ecg[1]?.evidence.some((item) => item.includes("分类未知"))).toBe(true);
		const labeled = buildHealthStory(
			[
				event(
					{
						type: "Electrocardiogram",
						classification: "InconclusivePoorReading",
						samplingHz: "512",
					},
					{ occurredAt: "2026-09-13T06:00:00.000Z" },
				),
			],
			window,
		);
		expect(labeled.ecg[0]?.classificationLabel).toBe("无法判定（信号不足）");
	});

	it("keeps every original sample in a 5-second ECG window, including spikes", () => {
		const hz = 512;
		const values = Array.from({ length: hz * 30 }, (_, index) => index % 17);
		values[1001] = 900;
		const first = ecgWaveformWindow(values, hz, 0);
		expect(first?.pages).toBe(6);
		expect(first?.samples).toHaveLength(hz * 5);
		expect(first?.samples[1001]).toBe(900);
		expect(first?.startSecond).toBe(0);
		expect(first?.endSecond).toBe(5);
		const last = ecgWaveformWindow(values, hz, 99);
		expect(last?.page).toBe(5);
		expect(last?.startSecond).toBe(25);
		expect(last?.samples.at(-1)).toBe(values.at(-1));
		expect(resolveEcgHertz(null, 15360, "30")).toBe(512);
		expect(resolveEcgHertz(512, 10, null)).toBe(512);
		expect(resolveEcgHertz("0", 100, 2)).toBe(50);
		expect(resolveEcgHertz(undefined, 1, 0)).toBeNull();
		expect(ecgWaveformWindow([1], 512, 0)).toBeNull();
		expect(ecgWaveformWindow(values, 512, -1)?.page).toBe(0);
		expect(ecgWaveformWindow(values, 512, 0, 0)).toBeNull();
		expect(ecgWaveformWindow(values.slice(0, 2561), 512, 1)).toBeNull();
	});
});

describe("readHealthXml", () => {
	it("keeps named nodes and ignores malformed children", () => {
		expect(readHealthXml("nope")).toEqual([]);
		expect(
			readHealthXml([
				{ name: "WorkoutStatistics", attributes: { unit: "kcal" }, text: "240" },
				{ name: 1, attributes: {} },
				{
					name: "Wrapper",
					attributes: { keep: "yes", skip: 2 },
					children: [{ name: "Child", attributes: {} }],
				},
			]),
		).toMatchObject([
			{ name: "WorkoutStatistics", text: "240" },
			{ name: "Wrapper", attributes: { keep: "yes" }, children: [{ name: "Child" }] },
		]);
	});
});
