import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHealthPart, packHealthDay } from "../../src/models/apple-health.js";
import type {
	DataOverview,
	FootprintBatchReceipt,
	FootprintImportSession,
} from "../../src/models/data-management.js";
import {
	HEALTH_DAY_MS,
	HEALTH_LIMITS,
	type HealthDay,
	type HealthFile,
	type HealthFileManifest,
	type HealthFilePart,
	type HealthImportReceipt,
	type HealthNode,
	type StoredHealthSeries,
} from "../../src/models/health-types.js";
import type { EventPage } from "../../src/models/types.js";
import { handleDataRequest } from "../../worker/data-routes.js";
import { handleGetEvents } from "../../worker/events.js";
import {
	collectUnusedHealthParts,
	ensureHealthFiles,
	healthFileInventory,
	putHealthFilePart,
	readHealthFile,
	validateHealthFiles,
} from "../../worker/health-files.js";
import { healthDayHeader, readHealthEvents, readHealthSeries } from "../../worker/health-read.js";
import { handleRequest } from "../../worker/index.js";
import {
	beginProviderImport,
	finishProviderImport,
	putProviderBatch,
} from "../../worker/provider-imports.js";
import { getDataOverview } from "../../worker/provider-overview.js";
import { encodeCursor } from "../../worker/utils.js";
import { sqliteD1 } from "../helpers/sqlite-d1.js";

const DAY = Date.parse("2026-09-13T00:00:00Z");
const HOUR = 3_600_000;
const ORIGIN = "http://127.0.0.1:17011";
const PREFIX = "/api/data/apple-health";
const HEART = "HKQuantityTypeIdentifierHeartRate";
const STEPS = "HKQuantityTypeIdentifierStepCount";
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const RARE = "HKQuantityTypeIdentifierWalkingSpeed";
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

let fixture: ReturnType<typeof sqliteD1>;
beforeEach(() => {
	fixture = sqliteD1();
	fixture.sqlite.exec(
		"CREATE TABLE _test_marker (key TEXT PRIMARY KEY, value TEXT);" +
			"INSERT INTO _test_marker VALUES ('env', 'test')",
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			throw new Error("Network access is forbidden in SQLite health tests");
		}),
	);
});
afterEach(() => {
	expect(fetch).not.toHaveBeenCalled();
	fixture.sqlite.close();
});

