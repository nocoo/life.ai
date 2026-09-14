import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import type { FootprintPayload } from "../src/models/footprint";
import type {
	HealthDay,
	HealthFile,
	HealthFileManifest,
	HealthFilePart,
	HealthNode,
	HealthSeries,
} from "../src/models/health-types";

class VerificationError extends Error {}

function check(condition: unknown, label: string): asserts condition {
	if (!condition) throw new VerificationError(label);
}

function same(actual: unknown, expected: unknown, label: string): void {
	check(isDeepStrictEqual(actual, expected), label);
}

function json<T>(text: string): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new VerificationError("Invalid JSON in snapshot or reference");
	}
}

function readJson<T>(path: string): T {
	return json<T>(readFileSync(path, "utf8"));
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function count(db: DatabaseSync, sql: string): number {
	const result = db.prepare(sql).get() as { n: number };
	check(Number.isSafeInteger(result.n), "Invalid aggregate in snapshot");
	return result.n;
}

/** Explicit ordering makes the digest independent of physical SQLite page layout. */
function fingerprint(db: DatabaseSync, queries: string[]) {
	const content = createHash("sha256");
	const timestamps = createHash("sha256");
	for (const [table, query] of queries.entries()) {
		for (const row of db.prepare(query).iterate()) {
			const { updated_at: updatedAt, ...values } = row;
			content.update(`${JSON.stringify([table, Object.entries(values)])}\n`);
			if (updatedAt !== undefined) timestamps.update(`${JSON.stringify([table, updatedAt])}\n`);
		}
	}
	return { content: content.digest("hex"), timestamps: timestamps.digest("hex") };
}

interface State {
	revision: number;
	recordCount: number;
	dataRows: number;
	payloadBytes: number;
	lastChangedAt: number | null;
}

function providerState(db: DatabaseSync, provider: string): State {
	const row = db
		.prepare(`SELECT revision, record_count AS recordCount, data_rows AS dataRows,
			payload_bytes AS payloadBytes, last_changed_at AS lastChangedAt
			FROM provider_state WHERE source_id = ?`)
		.get(provider);
	check(row, "Missing provider state");
	return { ...row } as unknown as State;
}

interface DayRow {
	utc_day: number;
	record_count: number;
	first_at: number;
	last_at: number;
	payload_bytes: number;
	summary_json: string;
	data_json: string;
	content_hash: string;
	updated_at: number;
}

export function captureFootprint(db: DatabaseSync) {
	let days = 0;
	let points = 0;
	let payloadBytes = 0;
	for (const item of db
		.prepare("SELECT * FROM provider_days WHERE source_id = 'footprint' ORDER BY utc_day")
		.iterate()) {
		const row = item as unknown as DayRow;
		const data = json<FootprintPayload>(row.data_json);
		check(row.utc_day % 86_400_000 === 0, "Footprint day is not UTC midnight");
		check(data.v === 1 && Array.isArray(data.points), "Invalid Footprint payload");
		same(
			data.fields,
			["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
			"Footprint fields changed",
		);
		check(
			data.points.length === row.record_count && row.record_count > 0,
			"Footprint count mismatch",
		);
		check(Buffer.byteLength(row.data_json) === row.payload_bytes, "Footprint byte count mismatch");
		check(
			sha256(`${row.utc_day}:${row.data_json}`) === row.content_hash,
			"Footprint hash mismatch",
		);
		const hours = Array<number>(24).fill(0);
		let previous = -1;
		for (const point of data.points) {
			check(
				point.length === 6 &&
					point.every((value, index) => (index > 2 && value === null) || Number.isFinite(value)) &&
					point[0] >= previous &&
					point[0] >= 0 &&
					point[0] < 86_400 &&
					Math.abs(point[1]) <= 90 &&
					Math.abs(point[2]) <= 180,
				"Invalid Footprint point",
			);
			previous = point[0];
			const hour = Math.floor(point[0] / 3600);
			hours[hour] = (hours[hour] ?? 0) + 1;
		}
		same(json(row.summary_json), { hourCounts: hours }, "Footprint hour coverage mismatch");
		check(
			row.first_at === row.utc_day + Math.round((data.points[0]?.[0] ?? 0) * 1000),
			"Footprint first instant mismatch",
		);
		check(
			row.last_at === row.utc_day + Math.round(previous * 1000),
			"Footprint last instant mismatch",
		);
		for (const [index, boundary] of (data.breaks ?? []).entries()) {
			check(
				Number.isInteger(boundary) &&
					boundary >= 0 &&
					boundary < data.points.length &&
					(index === 0 || boundary > (data.breaks?.[index - 1] ?? -1)),
				"Footprint segment mismatch",
			);
		}
		days++;
		points += row.record_count;
		payloadBytes += row.payload_bytes;
	}
	const state = providerState(db, "footprint");
	check(
		state.recordCount === points && state.dataRows === days && state.payloadBytes === payloadBytes,
		"Footprint provider totals mismatch",
	);
	check(
		count(db, "SELECT COUNT(*) AS n FROM life_events WHERE source_id = 'footprint'") === 0,
		"Legacy Footprint rows remain",
	);
	return {
		days,
		points,
		payloadBytes,
		state,
		...fingerprint(db, [
			"SELECT * FROM provider_days WHERE source_id = 'footprint' ORDER BY utc_day",
		]),
	};
}

type SeriesHeader = Omit<HealthSeries, "body">;
type DayManifest = Pick<HealthDay, "utcDay" | "recordCount" | "contentHash" | "payloadBytes"> & {
	series: SeriesHeader[];
};

function withoutCompression<T extends { payloadBytes: number }>(part: T) {
	const { payloadBytes: _payloadBytes, ...content } = part;
	return content;
}

function unpack(part: HealthFilePart, label: string): Buffer {
	check(part.body.length === part.payloadBytes, `${label}: encoded length mismatch`);
	check(
		Number.isSafeInteger(part.rawBytes) && part.rawBytes >= 0 && part.rawBytes <= 8 * 1024 * 1024,
		`${label}: raw length out of bounds`,
	);
	const compressed = Buffer.from(part.body, "base64");
	check(compressed.toString("base64") === part.body, `${label}: invalid base64`);
	let raw: Buffer;
	try {
		raw = gunzipSync(compressed, { maxOutputLength: Math.max(1, part.rawBytes) });
	} catch {
		throw new VerificationError(`${label}: gzip decode failed`);
	}
	check(
		raw.length === part.rawBytes && sha256(raw) === part.contentHash,
		`${label}: content hash mismatch`,
	);
	return raw;
}

interface ReferenceSummary {
	days: number;
	files: number;
	recordCount: number;
	seriesCount: number;
	filePartCount: number;
	dimensionCount: number;
	routePointCount: number;
	ecgSampleCount: number;
	xmlRecordCount: number;
	dayHashes: string;
	fileHashes: string;
}

export function verifyHealth(db: DatabaseSync, codecDirectory: string) {
	const days = readJson<DayManifest[]>(join(codecDirectory, "day-manifest.json"));
	const files = readJson<HealthFileManifest[]>(join(codecDirectory, "file-manifest.json"));
	const reference = readJson<ReferenceSummary>(join(codecDirectory, "summary.json"));
	const dayHashes = sha256(JSON.stringify(days.map((day) => [day.utcDay, day.contentHash])));
	const fileHashes = sha256(JSON.stringify(files.map((file) => [file.path, file.contentHash])));
	check(
		dayHashes === reference.dayHashes && fileHashes === reference.fileHashes,
		"Reference manifest digest mismatch",
	);
	check(
		days.length === reference.days && files.length === reference.files,
		"Reference manifest count mismatch",
	);
	check(
		new Set(days.map((day) => day.utcDay)).size === days.length &&
			new Set(files.map((file) => file.path)).size === files.length,
		"Reference contains duplicate keys",
	);
	check(
		count(db, "SELECT COUNT(*) AS n FROM provider_days WHERE source_id = 'apple-health'") ===
			days.length,
		"Health daily row count mismatch",
	);
	check(
		count(db, "SELECT COUNT(*) AS n FROM health_series") === reference.seriesCount,
		"Health series row count mismatch",
	);
	check(
		count(db, "SELECT COUNT(*) AS n FROM health_files") === files.length,
		"Health file row count mismatch",
	);
	check(
		count(db, "SELECT COUNT(*) AS n FROM life_events WHERE source_id = 'apple-health'") === 0,
		"Legacy Health rows remain",
	);
	const dayQuery = db.prepare(
		"SELECT * FROM provider_days WHERE source_id = 'apple-health' AND utc_day = ?",
	);
	const seriesQuery = db.prepare(`SELECT dimension, part, record_count AS recordCount,
		first_at AS firstAt, last_at AS lastAt, raw_bytes AS rawBytes,
		payload_bytes AS payloadBytes, content_hash AS contentHash, body
		FROM health_series WHERE utc_day = ? ORDER BY dimension, part`);
	let records = 0;
	let xmlRecords = 0;
	let xmlNodes = 0;
	let seriesCount = 0;
	let payloadBytes = 0;
	let seriesRawBytes = 0;
	const dimensions = new Set<string>();
	for (const [index, manifest] of days.entries()) {
		const label = `Health day ${index + 1}`;
		const name = new Date(manifest.utcDay).toISOString().slice(0, 10);
		const expected = readJson<HealthDay>(join(codecDirectory, "days", `${name}.json`));
		check(expected.utcDay === manifest.utcDay, `${label}: reference key mismatch`);
		same(
			{
				utcDay: expected.utcDay,
				recordCount: expected.recordCount,
				contentHash: expected.contentHash,
				payloadBytes: expected.payloadBytes,
				series: expected.data.series.map(({ body: _body, ...part }) => part),
			},
			manifest,
			`${label}: reference manifest mismatch`,
		);
		const row = dayQuery.get(manifest.utcDay) as unknown as DayRow | undefined;
		check(row, `${label}: missing daily row`);
		check(
			row.utc_day === expected.utcDay &&
				row.record_count === expected.recordCount &&
				row.first_at === expected.firstAt &&
				row.last_at === expected.lastAt &&
				row.content_hash === expected.contentHash,
			`${label}: daily metadata mismatch`,
		);
		check(
			row.payload_bytes === Buffer.byteLength(row.data_json),
			`${label}: header byte count mismatch`,
		);
		same(json(row.summary_json), expected.summary, `${label}: summary mismatch`);
		const actual = seriesQuery
			.all(manifest.utcDay)
			.map((series) => ({ ...series }) as unknown as HealthSeries);
		check(actual.length === expected.data.series.length, `${label}: missing or extra series`);
		same(
			json(row.data_json),
			{ v: 1, series: actual.map(({ body: _body, ...part }) => part) },
			`${label}: stored header mismatch`,
		);
		check(
			sha256(
				JSON.stringify([
					expected.utcDay,
					actual.map((part) => [part.dimension, part.part, part.contentHash]),
				]),
			) === row.content_hash,
			`${label}: recomputed day hash mismatch`,
		);
		for (const [partIndex, part] of actual.entries()) {
			const original = expected.data.series[partIndex] as HealthSeries;
			const { body: _originalBody, ...originalHeader } = original;
			const { body: _actualBody, ...actualHeader } = part;
			same(
				withoutCompression(actualHeader),
				withoutCompression(originalHeader),
				`${label}: series metadata mismatch`,
			);
			const raw = unpack(part, label);
			check(
				raw.equals(unpack(original, "Reference series")),
				`${label}: decoded series differs from reference`,
			);
			const nodes = json<HealthNode[]>(raw.toString("utf8"));
			check(
				Array.isArray(nodes) && nodes.length === part.recordCount,
				`${label}: decoded record count mismatch`,
			);
			for (const node of nodes) {
				check(
					(node.attributes.type || node.name) === part.dimension,
					`${label}: dimension mismatch`,
				);
				if (node.name === "Record") xmlRecords++;
				if (node.name !== "Electrocardiogram") xmlNodes++;
			}
			records += nodes.length;
			dimensions.add(part.dimension);
			seriesCount++;
			seriesRawBytes += raw.length;
			payloadBytes += part.payloadBytes;
		}
		payloadBytes += row.payload_bytes;
	}
	const fileQuery = db.prepare(`SELECT path, kind, first_at AS firstAt, last_at AS lastAt,
		record_count AS recordCount, raw_bytes AS rawBytes, content_hash AS contentHash, manifest_json
		FROM health_files WHERE path = ?`);
	const partsQuery = db.prepare(`SELECT part, raw_bytes AS rawBytes, payload_bytes AS payloadBytes,
		content_hash AS contentHash, body FROM health_file_parts WHERE file_hash = ? ORDER BY part`);
	const uniqueParts = new Set<string>();
	let fileRawBytes = 0;
	let routePoints = 0;
	let fileParts = 0;
	for (const [index, manifest] of files.entries()) {
		const label = `Health file ${index + 1}`;
		const expected = readJson<HealthFile>(join(codecDirectory, "files", `${index}.json`));
		const { parts: referenceParts, ...expectedMeta } = expected;
		same(
			{ ...expectedMeta, parts: referenceParts.map(({ body: _body, ...part }) => part) },
			manifest,
			`${label}: reference manifest mismatch`,
		);
		const row = fileQuery.get(manifest.path);
		check(row, `${label}: missing file`);
		const { manifest_json: manifestJson, ...metadata } = row;
		same(metadata, expectedMeta, `${label}: file metadata mismatch`);
		check(typeof manifestJson === "string", `${label}: invalid stored manifest`);
		const { parts: storedParts, ...storedMeta } = json<HealthFileManifest>(manifestJson);
		same(storedMeta, expectedMeta, `${label}: stored metadata mismatch`);
		same(
			storedParts.map(withoutCompression),
			manifest.parts.map(withoutCompression),
			`${label}: stored parts manifest mismatch`,
		);
		const actual = partsQuery
			.all(manifest.contentHash)
			.map((part) => ({ ...part }) as unknown as HealthFilePart);
		check(actual.length === referenceParts.length, `${label}: missing or extra parts`);
		check(
			actual.reduce((sum, part) => sum + part.rawBytes, 0) === manifest.rawBytes,
			`${label}: whole file length mismatch`,
		);
		check(
			sha256(JSON.stringify(actual.map((part) => [part.part, part.rawBytes, part.contentHash]))) ===
				manifest.contentHash,
			`${label}: whole file hash mismatch`,
		);
		for (const [partIndex, part] of actual.entries()) {
			const original = referenceParts[partIndex] as HealthFilePart;
			const { body: _actualBody, ...actualHeader } = part;
			const { body: _originalBody, ...originalHeader } = original;
			same(
				withoutCompression(actualHeader),
				withoutCompression(originalHeader),
				`${label}: part metadata mismatch`,
			);
			const raw = unpack(part, label);
			check(
				raw.equals(unpack(original, "Reference file part")),
				`${label}: original bytes differ from reference`,
			);
			fileRawBytes += raw.length;
			fileParts++;
			const key = `${manifest.contentHash}:${part.part}`;
			if (!uniqueParts.has(key)) payloadBytes += part.payloadBytes;
			uniqueParts.add(key);
		}
		if (manifest.kind === "route") routePoints += manifest.recordCount;
		payloadBytes += Buffer.byteLength(manifestJson);
	}
	check(
		count(db, "SELECT COUNT(*) AS n FROM health_file_parts") === uniqueParts.size,
		"Unreferenced or missing Health file parts",
	);
	check(
		fileParts === reference.filePartCount &&
			seriesCount === reference.seriesCount &&
			records === reference.recordCount &&
			xmlRecords === reference.xmlRecordCount &&
			dimensions.size === reference.dimensionCount &&
			routePoints === reference.routePointCount,
		"Decoded Health totals mismatch",
	);
	const dataRows = days.length + seriesCount + files.length + uniqueParts.size;
	const state = providerState(db, "apple-health");
	check(
		state.recordCount === records &&
			state.dataRows === dataRows &&
			state.payloadBytes === payloadBytes,
		"Health provider totals mismatch",
	);
	const receipt = db
		.prepare(`SELECT status, total_days AS totalDays, total_points AS totalRecords,
		committed_days AS committedDays, committed_points AS committedRecords,
		inserted_days AS insertedDays, updated_days AS updatedDays, unchanged_days AS unchangedDays,
		started_at AS startedAt, finished_at AS finishedAt
		FROM footprint_imports WHERE source_id = 'apple-health'`)
		.get() as
		| {
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
		  }
		| undefined;
	check(
		receipt &&
			receipt.status === "complete" &&
			receipt.totalDays === days.length &&
			receipt.totalRecords === records &&
			receipt.committedDays === days.length &&
			receipt.committedRecords === records &&
			receipt.insertedDays + receipt.updatedDays + receipt.unchangedDays === days.length &&
			receipt.finishedAt >= receipt.startedAt,
		"Health import receipt is incomplete",
	);
	const importedAt = db
		.prepare(
			"SELECT last_imported_at AS stamp FROM provider_state WHERE source_id = 'apple-health'",
		)
		.get();
	check(importedAt?.stamp === receipt.finishedAt, "Health last import timestamp mismatch");
	return {
		days: days.length,
		records,
		xmlRecords,
		xmlNodes,
		dimensions: dimensions.size,
		series: seriesCount,
		files: files.length,
		fileParts,
		storedFileParts: uniqueParts.size,
		dataRows,
		payloadBytes,
		seriesRawBytes,
		fileRawBytes,
		originalFiles: files.filter((file) => file.kind !== "metadata").length,
		originalParts: files
			.filter((file) => file.kind !== "metadata")
			.reduce((sum, file) => sum + file.parts.length, 0),
		originalBytes: files
			.filter((file) => file.kind !== "metadata")
			.reduce((sum, file) => sum + file.rawBytes, 0),
		routePoints,
		referenceEcgSamples: reference.ecgSampleCount,
		dayHashes,
		fileHashes,
		state,
		receipt: { ...receipt },
		...fingerprint(db, [
			"SELECT * FROM provider_days WHERE source_id = 'apple-health' ORDER BY utc_day",
			"SELECT * FROM health_series ORDER BY utc_day, dimension, part",
			"SELECT * FROM health_files ORDER BY path",
			"SELECT * FROM health_file_parts ORDER BY file_hash, part",
		]),
	};
}

interface Report {
	version: 1;
	mode: "capture" | "verify";
	createdAt: string;
	footprint: ReturnType<typeof captureFootprint>;
	health?: ReturnType<typeof verifyHealth>;
}

export function compareReports(current: Report, before?: Report, previous?: Report) {
	if (before)
		same(current.footprint, before.footprint, "Footprint changed since pre-import snapshot");
	if (previous) {
		same(current.footprint, previous.footprint, "Footprint changed during Health reimport");
		check(
			current.health && previous.health,
			"Reimport comparison requires two verified Health reports",
		);
		const { receipt: currentReceipt, ...currentContent } = current.health;
		const { receipt: previousReceipt, ...previousContent } = previous.health;
		same(
			currentContent,
			previousContent,
			"Health content, timestamps or revision changed during exact reimport",
		);
		check(
			currentReceipt.insertedDays === 0 &&
				currentReceipt.updatedDays === 0 &&
				currentReceipt.unchangedDays === current.health.days &&
				currentReceipt.startedAt > previousReceipt.finishedAt,
			"A completed, entirely unchanged second import is required",
		);
	}
	return {
		footprintUnchanged: before || previous ? true : null,
		healthIdempotent: previous ? true : null,
	};
}

if (import.meta.main) {
	try {
		const { positionals, values } = parseArgs({
			allowPositionals: true,
			options: { before: { type: "string" }, previous: { type: "string" } },
		});
		const [mode, database, third, fourth] = positionals;
		check(
			(mode === "capture" && positionals.length === 3) ||
				(mode === "verify" && positionals.length === 4),
			"Usage: capture <snapshot.sqlite> <report.json> | verify <snapshot.sqlite> <codec-directory> <report.json> [--before <baseline.json>] [--previous <first-verify.json>]",
		);
		check(database && third, "Missing local snapshot or output path");
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
			const footprint = captureFootprint(db);
			check(
				footprint.days === 1625 && footprint.points === 670191,
				"Expected 1625 Footprint days and 670191 points",
			);
			const health = mode === "verify" ? verifyHealth(db, third) : undefined;
			const report: Report = {
				version: 1,
				mode,
				createdAt: new Date().toISOString(),
				footprint,
				...(health ? { health } : {}),
			};
			const comparison = compareReports(
				report,
				values.before ? readJson<Report>(values.before) : undefined,
				values.previous ? readJson<Report>(values.previous) : undefined,
			);
			let independentEvidence: unknown;
			if (mode === "verify") {
				const evidence = readJson<{
					matched: boolean;
					mismatches: unknown[];
					xmlDays: number;
					xmlNodes: number;
					originalFiles: number;
					originalBytes: number;
					parts: number;
				}>(join(dirname(third), "codec-independent-verification.json"));
				check(
					evidence.matched === true &&
						evidence.mismatches.length === 0 &&
						evidence.xmlDays === health?.days &&
						evidence.xmlNodes === health.xmlNodes &&
						evidence.originalFiles === health.originalFiles &&
						evidence.originalBytes === health.originalBytes &&
						evidence.parts === health.originalParts,
					"Independent source verification did not pass",
				);
				independentEvidence = evidence;
			}
			writeFileSync(
				mode === "capture" ? third : (fourth as string),
				`${JSON.stringify({ ...report, ...comparison, independentEvidence, matched: true }, null, 2)}\n`,
				{ mode: 0o600, flag: "wx" },
			);
			console.log(
				JSON.stringify({
					mode,
					matched: true,
					footprintDays: footprint.days,
					footprintPoints: footprint.points,
					healthDays: health?.days,
					healthRecords: health?.records,
					healthRows: health?.dataRows,
					...comparison,
				}),
			);
		} finally {
			db.close();
		}
	} catch (error) {
		console.error(
			error instanceof VerificationError
				? error.message
				: "Unable to read or verify local snapshot; no report was written",
		);
		process.exitCode = 1;
	}
}
