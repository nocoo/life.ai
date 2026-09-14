import {
	type DataTarget,
	FOOTPRINT_LIMITS,
	type FootprintBatchReceipt,
	type FootprintImportReceipt,
	type FootprintImportSession,
	type ImportChannel,
} from "../src/models/data-management.js";
import {
	FOOTPRINT_DAY_MS,
	type FootprintDay,
	validateFootprintDay,
} from "../src/models/footprint.js";
import { sha256 } from "./auth.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody, validateString } from "./utils.js";

const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

interface ImportRow {
	id: string;
	expires_at: number;
	status: FootprintImportReceipt["status"];
	total_days: number;
	total_points: number;
	channel: ImportChannel;
	last_batch_id: number;
	last_batch_hash: string | null;
	last_batch_result: string | null;
	last_utc_day: number | null;
	committed_days: number;
	committed_points: number;
	inserted_days: number;
	updated_days: number;
	unchanged_days: number;
}

export function dataTarget(env: WorkerEnv): DataTarget {
	if (env.RESOURCE_ENV === "test") return "test";
	if (env.DATA_TARGET === "local" || env.DATA_TARGET === "production") return env.DATA_TARGET;
	throw new ApiError(500, "missing_data_target", "Data target is not configured");
}

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError(400, "invalid_payload", "Expected JSON object body");
	}
	return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
		throw new ApiError(400, "validation_error", `${field} must be a positive integer`);
	}
	return value;
}

function conflict(message: string): never {
	throw new ApiError(409, "import_conflict", message);
}

async function session(db: D1Database, id: string): Promise<ImportRow> {
	const row = await db
		.prepare("SELECT * FROM footprint_imports WHERE source_id = 'footprint' AND id = ?")
		.bind(id)
		.first<ImportRow>();
	if (!row) throw new ApiError(404, "import_not_found", "Import session is no longer current");
	return row;
}

function receipt(row: ImportRow): FootprintImportReceipt {
	return {
		sessionId: row.id,
		status: row.status,
		committedDays: row.committed_days,
		committedPoints: row.committed_points,
		insertedDays: row.inserted_days,
		updatedDays: row.updated_days,
		unchangedDays: row.unchanged_days,
	};
}

export async function beginFootprintImport(request: Request, env: WorkerEnv): Promise<Response> {
	const body = object(await readJsonBody(request, 4096));
	const target = dataTarget(env);
	if (body.target !== target) {
		throw new ApiError(409, "target_mismatch", `This API writes to the ${target} dataset`);
	}
	const fileName = validateString(body.fileName, "fileName", 255);
	const totalDays = positiveInteger(body.totalDays, "totalDays");
	const totalPoints = positiveInteger(body.totalPoints, "totalPoints");
	if (totalDays > totalPoints) {
		throw new ApiError(400, "validation_error", "Each imported day must contain points");
	}
	if (body.channel !== "web" && body.channel !== "cli") {
		throw new ApiError(400, "validation_error", "channel must be web or cli");
	}
	const now = Date.now();
	const id = crypto.randomUUID();
	const expiresAt = now + FOOTPRINT_LIMITS.leaseMs;
	const results = await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO sources (id, name, kind, provider, created_at) VALUES ('footprint', 'Footprint', 'import', 'footprint', ?) ON CONFLICT(id) DO NOTHING",
		).bind(now),
		env.DB.prepare(`INSERT INTO footprint_imports
			(source_id, id, expires_at, status, file_name, total_days, total_points, channel, started_at)
			VALUES ('footprint', ?, ?, 'running', ?, ?, ?, ?, ?)
			ON CONFLICT(source_id) DO UPDATE SET
			id = excluded.id, expires_at = excluded.expires_at, status = 'running',
			file_name = excluded.file_name, total_days = excluded.total_days, total_points = excluded.total_points,
			channel = excluded.channel, started_at = excluded.started_at, finished_at = NULL,
			last_batch_id = 0, last_batch_hash = NULL, last_batch_result = NULL, last_utc_day = NULL,
			committed_days = 0, committed_points = 0, inserted_days = 0, updated_days = 0, unchanged_days = 0
			WHERE footprint_imports.status != 'running' OR footprint_imports.expires_at <= ${NOW}`).bind(
			id,
			expiresAt,
			fileName,
			totalDays,
			totalPoints,
			body.channel,
			now,
		),
	]);
	if (results[1]?.meta.changes !== 1) conflict("Another Footprint import is still running");
	const data: FootprintImportSession = {
		id,
		expiresAt: new Date(expiresAt).toISOString(),
		target,
		totalDays,
		totalPoints,
	};
	return jsonResponse({ data }, 201);
}