function request(body: unknown, method = "POST", suffix = "/imports") {
	return new Request(ORIGIN + PREFIX + suffix, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
function url(suffix: string) {
	return new URL(ORIGIN + PREFIX + suffix);
}
function fileUrl(path: string, part?: string) {
	const result = url("/file");
	result.searchParams.set("path", path);
	if (part !== undefined) result.searchParams.set("part", part);
	return result;
}
async function unwrap<T>(response: Response): Promise<T> {
	expect(response.ok).toBe(true);
	return ((await response.json()) as { data: T }).data;
}
function measurement(type = HEART, at = DAY + HOUR, value = "60.00", end?: number): HealthNode {
	return {
		name: "Record",
		attributes: {
			type,
			startDate: new Date(at).toISOString(),
			...(end === undefined ? {} : { endDate: new Date(end).toISOString() }),
			sourceName: "Fixture Watch",
			unit: type === HEART ? "count/min" : "count",
			value,
		},
	};
}
function day(utcDay = DAY, values = [measurement(HEART, utcDay + HOUR)]) {
	return packHealthDay(utcDay, values);
}
function workout(path: string): HealthNode {
	return {
		name: "Workout",
		attributes: {
			workoutActivityType: "HKWorkoutActivityTypeWalking",
			startDate: new Date(DAY + HOUR).toISOString(),
			endDate: new Date(DAY + 2 * HOUR).toISOString(),
		},
		children: [
			{
				name: "WorkoutRoute",
				attributes: {},
				children: [{ name: "FileReference", attributes: { path: `/${path}` } }],
			},
		],
	};
}
function originalFile(
	path = "workout-routes/路线.gpx",
	large = false,
	variant = "one",
	level: 0 | 9 = 9,
): HealthFile {
	const raw = Buffer.from(
		"<gpx><metadata><desc>" +
			variant +
			(large ? "x".repeat(HEALTH_LIMITS.filePartRawBytes) : "") +
			'</desc></metadata><trk><trkseg><trkpt lat="1" lon="2"><time>2026-09-13T01:00:00Z</time></trkpt>' +
			'<trkpt lat="1.1" lon="2.1"><time>2026-09-13T01:00:02Z</time></trkpt></trkseg></trk></gpx>',
	);
	const parts: HealthFilePart[] = [];
	for (let offset = 0; offset < raw.length; offset += HEALTH_LIMITS.filePartRawBytes) {
		const bytes = raw.subarray(offset, offset + HEALTH_LIMITS.filePartRawBytes);
		const body = Buffer.from(gzipSync(bytes, { level })).toString("base64");
		parts.push({
			part: parts.length,
			rawBytes: bytes.length,
			payloadBytes: body.length,
			contentHash: digest(bytes),
			body,
		});
	}
	return {
		path,
		kind: "route",
		firstAt: DAY + HOUR,
		lastAt: DAY + HOUR + 2000,
		recordCount: 2,
		rawBytes: raw.length,
		contentHash: digest(
			JSON.stringify(parts.map((part) => [part.part, part.rawBytes, part.contentHash])),
		),
		parts,
	};
}
function manifest(file: HealthFile): HealthFileManifest {
	return { ...file, parts: file.parts.map(({ body: _body, ...part }) => part) };
}
function importBody(days: HealthDay[], files: HealthFile[] = []) {
	return {
		fileName: "导出.zip",
		totalDays: days.length,
		totalRecords: days.reduce((sum, value) => sum + value.recordCount, 0),
		files: files.map(manifest),
		channel: "cli",
		target: "test",
	};
}
async function begin(
	days: HealthDay[],
	files: HealthFile[] = [],
	extra: Record<string, unknown> = {},
) {
	return unwrap<FootprintImportSession>(
		await beginProviderImport(
			request({ ...importBody(days, files), ...extra }),
			fixture.env,
			"apple-health",
		),
	);
}
async function batch(id: string, days: HealthDay[], number = 1) {
	return unwrap<FootprintBatchReceipt & { committedRecords: number }>(
		await putProviderBatch(request({ days }, "PUT"), fixture.env, id, number, "apple-health"),
	);
}
async function part(id: string, file: HealthFile, fileIndex = 0, partIndex = 0) {
	return putHealthFilePart(
		request(file.parts[partIndex], "PUT"),
		fixture.env,
		id,
		fileIndex,
		partIndex,
	);
}
async function finish(id: string, status = "complete") {
	return unwrap<HealthImportReceipt>(
		await finishProviderImport(request({ status }), fixture.env, id, "apple-health"),
	);
}
async function imported(days: HealthDay[], files: HealthFile[] = []) {
	const session = await begin(days, files);
	for (const [fileIndex, file] of files.entries()) {
		for (const index of file.parts.keys()) await part(session.id, file, fileIndex, index);
	}
	for (const [index, value] of days.entries()) await batch(session.id, [value], index + 1);
	return finish(session.id);
}
function rows(table: "provider_days" | "health_series" | "health_files" | "health_file_parts") {
	const order = {
		provider_days: "source_id, utc_day",
		health_series: "utc_day, dimension, part",
		health_files: "path",
		health_file_parts: "file_hash, part",
	}[table];
	return fixture.sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
}
function state() {
	return fixture.sqlite
		.prepare("SELECT * FROM provider_state WHERE source_id = 'apple-health'")
		.get();
}
async function overview() {
	const result = await unwrap<DataOverview>(await getDataOverview(fixture.env));
	return result.providers.find((provider) => provider.id === "apple-health");
}
function physicalTotals() {
	return fixture.sqlite
		.prepare(
			"SELECT COUNT(*) AS dataRows, COALESCE(SUM(bytes), 0) AS payloadBytes FROM (" +
				"SELECT length(CAST(data_json AS BLOB)) AS bytes FROM provider_days WHERE source_id = 'apple-health' " +
				"UNION ALL SELECT length(CAST(body AS BLOB)) FROM health_series " +
				"UNION ALL SELECT length(CAST(manifest_json AS BLOB)) FROM health_files " +
				"UNION ALL SELECT length(CAST(body AS BLOB)) FROM health_file_parts " +
				"UNION ALL SELECT length(CAST(data AS BLOB)) FROM life_events WHERE source_id = 'apple-health')",
		)
		.get();
}
function insertLegacy(id: string, at: number, end: number | null = null, source = "apple-health") {
	fixture.sqlite
		.prepare("INSERT INTO sources VALUES (?, ?, 'import', ?, 0) ON CONFLICT(id) DO NOTHING")
		.run(source, source, source);
	fixture.sqlite
		.prepare("INSERT INTO life_events VALUES (?, ?, ?, ?, ?, 'second', 'Legacy', '', '{}', 1)")
		.run(id, source, id, at, end);
}

describe("Apple Health daily replacement in migrated SQLite", () => {
	it("keeps duplicate samples, removes missing dimensions, preserves absent days and restores A → B → A", async () => {
		const duplicate = measurement();
		const original = await day(DAY, [duplicate, duplicate, measurement(STEPS)]);
		const untouched = await day(DAY + HEALTH_DAY_MS);
		expect(await imported([original, untouched])).toMatchObject({
			insertedDays: 2,
			committedDays: 2,
			committedRecords: 4,
		});
		const untouchedDay = rows("provider_days")[1];
		const untouchedSeries = rows("health_series").filter((row) => row.utc_day !== DAY);
		const originalEvents = await readHealthEvents(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS);
		expect(originalEvents).toHaveLength(3);
		expect(new Set(originalEvents.map((event) => event.id)).size).toBe(3);
		expect(originalEvents.map((event) => event.data)).toEqual(
			Array.from({ length: 3 }, () => expect.objectContaining({ value: "60.00" })),
		);
		const replacement = await day(DAY, [measurement(STEPS, DAY + 2 * HOUR, "7")]);
		expect(await imported([replacement])).toMatchObject({ updatedDays: 1, committedRecords: 1 });
		expect(
			rows("health_series")
				.filter((row) => row.utc_day === DAY)
				.map((row) => row.dimension),
		).toEqual([STEPS]);
		expect(rows("provider_days")[1]).toEqual(untouchedDay);
		expect(rows("health_series").filter((row) => row.utc_day !== DAY)).toEqual(untouchedSeries);
		expect(await overview()).toMatchObject({ coverageDays: 2, recordCount: 2, dataRows: 4 });
		expect(await imported([original])).toMatchObject({ updatedDays: 1 });
		expect(
			(await readHealthEvents(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS)).map((event) => ({
				...event,
				updatedAt: "",
			})),
		).toEqual(originalEvents.map((event) => ({ ...event, updatedAt: "" })));
		expect(await overview()).toMatchObject({ recordCount: 4, dataRows: 5 });
	});

	it("preserves unchanged day, series, file and provider timestamps across an exact reimport", async () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
		const file = originalFile();
		const value = await day(DAY, [workout(file.path), measurement()]);
		await imported([value], [file]);
		const before = {
			days: rows("provider_days"),
			series: rows("health_series"),
			files: rows("health_files"),
			parts: rows("health_file_parts"),
			state: state(),
		};
		clock.mockReturnValue(Date.now() + 1000);
		expect(await imported([value], [file])).toMatchObject({
			insertedDays: 0,
			updatedDays: 0,
			unchangedDays: 1,
		});
		expect(rows("provider_days")).toEqual(before.days);
		expect(rows("health_series")).toEqual(before.series);
		expect(rows("health_files")).toEqual(before.files);
		expect(rows("health_file_parts")).toEqual(before.parts);
		expect(state()).toMatchObject({
			revision: before.state?.revision,
			last_changed_at: before.state?.last_changed_at,
		});
		expect(state()?.last_imported_at).not.toBe(before.state?.last_imported_at);
		expect(healthDayHeader(value).bytes).toBe(
			Buffer.byteLength(String(rows("provider_days")[0]?.data_json)),
		);
		expect(String(rows("provider_days")[0]?.data_json)).not.toContain('"body"');
	});

	it("rolls back a partially replaced dimension set and lease receipt when a later insert fails", async () => {
		const original = await day(DAY, [measurement(HEART)]);
		await imported([original]);
		const before = { days: rows("provider_days"), series: rows("health_series"), state: state() };
		const replacement = await day(DAY, [measurement(HEART), measurement(STEPS)]);
		const session = await begin([replacement]);
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_steps BEFORE INSERT ON health_series " +
				"WHEN NEW.dimension = '" +
				STEPS +
				"' BEGIN SELECT RAISE(ABORT, 'simulated series failure'); END",
		);
		await expect(batch(session.id, [replacement])).rejects.toThrow("simulated series failure");
		expect(rows("provider_days")).toEqual(before.days);
		expect(rows("health_series")).toEqual(before.series);
		expect(state()).toEqual(before.state);
		expect(
			fixture.sqlite.prepare("SELECT committed_days, last_batch_id FROM footprint_imports").get(),
		).toEqual({ committed_days: 0, last_batch_id: 0 });
		fixture.sqlite.exec("DROP TRIGGER reject_steps");
		expect(await batch(session.id, [replacement])).toMatchObject({ committedRecords: 2 });
	});

	it("removes only replaced legacy UTC buckets and preserves other providers and unusual/future dates", async () => {
		insertLegacy("old-health", DAY + HOUR);
		insertLegacy("absent-health", DAY - 1);
		insertLegacy("gps", DAY + HOUR, null, "footprint");
		const beforeGps = fixture.sqlite
			.prepare("SELECT * FROM life_events WHERE source_id = 'footprint'")
			.all();
		const ancient = await day(0, [measurement(HEART, 60_000)]);
		const current = await day();
		const future = await day(Date.parse("2099-01-01T00:00:00Z"));
		await imported([ancient, current, future]);
		expect(fixture.sqlite.prepare("SELECT id FROM life_events ORDER BY id").all()).toEqual([
			{ id: "absent-health" },
			{ id: "gps" },
		]);
		expect(
			fixture.sqlite.prepare("SELECT * FROM life_events WHERE source_id = 'footprint'").all(),
		).toEqual(beforeGps);
		expect(await overview()).toMatchObject({
			coverageDays: 3,
			recordCount: 4,
			health: { epochRecordCount: 1 },
		});
		expect(rows("provider_days").map((row) => row.utc_day)).toEqual([
			0,
			DAY,
			Date.parse("2099-01-01T00:00:00Z"),
		]);
	});
});

