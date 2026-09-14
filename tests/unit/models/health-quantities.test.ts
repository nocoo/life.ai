import { describe, expect, it } from "vitest";
import { buildDayInsights } from "../../../src/models/day-insights";
import { buildHealthStory, type SleepNight } from "../../../src/models/health-insights";
import {
	applyHealthStoryInsights,
	type QuantitySample,
	quantitySample,
	sumSensorQuantity,
} from "../../../src/models/health-quantities";
import type { JsonValue, LifeEvent } from "../../../src/models/types";

const start = Date.UTC(2026, 8, 13);
const hour = 3_600_000;
const window = {
	start: new Date(start).toISOString(),
	end: new Date(start + 24 * hour).toISOString(),
};
function event(changes: Partial<LifeEvent> = {}): LifeEvent {
	return {
		id: "record",
		sourceId: "apple-health",
		sourceName: "Apple 健康",
		sourceKind: "import",
		occurredAt: window.start,
		endAt: null,
		precision: "second",
		title: "步数",
		content: "",
		data: null,
		updatedAt: window.start,
		...changes,
	};
}
function sample(
	from: number,
	to: number,
	value: number,
	changes: Partial<QuantitySample> = {},
): QuantitySample {
	return {
		start: start + from * hour,
		end: start + to * hour,
		value,
		priority: 1,
		source: "app",
		createdAt: 0,
		id: "sample",
		...changes,
	};
}

describe("health measurement provenance", () => {
	it("uses actual device/source metadata and normalizes export creation times to UTC", () => {
		const measured = quantitySample(
			event({
				endAt: new Date(start + hour).toISOString(),
				data: {
					sourceName: "手表",
					device: "Apple Watch",
					creationDate: "2026-09-13 08:00:00 +0800",
				},
			}),
			120,
		);
		expect(measured).toEqual({
			id: "record",
			start,
			end: start + hour,
			value: 120,
			priority: 3,
			source: "手表\0Apple Watch",
			createdAt: start,
		});
		expect(quantitySample(event({ data: { sourceName: "iPhone", device: 7 } }), 1).priority).toBe(
			2,
		);
		expect(
			quantitySample(event({ data: { sourceName: "计步", device: "手机" } }), 1).priority,
		).toBe(2);
	});
	it.each<JsonValue>([
		null,
		[],
		"unknown",
		{ sourceName: 8 },
		{ creationDate: "invalid" },
		{ creationDate: 10 },
	])("retains a sample with missing/malformed provenance: %j", (data) => {
		const measured = quantitySample(event({ data }), 12);
		expect(measured).toMatchObject({
			start,
			end: start,
			value: 12,
			priority: 1,
			source: "Apple 健康\0",
			createdAt: 0,
		});
	});
});

