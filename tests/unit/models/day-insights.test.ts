import { describe, expect, it } from "vitest";
import { buildDayInsights, createDayInsightsCollector } from "../../../src/models/day-insights";
import type { JsonValue, LifeEvent } from "../../../src/models/types";

const window = { start: "2026-09-13T00:00:00.000Z", end: "2026-09-14T00:00:00.000Z" };
let sequence = 0;
function event(data: JsonValue = null, changes: Partial<LifeEvent> = {}): LifeEvent {
	return {
		id: String(++sequence),
		sourceId: "apple-health",
		sourceName: "Apple Health",
		sourceKind: "import",
		occurredAt: window.start,
		endAt: null,
		precision: "second",
		title: "记录",
		content: "",
		data,
		updatedAt: window.start,
		...changes,
	};
}
function metric(type: string, value: JsonValue, unit: JsonValue, changes: Partial<LifeEvent> = {}) {
	return event({ type: `HKQuantityTypeIdentifier${type}`, value, unit }, changes);
}
function gps(time: string, data: JsonValue, changes: Partial<LifeEvent> = {}) {
	return event(data, { occurredAt: time, sourceId: "footprint", sourceName: "GPS", ...changes });
}

describe("daily GPS projection", () => {
	it("fits only real in-day points, deduplicates repeated events, and keeps source paths apart", () => {
		const first = gps("2026-09-13T01:00:00Z", {
			latitude: 31.23,
			longitude: 121.47,
			elevation: 12,
			speed: 2,
		});
		const second = gps("2026-09-13T01:10:00Z", { lat: "31.231", lon: "121.471", ele: "13" });
		const third = gps("2026-09-13T02:10:00Z", { latitude: 31.24, lng: 121.48 });
		const another = gps(
			"2026-09-13T01:11:00Z",
			{ latitude: 40, longitude: 115 },
			{ sourceId: "watch", sourceName: "Watch", sourceKind: "connect" },
		);
		const result = buildDayInsights([third, first, another, second, first], window);
		expect(result.eventCount).toBe(4);
		expect(result.gps.pointCount).toBe(4);
		expect(result.gps.segments.map((segment) => segment.length)).toEqual([2, 1, 1]);
		expect(result.gps.distanceMeters).toBeGreaterThan(100);
		expect(result.gps.distanceMeters).toBeLessThan(200);
		expect(result.gps.firstAt).toBe("2026-09-13T01:00:00.000Z");
		expect(result.gps.lastAt).toBe("2026-09-13T02:10:00.000Z");
		expect(result.gps.segments[0]?.[1]?.elevation).toBe(13);
	});
	it("accepts nested Connect points and raw GPX fields with explicit UTC times", () => {
		const records = [
			gps("2026-09-13T01:00:00Z", {
				points: [
					{ lat: 0, lon: 0, time: "2026-09-13T01:01Z" },
					{ lat: 0, lon: 0.01, ts: "2026-09-13T01:02:03Z" },
					{ lat: 0, lon: 0.02, timestamp: "2026-09-13T01:03:00" },
					{ lat: 0, lon: 0.03, occurredAt: "2026-09-13T01:04:00Z" },
				],
			}),
			gps("2026-09-13T02:00:00Z", { trackPoints: [{ lat: 1, lon: 1 }] }, { precision: "hour" }),
		];
		const result = buildDayInsights(records, window);
		expect(result.gps.pointCount).toBe(5);
		expect(result.gps.segments[0]?.[0]?.precision).toBe("minute");
		expect(result.gps.segments[0]?.[1]?.precision).toBe("second");
		expect(result.gps.segments[1]?.[0]?.precision).toBe("hour");
		const collector = createDayInsightsCollector(window);
		for (const record of records) collector.add(record);
		expect(collector.finish().gps).toEqual({ ...result.gps, segments: [] });
	});
	it("does not connect day-only locations, the date line, duplicate samples, or reversed timestamps", () => {
		const result = buildDayInsights(
			[
				gps(window.start, { latitude: 0, longitude: 0 }, { precision: "day" }),
				gps(window.start, { latitude: 0, longitude: 0 }),
				gps("2026-09-13T00:10:00Z", { latitude: 0, longitude: 179.99 }),
				gps("2026-09-13T00:20:00Z", { latitude: 0, longitude: -179.99 }),
				gps("2026-09-13T00:30:00Z", {
					points: [
						{ latitude: 1, longitude: 0, time: "2026-09-13" },
						{ latitude: 2, longitude: 0, time: "2026-09-13T01" },
					],
				}),
			],
			window,
		);
		expect(result.gps.pointCount).toBe(5);
		expect(result.gps.segments).toHaveLength(5);
		expect(result.gps.distanceMeters).toBe(0);
		expect(result.gps.segments[3]?.[0]?.precision).toBe("day");
		expect(result.gps.segments[4]?.[0]?.precision).toBe("hour");
	});
	it("ignores invalid coordinates/times and points beyond half-open day boundaries", () => {
		const invalid: JsonValue[] = [
			null,
			[],
			true,
			8,
			"text",
			{ lat: "", lon: 0 },
			{ lat: false, lon: 0 },
			{ lat: "x", lon: 0 },
			{ lat: 91, lon: 0 },
			{ lat: 0, lon: 181 },
			{ lat: 0, lon: " " },
			{ lat: 0, lon: null },
			{ lat: 0, lon: Infinity },
			{ lat: 0, lon: 0, time: "bad" },
			{ lat: 0, lon: 0, time: "2026-09-12T23:59Z" },
			{ lat: 0, lon: 0, time: window.end },
		];
		const result = buildDayInsights(
			invalid.map((data) => event({ points: [data] })),
			window,
		);
		expect(result.gps.pointCount).toBe(0);
		expect(result.gps.firstAt).toBeNull();
	});
});