describe("verified original health attachments", () => {
	it("keeps partial files unreadable, blocks day publication and preserves active pending parts", async () => {
		const file = originalFile(undefined, true);
		const value = await day(DAY, [workout(file.path)]);
		const session = await begin([value], [file]);
		await part(session.id, file);
		expect(await unwrap(await healthFileInventory(fixture.env))).toEqual({ files: [] });
		await expect(readHealthFile(fixture.env, fileUrl(file.path))).rejects.toMatchObject({
			status: 404,
		});
		await expect(readHealthFile(fixture.env, fileUrl(file.path, "0"))).rejects.toMatchObject({
			status: 404,
		});
		await expect(batch(session.id, [value])).rejects.toMatchObject({ code: "incomplete_files" });
		expect(rows("provider_days")).toEqual([]);
		await collectUnusedHealthParts(fixture.env.DB);
		expect(rows("health_file_parts")).toHaveLength(1);
		await part(session.id, file, 0, 1);
		expect(
			await unwrap<HealthFileManifest>(await readHealthFile(fixture.env, fileUrl(file.path))),
		).toEqual(manifest(file));
		const returned = await unwrap<HealthFilePart>(
			await readHealthFile(fixture.env, fileUrl(file.path, "1")),
		);
		expect(await decodeHealthPart(returned)).toEqual(
			await decodeHealthPart(file.parts[1] as HealthFilePart),
		);
		await batch(session.id, [value]);
		expect(await finish(session.id)).toMatchObject({ status: "complete", committedRecords: 1 });
		expect(await overview()).toMatchObject({
			recordCount: 1,
			dataRows: 5,
			health: { files: [{ kind: "route", fileCount: 1, recordCount: 2, rawBytes: file.rawBytes }] },
		});
	});

	it("switches a changed file only after every part is verified and collects superseded bytes", async () => {
		const old = originalFile(undefined, true, "old");
		const value = await day(DAY, [workout(old.path)]);
		await imported([value], [old]);
		const next = originalFile(old.path, true, "new");
		const session = await begin([value], [next]);
		await part(session.id, next);
		expect(
			(await unwrap<HealthFileManifest>(await readHealthFile(fixture.env, fileUrl(old.path))))
				.contentHash,
		).toBe(old.contentHash);
		expect(rows("health_file_parts")).toHaveLength(3);
		await part(session.id, next, 0, 1);
		expect(
			(await unwrap<HealthFileManifest>(await readHealthFile(fixture.env, fileUrl(old.path))))
				.contentHash,
		).toBe(next.contentHash);
		await batch(session.id, [value]);
		await finish(session.id);
		expect(rows("health_file_parts")).toHaveLength(2);
		expect(rows("health_file_parts").every((row) => row.file_hash === next.contentHash)).toBe(true);
		expect(await overview()).toMatchObject(physicalTotals() ?? {});
	});

	it("deduplicates equal files across paths and keeps valid stored gzip lengths on cross-runtime reimports", async () => {
		const file = originalFile();
		const sameBytes = { ...file, path: "workout-routes/other.gpx" };
		const value = await day(DAY, [workout(file.path), workout(sameBytes.path)]);
		await imported([value], [file, sameBytes]);
		expect(rows("health_files")).toHaveLength(2);
		expect(rows("health_file_parts")).toHaveLength(1);
		const alternative = originalFile(file.path, false, "one", 0);
		expect(alternative.contentHash).toBe(file.contentHash);
		expect(alternative.parts[0]?.payloadBytes).not.toBe(file.parts[0]?.payloadBytes);
		const before = { files: rows("health_files"), parts: rows("health_file_parts") };
		const session = await begin([await day()], [alternative]);
		await part(session.id, alternative);
		expect(rows("health_files")).toEqual(before.files);
		expect(rows("health_file_parts")).toEqual(before.parts);
		const stored = await unwrap<HealthFileManifest>(
			await readHealthFile(fixture.env, fileUrl(file.path)),
		);
		expect(stored.parts[0]?.payloadBytes).toBe(file.parts[0]?.payloadBytes);
		const original = await unwrap<HealthFilePart>(
			await readHealthFile(fixture.env, fileUrl(file.path, "0")),
		);
		expect((await decodeHealthPart(original)).length).toBe(file.rawBytes);
		await batch(session.id, [await day()]);
		await finish(session.id);
		expect(rows("health_file_parts")).toHaveLength(1);
	});

	it("rolls back the final part when manifest publication fails and retries without a duplicate", async () => {
		const file = originalFile(undefined, true);
		const session = await begin([await day()], [file]);
		await part(session.id, file);
		const before = rows("health_file_parts");
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_file BEFORE INSERT ON health_files BEGIN SELECT RAISE(ABORT, 'manifest failed'); END",
		);
		await expect(part(session.id, file, 0, 1)).rejects.toThrow("manifest failed");
		expect(rows("health_file_parts")).toEqual(before);
		expect(rows("health_files")).toEqual([]);
		fixture.sqlite.exec("DROP TRIGGER reject_file");
		await part(session.id, file, 0, 1);
		await part(session.id, file, 0, 1);
		expect(rows("health_file_parts")).toHaveLength(2);
		expect(rows("health_files")).toHaveLength(1);
	});

	it("cleans abandoned parts on cancellation and expiry but keeps committed files", async () => {
		const committed = originalFile();
		await imported([await day()], [committed]);
		const pending = originalFile("workout-routes/pending.gpx", true);
		const session = await begin([await day()], [pending]);
		await part(session.id, pending);
		expect(rows("health_file_parts")).toHaveLength(2);
		expect(await finish(session.id, "cancelled")).toMatchObject({ committedRecords: 0 });
		expect(rows("health_file_parts")).toHaveLength(1);
		await expect(part(session.id, pending)).rejects.toMatchObject({ status: 409 });
		const next = await begin([await day()], [pending]);
		await expect(part(session.id, pending)).rejects.toMatchObject({ status: 404 });
		await part(next.id, pending);
		fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
		await expect(part(next.id, pending, 0, 1)).rejects.toMatchObject({ status: 409 });
		await collectUnusedHealthParts(fixture.env.DB);
		expect(rows("health_file_parts")).toHaveLength(1);
		expect(
			(await unwrap<HealthFileManifest>(await readHealthFile(fixture.env, fileUrl(committed.path))))
				.contentHash,
		).toBe(committed.contentHash);
	});

	it("fences a file upload whose lease expires or is replaced immediately before SQL execution", async () => {
		const file = originalFile();
		for (const mutation of ["expires_at = 0", "id = 'replacement'"]) {
			fixture.sqlite.exec("UPDATE footprint_imports SET status = 'cancelled'");
			const session = await begin([await day()], [file]);
			const original = fixture.db.batch.bind(fixture.db);
			const spy = vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
				fixture.sqlite.exec(`UPDATE footprint_imports SET ${mutation}`);
				return original(statements);
			});
			await expect(part(session.id, file)).rejects.toMatchObject({ status: 409 });
			spy.mockRestore();
			expect(rows("health_files")).toEqual([]);
			expect(rows("health_file_parts")).toEqual([]);
		}
	});

	it("rejects undeclared route references and missing declared files at start and finish", async () => {
		const file = originalFile();
		const value = await day(DAY, [workout(file.path)]);
		let session = await begin([value]);
		await expect(batch(session.id, [value])).rejects.toMatchObject({ code: "missing_attachment" });
		await finish(session.id, "cancelled");
		session = await begin([value], [file]);
		await expect(batch(session.id, [value])).rejects.toMatchObject({ code: "incomplete_files" });
		await part(session.id, file);
		await batch(session.id, [value]);
		fixture.sqlite.exec("DELETE FROM health_files");
		await expect(finish(session.id)).rejects.toMatchObject({ code: "incomplete_files" });
		await expect(ensureHealthFiles(fixture.env.DB, [file])).rejects.toMatchObject({ status: 409 });
	});
});