describe("overlap-aware sensor quantity integration", () => {
	it("uses wearable totals in overlaps and fills wearable gaps from the phone", () => {
		const samples = [
			sample(0, 4, 400, { priority: 2, source: "phone" }),
			sample(1, 3, 300, { priority: 3, source: "watch" }),
			sample(0, 4, 1000),
		];
		expect(sumSensorQuantity(samples, window)).toBe(500);
		expect(sumSensorQuantity([...samples].reverse(), window)).toBe(500);
	});
	it("clips crossing intervals at half-open day boundaries without dropping their in-day fraction", () => {
		expect(
			sumSensorQuantity(
				[sample(-1, 1, 200), sample(23, 25, 200), sample(24, 25, 100), sample(-1, 0, 100)],
				window,
			),
		).toBe(200);
	});
	it("prefers finer samples from the same source and the latest creation for an exact interval", () => {
		const measured = [
			sample(0, 4, 400),
			sample(1, 2, 150),
			sample(2, 3, 170, { createdAt: 1 }),
			sample(2, 3, 200, { createdAt: 2 }),
		];
		expect(sumSensorQuantity(measured, window)).toBe(550);
	});
	it("breaks equal-priority source and exact-duplicate ties deterministically", () => {
		const measures = [
			sample(0, 1, 300, { source: "z-source" }),
			sample(0, 1, 100, { source: "a-source", id: "a" }),
			sample(0, 1, 200, { source: "a-source", id: "z" }),
		];
		expect(sumSensorQuantity(measures, window)).toBe(100);
		expect(sumSensorQuantity(measures.reverse(), window)).toBe(100);
	});
	it("deduplicates instant readings and does not stack lower-priority points on intervals", () => {
		const measures = [
			sample(0, 1, 100, { priority: 2 }),
			sample(0.5, 0.5, 20, { priority: 1 }),
			sample(0.75, 0.75, 30, { priority: 3 }),
			sample(2, 2, 40, { priority: 3 }),
			sample(2, 2, 100, { priority: 1 }),
		];
		expect(sumSensorQuantity(measures, window)).toBe(170);
		expect(sumSensorQuantity([sample(-1, -1, 20), sample(24, 24, 20)], window)).toBeNull();
	});
	it("distinguishes missing from a measured zero and discards invalid sample boundaries/values", () => {
		expect(sumSensorQuantity([], window)).toBeNull();
		expect(sumSensorQuantity([sample(0, 1, 0)], window)).toBe(0);
		const invalid = [
			sample(0, 1, NaN),
			sample(0, 1, Infinity),
			sample(0, 1, -1),
			sample(0, 1, 3, { start: NaN }),
			sample(0, 1, 3, { end: NaN }),
			sample(2, 1, 10),
			sample(-2, -1, 10),
			sample(-1, 0, 10),
		];
		expect(sumSensorQuantity(invalid, window)).toBeNull();
	});
	it.each([
		{ start: "invalid", end: window.end },
		{ start: window.start, end: "invalid" },
		{ start: window.start, end: window.start },
		{ start: window.end, end: window.start },
	])("rejects invalid UTC reading windows: %j", (range) => {
		expect(sumSensorQuantity([sample(0, 1, 100)], range)).toBeNull();
	});
});

describe("shared timeline and summary totals", () => {
	it("retains legacy totals when detailed health narratives are absent", () => {
		const insights = buildDayInsights([], window);
		insights.health.sleepMinutes = 120;
		insights.workoutCount = 1;
		expect(applyHealthStoryInsights(insights, buildHealthStory([], window))).toBe(insights);
		expect(insights).toMatchObject({ workoutCount: 1, health: { sleepMinutes: 120 } });
	});
	it("uses full waking-day sleep, excludes awake/in-bed stages, and projects canonical workouts once", () => {
		const insights = buildDayInsights([], window);
		const health = buildHealthStory([], window);
		const night: SleepNight = {
			id: "sleep",
			fellAsleepAt: "2026-09-12T22:00:00Z",
			wokeAt: "2026-09-13T06:00:00Z",
			inBedMinutes: 500,
			asleepMinutes: 420,
			awakeMinutes: 60,
			stages: [
				{ kind: "core", label: "核心", minutes: 300 },
				{ kind: "deep", label: "深睡", minutes: 120 },
				{ kind: "awake", label: "清醒", minutes: 60 },
				{ kind: "inBed", label: "卧床", minutes: 500 },
			],
			timeline: [],
			sources: [],
			place: null,
			evidence: [],
		};
		health.nights = [
			night,
			{
				...night,
				id: "nap",
				asleepMinutes: 20,
				stages: [{ kind: "core", label: "核心", minutes: 20 }],
			},
		];
		const canonical = {
			id: "ride",
			eventId: "ride",
			activity: "Cycling",
			title: "骑行",
			sourceName: "Watch",
			startAt: "2026-09-13T08:00:00Z",
			endAt: "2026-09-13T09:00:00Z",
			durationMinutes: 50,
			distanceMeters: 16000,
			energyKcal: 320,
			statistics: [],
			routePaths: [],
			duplicateOf: null,
		};
		health.workouts = [
			{
				id: "ride-group",
				canonical,
				duplicates: [{ ...canonical, id: "copy", duplicateOf: "ride" }],
				overlapRatio: 1,
			},
		];
		applyHealthStoryInsights(insights, health);
		expect(insights.health).toMatchObject({
			sleepMinutes: 440,
			sleepStages: [
				{ name: "核心", minutes: 320 },
				{ name: "深睡", minutes: 120 },
			],
		});
		expect(insights.workoutCount).toBe(1);
		expect(insights.workouts).toEqual([
			{
				id: "ride",
				title: "骑行",
				occurredAt: canonical.startAt,
				endAt: canonical.endAt,
				precision: "second",
				durationMinutes: 50,
				distanceMeters: 16000,
				energyKcal: 320,
			},
		]);
	});
});