export async function putFootprintBatch(
	request: Request,
	env: WorkerEnv,
	id: string,
	batchId: number,
): Promise<Response> {
	positiveInteger(batchId, "batchId");
	const body = object(await readJsonBody(request, FOOTPRINT_LIMITS.batchBytes));
	if (
		!Array.isArray(body.days) ||
		!body.days.length ||
		body.days.length > FOOTPRINT_LIMITS.batchDays
	) {
		throw new ApiError(
			400,
			"validation_error",
			`Batch must contain 1–${FOOTPRINT_LIMITS.batchDays} days`,
		);
	}
	const days: FootprintDay[] = [];
	try {
		for (const input of body.days) days.push(await validateFootprintDay(input));
	} catch (error) {
		throw new ApiError(400, "invalid_day", error instanceof Error ? error.message : "Invalid day");
	}
	for (let index = 1; index < days.length; index++) {
		if ((days[index] as FootprintDay).utcDay <= (days[index - 1] as FootprintDay).utcDay) {
			throw new ApiError(
				400,
				"invalid_day_order",
				"Days must be unique and in ascending UTC order",
			);
		}
	}
	const firstDay = days[0] as FootprintDay;
	const lastDay = days[days.length - 1] as FootprintDay;
	const hash = await sha256(JSON.stringify(days.map((day) => [day.utcDay, day.contentHash])));
	const row = await session(env.DB, id);
	if (row.last_batch_id === batchId && row.last_batch_hash === hash && row.last_batch_result) {
		return jsonResponse({ data: JSON.parse(row.last_batch_result) as FootprintBatchReceipt });
	}
	if (row.status !== "running" || row.expires_at <= Date.now())
		conflict("Import session has expired or finished");
	if (batchId !== row.last_batch_id + 1) conflict("Batch is stale or out of order");
	if (row.last_utc_day !== null && firstDay.utcDay <= row.last_utc_day) {
		conflict("A day may appear only once in an import; parse the whole file before uploading");
	}
	const pointCount = days.reduce((sum, day) => sum + day.recordCount, 0);
	if (
		row.committed_days + days.length > row.total_days ||
		row.committed_points + pointCount > row.total_points
	) {
		conflict("Batch exceeds the import manifest");
	}
	const keys = days.map((day) => day.utcDay);
	const placeholders = keys.map(() => "?").join(", ");
	const oldRows = await env.DB.prepare(
		`SELECT utc_day, content_hash FROM provider_days WHERE source_id = 'footprint' AND utc_day IN (${placeholders})`,
	)
		.bind(...keys)
		.all<{ utc_day: number; content_hash: string }>();
	const current = new Map(oldRows.results.map((old) => [old.utc_day, old.content_hash]));
	const data: FootprintBatchReceipt = {
		...receipt(row),
		batchId,
		committedDays: row.committed_days + days.length,
		committedPoints: row.committed_points + pointCount,
		days: days.map((day) => ({
			utcDay: day.utcDay,
			recordCount: day.recordCount,
			contentHash: day.contentHash,
			status: !current.has(day.utcDay)
				? "inserted"
				: current.get(day.utcDay) === day.contentHash
					? "unchanged"
					: "updated",
		})),
	};
	for (const day of data.days) {
		if (day.status === "inserted") data.insertedDays++;
		else if (day.status === "updated") data.updatedDays++;
		else data.unchangedDays++;
	}
	// The claim and all guarded writes execute in one D1 transaction. A delayed
	// request can neither regain an old lease nor repeat a previous batch's writes.
	const guard = `EXISTS (SELECT 1 FROM footprint_imports WHERE source_id = 'footprint'
		AND id = ? AND status = 'running' AND last_batch_id = ? AND last_batch_hash = ? AND expires_at > ${NOW})`;
	const now = Date.now();
	const statements = [
		env.DB.prepare(`UPDATE footprint_imports SET last_batch_id = ?, last_batch_hash = ?, last_batch_result = ?,
			last_utc_day = ?, committed_days = ?, committed_points = ?, inserted_days = ?, updated_days = ?, unchanged_days = ?,
			expires_at = ${NOW} + ? WHERE source_id = 'footprint' AND id = ? AND status = 'running'
			AND last_batch_id = ? AND expires_at > ${NOW}`).bind(
			batchId,
			hash,
			JSON.stringify(data),
			lastDay.utcDay,
			data.committedDays,
			data.committedPoints,
			data.insertedDays,
			data.updatedDays,
			data.unchangedDays,
			FOOTPRINT_LIMITS.leaseMs,
			id,
			row.last_batch_id,
		),
		...days.map((day) =>
			env.DB.prepare(`INSERT INTO provider_days
			(source_id, utc_day, record_count, first_at, last_at, payload_bytes, summary_json, data_json, content_hash, updated_at)
			SELECT 'footprint', ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}
			ON CONFLICT(source_id, utc_day) DO UPDATE SET
			record_count = excluded.record_count, first_at = excluded.first_at, last_at = excluded.last_at,
			payload_bytes = excluded.payload_bytes, summary_json = excluded.summary_json, data_json = excluded.data_json,
			content_hash = excluded.content_hash, updated_at = excluded.updated_at
			WHERE provider_days.content_hash != excluded.content_hash`).bind(
				day.utcDay,
				day.recordCount,
				day.firstAt,
				day.lastAt,
				day.payloadBytes,
				JSON.stringify(day.summary),
				JSON.stringify(day.data),
				day.contentHash,
				now,
				id,
				batchId,
				hash,
			),
		),
		env.DB.prepare(`DELETE FROM life_events WHERE source_id = 'footprint'
			AND occurred_at >= ? AND occurred_at < ?
			AND CAST(floor(occurred_at / ${FOOTPRINT_DAY_MS}.0) * ${FOOTPRINT_DAY_MS} AS INTEGER) IN (${placeholders}) AND ${guard}`).bind(
			firstDay.utcDay,
			lastDay.utcDay + FOOTPRINT_DAY_MS,
			...keys,
			id,
			batchId,
			hash,
		),
	];
	const results = await env.DB.batch(statements);
	if (results[0]?.meta.changes !== 1) {
		const currentSession = await session(env.DB, id);
		if (
			currentSession.last_batch_id === batchId &&
			currentSession.last_batch_hash === hash &&
			currentSession.last_batch_result
		) {
			return jsonResponse({
				data: JSON.parse(currentSession.last_batch_result) as FootprintBatchReceipt,
			});
		}
		conflict("Import lease or batch order changed before commit");
	}
	return jsonResponse({ data });
}

