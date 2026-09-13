import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDayInsights } from "../../../../src/models/day-insights";
import { buildDayTimeline } from "../../../../src/models/time";
import type { DayTimeline, LifeEvent } from "../../../../src/models/types";
import {
	buildDayStory,
	healthMetrics,
	heartTrace,
	storyDistance,
	storyKind,
} from "../../../../src/viewmodels/day-story";

const originalZone = process.env.TZ;

beforeEach(() => {
	process.env.TZ = "UTC";
});

afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
	vi.useRealTimers();
});

let idCounter = 0;
function makeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
	idCounter++;
	return {
		id: `evt-${idCounter}`,
		sourceId: "journal",
		sourceName: "日记",
		sourceKind: "import",
		occurredAt: "2026-09-13T08:00:00.000Z",
		endAt: null,
		precision: "second",
		title: "日常",
		content: "",
		data: null,
		updatedAt: "2026-09-13T08:00:00.000Z",
		...overrides,
	};
}

describe("storyKind classification", () => {
	it("classifies workout events when workoutActivityType is present", () => {
		const ev = makeEvent({
			data: { workoutActivityType: "HKWorkoutActivityTypeRunning", totalDistance: 5 },
		});
		expect(storyKind(ev)).toBe("workout");
	});

	it("classifies sleep events when HKCategoryTypeIdentifierSleepAnalysis is present", () => {
		const ev = makeEvent({
			data: { type: "HKCategoryTypeIdentifierSleepAnalysis", value: 3 },
		});
		expect(storyKind(ev)).toBe("sleep");
	});

	it("classifies Pixiu source as money", () => {
		const ev = makeEvent({
			sourceId: "pixiu",
			data: { 币种: "CNY", 流出金额: 42 },
		});
		expect(storyKind(ev)).toBe("money");
	});

	it("classifies footprint and events with coordinates or trackPoints as journey", () => {
		const evGpx = makeEvent({ sourceId: "footprint", data: {} });
		expect(storyKind(evGpx)).toBe("journey");

		const evPoints = makeEvent({
			sourceId: "custom",
			data: { points: [{ lat: 31.23, lon: 121.47 }] },
		});
		expect(storyKind(evPoints)).toBe("journey");

		const evTrackPoints = makeEvent({
			sourceId: "custom",
			data: { trackPoints: [{ latitude: 31.23, longitude: 121.47 }] },
		});
		expect(storyKind(evTrackPoints)).toBe("journey");

		const evCoords = makeEvent({
			sourceId: "custom",
			data: { lat: 39.9, lng: 116.4 },
		});
		expect(storyKind(evCoords)).toBe("journey");
	});

	it("classifies Apple Health and HK identifiers as health", () => {
		const evHealth = makeEvent({ sourceId: "apple-health", data: {} });
		expect(storyKind(evHealth)).toBe("health");

		const evHk = makeEvent({
			sourceId: "other",
			data: { type: "HKQuantityTypeIdentifierStepCount", value: 1000 },
		});
		expect(storyKind(evHk)).toBe("health");
	});

	it("classifies connect sourceKind as connect and others as note", () => {
		const evConnect = makeEvent({ sourceId: "conn-1", sourceKind: "connect" });
		expect(storyKind(evConnect)).toBe("connect");

		const evNote = makeEvent({ sourceId: "journal", sourceKind: "import", data: {} });
		expect(storyKind(evNote)).toBe("note");
	});
});

describe("storyDistance formatting", () => {
	it("formats meters below 1000m with m unit and rounding", () => {
		expect(storyDistance(0)).toBe("0 m");
		expect(storyDistance(499.4)).toBe("499 m");
		expect(storyDistance(999.6)).toBe("1000 m");
	});

	it("formats meters 1000m and above as km with two decimals", () => {
		expect(storyDistance(1000)).toBe("1.00 km");
		expect(storyDistance(5234.5)).toBe("5.23 km");
	});
});

describe("healthMetrics aggregation labels and units", () => {
	it("formats all present health metrics with proper labels and units", () => {
		const metrics = healthMetrics({
			steps: 10240,
			distanceMeters: 7500,
			flights: 15,
			waterMl: 1800,
			energyKcal: 450,
			exerciseMinutes: 45,
			standHours: 12,
			sleepMinutes: 450,
			sleepStages: [],
			heartRate: { average: 72.4, min: 58, max: 135, samples: 48 },
		});

		const map = new Map(metrics.map((m) => [m.label, m]));
		expect(map.get("步数")?.value).toBe("10240 步");
		expect(map.get("心率")?.value).toBe("72 bpm");
		expect(map.get("心率")?.detail).toBe("58–135 · 48 次测量");
		expect(map.get("步行距离")?.value).toBe("7.50 km");
		expect(map.get("活动能量")?.value).toBe("450 kcal");
		expect(map.get("饮水")?.value).toBe("1800 ml");
		expect(map.get("爬楼")?.value).toBe("15 层");
		expect(map.has("睡眠")).toBe(true);
		expect(map.has("锻炼")).toBe(true);
		expect(map.has("站立")).toBe(true);
	});

	it("omits null health metrics cleanly", () => {
		const metrics = healthMetrics({
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
		});
		expect(metrics).toEqual([]);
	});
});

