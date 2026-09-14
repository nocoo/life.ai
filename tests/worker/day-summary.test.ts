import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaySummaryQuery, DaySummaryResult } from "../../src/models/ai.js";
import { packHealthDay } from "../../src/models/apple-health.js";
import { buildDayInsights, type DayInsights } from "../../src/models/day-insights.js";
import {
	FOOTPRINT_DAY_MS,
	type FootprintPoint,
	validateFootprintDay,
} from "../../src/models/footprint.js";
import type { HealthNode } from "../../src/models/health-types.js";
import type { LifeEvent } from "../../src/models/types.js";
import {
	buildDaySummaryPrompt,
	formatHealthEvidence,
	formatInsightsEvidence,
	handleGetDaySummary,
	handlePostDaySummary,
	safeValidateSummaryQuery,
	streamDayEvents,
} from "../../worker/day-summary.js";
import { formatEvidenceTime, formatHealthDimensionsEvidence } from "../../worker/diary-evidence.js";
import { DIARY_SYSTEM_PROMPT } from "../../worker/diary-prompt.js";
import { handlePutGeneralSettings } from "../../worker/general-settings.js";
import { healthDayHeader, readHealthEvents } from "../../worker/health-read.js";
import {
	buildWeatherCacheKey,
	getDaySun,
	getDayWeather,
	getPlaceLabel,
	roundCoordinate,
} from "../../worker/public-context.js";
import type { WorkerEnv } from "../../worker/types.js";

vi.mock("../../worker/public-context.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../worker/public-context.js")>();
	return {
		...actual,
		getDaySun: vi.fn(async () => ({
			events: [] as { kind: "sunrise" | "sunset"; occurredAt: string }[],
			daylightMinutes: 0,
			status: "normal" as const,
		})),
		getDayWeather: vi.fn(async () => null),
		getPlaceLabel: vi.fn(async () => null),
	};
});

const day: DaySummaryQuery = {
	date: "2026-09-13",
	timeZone: "Asia/Shanghai",
	start: "2026-09-12T16:00:00.000Z",
	end: "2026-09-13T16:00:00.000Z",
};
const databases: DatabaseSync[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});

/** Real, in-memory SQLite validates the lease SQL; it has no filesystem or remote bindings. */
function setup() {
	const sqlite = new DatabaseSync(":memory:");
	databases.push(sqlite);
	sqlite.exec(
		"CREATE TABLE _test_marker (key TEXT PRIMARY KEY, value TEXT); INSERT INTO _test_marker VALUES ('env', 'test');",
	);
	for (const name of readdirSync(new URL("../../worker/migrations/", import.meta.url))
		.filter((name) => name.endsWith(".sql"))
		.sort())
		sqlite.exec(readFileSync(new URL(`../../worker/migrations/${name}`, import.meta.url), "utf8"));
	const prepare = vi.fn((sql: string) => {
		const statement = sqlite.prepare(sql);
		let values: SQLInputValue[] = [];
		return {
			bind(...args: SQLInputValue[]) {
				values = args;
				return this;
			},
			async first() {
				return statement.get(...values) ?? null;
			},
			async all() {
				return { results: statement.all(...values) };
			},
			async run() {
				return { meta: { changes: Number(statement.run(...values).changes) } };
			},
		};
	});
	const run = vi.fn(
		async (_model: string, _input: { messages: { role: string; content: string }[] }) => ({
			response: "当天记录了阅读与步行。",
		}),
	);
	const env: WorkerEnv = {
		RESOURCE_ENV: "test",
		DATA_TARGET: "local",
		APP_ORIGIN: "http://localhost:17011",
		INGEST_HOST: "life.worker.hexly.ai",
		ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
		ACCESS_AUD: "isolated",
		TEST_ACCESS_JWKS: "",
		AI_SETTINGS_KEY: "01".repeat(32),
		DB: { prepare } as unknown as D1Database,
		ASSETS: {} as Fetcher,
		AI: { run } as unknown as Ai,
	};
	const insert = (changes: Partial<LifeEvent> = {}) => {
		const id = crypto.randomUUID();
		const event: LifeEvent = {
			id,
			sourceId: "journal",
			sourceName: "日记",
			sourceKind: "import",
			occurredAt: "2026-09-13T02:30:00.000Z",
			endAt: null,
			precision: "minute",
			title: "阅读",
			content: "",
			data: {},
			updatedAt: "2026-09-13T12:00:00.000Z",
			...changes,
		};
		sqlite
			.prepare("INSERT OR IGNORE INTO sources VALUES (?, ?, ?, 'journal', 0)")
			.run(event.sourceId, event.sourceName, event.sourceKind);
		sqlite
			.prepare(
				"INSERT INTO life_events (id, source_id, external_key, occurred_at, end_at, precision, title, content, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				event.id,
				event.sourceId,
				event.id,
				Date.parse(event.occurredAt),
				event.endAt ? Date.parse(event.endAt) : null,
				event.precision,
				event.title,
				event.content,
				JSON.stringify(event.data),
				Date.parse(event.updatedAt),
			);
		return event;
	};
	const putDay = async (utcDay: number, points: FootprintPoint[], breaks: number[] = []) => {
		const day = await validateFootprintDay({
			utcDay,
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points,
				breaks,
			},
		});
		sqlite.exec(
			"INSERT OR IGNORE INTO sources VALUES ('footprint', 'Footprint', 'import', 'footprint', 0)",
		);
		sqlite
			.prepare(
				"INSERT OR REPLACE INTO provider_days VALUES ('footprint', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				day.utcDay,
				day.recordCount,
				day.firstAt,
				day.lastAt,
				day.payloadBytes,
				JSON.stringify(day.summary),
				JSON.stringify(day.data),
				day.contentHash,
				Date.now(),
			);
		return day;
	};
	const putHealthDay = async (
		utcDay: number,
		nodes: HealthNode[],
		updatedAt = Date.parse("2026-09-14T00:00:00Z"),
	) => {
		const health = await packHealthDay(utcDay, nodes);
		const header = healthDayHeader(health);
		sqlite.exec(
			"INSERT OR IGNORE INTO sources VALUES ('apple-health', 'Apple 健康', 'import', 'apple-health', 0)",
		);
		sqlite.prepare("DELETE FROM health_series WHERE utc_day = ?").run(utcDay);
		for (const series of health.data.series)
			sqlite
				.prepare(
					"INSERT INTO health_series (utc_day, dimension, part, record_count, first_at, last_at, raw_bytes, payload_bytes, content_hash, body, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.run(
					health.utcDay,
					series.dimension,
					series.part,
					series.recordCount,
					series.firstAt,
					series.lastAt,
					series.rawBytes,
					series.payloadBytes,
					series.contentHash,
					series.body,
					updatedAt,
				);
		sqlite
			.prepare(
				"INSERT OR REPLACE INTO provider_days VALUES ('apple-health', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				health.utcDay,
				health.recordCount,
				health.firstAt,
				health.lastAt,
				header.bytes,
				JSON.stringify(health.summary),
				header.json,
				health.contentHash,
				updatedAt,
			);
		return health;
	};
	return { sqlite, env, run, insert, prepare, putDay, putHealthDay };
}
function request(query: unknown = day) {
	return new Request("http://localhost:17011/api/day-summary", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(query),
	});
}
function url(query = day) {
	return new URL(`http://localhost:17011/api/day-summary?${new URLSearchParams({ ...query })}`);
}
async function data(response: Response): Promise<DaySummaryResult> {
	return ((await response.json()) as { data: DaySummaryResult }).data;
}
function scan(env: WorkerEnv, evidence = true) {
	return streamDayEvents(env, Date.parse(day.start), Date.parse(day.end), day, evidence);
}

