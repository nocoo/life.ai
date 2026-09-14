import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDayInsights } from "../../../../src/models/day-insights";
import { buildDayTimeline } from "../../../../src/models/time";
import type { DayTimeline, LifeEvent } from "../../../../src/models/types";
import {
	buildDayStory,
	healthMetrics,
	heartTrace,
	storyDistance,
	storyHourBlocks,
	storyHourEntries,
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
	it("renders validated computer and article payloads as distinct narrative cards", () => {
		const events = [
			makeEvent({
				sourceId: "gecko",
				sourceKind: "external",
				data: {
					type: "computer-activity",
					activeSeconds: 1200,
					sessionCount: 2,
					apps: [{ name: "Editor", seconds: 1200, titles: ["Life.ai"] }],
				},
			}),
			makeEvent({
				sourceId: "firefly",
				sourceKind: "external",
				data: {
					type: "published-article",
					url: "https://lizheng.blog/2026/09/article",
					image: null,
					author: "作者",
				},
			}),
			makeEvent({
				sourceId: "github",
				sourceKind: "external",
				data: {
					type: "github-activity",
					account: { id: 7, login: "fixture" },
					repository: "fixture/app",
					url: "https://github.com/fixture/app/pull/1",
					action: "opened",
					number: 1,
					state: "open",
				},
			}),
		];
		const timeline = buildDayTimeline("2026-09-13", events);
		const story = buildDayStory(timeline, buildDayInsights(events, timeline));
		const branches = story.hours.flatMap((hour) => hour.branches);
		expect(branches.map((branch) => branch.kind)).toEqual(["computer", "article", "github"]);
		expect(branches[0]?.computer?.apps[0]?.name).toBe("Editor");
		expect(branches[1]?.article?.author).toBe("作者");
		expect(branches[2]?.github?.[0]?.activity.repository).toBe("fixture/app");
	});
	it("groups GitHub within each hour, counts unique PRs per repository and preserves every action and body", () => {
		const github = (
			minute: number,
			action: "commit" | "opened" | "merged" | "issue-opened" | "issue-closed" | "released",
			repository = "fixture/app",
		) =>
			makeEvent({
				sourceId: "github",
				sourceKind: "external",
				occurredAt: new Date(Date.parse("2026-09-13T08:00:00Z") + minute * 60_000).toISOString(),
				content: `Complete description ${minute}`,
				data: {
					type: "github-activity",
					account: { id: 7, login: "fixture" },
					repository,
					url: `https://github.com/${repository}/pull/1`,
					action,
					number: 1,
				},
			});
		const events = [
			github(2, "commit"),
			github(5, "opened"),
			github(9, "merged"),
			github(20, "opened", "fixture/other"),
			github(35, "commit"),
			github(40, "issue-opened"),
			github(45, "issue-closed"),
			github(50, "released"),
			github(60, "commit"),
		];
		const original = JSON.stringify(events);
		const timeline = buildDayTimeline("2026-09-13", events);
		const story = buildDayStory(timeline, buildDayInsights(events, timeline));
		expect(story.hours[8]?.branches).toHaveLength(1);
		const group = story.hours[8]?.branches[0];
		expect(group?.title).toBe("8 条动态 · 2 个仓库");
		expect(group?.metrics).toEqual([
			{ label: "Commit", value: "2" },
			{ label: "PR", value: "2" },
			{ label: "Issue", value: "1" },
			{ label: "Release", value: "1" },
		]);
		expect(group?.github?.map((item) => item.event)).toEqual(events.slice(0, 8));
		expect(story.hours[9]?.branches[0]?.events).toEqual(events.slice(8));
		expect(JSON.stringify(events)).toBe(original);
	});
	it("anchors cross-hour movement once with a continuation and keeps each map inside its hour", () => {
		const events = Array.from({ length: 11 }, (_, i) =>
			makeEvent({
				sourceId: "footprint",
				occurredAt: new Date(Date.parse("2026-09-13T08:55:00Z") + i * 60000).toISOString(),
				data: { latitude: 0, longitude: i * 0.01 },
			}),
		);
		const timeline = buildDayTimeline("2026-09-13", events);
		const story = buildDayStory(
			timeline,
			buildDayInsights(events, timeline),
			5,
			[],
			[
				{ id: "home", label: "家", latitude: 0, longitude: 0, radiusMeters: 100 },
				{ id: "work", label: "公司", latitude: 0, longitude: 0.1, radiusMeters: 100 },
			],
		);
		expect(story.hours[8]?.journeys).toHaveLength(1);
		expect(story.hours[8]?.journeys?.[0]?.commute).toBe("outbound");
		expect(story.hours.flatMap((hour) => hour.journeys ?? [])).toHaveLength(1);
		expect(story.hours[9]?.continuing).toContainEqual(
			expect.objectContaining({ anchorHour: 8, title: "可能的通勤持续" }),
		);
		const row = story.hours[8];
		if (!row) throw new Error("hour missing");
		expect(storyHourEntries(row, []).filter((entry) => entry.kind === "travel")).toHaveLength(1);
		for (const hour of story.hours)
			for (const visit of hour.visits)
				expect(
					visit.map.gps.segments
						.flat()
						.every((point) => new Date(point.occurredAt).getUTCHours() === hour.slot.hour),
				).toBe(true);
	});
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

	it("projects journey samples into an hourly visit without duplicating journey branches", () => {
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
		expect(hour9?.branches).toHaveLength(0);
		expect(hour9?.visits).toHaveLength(1);
		const visit = hour9?.visits[0];
		expect(visit?.visit.pointCount).toBe(2);
		expect(visit?.map.gps.distanceMeters).toBeGreaterThan(1000);
		expect(visit?.visit.observedMinutes).toBe(15);
		expect(hour9?.branches).toHaveLength(0);
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

	it("anchors a visit to its first timed GPS observation and keeps date-only locations in metadata", () => {
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
		expect(story1.hours[expectedHour]?.visits[0]?.visit.startAt).toBe(timedGps.occurredAt);

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

		expect(story2.hours.every((hour) => hour.visits.length === 0)).toBe(true);
		expect(story2.allDay[0]?.insights.gps.pointCount).toBe(1);
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

describe("GPS and solar chronology", () => {
	function gps(clock: string, longitude: number): LifeEvent {
		return makeEvent({
			sourceId: "footprint",
			occurredAt: `2026-09-13T${clock}:00.000Z`,
			data: { latitude: 0, longitude },
		});
	}
	function storyFor(events: LifeEvent[]) {
		const timeline = buildDayTimeline("2026-09-13", events);
		return buildDayStory(timeline, buildDayInsights(events, timeline));
	}
	it("combines a continuous hourly journey, preserves cross-area edges and every A → B → A visit", () => {
		const events = [
			gps("08:00", 0),
			gps("08:10", 0.01),
			gps("08:20", 0.07),
			gps("08:30", 0.08),
			gps("08:40", 0.01),
			gps("08:50", 0),
		];
		const story = storyFor(events);
		const item = story.hours[8]?.visits[0];
		expect(story.places.visits.map((visit) => visit.placeIndex)).toEqual([1, 2, 1]);
		expect(story.hours[8]?.visits).toHaveLength(1);
		expect(item?.stops.map((stop) => stop.placeIndex)).toEqual([1, 2, 1]);
		expect(item?.visit.pointCount).toBe(6);
		expect(item?.map.gps.segments.map((segment) => segment.length)).toEqual([6]);
		expect(item?.map.gps.distanceMeters).toBeGreaterThan(17_000);
		expect(item?.visit.observedMinutes).toBe(50);
		expect(item?.title).toBe("沿途经过 2 个区域");
		expect(item?.repeatedPlace).toBe(false);
	});
	it("splits same-area observations into sampled hours without filling gaps or claiming a stay", () => {
		const events = [
			gps("08:00", 0),
			gps("08:10", 0.0001),
			gps("09:00", 0.0002),
			gps("09:10", 0.0003),
			gps("12:00", 0.0004),
		];
		const story = storyFor(events);
		const maps = story.hours.flatMap((hour) => hour.visits);
		expect(maps.map((item) => item.repeatedPlace)).toEqual([false, true, true]);
		expect(maps.map((item) => item.visit.pointCount)).toEqual([2, 2, 1]);
		expect(maps.map((item) => item.visit.observedMinutes)).toEqual([10, 10, 0]);
		expect(maps.map((item) => item.period)).toEqual([
			"08:00:00 — 08:10:00",
			"09:00:00 — 09:10:00",
			"12:00:00",
		]);
		expect(maps.map((item) => item.stops[0]?.clock)).toEqual(["08:00:00", "09:00:00", "12:00:00"]);
		expect(new Set(maps.map((item) => item.visit.id)).size).toBe(3);
		expect(story.hours[10]?.visits).toEqual([]);
		expect(story.hours[11]?.visits).toEqual([]);
		expect(story.hours.every((hour) => hour.continuing.length === 0)).toBe(true);
		expect(story.hours[12]?.visits[0]?.title).toBe("同一区域采样 · 区域 1 附近");
		expect(story.places.visits).toHaveLength(1);
	});
	it("expands a returning area again and folds only its following same-area observation", () => {
		const story = storyFor([
			gps("08:00", 0),
			gps("09:00", 0.1),
			gps("10:00", 0),
			gps("11:00", 0.001),
		]);
		expect(story.hours.flatMap((hour) => hour.visits).map((item) => item.repeatedPlace)).toEqual([
			false,
			false,
			false,
			true,
		]);
		expect(story.hours[10]?.visits[0]?.title).toBe("位置采样 · 区域 1 附近");
		expect(story.hours[11]?.visits[0]?.title).toBe("同一区域采样 · 区域 1 附近");
		expect(
			story.hours
				.flatMap((hour) => hour.visits)
				.reduce((sum, item) => sum + item.visit.pointCount, 0),
		).toBe(4);
		expect(story.places.visits.map((visit) => visit.placeIndex)).toEqual([1, 2, 1]);
	});
	it("keeps movement through multiple regions open and resets the next single-region hour", () => {
		const story = storyFor([
			gps("08:00", 0),
			gps("09:00", 0),
			gps("09:10", 0.1),
			gps("09:20", 0),
			gps("10:00", 0.1),
			gps("10:10", 0),
			gps("11:00", 0),
			gps("12:00", 0),
		]);
		const maps = story.hours.flatMap((hour) => hour.visits);
		expect(maps.map((item) => item.repeatedPlace)).toEqual([false, false, false, false, true]);
		expect(story.hours[9]?.visits[0]?.stops.map((stop) => stop.placeIndex)).toEqual([1, 2, 1]);
		expect(story.hours[10]?.visits[0]?.stops.map((stop) => stop.placeIndex)).toEqual([2, 1]);
		expect(story.hours[9]?.visits).toHaveLength(1);
		expect(story.hours[10]?.visits).toHaveLength(1);
		expect(maps.flatMap((item) => item.visit.points)).toHaveLength(8);
	});
	it("clips points and edges to their own hour while preserving native breaks and sampling gaps", () => {
		const broken = gps("08:20", 0.003);
		broken.data = { latitude: 0, longitude: 0.003, breakBefore: true };
		const events = [
			gps("07:55", 0),
			gps("08:05", 0.001),
			gps("08:15", 0.002),
			broken,
			gps("08:25", 0.004),
			gps("08:58", 0.005),
			gps("09:02", 0.006),
		];
		const timeline = buildDayTimeline("2026-09-13", events);
		const insights = buildDayInsights(events, timeline);
		const original = structuredClone(insights);
		const story = buildDayStory(timeline, insights);
		const middle = story.hours[8]?.visits[0];
		expect(middle?.visit.pointCount).toBe(5);
		expect(middle?.visit.startAt).toBe("2026-09-13T08:05:00.000Z");
		expect(middle?.visit.endAt).toBe("2026-09-13T08:58:00.000Z");
		expect(middle?.map.gps.segments.map((segment) => segment.length)).toEqual([2, 2, 1]);
		expect(middle?.visit.observedMinutes).toBe(15);
		expect(middle?.map.gps.distanceMeters).toBeCloseTo(222.39, 1);
		expect(story.hours[7]?.visits[0]?.map.gps.distanceMeters).toBe(0);
		expect(story.hours[9]?.visits[0]?.visit.observedMinutes).toBe(0);
		const allPoints = story.hours.flatMap((hour) => {
			const points = hour.visits.flatMap((item) => item.visit.points);
			expect(
				points.every((point) => new Date(point.occurredAt).getHours() === hour.slot.hour),
			).toBe(true);
			return points;
		});
		expect(allPoints).toHaveLength(events.length);
		expect(new Set(allPoints).size).toBe(events.length);
		expect(allPoints).toEqual(expect.arrayContaining(insights.gps.segments.flat()));
		expect(insights).toEqual(original);
	});
	it("preserves interleaved providers' original paths and unions observed time within one map", () => {
		const events = [
			gps("08:00", 0),
			{ ...gps("08:05", 0.1), sourceId: "second-gps" },
			gps("08:10", 0.001),
			{ ...gps("08:15", 0.101), sourceId: "second-gps" },
			gps("08:20", 0.002),
		];
		const item = storyFor(events).hours[8]?.visits[0];
		expect(item?.stops.map((stop) => stop.placeIndex)).toEqual([1, 2, 1, 2, 1]);
		expect(item?.map.gps.segments.map((segment) => segment.length)).toEqual([3, 2]);
		expect(
			item?.map.gps.segments.every((segment) => new Set(segment.map((p) => p.sourceId)).size === 1),
		).toBe(true);
		expect(item?.visit.observedMinutes).toBe(20);
		expect(item?.map.gps.distanceMeters).toBeCloseTo(333.59, 1);
		expect(item?.repeatedPlace).toBe(false);
	});
	it("assigns legacy array samples to local hours after interpreting offsetless times as UTC", () => {
		process.env.TZ = "Asia/Shanghai";
		const event = makeEvent({
			sourceId: "footprint",
			occurredAt: "2026-09-13T00:00:00.000Z",
			data: {
				points: [
					{ latitude: 0, longitude: 0, time: "2026-09-12T23:59:30" },
					{ latitude: 0, longitude: 0.001, time: "2026-09-13T00:00:00+00:00" },
					{ latitude: 0, longitude: 0.002, time: "2026-09-13T00:10:00Z" },
				],
			},
		});
		const story = storyFor([event]);
		const first = story.hours[7]?.visits[0];
		const next = story.hours[8]?.visits[0];
		expect(first?.visit.startAt).toBe("2026-09-12T23:59:30.000Z");
		expect(first?.period).toBe("07:59:30");
		expect(first?.visit.pointCount).toBe(1);
		expect(next?.period).toBe("08:00:00 — 08:10:00");
		expect(next?.visit.pointCount).toBe(2);
		expect(next?.repeatedPlace).toBe(true);
		expect(story.hours[0]?.visits).toEqual([]);
		expect(story.hours[23]?.visits).toEqual([]);
	});
	it("keeps UTC point order inside a repeated local hour during the daylight-saving fallback", () => {
		process.env.TZ = "America/New_York";
		const events = ["05:50", "06:10", "07:00"].map((clock) =>
			makeEvent({
				sourceId: "footprint",
				occurredAt: `2026-11-01T${clock}:00.000Z`,
				data: { latitude: 0, longitude: 0 },
			}),
		);
		const timeline = buildDayTimeline("2026-11-01", events);
		const story = buildDayStory(timeline, buildDayInsights(events, timeline));
		const repeatedHour = story.hours[1];
		expect(repeatedHour?.slot.state).toBe("repeated");
		expect(repeatedHour?.visits).toHaveLength(1);
		expect(repeatedHour?.visits[0]?.visit.points.map((point) => point.occurredAt)).toEqual([
			"2026-11-01T05:50:00.000Z",
			"2026-11-01T06:10:00.000Z",
		]);
		expect(repeatedHour?.visits[0]?.visit.observedMinutes).toBe(20);
		expect(repeatedHour?.visits[0]?.repeatedPlace).toBe(false);
		expect(story.hours[2]?.visits[0]?.repeatedPlace).toBe(true);
	});
	it("orders original branches, astronomical instants and GPS together for narrow-screen reading", () => {
		const events = [
			makeEvent({ occurredAt: "2026-09-13T08:01:00.000Z" }),
			gps("08:10", 0),
			makeEvent({ occurredAt: "2026-09-13T08:30:00.000Z" }),
			makeEvent({ occurredAt: "2026-09-13T08:40:00.000Z" }),
		];
		const row = storyFor(events).hours[8];
		if (!row) throw new Error("Missing hour");
		const solar = [
			{
				kind: "sunrise" as const,
				occurredAt: "2026-09-13T08:05:00.000Z",
				hour: 8,
				clock: "08:05",
				label: "日出",
			},
		];
		expect(storyHourEntries(row, solar).map((entry) => entry.kind)).toEqual([
			"branch",
			"solar",
			"visit",
			"branch",
			"branch",
		]);
		const blocks = storyHourBlocks(row, solar);
		expect(blocks.map((block) => block.kind)).toEqual(["branches", "solar", "visit", "branches"]);
		const last = blocks.at(-1);
		expect(last?.kind === "branches" && last.branches).toHaveLength(2);
	});
	it("clips the local day before grouping even when UTC date differs", () => {
		process.env.TZ = "Asia/Shanghai";
		const events = [
			makeEvent({
				sourceId: "footprint",
				occurredAt: "2026-09-12T16:10:00.000Z",
				data: { latitude: 0, longitude: 0 },
			}),
			gps("16:01", 1),
		];
		const story = storyFor(events);
		expect(story.hours[0]?.visits[0]?.period).toBe("00:10:00");
		expect(story.places.totalPoints).toBe(1);
	});
});
