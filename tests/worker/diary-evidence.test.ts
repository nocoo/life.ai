import { describe, expect, it, vi } from "vitest";
import type { DayInsights } from "../../src/models/day-insights";
import type { LifeEvent, Precision } from "../../src/models/types";
import {
	cachedPublicContextFingerprint,
	collectDiaryEvidence,
	formatHealthDimensionsEvidence,
	formatSpendingEvidence,
	formatSunEvidence,
	formatWeatherEvidence,
	MAX_DIARY_PLACES,
} from "../../worker/diary-evidence.js";
import type { WorkerEnv } from "../../worker/types.js";

const env = {} as WorkerEnv;
const window = {
	date: "2026-09-13",
	timeZone: "Asia/Shanghai",
	start: "2026-09-12T16:00:00.000Z",
	end: "2026-09-13T16:00:00.000Z",
};

function insights(
	points: { latitude: number; longitude: number; at: string; precision?: Precision }[],
): DayInsights {
	return {
		eventCount: points.length,
		gps: {
			pointCount: points.length,
			distanceMeters: 100,
			firstAt: points[0]?.at ?? null,
			lastAt: points.at(-1)?.at ?? null,
			segments: [
				points.map((point) => ({
					latitude: point.latitude,
					longitude: point.longitude,
					occurredAt: point.at,
					precision: point.precision ?? "second",
					sourceId: "footprint",
					sourceName: "GPS",
					elevation: null,
					speed: null,
				})),
			],
		},
		health: {
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
		},
		workoutCount: 0,
		workouts: [],
		finance: [],
	};
}