describe("diary data sources and movement", () => {
	it("retains its generation lease across source/context work in addition to the model budget", async () => {
		const { env, insert, run } = setup();
		insert();
		const now = Date.now();
		const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		run.mockImplementationOnce(async () => {
			clock.mockReturnValue(now + 190_000);
			return { response: "较慢的完整资料仍可成功保存。" };
		});
		expect((await data(await handlePostDaySummary(request(), env))).summary?.content).toBe(
			"较慢的完整资料仍可成功保存。",
		);
		expect(run).toHaveBeenCalledOnce();
	});
	function seedExternal(sqlite: DatabaseSync) {
		const common = {
			sourceKind: "external" as const,
			occurredAt: "2026-09-13T01:02:03.000Z",
			endAt: null,
			precision: "second" as const,
			updatedAt: day.start,
		};
		const events: LifeEvent[] = [
			{
				...common,
				id: "gecko:sample",
				sourceId: "gecko",
				sourceName: "Gecko",
				title: "电脑活动",
				content: "Editor",
				precision: "hour",
				data: {
					type: "computer-activity",
					activeSeconds: 1200,
					sessionCount: 3,
					apps: [{ name: "Editor", seconds: 1200, titles: ["Life.ai 出行记录"] }],
				},
			},
			{
				...common,
				id: "firefly:sample",
				sourceId: "firefly",
				sourceName: "Firefly",
				title: "记录一段通勤",
				content: "从行迹理解一天",
				data: {
					type: "published-article",
					url: "https://lizheng.blog/2026/09/commute",
					image: "https://lizheng.blog/cover.jpg",
					author: "测试作者",
				},
			},
		];
		for (const event of events) {
			sqlite
				.prepare(
					"INSERT INTO day_source_settings (provider, enabled, encrypted_api_key, updated_at) VALUES (?, 1, NULL, 1)",
				)
				.run(event.sourceId);
			sqlite
				.prepare("INSERT INTO day_source_cache VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
				.run(
					event.sourceId,
					day.date,
					day.timeZone,
					day.start,
					day.end,
					JSON.stringify([event]),
					Date.now(),
				);
		}
		return events;
	}
	it("uses external-only evidence, cached GETs and stable hashes; disabling a source marks the diary stale", async () => {
		const { env, sqlite, run } = setup();
		seedExternal(sqlite);
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const saved = await data(await handlePostDaySummary(request(), env));
		expect(saved).toMatchObject({ eventCount: 2, stale: false });
		const userPrompt =
			run.mock.calls[0]?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(userPrompt).toContain("电脑前台活动");
		expect(userPrompt).toContain("Life.ai 出行记录");
		expect(userPrompt).toContain("公开发表文章");
		expect(userPrompt).toContain("09:02:03");
		expect(userPrompt).toContain("测试作者");
		expect(userPrompt).toContain("https://lizheng.blog/2026/09/commute");
		expect(await data(await handleGetDaySummary(env, url()))).toEqual(saved);
		sqlite.exec("UPDATE day_source_cache SET fetched_at = fetched_at + 1");
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		sqlite.exec("UPDATE day_source_settings SET enabled = 0 WHERE provider = 'firefly'");
		const disabled = await data(await handleGetDaySummary(env, url()));
		expect(disabled.stale).toBe(true);
		expect(disabled.summary).toEqual(saved.summary);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("keeps the previous diary when an enabled source fails before or after AI runs", async () => {
		const { env, sqlite, run } = setup();
		seedExternal(sqlite);
		const saved = await data(await handlePostDaySummary(request(), env));
		sqlite.exec("UPDATE day_source_cache SET fetched_at = 0 WHERE provider = 'firefly'");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("failure", { status: 503 })),
		);
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({
			status: 503,
			code: "source_unavailable",
		});
		expect(run).toHaveBeenCalledOnce();
		expect((await data(await handleGetDaySummary(env, url()))).summary).toEqual(saved.summary);
		sqlite.prepare("UPDATE day_source_cache SET fetched_at = ?").run(Date.now());
		run.mockImplementationOnce(async () => {
			sqlite.exec("UPDATE day_source_cache SET fetched_at = 0 WHERE provider = 'firefly'");
			return { response: "Do not replace the saved diary" };
		});
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({ status: 503 });
		expect((await data(await handleGetDaySummary(env, url()))).summary).toEqual(saved.summary);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_summary_leases").get()?.n).toBe(0);
	});
	it("provides named POIs, moving average, excluded stops and commute reasoning to the AI", async () => {
		const { env, run, putDay } = setup();
		const positions = [0, 0.01, 0.02, 0.03, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09];
		await putDay(
			Date.parse("2026-09-13"),
			positions.map((longitude, i) => [i * 60, 0, longitude, null, null, null]),
		);
		await handlePutGeneralSettings(
			new Request("http://localhost/api/settings/general", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					places: [
						{ id: "home", label: "家", latitude: 0, longitude: 0, radiusMeters: 100 },
						{ id: "work", label: "公司", latitude: 0, longitude: 0.09, radiusMeters: 100 },
						{ id: "poi", label: "图书馆", latitude: 0, longitude: 0.03, radiusMeters: 100 },
					],
					routine: null,
				}),
			}),
			env,
		);
		await handlePostDaySummary(request(), env);
		const userPrompt =
			run.mock.calls[0]?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(userPrompt).toContain("连续移动 2026/09/13 08:00:00 至 2026/09/13 08:11:00");
		expect(userPrompt).toContain('"movingAverageKmh":66.7');
		expect(userPrompt).toContain('"excludedStopMinutes":2');
		expect(userPrompt).toContain("可能的通勤去程");
		expect(userPrompt).toContain("仅凭 GPS 无法区分");
		expect(userPrompt).toContain('"label":"图书馆"');
		expect(userPrompt).toContain("不证明入内或消费");
	});
});
function prompt(evidence: Awaited<ReturnType<typeof scan>>) {
	return buildDaySummaryPrompt(
		day.date,
		day.timeZone,
		evidence.eventCount,
		evidence.sourceCounts,
		evidence.samplesBySource,
		evidence.insights,
		[
			...formatHealthEvidence(evidence.health, day.timeZone),
			...formatHealthDimensionsEvidence(evidence.healthEvents, day.timeZone),
		],
		[],
	);
}

function healthRecord(
	type: string,
	startDate: string,
	value: string,
	unit = "count",
	attributes: Record<string, string> = {},
): HealthNode {
	return {
		name: "Record",
		attributes: {
			type: `HKQuantityTypeIdentifier${type}`,
			startDate,
			value,
			unit,
			sourceName: "Apple Watch",
			device: "Watch",
			...attributes,
		},
	};
}

function sleepRecord(
	kind: string,
	startDate: string,
	endDate: string,
	sourceName = "Apple Watch",
): HealthNode {
	return {
		name: "Record",
		attributes: {
			type: "HKCategoryTypeIdentifierSleepAnalysis",
			startDate,
			endDate,
			sourceName,
			value: `HKCategoryValueSleepAnalysis${kind}`,
		},
	};
}

