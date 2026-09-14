import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual, parseArgs } from "node:util";
import Papa from "papaparse";
import { captureFootprint } from "./verify-health-import";

// This oracle deliberately does not import the Pixiu parser, validator or money helpers.
const COLUMNS = [
	"日期",
	"交易分类",
	"交易类型",
	"流入金额",
	"流出金额",
	"币种",
	"资金账户",
	"标签",
	"备注",
];
const DAY = 86_400_000;
const OFFSET = 28_800_000;
type Row = [string, string, string, string, string, string, string, string, string];
type Payload = {
	v: 1;
	precision: "day";
	sourceDate: string;
	timeZone: "Asia/Shanghai";
	utcOffsetMinutes: 480;
	columns: string[];
	rows: Row[];
};
class VerificationError extends Error {}

function check(condition: unknown, label: string): asserts condition {
	if (!condition) throw new VerificationError(label);
}
function equal(actual: unknown, expected: unknown, label: string): void {
	check(isDeepStrictEqual(actual, expected), label);
}
function sha(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}
function json<T>(value: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new VerificationError("Invalid JSON; private input details omitted");
	}
}
function count(db: DatabaseSync, sql: string): number {
	const value = db.prepare(sql).get()?.n;
	check(typeof value === "number" && Number.isSafeInteger(value), "Invalid database count");
	return value;
}