describe("health import lease and retry semantics", () => {
	it("allows one importer per provider and returns the same receipt after response loss", async () => {
		const value = await day();
		const session = await begin([value]);
		await expect(begin([value], [], { channel: "web" })).rejects.toMatchObject({ status: 409 });
		const first = await batch(session.id, [value]);
		const before = { days: rows("provider_days"), series: rows("health_series"), state: state() };
		expect(await batch(session.id, [value])).toEqual(first);
		expect(rows("provider_days")).toEqual(before.days);
		expect(rows("health_series")).toEqual(before.series);
		expect(state()).toEqual(before.state);
		await expect(batch(session.id, [await day(DAY, [measurement(STEPS)])])).rejects.toMatchObject({
			status: 409,
		});
		await finish(session.id);
		expect(await batch(session.id, [value])).toEqual(first);
		expect(await finish(session.id)).toMatchObject({ status: "complete", committedRecords: 1 });
		await expect(finish(session.id, "cancelled")).rejects.toMatchObject({ status: 409 });
	});

	it("serializes simultaneous copies of a batch using actual SQL without double progress or lost series", async () => {
		const value = await day(DAY, [measurement(), measurement(STEPS)]);
		const session = await begin([value]);
		const original = fixture.db.batch.bind(fixture.db);
		let arriving = 0;
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const spy = vi.spyOn(fixture.db, "batch").mockImplementation(async (statements) => {
			arriving++;
			if (arriving === 2) release();
			await gate;
			return original(statements);
		});
		const [left, right] = await Promise.all([
			batch(session.id, [value]),
			batch(session.id, [value]),
		]);
		spy.mockRestore();
		expect(left).toEqual(right);
		expect(left).toMatchObject({ insertedDays: 1, committedDays: 1, committedRecords: 2 });
		expect(rows("health_series")).toHaveLength(2);
		expect(state()).toMatchObject({ record_count: 2, data_rows: 3 });
		expect(await finish(session.id)).toMatchObject({ committedRecords: 2 });
	});

	it("rejects stale batches, repeated days, overruns and completion before all declared content", async () => {
		const first = await day();
		const second = await day(DAY + HEALTH_DAY_MS);
		const session = await begin([first, second]);
		await expect(batch(session.id, [first], 2)).rejects.toMatchObject({ status: 409 });
		await expect(finish(session.id)).rejects.toMatchObject({ status: 409 });
		await batch(session.id, [first]);
		await expect(batch(session.id, [first], 2)).rejects.toMatchObject({ status: 409 });
		await expect(
			batch(
				session.id,
				[
					await day(DAY + HEALTH_DAY_MS, [
						measurement(HEART, DAY + HEALTH_DAY_MS + HOUR),
						measurement(STEPS, DAY + HEALTH_DAY_MS + HOUR),
					]),
				],
				2,
			),
		).rejects.toMatchObject({ status: 409 });
		await batch(session.id, [second], 2);
		await expect(batch(session.id, [first], 1)).rejects.toMatchObject({ status: 409 });
		await expect(batch(session.id, [await day(DAY + 2 * HEALTH_DAY_MS)], 3)).rejects.toMatchObject({
			status: 409,
		});
		expect(await finish(session.id)).toMatchObject({ committedDays: 2 });
	});

	it("preserves committed days after cancellation and rejects delayed writes from a superseded session", async () => {
		const first = await day();
		const second = await day(DAY + HEALTH_DAY_MS);
		const old = await begin([first, second]);
		await batch(old.id, [first]);
		const cancelled = await finish(old.id, "cancelled");
		expect(cancelled).toMatchObject({ committedRecords: 1, committedDays: 1 });
		expect(await finish(old.id, "cancelled")).toEqual(cancelled);
		await expect(batch(old.id, [second], 2)).rejects.toMatchObject({ status: 409 });
		await begin([second]);
		await expect(batch(old.id, [first])).rejects.toMatchObject({ status: 404 });
		await expect(finish(old.id)).rejects.toMatchObject({ status: 404 });
		expect(rows("provider_days")).toHaveLength(1);
	});

	it("fences expiry or a new session at batch commit, preserving existing content", async () => {
		await imported([await day()]);
		const before = { days: rows("provider_days"), series: rows("health_series") };
		const replacement = await day(DAY, [measurement(STEPS)]);
		for (const mutation of ["expires_at = 0", "id = 'replacement', status = 'complete'"]) {
			fixture.sqlite.exec("UPDATE footprint_imports SET status = 'cancelled'");
			const session = await begin([replacement]);
			const original = fixture.db.batch.bind(fixture.db);
			const spy = vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
				fixture.sqlite.exec(`UPDATE footprint_imports SET ${mutation}`);
				return original(statements);
			});
			await expect(batch(session.id, [replacement])).rejects.toMatchObject({
				status: mutation.startsWith("id") ? 404 : 409,
			});
			spy.mockRestore();
			expect(rows("provider_days")).toEqual(before.days);
			expect(rows("health_series")).toEqual(before.series);
		}
	});

	it("rejects an expired lease before work, resumes with a new lease and fences expired completion", async () => {
		const value = await day();
		const old = await begin([value]);
		fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
		await expect(batch(old.id, [value])).rejects.toMatchObject({ status: 409 });
		const current = await begin([value]);
		await batch(current.id, [value]);
		const original = fixture.db.batch.bind(fixture.db);
		vi.spyOn(fixture.db, "batch").mockImplementationOnce(async (statements) => {
			fixture.sqlite.exec("UPDATE footprint_imports SET expires_at = 0");
			return original(statements);
		});
		await expect(finish(current.id)).rejects.toMatchObject({ status: 409 });
		expect((await overview())?.lastImportedAt).toBeNull();
		expect(await finish(current.id, "cancelled")).toMatchObject({ committedRecords: 1 });
	});

	it("lets simultaneous finish calls share a successful receipt", async () => {
		const value = await day();
		const session = await begin([value]);
		await batch(session.id, [value]);
		const result = await Promise.all([finish(session.id), finish(session.id)]);
		expect(result[0]).toEqual(result[1]);
		expect(result[0]?.status).toBe("complete");
	});
});