describe("daily summary evidence", () => {
	it("compares observed sleep with habitual clocks in the routine's timezone, without replacing observations", async () => {
		const { env, putHealthDay } = setup();
		await putHealthDay(Date.parse("2026-09-13T00:00:00Z"), [
			sleepRecord("AsleepCore", "2026-09-13T01:10:00Z", "2026-09-13T09:05:00Z"),
		]);
		const { health } = await scan(env);
		expect(health?.nights).toHaveLength(1);
		const routine = { bedtime: "21:00", wakeTime: "05:00", timeZone: "America/New_York" };
		const lines = formatHealthEvidence(health, day.timeZone, [], routine).join("\n");
		expect(lines).toContain("09:10 入睡");
		expect(lines).toContain("17:05 睡眠结束");
		expect(lines).toContain("2026/09/12 21:10 入睡");
		expect(lines).toContain("2026/09/13 05:05 这段记录结束");
		expect(lines).toContain("平时 21:00 入睡、05:00 起床");
		expect(health?.nights[0]?.fellAsleepAt).toBe("2026-09-13T01:10:00.000Z");
		expect(formatHealthEvidence(null, day.timeZone, [], routine).join("\n")).toContain(
			"没有归属本日起床的实测睡眠时段",
		);
		expect(formatHealthEvidence(null, day.timeZone)).toEqual([]);
		if (!health) throw new Error("Missing observed sleep");
		expect(
			formatHealthEvidence({ ...health, nights: [] }, day.timeZone, [], routine).join("\n"),
		).toContain("不能据此写出今天几点入睡");
	});

	it("validates the full local day and maps invalid input to HTTP 400", () => {
		expect(safeValidateSummaryQuery(day)).toEqual(day);
		for (const input of [
			null,
			{},
			{ ...day, timeZone: "UTC" },
			{ ...day, start: "2026-09-13T00:00:00Z" },
		])
			expect(() => safeValidateSummaryQuery(input)).toThrow(
				expect.objectContaining({ status: 400 }),
			);
		expect(() =>
			safeValidateSummaryQuery({
				get date() {
					throw "bad";
				},
			}),
		).toThrow(expect.objectContaining({ status: 400 }));
	});

	it("scans every page, keeps late activity, and hashes all data independently of sampling", async () => {
		const { env, sqlite, insert } = setup();
		for (let index = 0; index < 405; index++)
			insert({
				id: String(index).padStart(4, "0"),
				occurredAt: new Date(
					Date.parse(day.start) + (index % 24) * 3_600_000 + index * 1000,
				).toISOString(),
				title: `事件 ${index}`,
			});
		insert({ title: "夜间阅读", occurredAt: "2026-09-13T15:59:00Z" });
		insert({
			sourceId: "health",
			sourceName: "健康",
			data: { type: "HKQuantityTypeIdentifierStepCount", value: "1000", unit: "count" },
		});
		insert({
			sourceId: "health",
			sourceName: "健康",
			occurredAt: "2026-09-13T02:31:00.000Z",
			data: { type: "HKQuantityTypeIdentifierStepCount", value: "500", unit: "count" },
		});
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(408);
		expect(evidence.insights.health.steps).toBe(1500);
		expect(prompt(evidence)).toContain("夜间阅读");
		expect(evidence.samplesBySource.日记?.length).toBeLessThanOrEqual(24);
		expect((await scan(env, false)).inputHash).toBe(evidence.inputHash);
		const hashes = new Set([evidence.inputHash]);
		for (const sql of [
			"UPDATE life_events SET content='changed' WHERE id='0000'",
			"UPDATE life_events SET data='{\"value\":23}' WHERE id='0000'",
			"UPDATE life_events SET end_at=occurred_at+1000 WHERE id='0000'",
			"UPDATE life_events SET precision='second' WHERE id='0000'",
			"UPDATE sources SET name='新名字' WHERE id='journal'",
		]) {
			sqlite.exec(sql);
			hashes.add((await scan(env, false)).inputHash);
		}
		expect(hashes.size).toBe(6);
	});

	it("uses a half-open UTC window, including clipped cross-midnight intervals", async () => {
		const { env, insert } = setup();
		insert({ occurredAt: day.start, title: "起点" });
		insert({ occurredAt: day.end, title: "次日" });
		insert({
			occurredAt: "2026-09-12T15:30:00Z",
			endAt: "2026-09-12T16:30:00Z",
			data: { type: "HKQuantityTypeIdentifierStepCount", value: 1000, unit: "count" },
		});
		insert({
			occurredAt: "2026-09-12T00:00:00Z",
			endAt: day.end,
			precision: "day",
			title: "上日全天",
		});
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(2);
		expect(evidence.insights.health.steps).toBe(500);
		expect(prompt(evidence)).not.toContain("次日");
	});

	it("bounds all narrative text globally and treats prototype-like source names as data", async () => {
		const { env, insert } = setup();
		for (let source = 0; source < 40; source++)
			for (let hour = 0; hour < 24; hour++)
				insert({
					sourceId: String(source),
					sourceName:
						source === 0 ? "__proto__" : source === 1 ? "constructor" : `source ${source}`,
					occurredAt: new Date(Date.parse(day.start) + hour * 3_600_000).toISOString(),
					title: "长".repeat(200),
					content: "记".repeat(8000),
				});
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(960);
		expect(Object.entries(evidence.sourceCounts)).toContainEqual(["__proto__", 24]);
		expect(evidence.sourceCounts.constructor).toBe(24);
		expect(Object.values(evidence.samplesBySource).flat().length).toBeLessThanOrEqual(64);
		expect(Object.keys(evidence.samplesBySource)).toHaveLength(32);
		expect(prompt(evidence).length).toBeLessThan(40_000);
	});

	it("preserves date/hour/minute/second precision at the prompt presentation boundary", async () => {
		const { env, insert } = setup();
		for (const precision of ["day", "hour", "minute", "second"] as const)
			insert({
				precision,
				sourceId: precision,
				sourceName: precision,
				occurredAt: "2026-09-13T00:01:02Z",
				content: precision === "second" ? "精确记录" : "",
			});
		const at = "2026-09-13T00:01:02Z";
		expect(formatEvidenceTime(at, "day", day.timeZone)).toBe("2026/09/13");
		expect(formatEvidenceTime(at, "hour", day.timeZone)).toBe("2026/09/13 08时");
		expect(formatEvidenceTime(at, "hour", day.timeZone)).not.toMatch(/:/);
		const text = prompt(await scan(env));
		expect(text).toContain("[2026/09/13; precision=day]");
		expect(text).toMatch(/08时; precision=hour/);
		expect(text).not.toMatch(/08时:\d{2}; precision=hour/);
		expect(text).toContain("08:01; precision=minute");
		expect(text).toContain("08:01:02; precision=second");
		expect(text).toContain("精确记录");
	});

	it("formats numeric evidence, refunds and durations without inventing mixed-currency totals", () => {
		const insights: DayInsights = {
			eventCount: 5,
			gps: { pointCount: 10, segments: [], distanceMeters: 5200, firstAt: null, lastAt: null },
			health: {
				steps: 10500,
				distanceMeters: 8000,
				flights: 12,
				waterMl: 1800,
				energyKcal: 450,
				exerciseMinutes: 45,
				standHours: 10,
				sleepMinutes: 119.6,
				sleepStages: [],
				heartRate: { average: 75, min: 58, max: 130, samples: 20 },
			},
			workoutCount: 2,
			workouts: [0, 45].map((durationMinutes) => ({
				id: String(durationMinutes),
				title: "步行",
				occurredAt: day.start,
				endAt: null,
				precision: "hour",
				durationMinutes,
				distanceMeters: null,
				energyKcal: null,
			})),
			finance: [
				{ currency: "CNY", income: 100, expense: 20, transfers: 30, count: 3 },
				{ currency: "USD", income: 0, expense: 0, transfers: 0, count: 1 },
			],
		};
		const text = formatInsightsEvidence(insights).join("\n");
		for (const expected of ["10500", "5.20", "2小时0分", "心率平均"])
			expect(text).toContain(expected);
		expect(text).not.toContain("支出");
		expect(formatInsightsEvidence(buildDayInsights([], day))).toEqual([]);
		expect(
			buildDaySummaryPrompt(
				day.date,
				day.timeZone,
				1,
				{ journal: 1 },
				{ journal: [{ time: day.start, precision: "hour", title: "记录" }] },
				buildDayInsights([], day),
			),
		).toContain("当天没有额外的天气、身体或记账证据");
	});
});