describe("diary evidence formatting", () => {
	it("keeps every health dimension and unit, including rare and zero-valued observations", () => {
		const record = (
			data: LifeEvent["data"],
			at = "2026-09-13T02:15:00Z",
			precision: Precision = "minute",
		): LifeEvent => ({
			id: crypto.randomUUID(),
			sourceId: "apple-health",
			sourceName: "Apple 健康",
			sourceKind: "import",
			occurredAt: at,
			endAt: null,
			precision,
			title: "健康记录",
			content: "",
			data,
			updatedAt: window.start,
		});
		const lines = formatHealthDimensionsEvidence(
			[
				record({ type: "BodyMass", value: "71", unit: "kg" }, "2026-09-13T03:00:00Z"),
				record({ type: "BodyMass", value: 70, unit: "kg" }, "2026-09-13T00:00:00Z", "hour"),
				record({ type: "BodyMass", value: "156", unit: "lb" }),
				record({ type: "VO2Max", value: "38.2", unit: "mL/min·kg" }),
				record({
					type: "EnvironmentalAudioExposureEvent",
					value: "HKCategoryValueEnvironmentalAudioExposureEventMomentaryLimit",
				}),
				record({ type: "ZeroMetric", value: 0, unit: "count" }, window.start, "day"),
				record({ type: "UnknownMetric" }),
				record({ type: "BlankMetric", value: " " }),
				record({ type: "InvalidMetric", value: "NaN" }),
				record({
					type: "HKCategoryTypeIdentifierAppleStandHour",
					value: "HKCategoryValueAppleStandHourIdle",
				}),
				record(null),
				record([]),
				record("text"),
				record({ value: 10 }),
			],
			window.timeZone,
		);
		expect(lines).toHaveLength(9);
		expect(lines.find((line) => line.includes("BodyMass（单位 kg）"))).toContain(
			"2 条观测，原数值范围 70–71；首条 2026/09/13 08时，原值 70；末条 2026/09/13 11:00，原值 71",
		);
		expect(lines.find((line) => line.includes("BodyMass（单位 lb）"))).toContain(
			"原数值范围 156–156",
		);
		expect(lines.find((line) => line.includes("VO2Max"))).toContain("38.2");
		expect(lines.find((line) => line.includes("EnvironmentalAudioExposureEvent"))).toContain(
			"2026/09/13 10:15，原值 HKCategoryValueEnvironmentalAudioExposureEventMomentaryLimit",
		);
		expect(lines.find((line) => line.includes("ZeroMetric"))).toContain("首条 2026/09/13，原值 0");
		for (const type of ["UnknownMetric", "BlankMetric", "InvalidMetric"])
			expect(lines.find((line) => line.includes(type))).not.toContain("原数值范围");
		expect(lines.find((line) => line.includes("AppleStandHour"))).toContain("Idle=未达标");
	});

	it("retains chronological returns and original GPS precision with bounded place lookups", async () => {
		const labels = vi.fn(async (_env: WorkerEnv, point: { latitude: number }) =>
			point.latitude < 32 ? "甲区" : "乙区",
		);
		const api = {
			getDaySun: async () => ({ events: [], daylightMinutes: null, status: "normal" as const }),
			getDayWeather: async () => null,
			getPlaceLabel: labels,
		};
		const lines = await collectDiaryEvidence(
			env,
			{
				...window,
				health: null,
				pixiuEvents: [],
				insights: insights([
					{ latitude: 31, longitude: 120, at: "2026-09-13T00:00:00Z", precision: "hour" },
					{ latitude: 32, longitude: 120, at: "2026-09-13T01:15:00Z", precision: "minute" },
					{ latitude: 31, longitude: 120, at: "2026-09-13T02:30:10Z", precision: "second" },
				]),
			},
			api,
		);
		expect(lines.filter((line) => line.startsWith("- 定位时段"))).toEqual([
			"- 定位时段 2026/09/13 08时：在「甲区」一带有记录。",
			"- 定位时段 2026/09/13 09:15：在「乙区」一带有记录。",
			"- 定位时段 2026/09/13 10:30:10：在「甲区」一带有记录。",
		]);
		expect(labels).toHaveBeenCalledTimes(2);
		const many = await collectDiaryEvidence(
			env,
			{
				...window,
				health: null,
				pixiuEvents: [],
				insights: insights(
					Array.from({ length: 30 }, (_, index) => ({
						latitude: 31 + (index % 2),
						longitude: 120,
						at: new Date(Date.parse(window.start) + index * 60_000).toISOString(),
					})),
				),
			},
			api,
		);
		const visits = many.filter((line) => line.startsWith("- 定位时段"));
		expect(visits).toHaveLength(24);
		expect(visits[0]).toContain("00:00:00");
		expect(visits.at(-1)).toContain("00:29:00");
	});

	it("uses date-only GPS for the same weather cache without inventing a timed visit", async () => {
		const sun = vi.fn(async () => ({
			events: [],
			daylightMinutes: 0,
			status: "polar_night" as const,
		}));
		const label = vi.fn(async () => "不能定位为具体停留");
		const daily = insights([{ latitude: 31, longitude: 120, at: window.start, precision: "day" }]);
		const lines = await collectDiaryEvidence(
			env,
			{ ...window, insights: daily, health: null, pixiuEvents: [] },
			{ getDaySun: sun, getDayWeather: async () => null, getPlaceLabel: label },
		);
		expect(lines).toEqual(["- 天光：极夜，没有日出日落"]);
		expect(sun).toHaveBeenCalledOnce();
		expect(label).not.toHaveBeenCalled();
		expect(await cachedPublicContextFingerprint(env, window, daily)).toContain('"sun":null');
	});

	it("formats weather, polar night and date-only spending without inventing a clock", () => {
		expect(
			formatWeatherEvidence(
				{
					temperatureMin: 18,
					temperatureMax: 26,
					temperatureMean: 22,
					precipitationMm: 0,
					windMaxKmh: 12,
					weatherCode: 0,
					sampleCount: 24,
					expectedSamples: 24,
					complete: true,
					kind: "historical",
				},
				"Asia/Shanghai",
			)[0],
		).toContain("晴");
		expect(
			formatSunEvidence({ events: [], daylightMinutes: 0, status: "polar_night" }, "Asia/Shanghai"),
		).toEqual(["- 天光：极夜，没有日出日落"]);
		expect(
			formatSunEvidence(
				{
					events: [
						{ kind: "sunrise", occurredAt: "2026-09-12T21:54:00.000Z" },
						{ kind: "sunset", occurredAt: "2026-09-13T10:25:00.000Z" },
					],
					daylightMinutes: 750,
					status: "normal",
				},
				"Asia/Shanghai",
			).join("\n"),
		).toMatch(/日出/);
		const lunch = (id: string, note: string, type = "午饭"): LifeEvent => ({
			id,
			sourceId: "pixiu",
			sourceName: "貔貅记账",
			sourceKind: "import",
			occurredAt: window.start,
			endAt: window.end,
			precision: "day",
			title: type,
			content: note,
			data: {
				日期: "2026-09-13",
				交易分类: "日常支出",
				交易类型: type,
				流入金额: "0.00",
				流出金额: "32.00",
				币种: "CNY",
				备注: note,
				sourceDate: "2026-09-13",
			},
			updatedAt: window.start,
		});
		const spending = formatSpendingEvidence([
			lunch("pixiu:1", "午饭"),
			{
				id: "pixiu:pay",
				sourceId: "pixiu",
				sourceName: "貔貅记账",
				sourceKind: "import",
				occurredAt: window.start,
				endAt: window.end,
				precision: "day",
				title: "工资",
				content: "",
				data: {
					交易分类: "日常收入",
					交易类型: "工资",
					流入金额: "200.00",
					流出金额: "0.00",
					币种: "CNY",
					sourceDate: "2026-09-13",
				},
				updatedAt: window.start,
			},
			{
				id: "pixiu:in",
				sourceId: "pixiu",
				sourceName: "貔貅记账",
				sourceKind: "import",
				occurredAt: window.start,
				endAt: window.end,
				precision: "day",
				title: "退回",
				content: "",
				data: {
					交易分类: "日常支出",
					交易类型: "退回",
					流入金额: "5.00",
					流出金额: "0.00",
					币种: "CNY",
					sourceDate: "2026-09-13",
				},
				updatedAt: window.start,
			},
			{
				id: "pixiu:tf",
				sourceId: "pixiu",
				sourceName: "貔貅记账",
				sourceKind: "import",
				occurredAt: window.start,
				endAt: window.end,
				precision: "day",
				title: "转账",
				content: "",
				data: {
					交易分类: "转账",
					交易类型: "转出",
					流入金额: "0.00",
					流出金额: "50.00",
					币种: "CNY",
					sourceDate: "2026-09-13",
				},
				updatedAt: window.start,
			},
			{
				id: "pixiu:inv",
				sourceId: "pixiu",
				sourceName: "貔貅记账",
				sourceKind: "import",
				occurredAt: window.start,
				endAt: window.end,
				precision: "day",
				title: "买入",
				content: "",
				data: {
					交易分类: "投资",
					交易类型: "买入",
					流入金额: "0.00",
					流出金额: "100.00",
					币种: "CNY",
					sourceDate: "2026-09-13",
				},
				updatedAt: window.start,
			},
			{
				id: "pixiu:usd",
				sourceId: "pixiu",
				sourceName: "貔貅记账",
				sourceKind: "import",
				occurredAt: window.start,
				endAt: window.end,
				precision: "day",
				title: "午餐",
				content: "",
				data: {
					交易分类: "日常支出",
					交易类型: "午餐",
					流入金额: "0.00",
					流出金额: "9.50",
					币种: "USD",
					备注: "美元午饭",
					sourceDate: "2026-09-13",
				},
				updatedAt: window.start,
			},
			...Array.from({ length: 45 }, (_, index) =>
				lunch(`pixiu:n${index}`, `备注${index}`, `类型${index}`),
			),
		]);
		const text = spending.join("\n");
		expect(text).toContain("源记账日期，无交易时刻");
		expect(text).toContain("CNY 日常消费（仅「日常支出」流出）");
		expect(text).toContain("USD 日常消费（仅「日常支出」流出）");
		expect(text).toContain("日常收入");
		expect(text).toContain("不可当作退款");
		expect(text.replaceAll("不可当作退款", "")).not.toContain("退款");
		expect(text).toContain("转账");
		expect(text).toContain("不算消费或收入");
		expect(text).toContain("原分类「日常支出」");
		expect(text).toContain("原分类「投资」");
		expect(text).toContain("日常消费类型「午饭」");
		expect(text).toContain("日常消费类型「午餐」");
		expect(text).toContain("记账类型「日常支出 / 类型44」");
		expect(text).toContain("备注0");
		expect(text).toContain("备注44");
		expect(text).toContain("美元午饭");
		const originalRows = spending
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line) as Record<string, string>);
		expect(originalRows).toHaveLength(51);
		expect(originalRows.find((row) => row.备注 === "备注44")).toEqual({
			日期: "2026-09-13",
			交易分类: "日常支出",
			交易类型: "类型44",
			流入金额: "0.00",
			流出金额: "32.00",
			币种: "CNY",
			资金账户: "",
			标签: "",
			备注: "备注44",
		});
		expect(originalRows.find((row) => row.备注 === "美元午饭")?.币种).toBe("USD");
		expect(text.split("备注").length - 1).toBeGreaterThanOrEqual(46);
		expect(
			text.split("\n").some((line) => line.includes("投资") && line.includes("日常消费")),
		).toBe(false);
		expect(text).not.toMatch(/\d{2}:\d{2}/);
	});

	it("labels only a few long stays and never asks once per GPS point", async () => {
		const labels = vi.fn(async () => "苏州园区");
		const points = Array.from({ length: 20 }, (_, index) => ({
			latitude: 31.25 + index * 0.0001,
			longitude: 120.58,
			at: new Date(Date.parse(window.start) + index * 60_000).toISOString(),
		}));
		const lines = await collectDiaryEvidence(
			env,
			{ ...window, insights: insights(points), health: null, pixiuEvents: [] },
			{
				getDaySun: async () => ({
					events: [{ kind: "sunrise", occurredAt: "2026-09-12T21:54:00.000Z" }],
					daylightMinutes: 720,
					status: "normal",
				}),
				getDayWeather: async () => ({
					temperatureMin: 20,
					temperatureMax: 24,
					temperatureMean: 22,
					precipitationMm: 1,
					windMaxKmh: 8,
					weatherCode: 61,
					sampleCount: 24,
					expectedSamples: 24,
					complete: true,
					kind: "forecast",
				}),
				getPlaceLabel: labels,
			},
		);
		expect(labels.mock.calls.length).toBeLessThanOrEqual(MAX_DIARY_PLACES);
		expect(labels.mock.calls.length).toBeGreaterThan(0);
		expect(lines.some((line) => line.includes("苏州园区"))).toBe(true);
		expect(lines.some((line) => line.includes("场所类型没有直接标注"))).toBe(true);
		expect(lines.some((line) => line.includes("日出"))).toBe(true);
		expect(lines.some((line) => line.includes("雨"))).toBe(true);
	});

	it("skips weather when there is no GPS stay", async () => {
		const weather = vi.fn();
		const lines = await collectDiaryEvidence(
			env,
			{ ...window, insights: insights([]), health: null, pixiuEvents: [] },
			{
				getDaySun: async () => ({ events: [], daylightMinutes: null, status: "normal" }),
				getDayWeather: weather,
				getPlaceLabel: async () => null,
			},
		);
		expect(weather).not.toHaveBeenCalled();
		expect(lines).toEqual([]);
	});

	it("caps place lookups, swallows provider errors, and formats incomplete weather", async () => {
		expect(formatWeatherEvidence(null, "UTC")).toEqual([]);
		expect(
			formatWeatherEvidence(
				{
					temperatureMin: null,
					temperatureMax: null,
					temperatureMean: null,
					precipitationMm: 0,
					windMaxKmh: 3,
					weatherCode: null,
					sampleCount: 0,
					expectedSamples: 24,
					complete: false,
					kind: "historical",
				},
				"UTC",
			)[0],
		).toContain("气温未知");
		expect(
			formatSpendingEvidence([
				{
					id: "zero",
					sourceId: "pixiu",
					sourceName: "貔貅记账",
					sourceKind: "import",
					occurredAt: window.start,
					endAt: window.end,
					precision: "day",
					title: "空",
					content: "",
					data: { 日期: "2026-09-13", 流入金额: "0.00", 流出金额: "0.00", 币种: "CNY" },
					updatedAt: window.start,
				},
			]).join("\n"),
		).toContain("CNY");
		expect(
			formatWeatherEvidence(
				{
					temperatureMin: null,
					temperatureMax: null,
					temperatureMean: 21,
					precipitationMm: null,
					windMaxKmh: null,
					weatherCode: 3,
					sampleCount: 1,
					expectedSamples: 24,
					complete: false,
					kind: "forecast",
				},
				"UTC",
			)[0],
		).toContain("气温约 21°C");
		expect(
			formatSunEvidence(
				{
					events: [{ kind: "sunset", occurredAt: "2026-09-13T10:25:00.000Z" }],
					daylightMinutes: 800,
					status: "midnight_sun",
				},
				"Asia/Shanghai",
			),
		).toEqual(["- 天光：极昼"]);
		expect(
			formatSpendingEvidence([
				{
					id: "x",
					sourceId: "pixiu",
					sourceName: "貔貅记账",
					sourceKind: "import",
					occurredAt: window.start,
					endAt: null,
					precision: "hour",
					title: "忽略",
					content: "",
					data: { 流入金额: "10.00", 币种: "CNY" },
					updatedAt: window.start,
				},
			]),
		).toEqual([]);
		const clusters = [0, 1, 2, 3, 4].flatMap((cluster) => [
			{
				latitude: 31 + cluster,
				longitude: 120,
				at: new Date(Date.parse(window.start) + cluster * 3_600_000).toISOString(),
			},
			{
				latitude: 31 + cluster + 0.001,
				longitude: 120.001,
				at: new Date(Date.parse(window.start) + cluster * 3_600_000 + 60_000).toISOString(),
			},
		]);
		const labels = vi.fn(async () => {
			throw new Error("geocoder down");
		});
		const lines = await collectDiaryEvidence(
			env,
			{ ...window, insights: insights(clusters), health: null, pixiuEvents: [] },
			{
				getDaySun: async () => {
					throw new Error("sun down");
				},
				getDayWeather: async () => {
					throw new Error("weather down");
				},
				getPlaceLabel: labels,
			},
		);
		expect(labels.mock.calls.length).toBe(MAX_DIARY_PLACES);
		expect(lines.some((line) => line.includes("场所未知"))).toBe(true);
		expect(lines.some((line) => line.includes("天气"))).toBe(false);
		expect(lines.some((line) => line.includes("日出") || line.includes("天光"))).toBe(false);
		expect(
			formatSpendingEvidence([
				{
					id: "in",
					sourceId: "pixiu",
					sourceName: "貔貅记账",
					sourceKind: "import",
					occurredAt: window.start,
					endAt: window.end,
					precision: "day",
					title: "收入",
					content: "",
					data: {
						sourceDate: "2026-09-13",
						交易分类: "工资",
						交易类型: "收入",
						流入金额: "10.00",
						流出金额: "0.00",
						币种: "CNY",
					},
					updatedAt: window.start,
				},
			]).join("\n"),
		).toContain("流入 10.00");
		const unlabeled = await collectDiaryEvidence(
			env,
			{
				...window,
				insights: insights([
					{ latitude: 31.2, longitude: 121.4, at: window.start },
					{ latitude: 31.201, longitude: 121.401, at: "2026-09-12T16:10:00.000Z" },
				]),
				health: null,
				pixiuEvents: [],
			},
			{
				getDaySun: async () => ({
					events: [{ kind: "sunrise", occurredAt: "2026-09-12T21:54:00.000Z" }],
					daylightMinutes: 720,
					status: "normal",
				}),
				getDayWeather: async () => {
					throw new Error("weather down");
				},
				getPlaceLabel: async () => null,
			},
		);
		expect(unlabeled.some((line) => line.includes("场所未知"))).toBe(true);
		expect(unlabeled.some((line) => line.includes("日出"))).toBe(true);
		expect(unlabeled.some((line) => line.includes("天气"))).toBe(false);
	});

	it("fingerprints D1 public-context cache without calling upstream APIs", async () => {
		expect(await cachedPublicContextFingerprint(env, window, insights([]))).toBe(
			JSON.stringify(null),
		);
		expect(
			await cachedPublicContextFingerprint(
				env,
				window,
				insights([
					{ latitude: 31.25, longitude: 120.58, at: window.start },
					{ latitude: 31.2501, longitude: 120.5801, at: "2026-09-12T16:10:00.000Z" },
				]),
			),
		).toContain('"weather":null');
		const select = vi.fn<() => Promise<{ data_json: string; expires_at: number | null } | null>>(
			async () => null,
		);
		const prepare = vi.fn(() => ({
			bind() {
				return this;
			},
			first: select,
		}));
		const cachedEnv = { DB: { prepare } } as unknown as WorkerEnv;
		const points = [
			{ latitude: 31.25, longitude: 120.58, at: window.start },
			{ latitude: 31.2501, longitude: 120.5801, at: "2026-09-12T16:10:00.000Z" },
		];
		const empty = await cachedPublicContextFingerprint(cachedEnv, window, insights(points));
		expect(prepare).toHaveBeenCalled();
		expect(empty).toContain('"weather":null');
		select.mockResolvedValue({
			data_json: '{"sky":"changed"}',
			expires_at: Date.now() + 60_000,
		});
		const filled = await cachedPublicContextFingerprint(cachedEnv, window, insights(points));
		expect(filled).not.toBe(empty);
		expect(filled).toContain("changed");
		select.mockResolvedValue({ data_json: "expired", expires_at: 1 });
		expect(await cachedPublicContextFingerprint(cachedEnv, window, insights(points))).toBe(empty);
	});
});