describe("health input and file trust boundaries", () => {
	it("rejects invalid manifests and target mismatches before creating a source or lease", async () => {
		const value = await day();
		for (const extra of [
			{ target: "production" },
			{ totalDays: 0 },
			{ totalDays: 2 },
			{ totalRecords: "1" },
			{ totalRecords: 0 },
			{ channel: "other" },
			{ fileName: "" },
			{ files: null },
		]) {
			await expect(begin([value], [], extra)).rejects.toMatchObject({
				status: extra.target ? 409 : 400,
			});
		}
		for (const body of [null, [], false]) {
			await expect(
				beginProviderImport(request(body), fixture.env, "apple-health"),
			).rejects.toMatchObject({ status: 400 });
		}
		expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM sources").get()?.n).toBe(0);
	});

	it("validates attachment paths, lengths, contiguous parts, hashes and intervals", async () => {
		const valid = manifest(originalFile());
		expect(await validateHealthFiles([valid])).toEqual([valid]);
		for (const files of [
			null,
			[{}],
			[{ ...valid, extra: true }],
			[valid, valid],
			[{ ...valid, lastAt: (valid.firstAt as number) - 1 }],
			[{ ...valid, rawBytes: valid.rawBytes + 1 }],
			[{ ...valid, contentHash: "0".repeat(64) }],
			[{ ...valid, parts: [{ ...valid.parts[0], part: 1 }] }],
			[{ ...valid, parts: [] }],
			...["/root", "../up", "a/../b", "a//b", "a\\b", "a\0b"].map((path) => [{ ...valid, path }]),
		]) {
			await expect(validateHealthFiles(files)).rejects.toMatchObject({
				status: 400,
				code: "invalid_files",
			});
		}
	});

	it("rejects invalid day statistics, malformed batches and oversized bodies without partial writes", async () => {
		const value = await day();
		const session = await begin([value]);
		for (const body of [
			null,
			{},
			{ days: [] },
			{ days: [value, value] },
			{ days: [{}] },
			{ days: [{ ...value, recordCount: 999 }] },
			{ days: [{ ...value, contentHash: "0".repeat(64) }] },
		]) {
			await expect(
				putProviderBatch(request(body, "PUT"), fixture.env, session.id, 1, "apple-health"),
			).rejects.toMatchObject({ status: 400 });
		}
		await expect(batch(session.id, [value], 0)).rejects.toMatchObject({ status: 400 });
		await expect(finish(session.id, "failed")).rejects.toMatchObject({ status: 400 });
		const oversized = request({ days: [value] }, "PUT");
		oversized.headers.set("Content-Length", String(HEALTH_LIMITS.dayBytes + 1));
		await expect(
			putProviderBatch(oversized, fixture.env, session.id, 1, "apple-health"),
		).rejects.toMatchObject({ status: 413 });
		expect(rows("provider_days")).toEqual([]);
		expect(rows("health_series")).toEqual([]);
	});

	it("rejects unknown parts, mismatched declarations and corrupt bytes before storage", async () => {
		const file = originalFile();
		const session = await begin([await day()], [file]);
		const valid = file.parts[0] as HealthFilePart;
		for (const [fileIndex, partIndex] of [
			[1, 0],
			[0, 1],
			[-1, 0],
			[0, 0.5],
			[NaN, 0],
		]) {
			await expect(
				putHealthFilePart(
					request(valid, "PUT"),
					fixture.env,
					session.id,
					fileIndex as number,
					partIndex as number,
				),
			).rejects.toMatchObject({ status: 400 });
		}
		for (const body of [
			{},
			{ ...valid, part: 1 },
			{ ...valid, rawBytes: valid.rawBytes + 1 },
			{ ...valid, payloadBytes: valid.payloadBytes + 1 },
			{ ...valid, contentHash: "0".repeat(64) },
			{ ...valid, body: valid.body.slice(4) },
			{ ...valid, body: (valid.body[0] === "A" ? "B" : "A") + valid.body.slice(1) },
		]) {
			await expect(
				putHealthFilePart(request(body, "PUT"), fixture.env, session.id, 0, 0),
			).rejects.toMatchObject({ status: 400, code: "invalid_file_part" });
		}
		const oversized = request(valid, "PUT");
		oversized.headers.set("Content-Length", String(HEALTH_LIMITS.filePartBytes + 4097));
		await expect(putHealthFilePart(oversized, fixture.env, session.id, 0, 0)).rejects.toMatchObject(
			{ status: 413 },
		);
		expect(rows("health_file_parts")).toEqual([]);
	});

	it("validates attachment read paths and part numbers", async () => {
		const file = originalFile();
		await imported([await day()], [file]);
		await expect(readHealthFile(fixture.env, url("/file"))).rejects.toMatchObject({ status: 400 });
		await expect(readHealthFile(fixture.env, fileUrl("missing"))).rejects.toMatchObject({
			status: 404,
		});
		for (const index of ["", "-1", "1.5", "NaN"]) {
			await expect(readHealthFile(fixture.env, fileUrl(file.path, index))).rejects.toMatchObject({
				status: 400,
			});
		}
		await expect(readHealthFile(fixture.env, fileUrl(file.path, "99"))).rejects.toMatchObject({
			status: 404,
		});
	});
});

