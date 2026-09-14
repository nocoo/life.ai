import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaySummaryQuery, DaySummaryResult } from "../../src/models/ai.js";
import { buildDayInsights, type DayInsights } from "../../src/models/day-insights.js";
import {
	FOOTPRINT_DAY_MS,
	type FootprintPoint,
	validateFootprintDay,
} from "../../src/models/footprint.js";
import type { LifeEvent } from "../../src/models/types.js";
import {
	buildDaySummaryPrompt,
	formatInsightsEvidence,
	handleGetDaySummary,
	handlePostDaySummary,
	safeValidateSummaryQuery,
	streamDayEvents,
} from "../../worker/day-summary.js";
import type { WorkerEnv } from "../../worker/types.js";

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
	for (const name of ["0001_initial.sql", "0002_daily_ai.sql", "0003_provider_days.sql"])
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
	const run = vi.fn(async () => ({ response: "当天记录了阅读与步行。" }));
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
	return { sqlite, env, run, insert, prepare, putDay };
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
function prompt(evidence: Awaited<ReturnType<typeof scan>>) {
	return buildDaySummaryPrompt(
		day.date,
		day.timeZone,
		evidence.eventCount,
		evidence.sourceCounts,
		evidence.samplesBySource,
		evidence.insights,
	);
}

describe("daily summary evidence", () => {
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
		const text = prompt(await scan(env));
		expect(text).toContain("[2026/09/13; precision=day]");
		expect(text).toMatch(/08时; precision=hour/);
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
				{ currency: "CNY", income: 100, expense: -20, transfers: 30, count: 3 },
				{ currency: "USD", income: 0, expense: 0, transfers: 0, count: 1 },
			],
		};
		const text = formatInsightsEvidence(insights).join("\n");
		for (const expected of [
			"10500",
			"5.20",
			"2小时0分",
			"支出 -20.00",
			"收入 100.00",
			"转账/转出 30.00",
			"CNY",
			"USD",
			"心率平均",
		])
			expect(text).toContain(expected);
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
		).toContain("无特定生理或收支数值指标");
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
		expect((await scan(env, false)).inputHash).toBe(hashA);
		expect(outside.eventCount).toBe(3);
		await putDay(previousDay, inside, [0]);
		expect((await scan(env, false)).inputHash).toBe(hashA);
		await putDay(previousDay, inside, [1]);
		expect((await scan(env, false)).inputHash).not.toBe(hashA);
		await putDay(previousDay, [[57600, 0, 0.5, null, null, null]]);
		const changed = await data(await handleGetDaySummary(env, url()));
		expect(changed.stale).toBe(true);
		expect(changed.eventCount).toBe(2);
		expect((await scan(env, false)).inputHash).not.toBe(hashA);
		await putDay(previousDay, inside);
		expect((await data(await handleGetDaySummary(env, url()))).stale).toBe(false);
		expect((await scan(env, false)).inputHash).toBe(hashA);
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
});