export async function finishFootprintImport(
	request: Request,
	env: WorkerEnv,
	id: string,
): Promise<Response> {
	const body = object(await readJsonBody(request, 4096));
	if (body.status !== "complete" && body.status !== "cancelled") {
		throw new ApiError(400, "validation_error", "status must be complete or cancelled");
	}
	const row = await session(env.DB, id);
	if (row.status === body.status) return jsonResponse({ data: receipt(row) });
	if (row.status !== "running") conflict("Import has already finished");
	if (
		body.status === "complete" &&
		(row.committed_days !== row.total_days || row.committed_points !== row.total_points)
	) {
		conflict("Import is incomplete; not every declared day and point was committed");
	}
	const now = Date.now();
	const finish =
		env.DB.prepare(`UPDATE footprint_imports SET status = ?, finished_at = ?, expires_at = ?
		WHERE source_id = 'footprint' AND id = ? AND status = 'running' AND last_batch_id = ?
		${body.status === "complete" ? `AND expires_at > ${NOW}` : ""}`).bind(
			body.status,
			now,
			now,
			id,
			row.last_batch_id,
		);
	const results = await env.DB.batch([
		finish,
		env.DB.prepare(`UPDATE provider_state SET last_imported_at = ?, last_import_channel = ?
			WHERE source_id = 'footprint' AND EXISTS (SELECT 1 FROM footprint_imports
			WHERE source_id = 'footprint' AND id = ? AND status = 'complete' AND finished_at = ?)`).bind(
			now,
			row.channel,
			id,
			now,
		),
	]);
	if (results[0]?.meta.changes !== 1) {
		const current = await session(env.DB, id);
		if (current.status === body.status) return jsonResponse({ data: receipt(current) });
		conflict("Import session changed or expired before completion");
	}
	return jsonResponse({ data: { ...receipt(row), status: body.status } });
}