describe("daily health and finance projection", () => {
	it("preserves missing vs zero, converts units, and clips quantity intervals at midnight", () => {
		const records = [
			metric("StepCount", "120", "count", {
				occurredAt: "2026-09-12T23:00:00Z",
				endAt: "2026-09-13T01:00:00Z",
			}),
			metric("StepCount", 0, "count"),
			metric("StepCount", -1, "count"),
			metric("StepCount", true, "count"),
			metric("StepCount", "bad", "count"),
			metric("StepCount", "", "count"),
			metric("StepCount", 100, "wrong"),
			metric("StepCount", 100, null),
			metric("StepCount", null, "count"),
			metric("DistanceWalkingRunning", 1.2, "km"),
			metric("FlightsClimbed", 3, "count"),
			metric("DietaryWater", "0.5", "L"),
			metric("DietaryWater", "250", "mL"),
			metric("ActiveEnergyBurned", 418.4, "kJ"),
			metric("AppleExerciseTime", 1800, "s"),
			metric("Unknown", 50, "count"),
		];
		const result = buildDayInsights(records, window).health;
		expect(result).toMatchObject({
			steps: 60,
			distanceMeters: 1200,
			flights: 3,
			waterMl: 750,
			exerciseMinutes: 30,
			standHours: null,
			sleepMinutes: null,
		});
		expect(result.energyKcal).toBeCloseTo(100);
		expect(buildDayInsights([], window).health.steps).toBeNull();
	});
	it("uses sleep unions instead of double counting overlapping devices and excludes awake/in-bed", () => {
		const sleep = (value: JsonValue, start: string, end: string) =>
			event(
				{ type: "HKCategoryTypeIdentifierSleepAnalysis", value },
				{ occurredAt: start, endAt: end },
			);
		const records = [
			sleep(
				"HKCategoryValueSleepAnalysisAsleepUnspecified",
				"2026-09-12T22:00:00Z",
				"2026-09-13T02:00:00Z",
			),
			sleep(
				"HKCategoryValueSleepAnalysisAsleepCore",
				"2026-09-13T01:00:00Z",
				"2026-09-13T03:00:00Z",
			),
			sleep(
				"HKCategoryValueSleepAnalysisAsleepCore",
				"2026-09-13T02:00:00Z",
				"2026-09-13T03:00:00Z",
			),
			sleep(4, "2026-09-13T03:00:00Z", "2026-09-13T04:00:00Z"),
			sleep("HKCategoryValueSleepAnalysisAwake", "2026-09-13T04:00:00Z", "2026-09-13T05:00:00Z"),
			sleep(null, "2026-09-13T05:00:00Z", "2026-09-13T06:00:00Z"),
		];
		const result = buildDayInsights(records, window).health;
		expect(result.sleepMinutes).toBe(240);
		expect(result.sleepStages).toEqual([
			{ name: "未分期", minutes: 120 },
			{ name: "核心", minutes: 120 },
			{ name: "深睡", minutes: 60 },
		]);
	});
	it("aggregates actual heart samples and prefers detailed activity over daily rings", () => {
		const activity = event(
			{
				dateComponents: "2026-09-13",
				activeEnergyBurned: "400",
				activeEnergyBurnedUnit: "kcal",
				appleExerciseTime: "40",
				appleStandHours: "12",
			},
			{ precision: "day" },
		);
		const records = [
			activity,
			metric("HeartRate", 60, "count/min"),
			metric("HeartRate", "100", "bpm"),
			metric("HeartRate", 0, "bpm"),
			metric("HeartRate", "bad", "bpm"),
			metric("ActiveEnergyBurned", 200, "kcal"),
			event(
				{
					type: "HKCategoryTypeIdentifierAppleStandHour",
					value: "HKCategoryValueAppleStandHourStood",
				},
				{ endAt: "2026-09-13T01:00:00Z" },
			),
			event(
				{ type: "HKCategoryTypeIdentifierAppleStandHour", value: 0 },
				{ endAt: "2026-09-13T01:00:00Z" },
			),
			event(
				{ type: "HKCategoryTypeIdentifierAppleStandHour", value: "0" },
				{ occurredAt: "2026-09-13T01:00:00Z", endAt: "2026-09-13T02:00:00Z" },
			),
			event({ type: "HKCategoryTypeIdentifierAppleStandHour", value: "idle" }),
			event({ type: "HKCategoryTypeIdentifierAppleStandHour", value: 0 }),
		];
		const collector = createDayInsightsCollector(window);
		for (const record of records) collector.add(record);
		expect(collector.finish().health).toMatchObject({
			energyKcal: 200,
			exerciseMinutes: 40,
			standHours: 2,
			heartRate: { average: 80, min: 60, max: 100, samples: 2 },
		});
		expect(collector.finish().health.heartRate?.average).toBe(80);
		expect(buildDayInsights([activity], window).health).toMatchObject({
			energyKcal: 400,
			standHours: 12,
		});
	});
	it("keeps workout duration in the day and proportionally clips its quantities", () => {
		const result = buildDayInsights(
			[
				event(
					{
						workoutActivityType: "HKWorkoutActivityTypeRunning",
						totalDistance: "10",
						totalDistanceUnit: "km",
						totalEnergyBurned: "400",
						totalEnergyBurnedUnit: "kcal",
					},
					{ occurredAt: "2026-09-12T23:00:00Z", endAt: "2026-09-13T01:00:00Z" },
				),
				event({ workoutActivityType: "Custom", duration: "15", durationUnit: "min" }),
				event({ workoutActivityType: "HKWorkoutActivityTypeYoga" }),
			],
			window,
		);
		expect(result.workoutCount).toBe(3);
		expect(result.workouts.find((workout) => workout.title === "跑步")).toMatchObject({
			durationMinutes: 60,
			distanceMeters: 5000,
			energyKcal: 200,
			occurredAt: window.start,
		});
		expect(result.workouts.find((workout) => workout.title === "Custom")?.durationMinutes).toBe(15);
		expect(result.workouts.find((workout) => workout.title === "瑜伽")?.durationMinutes).toBe(0);
		const many = buildDayInsights(
			Array.from({ length: 105 }, () =>
				event({ workoutActivityType: "HKWorkoutActivityTypeYoga" }),
			),
			window,
		);
		expect(many.workoutCount).toBe(105);
		expect(many.workouts).toHaveLength(100);
	});
	it("separates currencies, refunds, and transfers from income/expense", () => {
		const pixiu = (data: JsonValue) => event(data, { sourceId: "pixiu" });
		const result = buildDayInsights(
			[
				pixiu({ 币种: " cny ", 交易类型: "支出", 流出金额: "100.10" }),
				pixiu({ 币种: "CNY", 交易类型: "退款", 流出金额: "-20.10" }),
				pixiu({ 币种: "CNY", 交易类型: "收入", 流入金额: "1200" }),
				pixiu({ 币种: "CNY", 交易类型: "转账", 流入金额: "500", 流出金额: "500" }),
				pixiu({ 币种: "USD", 交易类型: "支出", 流出金额: "25" }),
				pixiu({ 币种: " ", 流入金额: "", 流出金额: "" }),
				pixiu({ 流入金额: "0" }),
			],
			window,
		);
		expect(result.finance.find((item) => item.currency === "CNY")).toEqual({
			currency: "CNY",
			income: 1200,
			expense: 80,
			transfers: 500,
			count: 4,
		});
		expect(result.finance.find((item) => item.currency === "USD")?.expense).toBe(25);
		expect(result.finance.find((item) => item.currency === "未注明币种")?.count).toBe(2);
	});
	it("keeps UTC windows independent of rendering and excludes invalid, adjacent, and non-overlapping days", () => {
		const records = [
			event(null, { occurredAt: "invalid" }),
			event(null, { endAt: "invalid" }),
			event(null, { occurredAt: "2026-09-12T00:00:00Z", precision: "day", endAt: window.end }),
			event(null, { occurredAt: window.end, precision: "day" }),
			event(null, { occurredAt: window.end }),
			event(null, { occurredAt: "2026-09-12T12:00:00Z", endAt: window.start }),
			event(null, { precision: "day", endAt: "2026-09-15T00:00:00Z" }),
			event([]),
			event("text"),
		];
		expect(buildDayInsights(records, window).eventCount).toBe(3);
		const shiftedWindow = { start: "2026-09-12T16:00:00Z", end: "2026-09-13T16:00:00Z" };
		expect(
			buildDayInsights(
				[metric("StepCount", 100, "count", { occurredAt: "2026-09-12T23:00:00Z" })],
				shiftedWindow,
			).health.steps,
		).toBe(100);
	});
});