describe("compact Apple Health summary evidence", () => {
	it("puts the complete previous night and its GPS context into the waking day's real AI prompt", async () => {
		const { env, run, putHealthDay, putDay } = setup();
		const utcDay = Date.parse("2026-09-12T00:00:00Z");
		await putHealthDay(utcDay, [
			sleepRecord("AsleepCore", "2026-09-12T14:00:00Z", "2026-09-12T17:00:00Z"),
			sleepRecord("AsleepDeep", "2026-09-12T17:00:00Z", "2026-09-12T19:00:00Z"),
			sleepRecord("Awake", "2026-09-12T19:00:00Z", "2026-09-12T19:30:00Z"),
			sleepRecord("AsleepCore", "2026-09-12T19:30:00Z", "2026-09-12T23:00:00Z"),
			sleepRecord("AsleepUnspecified", "2026-09-12T14:00:00Z", "2026-09-12T23:00:00Z", "iPhone"),
			sleepRecord("InBed", "2026-09-12T13:30:00Z", "2026-09-12T23:30:00Z", "iPhone"),
		]);
		await putDay(utcDay, [
			[13.75 * 3600, 31, 121, null, null, null],
			[15 * 3600, 31.0001, 121.0001, null, null, null],
		]);
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(6);
		expect(evidence.sourceCounts).toEqual({ "Apple 健康": 6 });
		expect(evidence.insights.health).toMatchObject({
			sleepMinutes: 510,
			sleepStages: [
				{ name: "核心睡眠", minutes: 390 },
				{ name: "深睡", minutes: 120 },
			],
		});
		expect(evidence.health?.sleep).toMatchObject({
			fellAsleepAt: "2026-09-12T14:00:00.000Z",
			wokeAt: "2026-09-12T23:00:00.000Z",
			inBedMinutes: 600,
			awakeMinutes: 30,
			place: { sampleCount: 2 },
		});
		expect(evidence.insights.gps.pointCount).toBe(0);
		expect((await scan(env, false)).inputHash).toBe(evidence.inputHash);
		await handlePostDaySummary(request(), env);
		const sent =
			run.mock.calls[0]?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(sent).toContain("睡眠 8小时30分");
		expect(sent).toContain("09/12 22:00 入睡");
		expect(sent).toContain("09/13 07:00 睡眠结束");
		expect(sent).toContain("实际睡眠 510 分钟");
		expect(sent).toContain("卧床 600 分钟（不等于实际睡眠）");
		expect(sent).toContain("夜间清醒 30 分钟");
		expect(sent).toContain("深睡 120 分钟");
		expect(sent).toContain("夜间 2 个 GPS 采样");
		const previousDay = { start: "2026-09-11T16:00:00.000Z", end: day.start };
		const previous = await streamDayEvents(
			env,
			Date.parse(previousDay.start),
			Date.parse(previousDay.end),
			previousDay,
		);
		expect(previous.health?.nights).toEqual([]);
		expect(previous.health?.bedtimes).toHaveLength(1);
		expect(formatHealthEvidence(previous.health, day.timeZone).join("\n")).not.toContain(
			"醒来的这一夜",
		);
		expect(formatHealthEvidence(previous.health, day.timeZone).join("\n")).toContain(
			"今晚 09/12 22:00 入睡",
		);
	});

	it("keeps all sensor samples while reporting wearable-first activity and a duplicated workout only once", async () => {
		const { env, putHealthDay } = setup();
		const utcDay = Date.parse("2026-09-13T00:00:00Z");
		const workout: HealthNode = {
			name: "Workout",
			attributes: {
				workoutActivityType: "HKWorkoutActivityTypeCycling",
				sourceName: "Apple Watch",
				startDate: "2026-09-13T02:00:00Z",
				endDate: "2026-09-13T03:00:00Z",
				duration: "45",
				durationUnit: "min",
				totalDistance: "15",
				totalDistanceUnit: "km",
			},
		};
		await putHealthDay(utcDay, [
			healthRecord("StepCount", "2026-09-13T00:00:00Z", "400", "count", {
				endDate: "2026-09-13T04:00:00Z",
				sourceName: "iPhone",
				device: "iPhone",
			}),
			healthRecord("StepCount", "2026-09-13T01:00:00Z", "300", "count", {
				endDate: "2026-09-13T03:00:00Z",
			}),
			healthRecord("DistanceWalkingRunning", "2026-09-13T01:00:00Z", "1", "km", {
				endDate: "2026-09-13T02:00:00Z",
			}),
			healthRecord("DistanceWalkingRunning", "2026-09-13T01:00:00Z", "1.2", "km", {
				endDate: "2026-09-13T02:00:00Z",
				sourceName: "iPhone",
				device: "iPhone",
			}),
			healthRecord("FlightsClimbed", "2026-09-13T01:00:00Z", "4", "count", {
				endDate: "2026-09-13T02:00:00Z",
			}),
			healthRecord("FlightsClimbed", "2026-09-13T01:00:00Z", "5", "count", {
				endDate: "2026-09-13T02:00:00Z",
				sourceName: "iPhone",
				device: "iPhone",
			}),
			healthRecord("HeartRate", "2026-09-13T01:00:00Z", "60", "count/min"),
			healthRecord("HeartRate", "2026-09-13T01:30:00Z", "65", "count/min"),
			healthRecord("HeartRate", "2026-09-13T02:15:00Z", "160", "count/min"),
			workout,
			{ ...workout, attributes: { ...workout.attributes, sourceName: "Strava" } },
		]);
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(11);
		expect(evidence.sourceCounts).toEqual({ "Apple 健康": 11 });
		expect(evidence.insights.health).toMatchObject({
			steps: 500,
			distanceMeters: 1000,
			flights: 4,
		});
		expect(evidence.insights.workoutCount).toBe(1);
		expect(evidence.insights.workouts).toEqual([
			expect.objectContaining({ title: "骑行", durationMinutes: 45, distanceMeters: 15000 }),
		]);
		const text = prompt(evidence);
		expect(text).toContain("步数 500 步");
		expect(text).toContain("爬楼 4 层");
		expect(text).toContain("共 1 次运动");
		expect(text).toContain("09/13 10:15 心率 160 bpm；同时段有 骑行");
		expect(text).toContain("09/13 10:00 至 09/13 11:00 骑行，锻炼 45 分钟，距离 15.00 公里");
		expect(text).toContain("2026/09/13 09时 这一小时：爬楼，该小时 4.0 层");
		expect(text).toContain("2026/09/13 09时 这一小时：这一小时的脚步");
	});

	it("renders rare pressure/ECG measurements at local times with distinct physiological units", async () => {
		const { env, putHealthDay, run } = setup();
		const measuredAt = "2026-09-13T01:15:00Z";
		const systolic = healthRecord("BloodPressureSystolic", measuredAt, "122", "mmHg", {
			sourceName: "Cuff",
		});
		const diastolic = healthRecord("BloodPressureDiastolic", measuredAt, "78", "mmHg", {
			sourceName: "Cuff",
		});
		await putHealthDay(Date.parse("2026-09-13T00:00:00Z"), [
			{
				name: "Correlation",
				attributes: {
					type: "HKCorrelationTypeIdentifierBloodPressure",
					startDate: measuredAt,
					sourceName: "Cuff",
				},
				children: [systolic, diastolic],
			},
			systolic,
			diastolic,
			healthRecord("BloodPressureSystolic", "2026-09-13T01:30:00Z", "120", "mmHg", {
				sourceName: "Cuff",
			}),
			healthRecord("BloodPressureDiastolic", "2026-09-13T01:45:00Z", "80", "mmHg", {
				sourceName: "Other cuff",
			}),
			{
				name: "Electrocardiogram",
				attributes: {
					startDate: "2026-09-13T02:05:00Z",
					filePath: "electrocardiograms/ecg.csv",
					samplingHz: "512",
					classification: "HKElectrocardiogramClassificationSinusRhythm",
					averageHeartRate: "72",
					durationSeconds: "30",
					sampleCount: "15360",
					unit: "µV",
				},
			},
			healthRecord("OxygenSaturation", "2026-09-13T03:00:00Z", "0.96", "%"),
			healthRecord("OxygenSaturation", "2026-09-13T04:00:00Z", "98", "%"),
			healthRecord("RespiratoryRate", "2026-09-13T03:00:00Z", "14.5", "count/min"),
			healthRecord("HeartRateVariabilitySDNN", "2026-09-13T03:01:00Z", "42", "ms"),
			healthRecord("RestingHeartRate", "2026-09-13T03:02:00Z", "58", "count/min"),
			healthRecord("VO2Max", "2026-09-13T03:03:00Z", "38.2", "mL/min·kg"),
			healthRecord("HeartRate", "2026-09-13T05:00:00Z", "60", "count/min"),
			healthRecord("HeartRate", "2026-09-13T05:30:00Z", "65", "count/min"),
			healthRecord("HeartRate", "2026-09-13T06:00:00Z", "160", "count/min"),
		]);
		const evidence = await scan(env);
		expect(evidence.health?.bloodPressure).toHaveLength(3);
		expect(evidence.health?.bloodPressure[0]?.eventIds).toHaveLength(3);
		expect(evidence.health?.ecg[0]).toMatchObject({
			averageHeartRate: "72",
			unit: "µV",
			durationSeconds: "30",
			samplingHz: "512",
			sampleCount: "15360",
		});
		await handlePostDaySummary(request(), env);
		const sent =
			run.mock.calls[0]?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(sent).toContain("09/13 09:15 血压 122/78 mmHg（Cuff）");
		expect(sent).toContain("09/13 09:30 血压 120/未记录 mmHg");
		expect(sent).toContain("09/13 09:45 血压 未记录/80 mmHg");
		expect(sent).toContain("血氧：2 次测量，均值 97.0%");
		expect(sent).toContain("呼吸频率：1 次测量，均值 14.5 次/分");
		expect(sent).toContain("当日样本汇总，无时段归属");
		expect(sent).toContain("心率变异性 HRV：当日样本均值 42.0 ms");
		expect(sent).toContain("静息心率：当日记录 58 bpm");
		expect(sent).toContain(
			"HKQuantityTypeIdentifierVO2Max（单位 mL/min·kg）：1 条观测，原数值范围 38.2–38.2；首条 2026/09/13 11:03:00，原值 38.2",
		);
		expect(sent).toContain("09/13 14:00 心率 160 bpm；无同时段活动记录");
		const ecgLine = sent.split("\n").find((line) => line.includes("心电图测量")) ?? "";
		expect(ecgLine).toContain("09/13 10:05");
		expect(ecgLine).toContain("设备原始分类：窦性心律");
		expect(ecgLine).toMatch(/72\s*bpm/);
		expect(ecgLine).toMatch(/30\s*(秒|s)/);
		expect(ecgLine).not.toMatch(/72\s*µV/);
	});

	it("hashes every original in-day sample and its nested metadata even beyond the narrative sample budget", async () => {
		const { env, putHealthDay } = setup();
		const utcDay = Date.parse("2026-09-13T00:00:00Z");
		const records = Array.from({ length: 60 }, (_, index) =>
			healthRecord("HeartRate", new Date(utcDay + index * 60_000).toISOString(), "80", "count/min"),
		);
		await putHealthDay(utcDay, records);
		const first = await data(await handlePostDaySummary(request(), env));
		expect(first.eventCount).toBe(60);
		expect((await scan(env)).samplesBySource["Apple 健康"]).toHaveLength(2);
		const changed = records.map((record, index) =>
			index === 30 ? { ...record, attributes: { ...record.attributes, value: "81" } } : record,
		);
		await putHealthDay(utcDay, changed);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(true);
		await putHealthDay(utcDay, records, Date.now());
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		const withMetadata = records.map((record, index) =>
			index === 30
				? {
						...record,
						children: [
							{ name: "MetadataEntry", attributes: { key: "motionContext", value: "rest" } },
						],
					}
				: record,
		);
		await putHealthDay(utcDay, withMetadata);
		const result = await data(await handleGetDaySummary(env, url()));
		expect(result.stale).toBe(true);
		expect(result.summary).toEqual(first.summary);
		expect(result.eventCount).toBe(60);
	});

	it("invalidates a waking-day summary when only yesterday's sleep or overnight location evidence changes", async () => {
		const { env, putHealthDay, putDay } = setup();
		const utcDay = Date.parse("2026-09-12T00:00:00Z");
		const beforeMidnight = sleepRecord(
			"AsleepCore",
			"2026-09-12T14:00:00Z",
			"2026-09-12T15:00:00Z",
		);
		const after = sleepRecord("AsleepDeep", "2026-09-12T15:00:00Z", "2026-09-12T23:00:00Z");
		await putHealthDay(utcDay, [beforeMidnight, after]);
		await putDay(utcDay, [
			[13.75 * 3600, 31, 121, null, null, null],
			[15 * 3600, 31.0001, 121.0001, null, null, null],
		]);
		const first = await data(await handlePostDaySummary(request(), env));
		expect(first.eventCount).toBe(1);
		await putHealthDay(utcDay, [
			{
				...beforeMidnight,
				attributes: { ...beforeMidnight.attributes, startDate: "2026-09-12T13:30:00Z" },
			},
			after,
		]);
		const sleepChanged = await data(await handleGetDaySummary(env, url()));
		expect(sleepChanged.stale).toBe(true);
		expect(sleepChanged.eventCount).toBe(1);
		expect((await scan(env)).insights.health.sleepMinutes).toBe(570);
		await putHealthDay(utcDay, [beforeMidnight, after], Date.now());
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		await putDay(utcDay, [
			[13.75 * 3600, 32, 122, null, null, null],
			[15 * 3600, 32.0001, 122.0001, null, null, null],
		]);
		const placeChanged = await data(await handleGetDaySummary(env, url()));
		expect(placeChanged.stale).toBe(true);
		expect(placeChanged.eventCount).toBe(1);
	});

	it("keeps unchanged health summaries fresh when only import timestamps and outside-window indices change", async () => {
		const { env, sqlite, putHealthDay } = setup();
		const utcDay = Date.parse("2026-09-12T00:00:00Z");
		const inside = [
			healthRecord("HeartRate", "2026-09-12T16:30:00Z", "70", "count/min"),
			healthRecord("HeartRate", "2026-09-12T17:30:00Z", "80", "count/min"),
		];
		await putHealthDay(utcDay, inside);
		await handlePostDaySummary(request(), env);
		const before = await readHealthEvents(env.DB, Date.parse(day.start), Date.parse(day.end));
		await putHealthDay(
			utcDay,
			[healthRecord("HeartRate", "2026-09-12T10:00:00Z", "65", "count/min"), ...inside],
			Date.now(),
		);
		sqlite.exec(
			"UPDATE provider_days SET content_hash='changed-outside-window' WHERE source_id='apple-health'",
		);
		const after = await readHealthEvents(env.DB, Date.parse(day.start), Date.parse(day.end));
		expect(after.map((event) => event.id)).not.toEqual(before.map((event) => event.id));
		expect(after[0]?.updatedAt).not.toBe(before[0]?.updatedAt);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
	});

	it("keeps coincident health samples fresh across a virtual-index digit boundary", async () => {
		const { env, putHealthDay } = setup();
		const utcDay = Date.parse("2026-09-12T00:00:00Z");
		const outside = Array.from({ length: 9 }, (_, index) =>
			healthRecord("HeartRate", new Date(utcDay + index * 60_000).toISOString(), "65", "count/min"),
		);
		const inside = [
			healthRecord("HeartRate", "2026-09-12T16:30:00Z", "70", "count/min"),
			healthRecord("HeartRate", "2026-09-12T16:30:00Z", "80", "count/min"),
		];
		await putHealthDay(utcDay, [...outside, ...inside]);
		const first = await data(await handlePostDaySummary(request(), env));
		await putHealthDay(
			utcDay,
			[...outside, healthRecord("HeartRate", "2026-09-12T10:00:00Z", "65", "count/min"), ...inside],
			Date.now(),
		);
		const result = await data(await handleGetDaySummary(env, url()));
		expect(result.eventCount).toBe(2);
		expect(result.stale).toBe(false);
		expect(result.summary?.inputHash).toBe(first.summary?.inputHash);
	});

	it("counts dense compact dimensions and every legacy page without reviving replaced health records", async () => {
		const { env, putHealthDay, putDay, insert } = setup();
		const utcDay = Date.parse("2026-09-13T00:00:00Z");
		const records = Array.from({ length: 230 }, (_, index) =>
			healthRecord(
				index === 229 ? "WalkingAsymmetryPercentage" : "HeartRate",
				new Date(utcDay + index * 60_000).toISOString(),
				index === 229 ? "0.04" : "75",
				index === 229 ? "%" : "count/min",
			),
		);
		await putHealthDay(utcDay, records);
		await putDay(utcDay, [
			[0, 31, 121, null, null, null],
			[60, 31.001, 121.001, null, null, null],
		]);
		insert({
			sourceId: "apple-health",
			sourceName: "Apple 健康",
			title: "old health row",
			data: { type: "HKQuantityTypeIdentifierStepCount", value: "99999", unit: "count" },
		});
		for (let index = 0; index < 205; index++)
			insert({
				id: `journal-${index}`,
				occurredAt: new Date(utcDay + index * 60_000).toISOString(),
			});
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(437);
		expect(evidence.sourceCounts).toEqual({ "Apple 健康": 230, Footprint: 2, 日记: 205 });
		expect(evidence.insights.health.steps).toBeNull();
		expect(evidence.insights.health.heartRate?.samples).toBe(229);
		expect(prompt(evidence)).not.toContain("old health row");
		expect(prompt(evidence)).toContain("WalkingAsymmetryPercentage");
		expect((await scan(env, false)).inputHash).toBe(evidence.inputHash);
	});
});