describe("health indexed reads and overview", () => {
	it("reads crossing-midnight evidence without duplicating rows, and clips events to a half-open UTC window", async () => {
		const previous = await day(DAY - HEALTH_DAY_MS, [
			measurement(SLEEP, DAY - 2 * HOUR, "asleep", DAY + 6 * HOUR),
			measurement(SLEEP, DAY - HOUR, "ends-at-start", DAY),
		]);
		const value = await day(DAY, [
			measurement(HEART, DAY, "start"),
			measurement(HEART, DAY + HOUR, "coincident"),
			measurement(HEART, DAY + HOUR, "coincident"),
			measurement(RARE, DAY + HOUR, "rare"),
		]);
		const next = await day(DAY + HEALTH_DAY_MS, [measurement(HEART, DAY + HEALTH_DAY_MS, "end")]);
		await imported([previous, value, next]);
		const all = await readHealthSeries(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS);
		expect(all.map((series) => series.dimension)).toEqual([SLEEP, HEART, RARE]);
		const story = await readHealthSeries(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS, true);
		expect(story.map((series) => series.dimension)).toEqual([SLEEP, HEART]);
		expect(
			(await readHealthSeries(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS, true, [RARE])).map(
				(series) => series.dimension,
			),
		).toEqual([RARE]);
		expect(await readHealthSeries(fixture.env.DB, DAY, DAY)).toEqual([]);
		const events = await readHealthEvents(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS);
		expect(events).toHaveLength(5);
		expect(events.map((event) => event.data)).not.toContainEqual(
			expect.objectContaining({ value: "ends-at-start" }),
		);
		expect(events.map((event) => event.data)).not.toContainEqual(
			expect.objectContaining({ value: "end" }),
		);
		expect(new Set(events.map((event) => event.id)).size).toBe(5);
		expect(await readHealthEvents(fixture.env.DB, DAY, DAY + HEALTH_DAY_MS, [HEART])).toHaveLength(
			3,
		);
		expect(
			await readHealthEvents(fixture.env.DB, DAY + 10 * HEALTH_DAY_MS, DAY + 11 * HEALTH_DAY_MS),
		).toEqual([]);
	});

	it("keeps compact health series on the first event page and suppresses replaced legacy samples", async () => {
		await imported([await day()]);
		insertLegacy("replaced", DAY + HOUR);
		insertLegacy("prior-sleep", DAY - HOUR, DAY + HOUR);
		insertLegacy("expense", DAY + HOUR, null, "pixiu");
		const eventUrl = new URL(`${ORIGIN}/api/events?start=2026-09-13&end=2026-09-14`);
		const page = await unwrap<EventPage>(await handleGetEvents(fixture.env, eventUrl));
		expect(page.events.map((event) => event.id)).toEqual(["prior-sleep", "expense"]);
		expect(page.healthSeries).toHaveLength(1);
		eventUrl.searchParams.set("source", "pixiu");
		const expense = await unwrap<EventPage>(await handleGetEvents(fixture.env, eventUrl));
		expect(expense.events.map((event) => event.id)).toEqual(["expense"]);
		expect(expense.healthSeries).toBeUndefined();
		eventUrl.searchParams.set("source", "apple-health");
		eventUrl.searchParams.set("cursor", encodeCursor(DAY, "cursor"));
		expect(
			(await unwrap<EventPage>(await handleGetEvents(fixture.env, eventUrl))).healthSeries,
		).toBeUndefined();
	});

	it("counts facts once, measures actual payload bytes and caches dimension/file statistics by revision", async () => {
		expect(await overview()).toMatchObject({ recordCount: 0, coverageDays: 0, dataRows: 0 });
		const file = originalFile();
		const first = await day(DAY, [measurement(), measurement(), workout(file.path)]);
		const second = await day(DAY + HEALTH_DAY_MS);
		await imported([first, second], [file]);
		const result = await overview();
		expect(result).toMatchObject({
			storage: "day-dimension",
			coverageDays: 2,
			recordCount: 4,
			...physicalTotals(),
			lastImportChannel: "cli",
			health: {
				dimensions: [
					{ id: HEART, recordCount: 3, coverageDays: 2, dataRows: 2 },
					{ id: "Workout", recordCount: 1, coverageDays: 1, dataRows: 1 },
				],
				files: [{ kind: "route", fileCount: 1, recordCount: 2, rawBytes: file.rawBytes }],
			},
		});
		const queryCount = fixture.queries.length;
		expect(await overview()).toEqual(result);
		expect(fixture.queries.length - queryCount).toBe(1);
		const replacement = await day(DAY, [measurement(STEPS)]);
		await imported([replacement]);
		expect(await overview()).toMatchObject({ recordCount: 2, ...physicalTotals() });
		expect((await overview())?.health?.dimensions.map((dimension) => dimension.id)).not.toContain(
			"Workout",
		);
		fixture.sqlite.exec("DELETE FROM health_files");
		await collectUnusedHealthParts(fixture.env.DB);
		expect(await overview()).toMatchObject({ ...physicalTotals(), health: { files: [] } });
	});

	it("retains epoch-dated measurements and settings while rebuilding older coverage caches", async () => {
		const height = "HKQuantityTypeIdentifierHeight";
		const goal = "HKDataTypeSleepDurationGoal";
		await imported([
			await day(0, [measurement(height, 1_472_000)]),
			await day(),
			await day(DAY + HEALTH_DAY_MS, [measurement(goal, DAY + HEALTH_DAY_MS)]),
		]);
		const result = await overview();
		expect(result).toMatchObject({
			recordCount: 3,
			coverageDays: 1,
			firstAt: new Date(DAY + HOUR).toISOString(),
			coverage: [{ utcDay: DAY, recordCount: 1 }],
			health: {
				epochRecordCount: 1,
				dimensions: expect.arrayContaining([
					{
						id: height,
						recordCount: 1,
						coverageDays: 0,
						dataRows: 1,
						payloadBytes: expect.any(Number),
					},
					{
						id: goal,
						recordCount: 1,
						coverageDays: 0,
						dataRows: 1,
						payloadBytes: expect.any(Number),
					},
				]),
			},
		});
		expect(await readHealthEvents(fixture.env.DB, 0, HEALTH_DAY_MS)).toMatchObject([
			{ occurredAt: "1970-01-01T00:24:32.000Z", data: { type: height } },
		]);
		fixture.sqlite
			.prepare(
				"UPDATE provider_state SET stats_revision = revision, stats_json = ? WHERE source_id = 'apple-health'",
			)
			.run(
				JSON.stringify({
					coverage: [{ utcDay: 0, recordCount: 3 }],
					firstAt: 0,
					lastAt: DAY,
					health: { dimensions: result?.health?.dimensions, files: [] },
				}),
			);
		expect(await overview()).toEqual(result);
		const queryCount = fixture.queries.length;
		expect(await overview()).toEqual(result);
		expect(fixture.queries.length - queryCount).toBe(1);
	});
});