describe("heartTrace SVG polyline generator", () => {
	it("returns null if fewer than 2 valid samples", () => {
		expect(heartTrace([])).toBeNull();

		const single = [
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 70, unit: "bpm" },
			}),
		];
		expect(heartTrace(single)).toBeNull();
	});

	it("filters out invalid, non-positive, or wrong unit values", () => {
		const events = [
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: -10, unit: "bpm" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 0, unit: "bpm" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: "invalid", unit: "bpm" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 75, unit: "wrong-unit" },
			}),
			makeEvent({
				data: { type: "OtherType", value: 80, unit: "bpm" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 65, unit: "count/min" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 85, unit: "bpm" },
			}),
		];
		const trace = heartTrace(events);
		expect(trace).not.toBeNull();
		const points = (trace as string).split(" ");
		expect(points).toHaveLength(2);
	});

	it("handles equal values gracefully with flat mid-line coordinate (y=18.0)", () => {
		const events = [
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 75, unit: "bpm" },
			}),
			makeEvent({
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 75, unit: "bpm" },
			}),
		];
		const trace = heartTrace(events);
		expect(trace).toBe("0.0,18.0 120.0,18.0");
	});

	it("caps sample vertices at 64 points when over 64 samples are supplied", () => {
		const events = Array.from({ length: 120 }, (_, i) =>
			makeEvent({
				data: {
					type: "HKQuantityTypeIdentifierHeartRate",
					value: 60 + (i % 30),
					unit: "bpm",
				},
			}),
		);
		const trace = heartTrace(events);
		expect(trace).not.toBeNull();
		const points = (trace as string).split(" ");
		expect(points).toHaveLength(64);
		expect(points[0]?.startsWith("0.0,")).toBe(true);
		expect(points.at(-1)?.startsWith("120.0,")).toBe(true);
	});
});