describe("saved daily summaries", () => {
	it("summarizes compact GPS-only days, keeps duplicates and respects original segment breaks", async () => {
		const { env, putDay } = setup();
		await putDay(
			Date.parse("2026-09-13T00:00:00Z"),
			[
				[0, 0, 0, null, -1, null],
				[0, 0, 0, null, 0, null],
				[60, 0, 0.01, null, 1, null],
				[120, 0, 0.02, null, 1, null],
			],
			[2],
		);
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(4);
		expect(evidence.insights.gps.pointCount).toBe(4);
		expect(evidence.insights.gps.distanceMeters).toBeGreaterThan(1100);
		expect(evidence.insights.gps.distanceMeters).toBeLessThan(1120);
		expect(evidence.sourceCounts.Footprint).toBe(4);
		expect(evidence.inputHash).toBe((await scan(env, false)).inputHash);
		const result = await data(await handlePostDaySummary(request(), env));
		expect(result.summary?.eventCount).toBe(4);
		expect(result.stale).toBe(false);
	});

	it("merges compact GPS with paginated legacy records in UTC order and avoids covered legacy days", async () => {
		const { env, putDay, insert } = setup();
		const utcDay = Date.parse("2026-09-13T00:00:00Z");
		await putDay(utcDay, [
			[0, 0, 0, null, null, null],
			[120, 0, 0.02, null, null, null],
		]);
		insert({
			sourceId: "footprint",
			sourceName: "Footprint",
			occurredAt: "2026-09-13T00:01:00Z",
			data: { latitude: 45, longitude: 90 },
		});
		insert({
			sourceId: "footprint",
			sourceName: "Footprint",
			occurredAt: "2026-09-12T23:59:00Z",
			data: { latitude: 0, longitude: -0.01 },
		});
		for (let index = 0; index < 205; index++)
			insert({
				id: `journal-${index}`,
				occurredAt: index % 2 ? "2026-09-13T00:00:00Z" : "2026-09-13T00:02:00Z",
			});
		insert({ id: "z-last", occurredAt: "2026-09-13T00:02:00Z" });
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(209);
		expect(evidence.insights.gps.pointCount).toBe(3);
		expect(evidence.insights.gps.distanceMeters).toBeGreaterThan(3300);
		expect(evidence.insights.gps.distanceMeters).toBeLessThan(3350);
		expect(evidence.samplesBySource.Footprint?.map((sample) => sample.time)).toEqual([
			"2026-09-12T23:59:00.000Z",
			"2026-09-13T00:00:00.000Z",
			"2026-09-13T00:02:00.000Z",
		]);
	});

	it("keeps summaries fresh after outside-window edits or import-time changes, and supports A → B → A", async () => {
		const { env, sqlite, putDay } = setup();
		const currentDay = Date.parse("2026-09-13T00:00:00Z");
		const previousDay = currentDay - FOOTPRINT_DAY_MS;
		const inside: FootprintPoint[] = [
			[57600, 0, 0, null, null, null],
			[57660, 0, 0.01, null, null, null],
		];
		await putDay(previousDay, inside);
		await putDay(currentDay, [
			[1, 0, 0.02, null, null, null],
			[57600, 0, 1, null, null, null],
		]);
		const original = await data(await handlePostDaySummary(request(), env));
		const hashA = original.summary?.inputHash;
		const eventsHashA = (await scan(env, false)).inputHash;
		await putDay(previousDay, [[1, 1, 1, null, null, null], ...inside], [1]);
		await putDay(currentDay, [
			[1, 0, 0.02, null, null, null],
			[57600, 5, 5, null, null, null],
		]);
		sqlite.exec(
			"UPDATE provider_days SET updated_at = updated_at + 1000, content_hash = 'whole-day-changed'",
		);
		const outside = await data(await handleGetDaySummary(env, url()));
		expect(outside.stale).toBe(false);
		expect((await scan(env, false)).inputHash).toBe(eventsHashA);
		expect(outside.summary?.inputHash).toBe(hashA);
		expect(outside.eventCount).toBe(3);
		await putDay(previousDay, inside, [0]);
		expect((await scan(env, false)).inputHash).toBe(eventsHashA);
		await putDay(previousDay, inside, [1]);
		expect((await scan(env, false)).inputHash).not.toBe(eventsHashA);
		await putDay(previousDay, [[57600, 0, 0.5, null, null, null]]);
		const changed = await data(await handleGetDaySummary(env, url()));
		expect(changed.stale).toBe(true);
		expect(changed.eventCount).toBe(2);
		expect((await scan(env, false)).inputHash).not.toBe(eventsHashA);
		await putDay(previousDay, inside);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		expect((await scan(env, false)).inputHash).toBe(eventsHashA);
	});

	it("reports empty days honestly, never calls AI and releases the lease on rejection", async () => {
		const { env, sqlite, run } = setup();
		expect(await data(await handleGetDaySummary(env, url()))).toEqual({
			summary: null,
			stale: false,
			eventCount: 0,
		});
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({
			status: 400,
			code: "no_records",
		});
		expect(run).not.toHaveBeenCalled();
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_summary_leases").get()?.n).toBe(0);
		await expect(
			handleGetDaySummary(env, new URL("http://localhost/api/day-summary")),
		).rejects.toMatchObject({ status: 400 });
	});

	it("persists successful output, detects changed records, and replaces only on another success", async () => {
		const { env, sqlite, insert, run } = setup();
		insert();
		const first = await data(await handlePostDaySummary(request(), env));
		expect(first.summary?.content).toBe("当天记录了阅读与步行。");
		expect(first.stale).toBe(false);
		expect(await data(await handleGetDaySummary(env, url()))).toEqual(first);
		insert({ title: "晚餐" });
		const stale = await data(await handleGetDaySummary(env, url()));
		expect(stale.stale).toBe(true);
		expect(stale.eventCount).toBe(2);
		expect(stale.summary).toEqual(first.summary);
		run.mockRejectedValueOnce(new Error("upstream secret must not leak"));
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({ status: 502 });
		expect((await data(await handleGetDaySummary(env, url()))).summary).toEqual(first.summary);
		run.mockResolvedValueOnce({ response: "新的当天总结。" });
		const next = await data(await handlePostDaySummary(request(), env));
		expect(next.summary?.content).toBe("新的当天总结。");
		expect(next.stale).toBe(false);
		expect(next.summary?.inputHash).not.toBe(first.summary?.inputHash);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_summary_leases").get()?.n).toBe(0);
	});

	it("marks a saved diary stale when only the writing contract changes, without overwriting it", async () => {
		const { env, insert, run } = setup();
		insert();
		const saved = await data(await handlePostDaySummary(request(), env));
		vi.resetModules();
		vi.doMock("../../worker/diary-prompt.js", () => ({
			DIARY_SYSTEM_PROMPT,
			DIARY_PROMPT_VERSION: "isolated-next-writing-contract",
		}));
		try {
			const changed = await import("../../worker/day-summary.js");
			const read = await data(await changed.handleGetDaySummary(env, url()));
			expect(read.stale).toBe(true);
			expect(read.summary).toEqual(saved.summary);
			expect(read.eventCount).toBe(saved.eventCount);
			expect(run).toHaveBeenCalledOnce();
		} finally {
			vi.doUnmock("../../worker/diary-prompt.js");
			vi.resetModules();
		}
	});

	it("passes personal names and wall-clock routine to the prompt and invalidates saved diaries on settings changes", async () => {
		const { env, insert, run } = setup();
		insert();
		const save = (label: string, bedtime = "03:00") =>
			handlePutGeneralSettings(
				new Request("http://localhost/api/settings/general", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						places: [{ id: "home", label, latitude: 31, longitude: 121, radiusMeters: 300 }],
						routine: { bedtime, wakeTime: "11:00", timeZone: "Asia/Shanghai" },
					}),
				}),
				env,
			);
		await save("家");
		const saved = await data(await handlePostDaySummary(request(), env));
		const prompt =
			run.mock.calls[0]?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(prompt).toContain("用户确认的地点与作息背景，与当日观测分开");
		expect(prompt).toContain("通常 03:00 入睡，11:00 起床");
		expect(prompt).toContain('"label":"家"');
		expect(prompt).toContain("不是当天的睡眠记录");
		expect(prompt).not.toContain("在用户命名的「家」"); // Merely configuring home is not evidence of a visit.
		await save(" 家 ");
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		await save("书房");
		const stale = await data(await handleGetDaySummary(env, url()));
		expect(stale.stale).toBe(true);
		expect(stale.summary).toEqual(saved.summary);
		await save("家", "02:30");
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(true);
		await save("家");
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		expect(run).toHaveBeenCalledOnce();
	});

	it("marks a generation stale if habitual context changes while the model is running", async () => {
		const { env, insert, run } = setup();
		insert();
		run.mockImplementationOnce(async () => {
			await handlePutGeneralSettings(
				new Request("http://localhost/api/settings/general", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						places: [],
						routine: { bedtime: "09:00", wakeTime: "17:00", timeZone: "Asia/Shanghai" },
					}),
				}),
				env,
			);
			return { response: "依据生成开始时的材料。" };
		});
		expect((await data(await handlePostDaySummary(request(), env))).stale).toBe(true);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(true);
	});

	it("does not save public-context that arrived while the model was running", async () => {
		const { env, sqlite, putDay, run } = setup();
		await putDay(Date.parse("2026-09-13T00:00:00Z"), [
			[3600, 31.25, 120.58, null, null, null],
			[7200, 31.2501, 120.5801, null, null, null],
		]);
		const weatherKey = buildWeatherCacheKey({
			...day,
			latitude: roundCoordinate(31.25),
			longitude: roundCoordinate(120.58),
		});
		run.mockImplementationOnce(async () => {
			sqlite
				.prepare(
					"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at, expires_at) VALUES ('weather', ?, ?, ?, ?)",
				)
				.run(weatherKey, '{"temperatureMax":31}', Date.now(), Date.now() + 3_600_000);
			return { response: "生成中写入的天气。" };
		});
		const result = await data(await handlePostDaySummary(request(), env));
		expect(result.stale).toBe(true);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(true);
		expect((await data(await handleGetDaySummary(env, url()))).summary?.inputHash).toBe(
			result.summary?.inputHash,
		);
	});

	it("marks a summary stale when an import arrives during model generation", async () => {
		const { env, insert, run } = setup();
		insert();
		run.mockImplementationOnce(async () => {
			insert({ title: "迟到数据" });
			return { response: "开始生成时的记录。" };
		});
		const result = await data(await handlePostDaySummary(request(), env));
		expect(result.stale).toBe(true);
		expect(result.eventCount).toBe(2);
		expect(result.summary?.eventCount).toBe(1);
	});

	it("uses an atomic lease to reject concurrent work and safely replaces an expired lease", async () => {
		const { env, sqlite, insert, run } = setup();
		insert();
		let finish: ((value: { response: string }) => void) | undefined;
		run.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const first = handlePostDaySummary(request(), env);
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({
			status: 409,
			code: "generation_in_progress",
		});
		finish?.({ response: "并发生成成功。" });
		await expect(first).resolves.toBeInstanceOf(Response);
		sqlite
			.prepare("INSERT INTO day_summary_leases VALUES (?, ?, 'expired', 0)")
			.run(day.date, day.timeZone);
		expect((await data(await handlePostDaySummary(request(), env))).stale).toBe(false);
	});

	it("recovers lost lease/save acknowledgements and transient reads without repeating AI", async () => {
		const { env, sqlite, insert, run, prepare } = setup();
		insert();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const original = prepare.getMockImplementation();
		const interrupted = new Set<string>();
		prepare.mockImplementation((sql) => {
			if (!original) throw new Error("missing test implementation");
			const statement = original(sql);
			if (sql.includes("FROM general_settings") && !interrupted.has("read")) {
				interrupted.add("read");
				throw new Error("Network connection lost.");
			}
			const write = statement.run.bind(statement);
			const kind = sql.includes("INSERT INTO day_summary_leases")
				? "lease"
				: sql.includes("INSERT INTO day_summaries")
					? "save"
					: null;
			if (kind)
				statement.run = async () => {
					const result = await write();
					if (!interrupted.has(kind)) {
						interrupted.add(kind);
						throw new Error("Network connection lost.");
					}
					return result;
				};
			return statement;
		});
		const result = await data(await handlePostDaySummary(request(), env));
		expect(result.summary?.content).toBe("当天记录了阅读与步行。");
		expect(run).toHaveBeenCalledOnce();
		expect(interrupted.size).toBe(3);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_summaries").get()?.n).toBe(1);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_summary_leases").get()?.n).toBe(0);
	});

	it("never reports success or deletes another request's lease after losing ownership", async () => {
		const { env, sqlite, insert, run } = setup();
		insert();
		const before = await data(await handlePostDaySummary(request(), env));
		run.mockImplementationOnce(async () => {
			sqlite
				.prepare("UPDATE day_summary_leases SET lease_token='successor', leased_until=?")
				.run(Date.now() + 90_000);
			return { response: "不能保存的旧结果。" };
		});
		await expect(handlePostDaySummary(request(), env)).rejects.toMatchObject({
			status: 409,
			code: "generation_expired",
		});
		expect((await data(await handleGetDaySummary(env, url()))).summary).toEqual(before.summary);
		expect(sqlite.prepare("SELECT lease_token FROM day_summary_leases").get()?.lease_token).toBe(
			"successor",
		);
	});

	it("detects changed saved time boundaries or counts even when the hash is unchanged", async () => {
		const { env, sqlite, insert } = setup();
		insert();
		await handlePostDaySummary(request(), env);
		for (const column of ["start_at", "end_at", "event_count"]) {
			sqlite.exec(`UPDATE day_summaries SET ${column} = 'different'`);
			expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(true);
			await handlePostDaySummary(request(), env);
		}
	});

	it("keeps database failures distinct from a busy lease and tolerates failed lease cleanup", async () => {
		const { env, prepare, insert } = setup();
		insert();
		prepare.mockImplementationOnce(() => {
			throw new Error("database unavailable");
		});
		await expect(handlePostDaySummary(request(), env)).rejects.toThrow("database unavailable");
		const original = prepare.getMockImplementation();
		prepare.mockImplementation((sql) => {
			if (sql.startsWith("DELETE FROM day_summary_leases")) throw new Error("cleanup unavailable");
			if (!original) throw new Error("missing test implementation");
			return original(sql);
		});
		expect((await data(await handlePostDaySummary(request(), env))).summary).not.toBeNull();
	});

	it("folds cached public context into the hash and never fetches it on GET", async () => {
		const { env, sqlite, putDay } = setup();
		await putDay(Date.parse("2026-09-13T00:00:00Z"), [
			[3600, 31.25, 120.58, null, null, null],
			[7200, 31.2501, 120.5801, null, null, null],
		]);
		const first = await data(await handlePostDaySummary(request(), env));
		expect(first.stale).toBe(false);
		vi.mocked(getDayWeather).mockClear();
		vi.mocked(getDaySun).mockClear();
		vi.mocked(getPlaceLabel).mockClear();
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		expect(getDayWeather).not.toHaveBeenCalled();
		expect(getDaySun).not.toHaveBeenCalled();
		expect(getPlaceLabel).not.toHaveBeenCalled();
		const weatherKey = buildWeatherCacheKey({
			...day,
			latitude: roundCoordinate(31.25),
			longitude: roundCoordinate(120.58),
		});
		sqlite
			.prepare(
				"INSERT INTO public_context_cache (kind, cache_key, data_json, created_at, expires_at) VALUES ('weather', ?, ?, ?, ?)",
			)
			.run(weatherKey, '{"temperatureMax":31}', Date.now(), Date.now() + 3_600_000);
		const stale = await data(await handleGetDaySummary(env, url()));
		expect(stale.stale).toBe(true);
		expect(stale.summary?.inputHash).toBe(first.summary?.inputHash);
		expect(getDayWeather).not.toHaveBeenCalled();
	});

	it("carries the previous diary and optional revision into the next prompt", async () => {
		const { env, insert, run } = setup();
		insert();
		await handlePostDaySummary(request(), env);
		run.mockResolvedValueOnce({ response: "改过的日记。" });
		await handlePostDaySummary(request({ ...day, revision: "少写步数" }), env);
		const messages = run.mock.calls.at(-1)?.[1].messages ?? [];
		const sent = messages.find((message) => message.role === "user")?.content ?? "";
		expect(sent).toContain("上一则日记");
		expect(sent).toContain("当天记录了阅读与步行。");
		expect(sent).toContain("少写步数");
		expect(messages[0]).toEqual({ role: "system", content: DIARY_SYSTEM_PROMPT });
		expect(sent).not.toContain("/no_think");
		await handlePostDaySummary(request(), env);
		const freshPrompt =
			run.mock.calls.at(-1)?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(freshPrompt).not.toContain("【上一则日记】");
		expect(freshPrompt).not.toContain("改过的日记。");
	});
});