describe("Apple Health API and Access boundaries", () => {
	const route = (req: Request) => handleDataRequest(req, fixture.env, new URL(req.url));

	it("routes begin, verified file upload, day upload, finish, inventory and both series views", async () => {
		const file = originalFile();
		const value = await day(DAY, [workout(file.path), measurement(RARE)]);
		const session = await unwrap<FootprintImportSession>(
			await route(request(importBody([value], [file]))),
		);
		expect(
			(await route(request(file.parts[0], "PUT", `/imports/${session.id}/files/0/parts/0`))).status,
		).toBe(200);
		expect(
			(await route(request({ days: [value] }, "PUT", `/imports/${session.id}/batches/1`))).status,
		).toBe(200);
		expect(
			(await route(request({ status: "complete" }, "POST", `/imports/${session.id}/finish`)))
				.status,
		).toBe(200);
		expect(await unwrap(await route(new Request(url("/files"))))).toEqual({
			files: [{ path: file.path, contentHash: file.contentHash }],
		});
		expect(await unwrap(await route(new Request(fileUrl(file.path))))).toEqual(manifest(file));
		const read = "/series?start=2026-09-13&end=2026-09-14";
		expect(
			(await unwrap<{ series: StoredHealthSeries[] }>(await route(new Request(url(read))))).series,
		).toHaveLength(2);
		expect(
			(
				await unwrap<{ series: StoredHealthSeries[] }>(
					await route(new Request(url(`${read}&view=story`))),
				)
			).series.map((series) => series.dimension),
		).toEqual(["Workout"]);
		expect((await route(new Request(url(`${read}&view=all`)))).status).toBe(200);
	});

	it("rejects unsupported methods, unknown endpoints and invalid UTC read windows", async () => {
		for (const suffix of [
			"/imports",
			"/files",
			"/file",
			"/series",
			"/imports/id/batches/1",
			"/imports/id/finish",
			"/imports/id/files/0/parts/0",
		]) {
			await expect(route(new Request(url(suffix), { method: "DELETE" }))).rejects.toMatchObject({
				status: 405,
			});
		}
		await expect(route(new Request(url("/unknown")))).rejects.toMatchObject({ status: 404 });
		for (const query of [
			"",
			"?start=bad&end=2026-09-14",
			"?start=2026-09-14&end=2026-09-13",
			"?start=2026-09-13&end=2026-09-13",
			"?start=2026-01-01&end=2026-09-14",
			"?start=2026-09-13&end=2026-09-14&view=unknown",
		]) {
			await expect(route(new Request(url(`/series${query}`)))).rejects.toMatchObject({
				status: 400,
			});
		}
		const legacy = await handleRequest(
			new Request(`${ORIGIN}/api/imports`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: [] }),
			}),
			fixture.env,
		);
		expect(legacy.status).toBe(410);
		expect(await legacy.json()).toMatchObject({ error: { code: "health_import_moved" } });
	});

	it("requires verified Access JWTs for health data and shares the same owner dataset across identities", async () => {
		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(publicKey);
		fixture.env.TEST_ACCESS_JWKS = JSON.stringify({
			keys: [{ ...publicJwk, kid: "health-test", alg: "RS256" }],
		});
		const token = (subject: string, audience = fixture.env.ACCESS_AUD, expired = false) =>
			new SignJWT({ email: `${subject}@example.test` })
				.setProtectedHeader({ alg: "RS256", kid: "health-test" })
				.setIssuer(`https://${fixture.env.ACCESS_TEAM_DOMAIN}`)
				.setAudience(audience)
				.setSubject(subject)
				.setExpirationTime(Math.floor(Date.now() / 1000) + (expired ? -120 : 600))
				.sign(privateKey);
		const readUrl = url("/series?start=2026-09-13&end=2026-09-14");
		const unauthorizedHeaders: HeadersInit[] = [
			{},
			{ Authorization: `Bearer life_${"1".repeat(64)}` },
			{ "Cf-Access-Authenticated-User-Email": "owner@example.test" },
		];
		for (const headers of unauthorizedHeaders) {
			expect((await handleRequest(new Request(readUrl, { headers }), fixture.env)).status).toBe(
				401,
			);
		}
		for (const assertion of [
			"forged",
			await token("owner", "wrong"),
			await token("owner", undefined, true),
		]) {
			expect(
				(
					await handleRequest(
						new Request(readUrl, {
							headers: { "Cf-Access-Jwt-Assertion": assertion },
						}),
						fixture.env,
					)
				).status,
			).toBe(403);
		}
		const authorized = await token("owner");
		const req = request(importBody([await day()]));
		req.headers.set("Cf-Access-Jwt-Assertion", authorized);
		const session = await unwrap<FootprintImportSession>(await handleRequest(req, fixture.env));
		const upload = request({ days: [await day()] }, "PUT", `/imports/${session.id}/batches/1`);
		upload.headers.set("Cf-Access-Jwt-Assertion", authorized);
		expect((await handleRequest(upload, fixture.env)).status).toBe(200);
		const otherIdentity = await token("other-owner-identity");
		const result = await unwrap<{ series: StoredHealthSeries[] }>(
			await handleRequest(
				new Request(readUrl, {
					headers: { "Cf-Access-Jwt-Assertion": otherIdentity },
				}),
				fixture.env,
			),
		);
		expect(result.series).toHaveLength(1);
	});

	it("denies health reads and writes on the machine host and rejects cross-origin browser writes", async () => {
		for (const suffix of [
			"/imports",
			"/files",
			"/file",
			"/series",
			"/imports/id/batches/1",
			"/imports/id/finish",
			"/imports/id/files/0/parts/0",
		]) {
			const response = await handleRequest(
				new Request(`https://life.worker.hexly.ai${PREFIX}${suffix}`, {
					method: suffix === "/imports" ? "POST" : "GET",
				}),
				fixture.env,
			);
			expect(response.status).toBe(404);
		}
		const crossOrigin = request(importBody([await day()]));
		crossOrigin.headers.set("Origin", "https://other.example");
		expect((await handleRequest(crossOrigin, fixture.env)).status).toBe(403);
		const production = {
			...fixture.env,
			RESOURCE_ENV: "production",
			DATA_TARGET: "production",
			APP_ORIGIN: ORIGIN,
		};
		expect((await handleRequest(new Request(url("/files")), production)).status).toBe(401);
		expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM sources").get()?.n).toBe(0);
	});
});
