import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	FOOTPRINT_DAY_MS,
	type FootprintPoint,
	footprintDayEvents,
	validateFootprintDay,
} from "../../src/models/footprint.js";
import type { EventPage, LifeEvent } from "../../src/models/types.js";
import { handleGetEvents, readEventRows } from "../../worker/events.js";
import { readFootprintDays } from "../../worker/footprint-read.js";
import * as workerTime from "../../worker/time.js";
import { sqliteD1 } from "../helpers/sqlite-d1.js";

const UTC_DAY = Date.parse("2026-09-13T00:00:00Z");
const databases: DatabaseSync[] = [];
afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setup() {
	const fixture = sqliteD1();
	const { sqlite } = fixture;
	databases.push(sqlite);
	sqlite.exec("CREATE TABLE _test_marker (env TEXT); INSERT INTO _test_marker VALUES ('test')");
	let sequence = 0;
	const insert = (changes: Partial<LifeEvent> = {}) => {
		const event: LifeEvent = {
			id: `event-${String(sequence++).padStart(4, "0")}`,
			sourceId: "journal",
			sourceName: "日记",
			sourceKind: "import",
			occurredAt: new Date(UTC_DAY + 3600_000).toISOString(),
			endAt: null,
			precision: "second",
			title: "记录",
			content: "",
			data: {},
			updatedAt: new Date(UTC_DAY).toISOString(),
			...changes,
		};
		sqlite
			.prepare("INSERT OR IGNORE INTO sources VALUES (?, ?, ?, ?, 0)")
			.run(event.sourceId, event.sourceName, event.sourceKind, event.sourceId);
		sqlite
			.prepare("INSERT INTO life_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
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
	const putDay = async (utcDay: number, points: FootprintPoint[], source = "footprint") => {
		const day = await validateFootprintDay({
			utcDay,
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points,
			},
		});
		sqlite
			.prepare("INSERT OR IGNORE INTO sources VALUES (?, ?, 'import', ?, 0)")
			.run(source, source, source);
		sqlite
			.prepare("INSERT OR REPLACE INTO provider_days VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
			.run(
				source,
				day.utcDay,
				day.recordCount,
				day.firstAt,
				day.lastAt,
				day.payloadBytes,
				JSON.stringify(day.summary),
				JSON.stringify(day.data),
				day.contentHash,
				UTC_DAY,
			);
		return { ...day, updatedAt: UTC_DAY };
	};
	return { ...fixture, insert, putDay };
}

const point = (second = 0): FootprintPoint => [second, 0, 0, null, null, null];
function query(extra: Record<string, string> = {}) {
	return new URL(
		`http://localhost:17011/api/events?${new URLSearchParams({
			start: new Date(UTC_DAY).toISOString(),
			end: new Date(UTC_DAY + FOOTPRINT_DAY_MS).toISOString(),
			...extra,
		})}`,
	);
}
async function page(response: Response): Promise<EventPage> {
	return ((await response.json()) as { data: EventPage }).data;
}

describe("indexed daily event reads", () => {
	it("returns the half-open occurrence range and overlapping intervals once, preserving precision", async () => {
		const { env, insert } = setup();
		const crossing = insert({
			occurredAt: new Date(UTC_DAY - 1000).toISOString(),
			endAt: new Date(UTC_DAY + 1000).toISOString(),
		});
		const zero = insert({
			occurredAt: new Date(UTC_DAY).toISOString(),
			endAt: new Date(UTC_DAY).toISOString(),
		});
		const interval = insert({ endAt: new Date(UTC_DAY + 7200_000).toISOString() });
		const date = insert({ precision: "day", occurredAt: new Date(UTC_DAY).toISOString() });
		insert({ occurredAt: new Date(UTC_DAY + FOOTPRINT_DAY_MS).toISOString() });
		insert({
			occurredAt: new Date(UTC_DAY - 1000).toISOString(),
			endAt: new Date(UTC_DAY).toISOString(),
		});
		insert({
			precision: "day",
			occurredAt: new Date(UTC_DAY - FOOTPRINT_DAY_MS).toISOString(),
			endAt: new Date(UTC_DAY + FOOTPRINT_DAY_MS).toISOString(),
		});
		const result = await page(await handleGetEvents(env, query()));
		expect(result.events).toEqual([crossing, zero, date, interval]);
		expect(result.footprintDays).toEqual([]);
		expect(result.nextCursor).toBeNull();
	});

	it("paginates tied timestamps, filters both branches, and attaches GPS packages only once", async () => {
		const { env, insert, putDay, queries } = setup();
		const records = Array.from({ length: 405 }, () => insert());
		const footprint = await putDay(UTC_DAY, [point(1)]);
		insert({ sourceId: "health", sourceName: "健康" });
		const first = await page(await handleGetEvents(env, query()));
		expect(first.events).toEqual(records.slice(0, 200));
		expect(first.footprintDays).toEqual([footprint]);
		expect(first.nextCursor).not.toBeNull();
		queries.length = 0;
		const second = await page(
			await handleGetEvents(env, query({ cursor: first.nextCursor as string })),
		);
		expect(second.events).toEqual(records.slice(200, 400));
		expect(second).not.toHaveProperty("footprintDays");
		expect(queries.some((sql) => sql.includes("SELECT utc_day"))).toBe(false);
		const third = await page(
			await handleGetEvents(env, query({ cursor: second.nextCursor as string, source: "journal" })),
		);
		expect(third.events).toEqual(records.slice(400));
		expect(third.nextCursor).toBeNull();
		const filtered = await page(await handleGetEvents(env, query({ source: "health" })));
		expect(filtered.events.map((event) => event.sourceId)).toEqual(["health"]);
		expect(filtered).not.toHaveProperty("footprintDays");
		const gps = await page(await handleGetEvents(env, query({ source: "footprint" })));
		expect(gps.events).toEqual([]);
		expect(gps.footprintDays).toEqual([footprint]);
		expect(
			(await page(await handleGetEvents(env, query({ source: "unknown' OR 1=1 --" })))).events,
		).toEqual([]);
	});

	it("suppresses only legacy Footprint days with a current package, including pre-epoch days", async () => {
		const { env, insert, putDay } = setup();
		const covered = insert({ sourceId: "footprint", sourceName: "Footprint" });
		const other = insert();
		const uncovered = insert({
			sourceId: "footprint",
			sourceName: "Footprint",
			occurredAt: new Date(UTC_DAY - 1000).toISOString(),
		});
		await putDay(UTC_DAY, [point(123)]);
		const result = await page(
			await handleGetEvents(
				env,
				query({ start: new Date(UTC_DAY - FOOTPRINT_DAY_MS).toISOString() }),
			),
		);
		expect(result.events).toEqual([uncovered, other]);
		expect(result.events).not.toContainEqual(covered);
		insert({ sourceId: "footprint", occurredAt: "1969-12-31T23:59:59.999Z" });
		await putDay(-FOOTPRINT_DAY_MS, [point(86399.999)]);
		const beforeEpoch = await readEventRows(env.DB, {
			start: -FOOTPRINT_DAY_MS,
			end: 0,
			limit: 200,
		});
		expect(beforeEpoch).toEqual([]);
	});

	it("uses range searches for points, intervals, source filters, and daily packages", async () => {
		const { env, sqlite, insert, putDay, queries } = setup();
		insert();
		insert({
			occurredAt: new Date(UTC_DAY - 1000).toISOString(),
			endAt: new Date(UTC_DAY + 1000).toISOString(),
		});
		await putDay(UTC_DAY, [point()]);
		for (const source of [undefined, "journal"]) {
			queries.length = 0;
			await readEventRows(env.DB, {
				start: UTC_DAY,
				end: UTC_DAY + FOOTPRINT_DAY_MS,
				source,
				limit: 200,
			});
			const sql = queries[0] as string;
			const bindings = source
				? [UTC_DAY, UTC_DAY + FOOTPRINT_DAY_MS, source, 200]
				: [UTC_DAY, UTC_DAY + FOOTPRINT_DAY_MS, 200];
			const plans = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings);
			const plan = plans.map((row) => row.detail).join("\n");
			expect(plan).toContain(
				`SEARCH e USING INDEX ${source ? "idx_life_events_source_range" : "idx_life_events_range"}`,
			);
			expect(plan).toContain("SEARCH e USING INDEX idx_life_events_interval");
			expect(plan).not.toContain("SCAN e");
		}
		queries.length = 0;
		await readFootprintDays(env.DB, UTC_DAY, UTC_DAY + FOOTPRINT_DAY_MS);
		const plans = sqlite.prepare(`EXPLAIN QUERY PLAN ${queries[0]}`).all(UTC_DAY, UTC_DAY);
		expect(plans.map((row) => row.detail).join("\n")).toMatch(
			/SEARCH provider_days .*source_id=.*utc_day/,
		);
	});

	it.each([
		[{ start: "" }, "missing_parameter"],
		[{ end: "" }, "missing_parameter"],
		[{ start: "bad" }, "invalid_timestamp"],
		[{ end: "2026-09-13T00:00:00Z" }, "invalid_range"],
		[{ end: "2026-09-12T00:00:00Z" }, "invalid_range"],
		[{ end: "2026-11-01T00:00:00Z" }, "range_too_large"],
		[{ cursor: "!invalid!" }, "invalid_cursor"],
	])("rejects invalid query parameters: %j", async (parameters, code) => {
		const { env, queries } = setup();
		await expect(handleGetEvents(env, query(parameters))).rejects.toMatchObject({
			status: 400,
			code,
		});
		expect(queries).toEqual([]);
	});

	it("normalizes offsetless timestamps as UTC and handles unexpected timestamp errors", async () => {
		const { env, insert } = setup();
		const event = insert({ occurredAt: "2026-09-13T01:00:00.000Z" });
		const response = await page(
			await handleGetEvents(
				env,
				query({ start: "2026-09-13T00:00:00", end: "2026-09-13T10:00:00+08:00" }),
			),
		);
		expect(response.events).toEqual([event]);
		vi.spyOn(workerTime, "normalizeTimestamp").mockImplementationOnce(() => {
			throw "invalid";
		});
		await expect(handleGetEvents(env, query())).rejects.toMatchObject({
			status: 400,
			message: "Invalid timestamp",
		});
	});
});

describe("trusted UTC day package reads", () => {
	it("queries both UTC days of a Shanghai date, leaves clipping to the projection, and never rehashes", async () => {
		const { env, putDay, queries } = setup();
		const previous = await putDay(UTC_DAY - FOOTPRINT_DAY_MS, [point(3600), point(16 * 3600)]);
		const current = await putDay(UTC_DAY, [point(15 * 3600), point(16 * 3600)]);
		await putDay(UTC_DAY + FOOTPRINT_DAY_MS, [point()]);
		await putDay(UTC_DAY, [point()], "other-provider");
		const digest = vi.spyOn(crypto.subtle, "digest");
		const window = { start: UTC_DAY - 8 * 3600_000, end: UTC_DAY + 16 * 3600_000 };
		const days = await readFootprintDays(env.DB, window.start, window.end);
		expect(days).toEqual([previous, current]);
		expect(days.flatMap((day) => footprintDayEvents(day, window))).toHaveLength(2);
		expect(digest).not.toHaveBeenCalled();
		queries.length = 0;
		expect(await readFootprintDays(env.DB, UTC_DAY, UTC_DAY)).toEqual([]);
		expect(await readFootprintDays(env.DB, UTC_DAY + 1, UTC_DAY)).toEqual([]);
		expect(queries).toEqual([]);
	});

	it.each([
		["2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", 23],
		["2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", 25],
	])("preserves actual DST windows %s to %s", async (start, end, hours) => {
		const { env, putDay } = setup();
		const startMs = Date.parse(start);
		const endMs = Date.parse(end);
		const firstDay = Math.floor(startMs / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
		await putDay(firstDay, [point((startMs - firstDay) / 1000)]);
		await putDay(firstDay + FOOTPRINT_DAY_MS, [
			point((endMs - firstDay - FOOTPRINT_DAY_MS) / 1000 - 0.001),
		]);
		const result = await page(await handleGetEvents(env, query({ start, end })));
		expect((endMs - startMs) / 3600_000).toBe(hours);
		expect(result.footprintDays).toHaveLength(2);
		expect(
			result.footprintDays?.flatMap((day) =>
				footprintDayEvents(day, { start: startMs, end: endMs }),
			),
		).toHaveLength(2);
	});
});
