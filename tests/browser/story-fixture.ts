import type { ImportRecord, ImportSourceId } from "../../src/models/types";

/** Synthetic design/test day. Imported only into the isolated L3 database, never into production. */
export const STORY_DAY = "2026-09-17";
export const storyAt = (hour: number, minute = 0) =>
	new Date(Date.UTC(2026, 8, 17, hour - 8, minute)).toISOString();

const health = (
	key: string,
	hour: number,
	minute: number,
	type: string,
	value: string,
	unit: string,
): ImportRecord => ({
	key,
	occurredAt: storyAt(hour, minute),
	precision: "minute",
	title: type === "HeartRate" ? "心率测量" : "活动记录",
	data: { type: `HKQuantityTypeIdentifier${type}`, value, unit },
});

export const storyImports: Record<ImportSourceId, ImportRecord[]> = {
	"apple-health": [
		{
			key: "story-sleep",
			occurredAt: storyAt(-1, 10),
			endAt: storyAt(6, 40),
			precision: "minute",
			title: "夜间睡眠",
			data: {
				type: "HKCategoryTypeIdentifierSleepAnalysis",
				value: "HKCategoryValueSleepAnalysisAsleepCore",
			},
		},
		{
			key: "story-run",
			occurredAt: storyAt(7, 10),
			endAt: storyAt(7, 55),
			precision: "minute",
			title: "河畔晨跑",
			content: "沿着熟悉的河岸跑了一圈。",
			data: {
				workoutActivityType: "HKWorkoutActivityTypeRunning",
				totalDistance: "6.2",
				totalDistanceUnit: "km",
				totalEnergyBurned: "380",
				totalEnergyBurnedUnit: "kcal",
			},
		},
		{
			key: "story-yoga",
			occurredAt: storyAt(19, 10),
			endAt: storyAt(19, 45),
			precision: "minute",
			title: "晚间拉伸",
			data: {
				workoutActivityType: "HKWorkoutActivityTypeYoga",
				totalEnergyBurned: "128",
				totalEnergyBurnedUnit: "kcal",
			},
		},
		health("story-steps-a", 6, 50, "StepCount", "920", "count"),
		health("story-steps-b", 7, 55, "StepCount", "6840", "count"),
		health("story-after-move-heart", 8, 50, "HeartRate", "78", "count/min"),
		health("story-steps-c", 13, 30, "StepCount", "1680", "count"),
		health("story-steps-d", 18, 50, "StepCount", "2450", "count"),
		health("story-water-a", 6, 45, "DietaryWater", "350", "mL"),
		health("story-water-b", 13, 0, "DietaryWater", "500", "mL"),
		...Array.from({ length: 46 }, (_, index) =>
			health(
				`story-heart-${index}`,
				7,
				10 + index,
				"HeartRate",
				String(112 + Math.round(18 * Math.sin(index / 5) + index / 3)),
				"count/min",
			),
		),
		...Array.from({ length: 14 }, (_, index) =>
			health(
				`story-rest-heart-${index}`,
				14,
				index * 3,
				"HeartRate",
				String(65 + Math.round(6 * Math.sin(index))),
				"count/min",
			),
		),
	],
	footprint: [
		...Array.from({ length: 20 }, (_, index) => ({
			key: `story-morning-track-${index}`,
			occurredAt: storyAt(8, 20 + index),
			precision: "minute" as const,
			title: index === 0 ? "沿着苏州河出发" : "轨迹点",
			data: { latitude: 31.2407 + index * 0.00012, longitude: 121.449 + index * 0.00055 },
		})),
		...Array.from({ length: 23 }, (_, index) => ({
			key: `story-evening-track-${index}`,
			occurredAt: storyAt(18, 20 + index),
			precision: "minute" as const,
			title: index === 0 ? "走路回家" : "轨迹点",
			data: { latitude: 31.243 - index * 0.000105, longitude: 121.46 - index * 0.00047 },
		})),
	],
	pixiu: [
		{
			key: "story-coffee",
			occurredAt: storyAt(8, 5),
			precision: "minute",
			title: "转角的早餐",
			content: "咖啡和一份三明治",
			data: { 币种: "CNY", 交易类型: "支出", 流出金额: "32.50", 交易分类: "餐饮" },
		},
		{
			key: "story-lunch",
			occurredAt: storyAt(12, 20),
			precision: "minute",
			title: "和同事一起午餐",
			data: { 币种: "CNY", 交易类型: "支出", 流出金额: "48.00", 交易分类: "餐饮" },
		},
		{
			key: "story-dinner",
			occurredAt: storyAt(18, 50),
			precision: "minute",
			title: "晚餐食材",
			data: { 币种: "CNY", 交易类型: "支出", 流出金额: "89.00", 交易分类: "日用" },
		},
	],
	journal: [
		{
			key: "story-day-note",
			occurredAt: STORY_DAY,
			precision: "day",
			title: "九月的一个普通星期四",
			content: "天气渐凉，开始期待步行的季节。",
		},
		{
			key: "story-book",
			occurredAt: storyAt(14, 10),
			precision: "minute",
			title: "书店里的半小时",
			content: "翻了几页《看不见的城市》。把喜欢的一句话抄进笔记，暂时放下手机。",
			data: { pages: 18 },
		},
		{
			key: "story-evening-note",
			occurredAt: storyAt(21, 30),
			precision: "minute",
			title: "把这一天写下来",
			content: "早晨沿河跑步，晚上又从河边走回家。白天的事情不少，最想记住的却是途中那段安静的路。",
		},
	],
};

export const storySnapshots = [
	{
		timestamp: storyAt(9),
		title: "上午的专注时段",
		content: "整理提案，把零散的想法连成一个完整的方案。",
	},
	{
		timestamp: storyAt(15),
		title: "和团队聊聊新想法",
		content: "讨论下一步的方向，记下三个可以马上尝试的改动。",
	},
];