describe("compact pixiu in diary evidence", () => {
	it("hashes compact pixiu without virtual ids and skips leftover event rows", async () => {
		const { env, sqlite, insert, run } = setup();
		const utcDay = Date.parse("2026-09-13T00:00:00.000Z");
		const firstAt = Date.parse(day.start);
		sqlite
			.prepare("INSERT OR IGNORE INTO sources VALUES (?, ?, 'import', 'pixiu', ?)")
			.run("pixiu", "貔貅记账", Date.now());
		const payload = {
			v: 1,
			precision: "day",
			sourceDate: "2026-09-13",
			timeZone: "Asia/Shanghai",
			utcOffsetMinutes: 480,
			columns: [
				"日期",
				"交易分类",
				"交易类型",
				"流入金额",
				"流出金额",
				"币种",
				"资金账户",
				"标签",
				"备注",
			],
			rows: [["2026-09-13", "餐饮", "支出", "0.00", "32.00", "CNY", "现金", "", "午饭"]],
		};
		sqlite
			.prepare("INSERT INTO provider_days VALUES ('pixiu', ?, 1, ?, ?, ?, ?, ?, ?, ?)")
			.run(
				utcDay,
				firstAt,
				firstAt + 1000,
				200,
				JSON.stringify({ totals: [] }),
				JSON.stringify(payload),
				"hash-a",
				Date.now(),
			);
		insert({
			id: "legacy-pixiu",
			sourceId: "pixiu",
			sourceName: "貔貅记账",
			precision: "day",
			title: "旧行",
			content: "不应重复",
			data: { 备注: "旧行" },
		});
		const evidence = await scan(env);
		expect(evidence.eventCount).toBe(1);
		expect(evidence.pixiuEvents).toHaveLength(1);
		expect(evidence.pixiuEvents[0]?.data).toMatchObject({
			流出金额: "32.00",
			sourceDate: "2026-09-13",
		});
		expect(prompt(evidence)).not.toContain("旧行");
		await handlePostDaySummary(request(), env);
		const sent =
			run.mock.calls.at(-1)?.[1].messages.find((message) => message.role === "user")?.content ?? "";
		expect(sent).toContain("源记账日期，无交易时刻");
		expect(sent).toContain("32.00");
		expect(sent).toContain("原分类「餐饮」");
		expect(sent).not.toContain("日常消费（仅「日常支出」流出）：32.00");
		const hash = evidence.inputHash;
		expect((await scan(env, false)).inputHash).toBe(hash);
	});
});