function dateKey(date: string): number {
	check(/^\d{4}-\d{2}-\d{2}$/.test(date), "Invalid source accounting date");
	const value = Date.parse(`${date}T00:00:00.000Z`);
	check(
		Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date,
		"Source accounting date does not exist",
	);
	return value;
}
function cents(amount: string): bigint {
	check(/^\d+\.\d{2}$/.test(amount), "Invalid original amount format");
	const [whole, fraction] = amount.split(".") as [string, string];
	const value = BigInt(whole) * 100n + BigInt(fraction);
	check(value <= BigInt(Number.MAX_SAFE_INTEGER), "Original amount exceeds exact numeric storage");
	return value;
}
function totals(rows: Row[], fields: number[]) {
	const groups = new Map<string, { count: number; incoming: bigint; outgoing: bigint }>();
	for (const row of rows) {
		const key = JSON.stringify(fields.map((field) => row[field]));
		const total = groups.get(key) ?? { count: 0, incoming: 0n, outgoing: 0n };
		total.count++;
		total.incoming += cents(row[3]);
		total.outgoing += cents(row[4]);
		groups.set(key, total);
	}
	return [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
function moneyEvidence(rows: Row[]) {
	return Object.fromEntries(
		Object.entries({
			currency: [5],
			classification: [5, 1],
			type: [5, 1, 2],
			account: [5, 6],
			combined: [5, 1, 2, 6],
		}).map(([name, fields]) => {
			const values = totals(rows, fields);
			return [
				name,
				{
					groups: values.length,
					hash: sha(
						JSON.stringify(
							values.map(([key, value]) => [
								key,
								value.count,
								value.incoming.toString(),
								value.outgoing.toString(),
							]),
						),
					),
				},
			];
		}),
	);
}
function summary(rows: Row[]) {
	return {
		totals: totals(rows, [5, 1]).map(([key, total]) => {
			const [currency, classification] = json<[string, string]>(key);
			check(
				total.incoming <= BigInt(Number.MAX_SAFE_INTEGER) &&
					total.outgoing <= BigInt(Number.MAX_SAFE_INTEGER),
				"Daily summary exceeds exact numeric storage",
			);
			return {
				currency,
				classification,
				count: total.count,
				inflowMinor: Number(total.incoming),
				outflowMinor: Number(total.outgoing),
			};
		}),
	};
}
function payload(date: string, rows: Row[]): Payload {
	return {
		v: 1,
		precision: "day",
		sourceDate: date,
		timeZone: "Asia/Shanghai",
		utcOffsetMinutes: 480,
		columns: COLUMNS,
		rows,
	};
}
function contentHash(data: Payload): string {
	return sha(JSON.stringify({ ...data, rows: data.rows.map((row) => JSON.stringify(row)).sort() }));
}

export function referenceCsv(files: { name: string; bytes: Uint8Array }[]) {
	const days = new Map<string, Row[]>();
	const fileEvidence = [];
	for (const file of files) {
		let text: string;
		try {
			text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
		} catch {
			throw new VerificationError("Original CSV is not valid UTF-8");
		}
		const parsed = Papa.parse<string[]>(text, { dynamicTyping: false, skipEmptyLines: true });
		check(parsed.errors.length === 0, "Original CSV syntax error");
		const [header, ...records] = parsed.data;
		equal(header, COLUMNS, "Original nine-column CSV header mismatch");
		const fileDays = new Map<string, Row[]>();
		for (const row of records) {
			check(
				row.length === 9 && row.every((cell) => typeof cell === "string"),
				"Original row does not contain nine strings",
			);
			const original = row as Row;
			dateKey(original[0]);
			check(
				original[1].trim() && original[5].trim(),
				"Missing original currency or classification",
			);
			cents(original[3]);
			cents(original[4]);
			const group = fileDays.get(original[0]) ?? [];
			group.push(original);
			fileDays.set(original[0], group);
		}
		for (const [date, rows] of fileDays) {
			check(
				!days.has(date),
				"Source files contain overlapping accounting dates; supply the original disjoint yearly exports",
			);
			days.set(date, rows);
		}
		fileEvidence.push({
			name: file.name,
			bytes: file.bytes.byteLength,
			records: records.length,
			hash: sha(file.bytes),
		});
	}
	const ordered = [...days].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const rows = ordered.flatMap(([, entries]) => entries);
	check(rows.length > 0, "No original Pixiu records");
	return {
		days: ordered,
		evidence: {
			files: fileEvidence,
			days: days.size,
			records: rows.length,
			zeroRows: rows.filter((row) => cents(row[3]) === 0n && cents(row[4]) === 0n).length,
			duplicateOccurrences: rows.length - new Set(rows.map((row) => JSON.stringify(row))).size,
			orderedRows: sha(JSON.stringify(ordered)),
			exactCents: moneyEvidence(rows),
		},
	};
}

function fingerprint(db: DatabaseSync, queries: string[]) {
	const content = createHash("sha256");
	const timestamps = createHash("sha256");
	let rows = 0;
	for (const [table, sql] of queries.entries())
		for (const row of db.prepare(sql).iterate()) {
			const { updated_at: stamp, ...values } = row;
			content.update(`${JSON.stringify([table, Object.entries(values)])}\n`);
			if (stamp !== undefined) timestamps.update(`${JSON.stringify([table, stamp])}\n`);
			rows++;
		}
	return { rows, content: content.digest("hex"), timestamps: timestamps.digest("hex") };
}
const STATE =
	"SELECT source_id, revision, record_count, data_rows, payload_bytes, last_changed_at FROM provider_state";

export function captureProviders(db: DatabaseSync) {
	return {
		footprint: captureFootprint(db),
		healthDays: count(
			db,
			"SELECT COUNT(*) AS n FROM provider_days WHERE source_id = 'apple-health'",
		),
		healthRecords: count(
			db,
			"SELECT COALESCE(SUM(record_count), 0) AS n FROM provider_days WHERE source_id = 'apple-health'",
		),
		healthSeries: count(db, "SELECT COUNT(*) AS n FROM health_series"),
		healthFiles: count(db, "SELECT COUNT(*) AS n FROM health_files"),
		healthFileParts: count(db, "SELECT COUNT(*) AS n FROM health_file_parts"),
		...fingerprint(db, [
			"SELECT * FROM sources WHERE id != 'pixiu' ORDER BY id",
			"SELECT * FROM life_events WHERE source_id != 'pixiu' ORDER BY source_id, id",
			"SELECT * FROM provider_days WHERE source_id != 'pixiu' ORDER BY source_id, utc_day",
			"SELECT * FROM health_series ORDER BY utc_day, dimension, part",
			"SELECT * FROM health_files ORDER BY path",
			"SELECT * FROM health_file_parts ORDER BY file_hash, part",
			`${STATE} WHERE source_id != 'pixiu' ORDER BY source_id`,
		]),
	};
}
function capturePixiu(db: DatabaseSync) {
	return {
		days: count(db, "SELECT COUNT(*) AS n FROM provider_days WHERE source_id = 'pixiu'"),
		records: count(
			db,
			"SELECT COALESCE(SUM(record_count), 0) AS n FROM provider_days WHERE source_id = 'pixiu'",
		),
		payloadBytes: count(
			db,
			"SELECT COALESCE(SUM(payload_bytes), 0) AS n FROM provider_days WHERE source_id = 'pixiu'",
		),
		...fingerprint(db, [
			"SELECT * FROM sources WHERE id = 'pixiu'",
			"SELECT * FROM provider_days WHERE source_id = 'pixiu' ORDER BY utc_day",
			"SELECT * FROM life_events WHERE source_id = 'pixiu' ORDER BY id",
			`${STATE} WHERE source_id = 'pixiu'`,
		]),
	};
}

interface DayRow {
	utc_day: number;
	record_count: number;
	first_at: number;
	last_at: number;
	payload_bytes: number;
	content_hash: string;
	updated_at: number;
	data_json: string;
	summary_json: string;
}
interface Receipt {
	status: string;
	totalDays: number;
	totalRecords: number;
	committedDays: number;
	committedRecords: number;
	insertedDays: number;
	updatedDays: number;
	unchangedDays: number;
	startedAt: number;
	finishedAt: number;
	importedAt: number;
	channel: string;
	importedChannel: string;
}

export function verifyPixiu(db: DatabaseSync, reference: ReturnType<typeof referenceCsv>) {
	const stored = db
		.prepare("SELECT * FROM provider_days WHERE source_id = 'pixiu' ORDER BY utc_day")
		.all() as unknown as DayRow[];
	check(stored.length === reference.days.length, "Pixiu accounting-day count mismatch");
	check(
		count(db, "SELECT COUNT(*) AS n FROM life_events WHERE source_id = 'pixiu'") === 0,
		"Legacy Pixiu event rows remain",
	);
	const actualRows: Row[] = [];
	for (const [index, [date, rows]] of reference.days.entries()) {
		const row = stored[index] as DayRow;
		const key = dateKey(date);
		const label = `Pixiu day ${index + 1}`;
		const expected = payload(date, rows);
		const data = json<Payload>(row.data_json);
		equal(
			data,
			expected,
			`${label}: original cells, row order, duplicates or date metadata differ`,
		);
		const expectedSummary = summary(rows);
		equal(json(row.summary_json), expectedSummary, `${label}: exact-cent summary mismatch`);
		check(
			row.utc_day === key &&
				row.first_at === key - OFFSET &&
				row.last_at === key - OFFSET + DAY - 1,
			`${label}: UTC+8 accounting interval mismatch`,
		);
		check(
			row.record_count === rows.length &&
				Number.isSafeInteger(row.updated_at) &&
				row.updated_at >= 0,
			`${label}: count or timestamp mismatch`,
		);
		check(row.content_hash === contentHash(expected), `${label}: content hash mismatch`);
		const bytes =
			Buffer.byteLength(JSON.stringify(expected)) +
			Buffer.byteLength(JSON.stringify(expectedSummary));
		check(
			row.payload_bytes === bytes &&
				bytes === Buffer.byteLength(row.data_json) + Buffer.byteLength(row.summary_json),
			`${label}: payload byte count mismatch`,
		);
		actualRows.push(...data.rows);
	}
	const exactCents = moneyEvidence(actualRows);
	equal(
		exactCents,
		reference.evidence.exactCents,
		"Exact cents by currency/classification/type/account mismatch",
	);
	check(actualRows.length === reference.evidence.records, "Pixiu original record count mismatch");
	const snapshot = capturePixiu(db);
	const state = db.prepare("SELECT * FROM provider_state WHERE source_id = 'pixiu'").get();
	check(
		state &&
			state.record_count === snapshot.records &&
			state.data_rows === snapshot.days &&
			state.payload_bytes === snapshot.payloadBytes,
		"Pixiu provider aggregate mismatch",
	);
	const source = db.prepare("SELECT kind, provider FROM sources WHERE id = 'pixiu'").get();
	check(source?.kind === "import" && source.provider === "pixiu", "Pixiu source metadata mismatch");
	const receipt = db
		.prepare(`SELECT f.status, f.total_days AS totalDays, f.total_points AS totalRecords,
		f.committed_days AS committedDays, f.committed_points AS committedRecords,
		f.inserted_days AS insertedDays, f.updated_days AS updatedDays, f.unchanged_days AS unchangedDays,
		f.started_at AS startedAt, f.finished_at AS finishedAt, p.last_imported_at AS importedAt,
		f.channel, p.last_import_channel AS importedChannel
		FROM footprint_imports f JOIN provider_state p USING (source_id) WHERE f.source_id = 'pixiu'`)
		.get() as unknown as Receipt | undefined;
	check(
		receipt?.status === "complete" &&
			receipt.totalDays === snapshot.days &&
			receipt.totalRecords === snapshot.records &&
			receipt.committedDays === snapshot.days &&
			receipt.committedRecords === snapshot.records &&
			receipt.insertedDays + receipt.updatedDays + receipt.unchangedDays === snapshot.days &&
			Number.isSafeInteger(receipt.startedAt) &&
			Number.isSafeInteger(receipt.finishedAt) &&
			receipt.finishedAt >= receipt.startedAt &&
			receipt.importedAt === receipt.finishedAt &&
			["web", "cli"].includes(receipt.channel) &&
			receipt.importedChannel === receipt.channel,
		"Pixiu complete import receipt or import timestamp mismatch",
	);
	return {
		snapshot,
		receipt: { ...receipt },
		reference: reference.evidence,
		exactCentsMatched: true,
	};
}

interface Report {
	version: 1;
	mode: "capture" | "verify";
	createdAt: string;
	others: ReturnType<typeof captureProviders>;
	pixiu: ReturnType<typeof capturePixiu>;
	verification?: ReturnType<typeof verifyPixiu>;
}

export function comparePixiuReports(current: Report, before?: Report, previous?: Report) {
	if (before)
		equal(
			current.others,
			before.others,
			"Other provider content, counts or timestamps changed since baseline",
		);
	if (previous) {
		equal(current.others, previous.others, "Other providers changed during Pixiu replay");
		equal(
			current.pixiu,
			previous.pixiu,
			"Pixiu content, row timestamps or provider revision changed during replay",
		);
		check(
			current.verification && previous.verification,
			"Replay comparison requires two verified imports",
		);
		equal(
			current.verification.reference,
			previous.verification.reference,
			"Replay CSV source differs from the first import",
		);
		const receipt = current.verification.receipt;
		check(
			receipt.insertedDays === 0 &&
				receipt.updatedDays === 0 &&
				receipt.unchangedDays === current.pixiu.days &&
				receipt.startedAt > previous.verification.receipt.finishedAt,
			"A second complete unchanged Pixiu import is required",
		);
	}
	return {
		otherProvidersUnchanged: before || previous ? true : null,
		pixiuIdempotent: previous ? true : null,
	};
}

function selfCheck(): number {
	const db = new DatabaseSync(":memory:");
	let checks = 0;
	const rejects = (fn: () => unknown, label: string) => {
		let failed = false;
		try {
			fn();
		} catch (error) {
			if (error instanceof VerificationError) failed = true;
			else throw error;
		}
		check(failed, `Self-check missed ${label}`);
		checks++;
	};
	const corrupt = (sql: string, fn: () => unknown, label: string) => {
		db.exec("SAVEPOINT self_check");
		try {
			db.exec(sql);
			rejects(fn, label);
		} finally {
			db.exec("ROLLBACK TO self_check; RELEASE self_check");
		}
	};
	try {
		const migrations = new URL("../worker/migrations/", import.meta.url);
		for (const file of readdirSync(migrations)
			.filter((name) => name.endsWith(".sql"))
			.sort())
			db.exec(readFileSync(new URL(file, migrations), "utf8"));
		db.exec(
			"CREATE TABLE _test_marker (key TEXT PRIMARY KEY, value TEXT); INSERT INTO _test_marker VALUES ('env','test')",
		);
		db.exec(
			"INSERT INTO sources (id,name,kind,provider,created_at) VALUES ('footprint','fixture','import','footprint',1), ('pixiu','fixture','import','pixiu',1), ('apple-health','fixture','import','apple-health',1)",
		);
		const key = Date.parse("2026-01-01T00:00:00Z");
		const gps = JSON.stringify({
			v: 1,
			fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
			points: [[0, 0, 0, null, null, null]],
		});
		const hours = Array<number>(24).fill(0);
		hours[0] = 1;
		const insert = db.prepare("INSERT INTO provider_days VALUES (?,?,?,?,?,?,?,?,?,?)");
		insert.run(
			"footprint",
			key,
			1,
			key,
			key,
			Buffer.byteLength(gps),
			JSON.stringify({ hourCounts: hours }),
			gps,
			sha(`${key}:${gps}`),
			1000,
		);
		const csv = `${COLUMNS.join(",")}\r\n2026-01-01,支出,餐饮,0.00,0.10,CNY,现金,,"逗号, ""引号""\n换行"\r\n2026-01-02,收入,销售,0.30,0.00,USD,美元账户,,\r\n2026-01-01,调整,对账,0.00,0.00,CNY,现金,原始标签,\r\n2026-01-01,支出,餐饮,0.00,0.10,CNY,现金,,"逗号, ""引号""\n换行"\r\n`;
		const reference = referenceCsv([{ name: "synthetic.csv", bytes: Buffer.from(csv) }]);
		check(
			reference.evidence.records === 4 &&
				reference.evidence.days === 2 &&
				reference.evidence.zeroRows === 1 &&
				reference.evidence.duplicateOccurrences === 1,
			"Self-check CSV did not preserve zeros/duplicates/quotes",
		);
		checks++;
		for (const [date, rows] of reference.days) {
			const data = payload(date, rows),
				totalsJson = JSON.stringify(summary(rows)),
				dataJson = JSON.stringify(data);
			insert.run(
				"pixiu",
				dateKey(date),
				rows.length,
				dateKey(date) - OFFSET,
				dateKey(date) - OFFSET + DAY - 1,
				Buffer.byteLength(dataJson) + Buffer.byteLength(totalsJson),
				totalsJson,
				dataJson,
				contentHash(data),
				1000,
			);
		}
		db.exec(
			"INSERT INTO footprint_imports (source_id,id,expires_at,status,file_name,total_days,total_points,channel,started_at,finished_at,committed_days,committed_points,inserted_days) VALUES ('pixiu','first',2000,'complete','fixture',2,4,'cli',1000,2000,2,4,2)",
		);
		db.exec(
			"UPDATE provider_state SET last_imported_at=2000,last_import_channel='cli' WHERE source_id='pixiu'",
		);
		const report = (): Report => {
			const verification = verifyPixiu(db, reference);
			return {
				version: 1,
				mode: "verify",
				createdAt: "fixture",
				others: captureProviders(db),
				pixiu: verification.snapshot,
				verification,
			};
		};
		const first = report();
		checks++;
		const verify = () => verifyPixiu(db, reference);
		corrupt(
			"UPDATE provider_days SET data_json=json_set(data_json,'$.rows[0][8]','changed') WHERE source_id='pixiu'",
			verify,
			"changed original cell",
		);
		corrupt(
			"UPDATE provider_days SET data_json=json_remove(data_json,'$.rows[2]') WHERE source_id='pixiu'",
			verify,
			"missing duplicate",
		);
		corrupt(
			"UPDATE provider_days SET data_json=json_remove(data_json,'$.rows[1]') WHERE source_id='pixiu'",
			verify,
			"missing zero row",
		);
		corrupt(
			"UPDATE provider_days SET data_json=json_set(data_json,'$.rows',json_array(json_extract(data_json,'$.rows[1]'),json_extract(data_json,'$.rows[0]'),json_extract(data_json,'$.rows[2]'))) WHERE source_id='pixiu' AND record_count=3",
			verify,
			"row order change",
		);
		corrupt(
			"UPDATE provider_days SET summary_json=json_set(summary_json,'$.totals[0].inflowMinor',999) WHERE source_id='pixiu'",
			verify,
			"wrong exact cents",
		);
		corrupt(
			"UPDATE provider_days SET first_at=utc_day WHERE source_id='pixiu'",
			verify,
			"UTC+8 interval drift",
		);
		corrupt(
			"UPDATE provider_days SET content_hash='wrong' WHERE source_id='pixiu'",
			verify,
			"incorrect content hash",
		);
		corrupt(
			"UPDATE provider_days SET payload_bytes=payload_bytes+1 WHERE source_id='pixiu'",
			verify,
			"incorrect byte count",
		);
		corrupt(
			"UPDATE provider_state SET record_count=record_count+1 WHERE source_id='pixiu'",
			verify,
			"provider count drift",
		);
		corrupt(
			"UPDATE footprint_imports SET status='running' WHERE source_id='pixiu'",
			verify,
			"incomplete receipt",
		);
		db.exec(
			"UPDATE footprint_imports SET id='second',started_at=3000,finished_at=4000,inserted_days=0,unchanged_days=2 WHERE source_id='pixiu'; UPDATE provider_state SET last_imported_at=4000 WHERE source_id='pixiu'",
		);
		comparePixiuReports(report(), first, first);
		checks++;
		corrupt(
			"UPDATE provider_days SET updated_at=4000 WHERE source_id='pixiu'",
			() => comparePixiuReports(report(), first, first),
			"replay timestamp write",
		);
		corrupt(
			"UPDATE provider_days SET updated_at=4000 WHERE source_id='footprint'",
			() => comparePixiuReports(report(), first, first),
			"Footprint change",
		);
		corrupt(
			"UPDATE provider_state SET revision=revision+1 WHERE source_id='apple-health'",
			() => comparePixiuReports(report(), first, first),
			"Health change",
		);
		corrupt(
			"UPDATE footprint_imports SET unchanged_days=0,updated_days=2 WHERE source_id='pixiu'",
			() => comparePixiuReports(report(), first, first),
			"changed replay receipt",
		);
		rejects(
			() =>
				referenceCsv([
					{ name: "bad.csv", bytes: Buffer.from(csv.replace("2026-01-01", "2026-02-30")) },
				]),
			"invalid original date",
		);
		rejects(
			() => referenceCsv([{ name: "bad.csv", bytes: Buffer.from(csv.replace("0.10", "0.1")) }]),
			"invalid original amount",
		);
		return checks;
	} finally {
		db.close();
	}
}

if (import.meta.main) {
	try {
		const { positionals, values } = parseArgs({
			allowPositionals: true,
			options: { before: { type: "string" }, previous: { type: "string" } },
		});
		const [mode, database, third, fourth] = positionals;
		if (mode === "self-test" && positionals.length === 1)
			console.log(JSON.stringify({ selfChecks: selfCheck(), matched: true }));
		else {
			check(
				(mode === "capture" && positionals.length === 3) ||
					(mode === "verify" && positionals.length === 4),
				"Usage: capture <snapshot.sqlite> <report.json> | verify <snapshot.sqlite> <csv-directory> <report.json> [--before <baseline.json>] [--previous <first-verify.json>] | self-test",
			);
			check(database && third, "Missing snapshot or report path");
			const db = new DatabaseSync(database, { readOnly: true });
			try {
				db.exec("PRAGMA query_only = ON; BEGIN");
				check(
					db.prepare("PRAGMA quick_check").get()?.quick_check === "ok",
					"SQLite integrity check failed",
				);
				check(
					db.prepare("PRAGMA foreign_key_check").all().length === 0,
					"SQLite foreign key check failed",
				);
				const others = captureProviders(db);
				check(
					others.footprint.days === 1625 &&
						others.footprint.points === 670191 &&
						others.healthDays === 1413 &&
						others.healthRecords === 1841302 &&
						others.healthSeries === 29100 &&
						others.healthFiles === 158 &&
						others.healthFileParts === 1328,
					"Expected the complete production Footprint and Health datasets",
				);
				let verification: ReturnType<typeof verifyPixiu> | undefined;
				if (mode === "verify") {
					const files = Array.from({ length: 7 }, (_, index) => {
						const name = `${2020 + index}.csv`;
						return { name, bytes: readFileSync(join(third, name)) };
					});
					const reference = referenceCsv(files);
					check(
						reference.evidence.records === 8690 && reference.evidence.days === 1832,
						"Expected all 8690 original Pixiu records across 1832 accounting dates",
					);
					verification = verifyPixiu(db, reference);
				}
				const report: Report = {
					version: 1,
					mode,
					createdAt: new Date().toISOString(),
					others,
					pixiu: verification?.snapshot ?? capturePixiu(db),
					...(verification ? { verification } : {}),
				};
				const comparison = comparePixiuReports(
					report,
					values.before ? json<Report>(readFileSync(values.before, "utf8")) : undefined,
					values.previous ? json<Report>(readFileSync(values.previous, "utf8")) : undefined,
				);
				writeFileSync(
					mode === "capture" ? third : (fourth as string),
					`${JSON.stringify({ ...report, ...comparison, matched: true }, null, 2)}\n`,
					{ mode: 0o600, flag: "wx" },
				);
				console.log(
					JSON.stringify({
						mode,
						matched: true,
						pixiuDays: report.pixiu.days,
						pixiuRecords: report.pixiu.records,
						zeroRows: verification?.reference.zeroRows,
						duplicateOccurrences: verification?.reference.duplicateOccurrences,
						footprintDays: others.footprint.days,
						footprintPoints: others.footprint.points,
						healthRecords: others.healthRecords,
						...comparison,
					}),
				);
			} finally {
				db.close();
			}
		}
	} catch (error) {
		console.error(
			error instanceof VerificationError
				? error.message
				: "Unable to verify local snapshot or create a new report; private details omitted",
		);
		process.exitCode = 1;
	}
}
