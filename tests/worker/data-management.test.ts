import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	DataOverview,
	FootprintBatchReceipt,
	FootprintImportReceipt,
	FootprintImportSession,
} from "../../src/models/data-management.js";
import {
	FOOTPRINT_DAY_MS,
	type FootprintDay,
	validateFootprintDay,
} from "../../src/models/footprint.js";
import { handleDataRequest } from "../../worker/data-routes.js";
import {
	beginFootprintImport,
	dataTarget,
	finishFootprintImport,
	putFootprintBatch,
} from "../../worker/footprint-imports.js";
import { handleRequest } from "../../worker/index.js";
import { getDataOverview } from "../../worker/provider-overview.js";
import { handleGetSources, handlePostImports } from "../../worker/routes.js";
import { sqliteD1 } from "../helpers/sqlite-d1.js";

const DAY = Date.parse("2026-09-13T00:00:00Z");
const fields = ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"];
function request(body: unknown, method = "POST", path = "/api/data/footprint/imports") {
	return new Request(`http://localhost:17011${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
async function unwrap<T>(response: Response): Promise<T> {
	return ((await response.json()) as { data: T }).data;
}
function day(utcDay = DAY, offsets = [1, 3601], latitude = 0) {
	return validateFootprintDay({
		utcDay,
		data: { v: 1, fields, points: offsets.map((offset) => [offset, latitude, 1, -5.25, -1, -1]) },
	});
}

let fixture: ReturnType<typeof sqliteD1>;
beforeEach(() => {
	fixture = sqliteD1();
});
afterEach(() => {
	fixture.sqlite.close();
});

async function begin(days: FootprintDay[], extra: Record<string, unknown> = {}) {
	return unwrap<FootprintImportSession>(
		await beginFootprintImport(
			request({
				fileName: "sample.gpx",
				totalDays: days.length,
				totalPoints: days.reduce((sum, item) => sum + item.recordCount, 0),
				channel: "cli",
				target: "test",
				...extra,
			}),
			fixture.env,
		),
	);
}
async function batch(id: string, days: FootprintDay[], batchId = 1) {
	return unwrap<FootprintBatchReceipt>(
		await putFootprintBatch(request({ days }, "PUT"), fixture.env, id, batchId),
	);
}
async function finish(id: string, status = "complete") {
	return unwrap<FootprintImportReceipt>(
		await finishFootprintImport(request({ status }), fixture.env, id),
	);
}
async function imported(days: FootprintDay[]) {
	const session = await begin(days);
	await batch(session.id, days);
	return finish(session.id);
}
function stored() {
	return fixture.sqlite.prepare("SELECT * FROM provider_days ORDER BY utc_day").all();
}
async function footprintOverview() {
	return (await unwrap<DataOverview>(await getDataOverview(fixture.env))).providers.find(
		(provider) => provider.id === "footprint",
	);
}

describe("complete UTC day snapshots", () => {
	it("keeps every point in one row per day, and skips content-equal payload updates", async () => {
		const days = [await day(), await day(DAY + FOOTPRINT_DAY_MS, [100])];
		expect(await imported(days)).toMatchObject({
			status: "complete",
			committedDays: 2,
			committedPoints: 3,
			insertedDays: 2,
		});
		const before = stored();
		const state = fixture.sqlite.prepare("SELECT * FROM provider_state").get();
		expect(await imported(days)).toMatchObject({
			insertedDays: 0,
			updatedDays: 0,
			unchangedDays: 2,
		});
		expect(stored()).toEqual(before);
		expect(fixture.sqlite.prepare("SELECT revision FROM provider_state").get()?.revision).toBe(
			state?.revision,
		);
		expect(await footprintOverview()).toMatchObject({
			recordCount: 3,
			dataRows: 2,
			coverageDays: 2,
			payloadBytes: days.reduce((sum, value) => sum + value.payloadBytes, 0),
			lastImportChannel: "cli",
		});
	});

	it("replaces the entire included day with fewer points, keeps absent days, and restores A → B → A", async () => {
		const original = await day();
		const untouched = await day(DAY + FOOTPRINT_DAY_MS);
		await imported([original, untouched]);
		const untouchedBefore = stored()[1];
		const replacement = await day(DAY, [7200], 10);
		expect(await imported([replacement])).toMatchObject({ updatedDays: 1, committedPoints: 1 });
		expect(stored()[1]).toEqual(untouchedBefore);
		expect(JSON.parse(String(stored()[0]?.data_json)).points).toEqual(replacement.data.points);
		expect(await footprintOverview()).toMatchObject({ recordCount: 3, dataRows: 2 });
		expect(await imported([original])).toMatchObject({ updatedDays: 1 });
		expect(JSON.parse(String(stored()[0]?.data_json)).points).toEqual(original.data.points);
		expect(await footprintOverview()).toMatchObject({ recordCount: 4, dataRows: 2 });
	});

	it("recomputes untrusted statistics and accepts future days", async () => {
		const future = await day(Date.parse("2099-01-01T00:00:00Z"));
		const session = await begin([future]);
		const result = await batch(session.id, [
			{ ...future, recordCount: 999, contentHash: "forged", payloadBytes: 1 },
		]);
		expect(result.committedPoints).toBe(2);
		expect(result.days[0]?.contentHash).toBe(future.contentHash);
		expect(stored()[0]?.record_count).toBe(2);
	});

	it("removes only legacy Footprint points for atomically replaced days", async () => {
		const session = await begin([await day()]);
		for (const [id, time] of [
			["old", DAY + 1000],
			["keep", DAY - 1000],
		] as const) {
			fixture.sqlite
				.prepare(
					"INSERT INTO life_events VALUES (?, 'footprint', ?, ?, NULL, 'second', 'GPS', '', '{}', 0)",
				)
				.run(id, id, time);
		}
		await batch(session.id, [await day()]);
		expect(fixture.sqlite.prepare("SELECT id FROM life_events").all()).toEqual([{ id: "keep" }]);
		expect(await footprintOverview()).toMatchObject({
			dataRows: 2,
			recordCount: 3,
			coverageDays: 2,
		});
	});

	it("rolls back both session progress and earlier days when a later SQL write fails", async () => {
		const days = [await day(), await day(DAY + FOOTPRINT_DAY_MS)];
		const session = await begin(days);
		fixture.sqlite.exec(
			`CREATE TRIGGER reject_day BEFORE INSERT ON provider_days WHEN NEW.utc_day > ${DAY} BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`,
		);
		await expect(batch(session.id, days)).rejects.toThrow("simulated write failure");
		expect(stored()).toEqual([]);
		expect(
			fixture.sqlite.prepare("SELECT committed_days, last_batch_id FROM footprint_imports").get(),
		).toEqual({ committed_days: 0, last_batch_id: 0 });
		fixture.sqlite.exec("DROP TRIGGER reject_day");
		expect((await batch(session.id, days)).committedDays).toBe(2);
	});
});

describe("import leases and retries", () => {
	it("rejects concurrent web/CLI sessions and returns the same receipt after response loss", async () => {
		const days = [await day()];
		const session = await begin(days);
		await expect(begin(days, { channel: "web" })).rejects.toMatchObject({ status: 409 });
		const first = await batch(session.id, days);
		const before = stored();
		expect(await batch(session.id, days)).toEqual(first);
		expect(stored()).toEqual(before);
		await expect(batch(session.id, [await day(DAY, [100])])).rejects.toMatchObject({ status: 409 });
		expect(await finish(session.id)).toEqual({
			...first,
			batchId: undefined,
			days: undefined,
			status: "complete",
		});
		expect((await finish(session.id)).status).toBe("complete");
		await expect(finish(session.id, "cancelled")).rejects.toMatchObject({ status: 409 });
	});

	it("serializes racing deliveries of the same batch without double progress", async () => {
		const days = [await day()];
		const session = await begin(days);
		const [a, b] = await Promise.all([batch(session.id, days), batch(session.id, days)]);
		expect(a).toEqual(b);
		expect(a.insertedDays).toBe(1);
		expect(stored()).toHaveLength(1);
		expect((await finish(session.id)).committedPoints).toBe(2);
	});

	it("rejects stale/out-of-order batches and repeated dates, and prevents early completion", async () => {
		const days = [await day(), await day(DAY + FOOTPRINT_DAY_MS)];
		const session = await begin(days);
		await expect(batch(session.id, days, 2)).rejects.toMatchObject({ status: 409 });
		await batch(session.id, [days[0] as FootprintDay]);
		await expect(finish(session.id)).rejects.toMatchObject({ status: 409 });
		await expect(batch(session.id, [days[0] as FootprintDay], 2)).rejects.toMatchObject({
			status: 409,
		});
		await batch(session.id, [days[1] as FootprintDay], 2);
		await expect(batch(session.id, [days[0] as FootprintDay], 1)).rejects.toMatchObject({
			status: 409,
		});
		expect((await finish(session.id)).committedDays).toBe(2);
	});

	it("preserves committed days on cancellation and blocks delayed batches from a replaced session", async () => {
		const days = [await day(), await day(DAY + FOOTPRINT_DAY_MS)];
		const first = await begin(days);
		await batch(first.id, [days[0] as FootprintDay]);
		expect(await finish(first.id, "cancelled")).toMatchObject({
			status: "cancelled",
			committedDays: 1,
		});
		expect((await finish(first.id, "cancelled")).status).toBe("cancelled");
		await expect(batch(first.id, [days[1] as FootprintDay], 2)).rejects.toMatchObject({
			status: 409,
		});
		const second = await begin([await day(DAY, [99])]);
		await batch(second.id, [await day(DAY, [99])]);
		const before = stored();
		await expect(batch(first.id, days)).rejects.toMatchObject({ status: 404 });
		await expect(finish(first.id)).rejects.toMatchObject({ status: 404 });
		expect(stored()).toEqual(before);
	});

	it("allows expired leases to be replaced and fences expiry at the database execution boundary", async () => {
		const days = [await day()];
		const old = await begin(days);
		fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
		await expect(batch(old.id, days)).rejects.toMatchObject({ status: 409 });
		const current = await begin(days);
		const original = fixture.db.batch.bind(fixture.db);
		vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
			fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
			return original(statements);
		});
		await expect(batch(current.id, days)).rejects.toMatchObject({ status: 409 });
		expect(stored()).toEqual([]);
		expect((await finish(current.id, "cancelled")).committedDays).toBe(0);
	});

	it("fences a session replaced immediately before commit, including finish", async () => {
		const days = [await day()];
		let current = await begin(days);
		const original = fixture.db.batch.bind(fixture.db);
		vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
			fixture.sqlite.exec("UPDATE footprint_imports SET id = 'newer', status = 'complete'");
			return original(statements);
		});
		await expect(batch(current.id, days)).rejects.toMatchObject({ status: 404 });
		expect(stored()).toEqual([]);
		current = await begin(days);
		await batch(current.id, days);
		vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
			fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
			return original(statements);
		});
		await expect(finish(current.id)).rejects.toMatchObject({ status: 409 });
		expect((await footprintOverview())?.lastImportedAt).toBeNull();
	});

	it("returns a successful concurrent finish without failing the second caller", async () => {
		const session = await begin([await day()]);
		await batch(session.id, [await day()]);
		const result = await Promise.all([finish(session.id), finish(session.id)]);
		expect(result[0]).toEqual(result[1]);
	});
});

describe("data targets and invalid input", () => {
	it("identifies production data on a local development host explicitly", async () => {
		expect(dataTarget(fixture.env)).toBe("test");
		expect(
			dataTarget({ ...fixture.env, RESOURCE_ENV: "development", DATA_TARGET: "production" }),
		).toBe("production");
		expect(dataTarget({ ...fixture.env, RESOURCE_ENV: "development", DATA_TARGET: "local" })).toBe(
			"local",
		);
		expect(() =>
			dataTarget({ ...fixture.env, RESOURCE_ENV: "production", DATA_TARGET: "" }),
		).toThrow(expect.objectContaining({ status: 500 }));
		await expect(begin([await day()], { target: "production" })).rejects.toMatchObject({
			code: "target_mismatch",
		});
		expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM sources").get()?.n).toBe(0);
	});

	it("validates manifests before touching the database", async () => {
		for (const input of [null, [], false]) {
			await expect(beginFootprintImport(request(input), fixture.env)).rejects.toMatchObject({
				status: 400,
			});
		}
		for (const extra of [
			{ totalDays: 0 },
			{ totalDays: 1.5 },
			{ totalPoints: "2" },
			{ totalPoints: 0 },
			{ totalDays: 3 },
			{ channel: "unknown" },
			{ fileName: "" },
		]) {
			await expect(begin([await day()], extra)).rejects.toMatchObject({ status: 400 });
		}
		expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM sources").get()?.n).toBe(0);
	});

	it("rejects invalid, unordered, empty or excessive batches and manifest overruns", async () => {
		const days = [await day()];
		const session = await begin(days);
		for (const payload of [
			null,
			{},
			{ days: [] },
			{ days: new Array(33).fill(days[0]) },
			{ days: [{}] },
		]) {
			await expect(
				putFootprintBatch(request(payload, "PUT"), fixture.env, session.id, 1),
			).rejects.toMatchObject({ status: 400 });
		}
		await expect(batch(session.id, days, 0)).rejects.toMatchObject({ status: 400 });
		await expect(
			batch(session.id, [days[0] as FootprintDay, days[0] as FootprintDay]),
		).rejects.toMatchObject({ code: "invalid_day_order" });
		await expect(
			batch(session.id, [await day(DAY + FOOTPRINT_DAY_MS), days[0] as FootprintDay]),
		).rejects.toMatchObject({ code: "invalid_day_order" });
		await expect(
			batch(session.id, [days[0] as FootprintDay, await day(DAY + FOOTPRINT_DAY_MS)]),
		).rejects.toMatchObject({ status: 409 });
		await expect(batch(session.id, [await day(DAY, [1, 2, 3])])).rejects.toMatchObject({
			status: 409,
		});
		await expect(finish(session.id, "failed")).rejects.toMatchObject({ status: 400 });
		await expect(
			putFootprintBatch(
				request({ days, padding: "a".repeat(768 * 1024) }, "PUT"),
				fixture.env,
				session.id,
				1,
			),
		).rejects.toMatchObject({ status: 413 });
		expect(stored()).toHaveLength(0);
	});
});

describe("overview statistics", () => {
	it("returns empty providers, caches coverage, and makes source counts independent of full scans", async () => {
		const empty = await unwrap<DataOverview>(await getDataOverview(fixture.env));
		expect(empty.providers).toHaveLength(4);
		expect(empty.providers.every((provider) => provider.dataRows === 0 && !provider.firstAt)).toBe(
			true,
		);
		await imported([await day()]);
		const first = await footprintOverview();
		const before = fixture.queries.length;
		expect(await footprintOverview()).toEqual(first);
		expect(fixture.queries.slice(before)).toHaveLength(1);
		const sources = await unwrap<{ id: string; recordCount: number; lastEventAt: string }[]>(
			await handleGetSources(fixture.env),
		);
		expect(sources).toEqual([
			expect.objectContaining({
				id: "footprint",
				recordCount: 2,
				lastEventAt: new Date(DAY + 3_601_000).toISOString(),
			}),
		]);
		expect(fixture.queries.at(-1)).not.toContain("COUNT(");
	});

	it("accounts for legacy providers, cross-midnight intervals and boundary-exclusive ends", async () => {
		await handlePostImports(
			request({
				source: "journal",
				records: [
					{
						key: "interval",
						title: "Sleep",
						occurredAt: "2026-09-12T23:00:00Z",
						endAt: "2026-09-14T00:00:00Z",
						precision: "second",
						data: { value: 1 },
					},
					{ key: "day", title: "Day", occurredAt: "2026-09-13", precision: "day" },
					{
						key: "zero",
						title: "Zero",
						occurredAt: "2026-09-13T12:00:00Z",
						endAt: "2026-09-13T12:00:00Z",
					},
				],
			}),
			fixture.env,
		);
		const overview = await unwrap<DataOverview>(await getDataOverview(fixture.env));
		const health = overview.providers.find((provider) => provider.id === "journal");
		expect(health).toMatchObject({
			coverageDays: 2,
			dataRows: 3,
			recordCount: 3,
			storage: "events",
			lastImportChannel: "web",
			firstAt: "2026-09-12T23:00:00.000Z",
			lastAt: "2026-09-14T00:00:00.000Z",
		});
		expect(health?.coverage.map((item) => item.recordCount)).toEqual([1, 3]);
		fixture.sqlite.exec(
			"UPDATE life_events SET data = '{\"value\":20}', title = 'Changed' WHERE external_key = 'interval'",
		);
		expect(
			(await unwrap<DataOverview>(await getDataOverview(fixture.env))).providers.find(
				(provider) => provider.id === "journal",
			)?.payloadBytes,
		).toBe((health?.payloadBytes as number) + 1);
		fixture.sqlite.exec("DELETE FROM life_events WHERE external_key = 'interval'");
		expect(
			(await unwrap<DataOverview>(await getDataOverview(fixture.env))).providers.find(
				(provider) => provider.id === "journal",
			),
		).toMatchObject({ coverageDays: 1, dataRows: 2, recordCount: 2 });
	});

	it("invalidates after daily deletion, but not on a timestamp-only update", async () => {
		await imported([await day()]);
		await footprintOverview();
		const before = fixture.sqlite.prepare("SELECT revision FROM provider_state").get()?.revision;
		fixture.sqlite.exec("UPDATE provider_days SET updated_at = updated_at + 1");
		expect(fixture.sqlite.prepare("SELECT revision FROM provider_state").get()?.revision).toBe(
			before,
		);
		fixture.sqlite.exec("DELETE FROM provider_days");
		expect(await footprintOverview()).toMatchObject({
			coverageDays: 0,
			dataRows: 0,
			recordCount: 0,
			payloadBytes: 0,
			firstAt: null,
			lastAt: null,
		});
	});

	it("does not cache an obsolete revision when data changes during snapshot publication", async () => {
		await imported([await day()]);
		const original = fixture.db.prepare.bind(fixture.db);
		vi.spyOn(fixture.db, "prepare").mockImplementation((sql, values) => {
			if (sql.startsWith("UPDATE provider_state SET stats_revision"))
				fixture.sqlite.exec("UPDATE provider_state SET revision = revision + 1");
			return original(sql, values);
		});
		await footprintOverview();
		const row = fixture.sqlite.prepare("SELECT revision, stats_revision FROM provider_state").get();
		expect(row?.stats_revision).not.toBe(row?.revision);
	});
});

describe("data API boundaries", () => {
	it("routes the target, overview, upload, finish and compact reads", async () => {
		const call = (req: Request) => handleDataRequest(req, fixture.env, new URL(req.url));
		expect(await unwrap(await call(new Request("http://localhost:17011/api/data/target")))).toEqual(
			{ target: "test" },
		);
		expect((await call(new Request("http://localhost:17011/api/data/overview"))).status).toBe(200);
		const points = await day();
		const session = await unwrap<FootprintImportSession>(
			await call(
				request({
					fileName: "x.gpx",
					totalDays: 1,
					totalPoints: 2,
					target: "test",
					channel: "web",
				}),
			),
		);
		await call(
			request({ days: [points] }, "PUT", `/api/data/footprint/imports/${session.id}/batches/1`),
		);
		await call(
			request({ status: "complete" }, "POST", `/api/data/footprint/imports/${session.id}/finish`),
		);
		const response = await call(
			new Request(
				"http://localhost:17011/api/data/footprint/days?start=2026-09-12T16:00:00Z&end=2026-09-13T16:00:00Z",
			),
		);
		expect(await unwrap(response)).toEqual({ days: [expect.objectContaining(points)] });
	});

	it("rejects bad windows, methods, unknown routes, old writes and ingestion-host access", async () => {
		const call = (req: Request) => handleDataRequest(req, fixture.env, new URL(req.url));
		for (const path of [
			"target",
			"overview",
			"footprint/imports",
			"footprint/days",
			"footprint/imports/x/batches/1",
			"footprint/imports/x/finish",
		]) {
			await expect(
				call(new Request(`http://localhost:17011/api/data/${path}`, { method: "DELETE" })),
			).rejects.toMatchObject({ status: 405 });
		}
		for (const query of [
			"",
			"?start=bad&end=bad",
			"?start=2026-09-13&end=2026-09-13",
			"?start=2026-01-01&end=2026-09-13",
		]) {
			await expect(
				call(new Request(`http://localhost:17011/api/data/footprint/days${query}`)),
			).rejects.toMatchObject({ status: 400 });
		}
		await expect(call(new Request("http://localhost:17011/api/data/nope"))).rejects.toMatchObject({
			status: 404,
		});
		await expect(
			handlePostImports(request({ source: "footprint", records: [] }), fixture.env),
		).rejects.toMatchObject({ status: 410 });
		const denied = await handleRequest(
			new Request("https://life.worker.hexly.ai/api/data/target"),
			fixture.env,
		);
		expect(denied.status).toBe(404);
		const gated = await handleRequest(new Request("https://life.hexly.ai/api/data/overview"), {
			...fixture.env,
			APP_ORIGIN: "https://life.hexly.ai",
			RESOURCE_ENV: "production",
			DATA_TARGET: "production",
		});
		expect(gated.status).toBe(401);
		const local = await handleRequest(new Request("http://localhost:17011/api/data/target"), {
			...fixture.env,
			RESOURCE_ENV: "development",
		});
		expect(await unwrap(local)).toEqual({ target: "local" });
	});
});