describe("buildDayStory comprehensive contract", () => {
	const day = "2026-09-13";

	it("groups high-frequency health records of the same source into a single branch while retaining raw events", () => {
		const events: LifeEvent[] = [
			makeEvent({
				id: "step-1",
				sourceId: "apple-health",
				sourceName: "Apple Health",
				occurredAt: "2026-09-13T08:10:00.000Z",
				title: "步数1",
				data: { type: "HKQuantityTypeIdentifierStepCount", value: 1200, unit: "count" },
			}),
			makeEvent({
				id: "step-2",
				sourceId: "apple-health",
				sourceName: "Apple Health",
				occurredAt: "2026-09-13T08:25:00.000Z",
				title: "步数2",
				data: { type: "HKQuantityTypeIdentifierStepCount", value: 800, unit: "count" },
			}),
			makeEvent({
				id: "hr-1",
				sourceId: "apple-health",
				sourceName: "Apple Health",
				occurredAt: "2026-09-13T08:15:00.000Z",
				title: "心率",
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 72, unit: "bpm" },
			}),
			makeEvent({
				id: "hr-2",
				sourceId: "apple-health",
				sourceName: "Apple Health",
				occurredAt: "2026-09-13T08:35:00.000Z",
				title: "心率",
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: 88, unit: "bpm" },
			}),
		];

		const timeline: DayTimeline = buildDayTimeline(day, events);
		const insights = buildDayInsights(events, timeline);
		const story = buildDayStory(timeline, insights);

		const hourSlot = story.hours.find((h) => h.slot.hour === 8);
		expect(hourSlot).toBeDefined();
		// Grouped into a single "health:apple-health" branch
		expect(hourSlot?.branches).toHaveLength(1);
		const branch = hourSlot?.branches[0];
		expect(branch?.id).toBe("health:apple-health");
		expect(branch?.kind).toBe("health");
		expect(branch?.title).toBe("身体记录");
		expect(branch?.events).toHaveLength(4);
		expect(branch?.events.map((e) => e.id)).toEqual(["step-1", "hr-1", "step-2", "hr-2"]);
		expect(branch?.metrics.some((m) => m.label === "步数" && m.value === "2000 步")).toBe(true);
		expect(branch?.heartTrace).not.toBeNull();
	});

	it("groups journey samples while preserving the recorded place title and route metrics", () => {
		const events: LifeEvent[] = [
			makeEvent({
				id: "gpx-1",
				sourceId: "footprint",
				sourceName: "GPS",
				occurredAt: "2026-09-13T09:05:00.000Z",
				title: "公园起点",
				data: { latitude: 31.23, longitude: 121.47 },
			}),
			makeEvent({
				id: "gpx-2",
				sourceId: "footprint",
				sourceName: "GPS",
				occurredAt: "2026-09-13T09:20:00.000Z",
				title: "定位2",
				data: { latitude: 31.24, longitude: 121.48 },
			}),
		];

		const timeline = buildDayTimeline(day, events);
		const insights = buildDayInsights(events, timeline);
		const story = buildDayStory(timeline, insights);

		const hour9 = story.hours.find((h) => h.slot.hour === 9);
		expect(hour9?.branches).toHaveLength(1);
		const branch = hour9?.branches[0];
		expect(branch?.kind).toBe("journey");
		expect(branch?.title).toBe("公园起点");
		expect(branch?.metrics.some((m) => m.label === "位置")).toBe(true);
		expect(branch?.metrics.some((m) => m.label === "记录轨迹")).toBe(true);
	});

	it("shows multi-hour event content only at anchor hour and marks continuing in subsequent hours", () => {
		const longEvent = makeEvent({
			id: "evt-sleep-long",
			sourceId: "apple-health",
			sourceName: "Apple Health",
			title: "夜间睡眠",
			occurredAt: "2026-09-13T01:00:00.000Z",
			endAt: "2026-09-13T04:30:00.000Z",
			data: {
				type: "HKCategoryTypeIdentifierSleepAnalysis",
				value: "HKCategoryValueSleepAnalysisAsleepCore",
			},
		});

		const timeline = buildDayTimeline(day, [longEvent]);
		const insights = buildDayInsights([longEvent], timeline);
		const story = buildDayStory(timeline, insights);

		// Anchor at hour 1
		const hour1 = story.hours.find((h) => h.slot.hour === 1);
		expect(hour1?.branches).toHaveLength(1);
		expect(hour1?.branches[0]?.id).toBe("sleep:apple-health");
		expect(hour1?.branches[0]?.title).toBe("睡眠");
		expect(hour1?.continuing).toHaveLength(0);

		// Continuing at hour 2, 3, 4
		for (const h of [2, 3, 4]) {
			const hourSlot = story.hours.find((s) => s.slot.hour === h);
			expect(hourSlot?.branches).toHaveLength(0); // content appears only once
			expect(hourSlot?.continuing).toHaveLength(1);
			expect(hourSlot?.continuing[0]).toEqual({
				id: "evt-sleep-long",
				title: "睡眠持续",
				kind: "sleep",
				side: "left",
				anchorHour: 1,
			});
		}

		// Hour 5 is past the interval
		const hour5 = story.hours.find((h) => h.slot.hour === 5);
		expect(hour5?.branches).toHaveLength(0);
		expect(hour5?.continuing).toHaveLength(0);
	});

	it("flags fromPreviousDay on branch when event started before day.start", () => {
		const crossMidnight = makeEvent({
			id: "evt-overnight",
			sourceId: "apple-health",
			sourceName: "Apple Health",
			title: "跨午夜睡眠",
			occurredAt: "2026-09-12T22:30:00.000Z",
			endAt: "2026-09-13T06:00:00.000Z",
			data: {
				type: "HKCategoryTypeIdentifierSleepAnalysis",
				value: 3,
			},
		});

		const timeline = buildDayTimeline(day, [crossMidnight]);
		const insights = buildDayInsights([crossMidnight], timeline);
		const story = buildDayStory(timeline, insights);

		const firstActive = story.hours.find((h) => h.branches.length > 0);
		expect(firstActive).toBeDefined();
		const branch = firstActive?.branches[0];
		expect(branch?.fromPreviousDay).toBe(true);
	});

	it("keeps date-only precision events in allDay and does not place them in hourly slots", () => {
		const dayEvent = makeEvent({
			id: "evt-all-day-journal",
			sourceId: "journal",
			title: "今日总结日志",
			occurredAt: "2026-09-13T00:00:00.000Z",
			precision: "day",
			data: null,
		});

		const timeline = buildDayTimeline(day, [dayEvent]);
		const insights = buildDayInsights([dayEvent], timeline);
		const story = buildDayStory(timeline, insights);

		// Hourly slots should have no branches
		for (const slot of story.hours) {
			expect(slot.branches).toHaveLength(0);
			expect(slot.continuing).toHaveLength(0);
		}

		// Placed in allDay
		expect(story.allDay).toHaveLength(1);
		expect(story.allDay[0]?.id).toBe("evt-all-day-journal");
		expect(story.allDay[0]?.kind).toBe("note");
		expect(story.allDay[0]?.period).toBeNull();
		expect(story.allDay[0]?.fromPreviousDay).toBe(false);
	});

	it("anchors mapHour to the earliest valid timed GPS point, and keeps it null if only date-only locations exist", () => {
		// Case 1: timed GPS point at 14:15 local time
		const timedGps = makeEvent({
			id: "gpx-timed",
			sourceId: "footprint",
			occurredAt: "2026-09-13T14:15:00.000Z",
			precision: "second",
			data: { latitude: 31.23, longitude: 121.47 },
		});
		const timeline1 = buildDayTimeline(day, [timedGps]);
		const insights1 = buildDayInsights([timedGps], timeline1);
		const story1 = buildDayStory(timeline1, insights1);

		const expectedHour = new Date("2026-09-13T14:15:00.000Z").getHours();
		expect(story1.mapHour).toBe(expectedHour);

		// Case 2: Only date-level precision GPS point
		const dateOnlyGps = makeEvent({
			id: "gpx-day-only",
			sourceId: "footprint",
			occurredAt: "2026-09-13T00:00:00.000Z",
			precision: "day",
			data: { latitude: 31.23, longitude: 121.47 },
		});
		const timeline2 = buildDayTimeline(day, [dateOnlyGps]);
		const insights2 = buildDayInsights([dateOnlyGps], timeline2);
		const story2 = buildDayStory(timeline2, insights2);

		expect(story2.mapHour).toBeNull();
	});

	it("preserves workout and finance categories with calculated metrics in story branches", () => {
		const workoutEv = makeEvent({
			id: "evt-run",
			sourceId: "apple-health",
			sourceName: "Apple Health",
			title: "晨跑训练",
			occurredAt: "2026-09-13T07:00:00.000Z",
			endAt: "2026-09-13T07:45:00.000Z",
			data: {
				workoutActivityType: "HKWorkoutActivityTypeRunning",
				totalDistance: 6.5,
				totalDistanceUnit: "km",
				totalEnergyBurned: 420,
				totalEnergyBurnedUnit: "kcal",
			},
		});

		const financeEv1 = makeEvent({
			id: "evt-pay",
			sourceId: "pixiu",
			sourceName: "Pixiu",
			title: "午餐支出",
			occurredAt: "2026-09-13T12:15:00.000Z",
			data: { 币种: "CNY", 交易类型: "支出", 流出金额: 68.5 },
		});

		const financeEv2 = makeEvent({
			id: "evt-transfer",
			sourceId: "pixiu",
			sourceName: "Pixiu",
			title: "理财转账",
			occurredAt: "2026-09-13T12:20:00.000Z",
			data: { 币种: "CNY", 交易类型: "转账", 流入金额: 500, 流出金额: 500 },
		});

		const all = [workoutEv, financeEv1, financeEv2];
		const timeline = buildDayTimeline(day, all);
		const insights = buildDayInsights(all, timeline);
		const story = buildDayStory(timeline, insights);

		// Workout branch in hour 7
		const hour7 = story.hours.find((h) => h.slot.hour === 7);
		const wBranch = hour7?.branches.find((b) => b.kind === "workout");
		expect(wBranch).toBeDefined();
		expect(wBranch?.side).toBe("right");
		expect(wBranch?.metrics.some((m) => m.label === "距离" && m.value === "6.50 km")).toBe(true);
		expect(wBranch?.metrics.some((m) => m.label === "消耗" && m.value === "420 kcal")).toBe(true);

		// Finance branches in hour 12 (individual branches per Pixiu transaction)
		const hour12 = story.hours.find((h) => h.slot.hour === 12);
		expect(hour12?.branches).toHaveLength(2);
		const payBranch = hour12?.branches.find((b) => b.id === "evt-pay");
		expect(payBranch).toBeDefined();
		expect(payBranch?.kind).toBe("money");
		expect(payBranch?.side).toBe("right");
		expect(payBranch?.metrics.some((m) => m.label.includes("支出") && m.value === "68.50")).toBe(
			true,
		);

		const transferBranch = hour12?.branches.find((b) => b.id === "evt-transfer");
		expect(transferBranch).toBeDefined();
		expect(transferBranch?.kind).toBe("money");
		expect(transferBranch?.side).toBe("right");
		expect(
			transferBranch?.metrics.some((m) => m.label.includes("转账") && m.value === "500.00"),
		).toBe(true);
	});
});
