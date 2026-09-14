import type {
	Connect,
	CreatedConnect,
	ImportRecord,
	ImportSourceId,
	IngestReceipt,
	Precision,
	Session,
	Source,
	SourceKind,
} from "../src/models/types.js";
import { authenticateConnect, generateConnectToken, sha256 } from "./auth.js";
import { type FetchLike, fetchAuthorProfile } from "./author-profile.js";
import { withD1Retry } from "./database.js";
import { floorToUtcHour, normalizeTimestamp, timestampAtPrecision } from "./time.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, LIMITS, readJsonBody, validateDataField, validateString } from "./utils.js";

const VALID_IMPORT_SOURCES: ImportSourceId[] = ["pixiu", "journal"];
const VALID_PRECISIONS: Precision[] = ["day", "hour", "minute", "second"];

/**
 * GET /api/session
 */
export async function handleGetSession(
	session: {
		email: string | null;
		subject: string;
		mode: "access" | "local";
	},
	fetchFn?: FetchLike,
): Promise<Response> {
	let name: string | null = null;
	let avatar: string | null = null;

	if (session.email) {
		const profile = await fetchAuthorProfile(session.email, fetchFn);
		name = profile.name;
		avatar = profile.avatar;
	}

	const resp: { data: Session } = {
		data: {
			email: session.email,
			subject: session.subject,
			mode: session.mode,
			name,
			avatar,
		},
	};
	return jsonResponse(resp);
}

/**
 * GET /api/sources
 * Returns all sources (both import and connect), with record counts and last record time.
 */
export async function handleGetSources(env: WorkerEnv): Promise<Response> {
	const query = `
		SELECT s.id, s.name, s.kind, s.provider, COALESCE(p.record_count, 0) AS record_count,
		CASE WHEN e.occurred_at IS NULL THEN d.last_at WHEN d.last_at IS NULL THEN e.occurred_at
			ELSE MAX(e.occurred_at, d.last_at) END AS last_event_at
		FROM sources s LEFT JOIN provider_state p ON p.source_id = s.id
		LEFT JOIN life_events e ON e.id = (SELECT id FROM life_events WHERE source_id = s.id ORDER BY occurred_at DESC, id DESC LIMIT 1)
		LEFT JOIN provider_days d ON d.source_id = s.id AND d.utc_day = (SELECT utc_day FROM provider_days WHERE source_id = s.id ORDER BY utc_day DESC LIMIT 1)
		ORDER BY s.created_at ASC
	`;

	const results = await withD1Retry(() =>
		env.DB.prepare(query).all<{
			id: string;
			name: string;
			kind: SourceKind;
			provider: string;
			record_count: number;
			last_event_at: number | null;
		}>(),
	);

	const sources: Source[] = (results.results || []).map((row) => ({
		id: row.id,
		name: row.name,
		kind: row.kind,
		provider: row.provider as ImportSourceId | "connect",
		recordCount: row.record_count,
		lastEventAt: row.last_event_at != null ? new Date(row.last_event_at).toISOString() : null,
	}));

	return jsonResponse({ data: sources });
}

export { handleGetEvents } from "./events.js";

/**
 * Ensure an import source exists in `sources` table.
 */
async function ensureImportSource(db: D1Database, sourceId: ImportSourceId): Promise<void> {
	const sourceNames: Record<ImportSourceId, string> = {
		"apple-health": "Apple Health",
		footprint: "Footprint",
		pixiu: "Pixiu",
		journal: "Journal",
	};

	const now = Date.now();
	const sourceName = sourceNames[sourceId] ?? sourceId;
	await db
		.prepare(
			`
		INSERT INTO sources (id, name, kind, provider, created_at)
		VALUES (?, ?, 'import', ?, ?)
		ON CONFLICT(id) DO NOTHING
	`,
		)
		.bind(sourceId, sourceName, sourceId, now)
		.run();
}

/**
 * POST /api/imports
 * Batch upsert 1–100 records.
 * Stable-key idempotency: (source_id, external_key).
 *
 * Strict validation:
 * - Reject non-object top-level payload (null, boolean, number, string, array) with 400.
 * - Reject null, undefined, or primitive items in records array with 400.
 * - Precision: default to 'hour' ONLY if undefined; any explicit non-matching value returns 400.
 * - Normalize/floor occurredAt via timestampAtPrecision according to precision.
 * - Explicit invalid endAt types / values or endAt < occurredAt returns 400.
 * - For precision === 'day', end_at is ignored/cleared to prevent spanning other days.
 * - ensureImportSource runs ONLY after all record validations succeed.
 */
export async function handlePostImports(request: Request, env: WorkerEnv): Promise<Response> {
	const body = await readJsonBody<unknown>(request);

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new ApiError(400, "invalid_payload", "Expected JSON object body");
	}

	const typedBody = body as {
		source?: unknown;
		records?: unknown;
	};

	if (!typedBody.source || typeof typedBody.source !== "string") {
		throw new ApiError(400, "invalid_payload", "source is required and must be a string");
	}

	if (!Array.isArray(typedBody.records)) {
		throw new ApiError(400, "invalid_payload", "records must be an array");
	}

	const source = typedBody.source as ImportSourceId;
	if (source === "pixiu")
		throw new ApiError(
			410,
			"pixiu_import_moved",
			"Use Data Management → 貔貅记账 to replace complete Asia/Shanghai accounting days",
		);
	if (source === "apple-health")
		throw new ApiError(
			410,
			"health_import_moved",
			"Use Data Management → Apple Health to import complete UTC day dimensions and attachments",
		);
	if (source === "footprint") {
		throw new ApiError(
			410,
			"footprint_import_moved",
			"Use Data Management → Footprint to replace complete UTC days",
		);
	}
	if (!VALID_IMPORT_SOURCES.includes(source)) {
		throw new ApiError(400, "invalid_source", `Unsupported source: ${typedBody.source}`);
	}

	if (typedBody.records.length === 0) {
		throw new ApiError(400, "validation_error", "Records array cannot be empty");
	}

	if (typedBody.records.length > LIMITS.maxBatchRecords) {
		throw new ApiError(
			400,
			"batch_too_large",
			`Batch size cannot exceed ${LIMITS.maxBatchRecords} records`,
		);
	}

	const validatedRecords: {
		key: string;
		occurredAtMs: number;
		endAtMs: number | null;
		precision: Precision;
		title: string;
		content: string;
		dataJson: string;
	}[] = [];

	for (let i = 0; i < typedBody.records.length; i++) {
		const record = typedBody.records[i] as ImportRecord;
		if (!record || typeof record !== "object" || Array.isArray(record)) {
			throw new ApiError(400, "validation_error", `records[${i}] must be a non-null object`);
		}

		const key = validateString(record.key, `records[${i}].key`, 255);
		const title = validateString(record.title, `records[${i}].title`, LIMITS.titleMaxChars);
		const content = validateString(
			record.content,
			`records[${i}].content`,
			LIMITS.contentMaxChars,
			false,
		);
		const dataJson = validateDataField(record.data);

		// Precision: default to 'hour' only if undefined
		let precision: Precision;
		if (record.precision === undefined) {
			precision = "hour";
		} else if (
			record.precision === "day" ||
			record.precision === "hour" ||
			record.precision === "minute" ||
			record.precision === "second"
		) {
			precision = record.precision;
		} else {
			throw new ApiError(
				400,
				"invalid_precision",
				`records[${i}].precision must be one of: ${VALID_PRECISIONS.join(", ")}`,
			);
		}

		if (typeof record.occurredAt !== "string" || !record.occurredAt.trim()) {
			throw new ApiError(400, "invalid_timestamp", `records[${i}].occurredAt is required`);
		}

		let occurredAtMs: number;
		try {
			const flooredIso = timestampAtPrecision(record.occurredAt, precision);
			occurredAtMs = new Date(flooredIso).getTime();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Invalid timestamp";
			throw new ApiError(400, "invalid_timestamp", `records[${i}].occurredAt: ${msg}`);
		}

		let endAtMs: number | null = null;
		if (record.endAt !== undefined && record.endAt !== null) {
			if (typeof record.endAt !== "string" || !record.endAt.trim()) {
				throw new ApiError(
					400,
					"invalid_timestamp",
					`records[${i}].endAt must be a valid ISO string`,
				);
			}
			try {
				endAtMs = new Date(normalizeTimestamp(record.endAt)).getTime();
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : "Invalid timestamp";
				throw new ApiError(400, "invalid_timestamp", `records[${i}].endAt: ${msg}`);
			}
			if (endAtMs < occurredAtMs) {
				throw new ApiError(
					400,
					"invalid_range",
					`records[${i}].endAt cannot be earlier than occurredAt`,
				);
			}
		}

		// Day precision records anchor to UTC day and should not overlap other days via end_at
		if (precision === "day") {
			endAtMs = null;
		}

		validatedRecords.push({
			key,
			occurredAtMs,
			endAtMs,
			precision,
			title,
			content,
			dataJson,
		});
	}

	// Ensure source entry exists ONLY after all records pass validation
	await ensureImportSource(env.DB, source);

	const statements: D1PreparedStatement[] = [];
	const now = Date.now();

	for (const rec of validatedRecords) {
		const id = crypto.randomUUID();
		const stmt = env.DB.prepare(`
			INSERT INTO life_events (
				id, source_id, external_key, occurred_at, end_at, precision, title, content, data, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(source_id, external_key) WHERE external_key IS NOT NULL DO UPDATE SET
				occurred_at = excluded.occurred_at,
				end_at = excluded.end_at,
				precision = excluded.precision,
				title = excluded.title,
				content = excluded.content,
				data = excluded.data,
				updated_at = excluded.updated_at
		`).bind(
			id,
			source,
			rec.key,
			rec.occurredAtMs,
			rec.endAtMs,
			rec.precision,
			rec.title,
			rec.content,
			rec.dataJson,
			now,
		);

		statements.push(stmt);
	}

	statements.push(
		env.DB.prepare(
			"UPDATE provider_state SET last_imported_at = ?, last_import_channel = 'web' WHERE source_id = ?",
		).bind(now, source),
	);
	await env.DB.batch(statements);

	return jsonResponse({ data: { accepted: validatedRecords.length } });
}

/**
 * GET /api/connects
 * Lists all Connect metadata (token is never returned here).
 */
export async function handleGetConnects(env: WorkerEnv): Promise<Response> {
	const query = `
		SELECT
			c.id,
			c.name,
			c.prefix,
			c.created_at,
			c.last_used_at,
			c.revoked_at,
			COUNT(e.id) as record_count
		FROM connects c
		LEFT JOIN life_events e ON c.id = e.source_id
		GROUP BY c.id
		ORDER BY c.created_at DESC
	`;

	const results = await env.DB.prepare(query).all<{
		id: string;
		name: string;
		prefix: string;
		created_at: number;
		last_used_at: number | null;
		revoked_at: number | null;
		record_count: number;
	}>();

	const connects: Connect[] = (results.results || []).map((row) => ({
		id: row.id,
		name: row.name,
		prefix: row.prefix,
		createdAt: new Date(row.created_at).toISOString(),
		lastUsedAt: row.last_used_at != null ? new Date(row.last_used_at).toISOString() : null,
		revokedAt: row.revoked_at != null ? new Date(row.revoked_at).toISOString() : null,
		recordCount: row.record_count,
	}));

	return jsonResponse({ data: connects });
}

/**
 * POST /api/connects
 * Creates a new Connect token. The plaintext token is shown ONLY here.
 */
export async function handlePostConnects(request: Request, env: WorkerEnv): Promise<Response> {
	const body = await readJsonBody<unknown>(request);
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new ApiError(400, "invalid_payload", "Expected JSON object body");
	}

	const typedBody = body as { name?: unknown };
	const name = validateString(typedBody.name, "name", LIMITS.nameMaxChars);

	const id = crypto.randomUUID();
	const { token, prefix } = generateConnectToken();
	const tokenHash = await sha256(token);
	const now = Date.now();

	const insertConnectStmt = env.DB.prepare(`
		INSERT INTO connects (id, name, token_hash, prefix, created_at)
		VALUES (?, ?, ?, ?, ?)
	`).bind(id, name, tokenHash, prefix, now);

	const insertSourceStmt = env.DB.prepare(`
		INSERT INTO sources (id, name, kind, provider, created_at)
		VALUES (?, ?, 'connect', 'connect', ?)
	`).bind(id, name, now);

	await env.DB.batch([insertConnectStmt, insertSourceStmt]);

	const connect: Connect = {
		id,
		name,
		prefix,
		createdAt: new Date(now).toISOString(),
		lastUsedAt: null,
		revokedAt: null,
		recordCount: 0,
	};

	const result: CreatedConnect = {
		connect,
		token,
	};

	return jsonResponse({ data: result }, 201);
}

/**
 * DELETE /api/connects/:id
 * Revokes a Connect token, retaining history. Repeated revocation is idempotent.
 */
export async function handleDeleteConnect(id: string, env: WorkerEnv): Promise<Response> {
	const existing = await env.DB.prepare(
		"SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM connects WHERE id = ?",
	)
		.bind(id)
		.first<{
			id: string;
			name: string;
			prefix: string;
			created_at: number;
			last_used_at: number | null;
			revoked_at: number | null;
		}>();

	if (!existing) {
		throw new ApiError(404, "not_found", "Connect not found");
	}

	let revokedAt = existing.revoked_at;
	if (revokedAt === null) {
		revokedAt = Date.now();
		await env.DB.prepare("UPDATE connects SET revoked_at = ? WHERE id = ?")
			.bind(revokedAt, id)
			.run();
	}

	const countRow = await env.DB.prepare(
		"SELECT COUNT(id) as count FROM life_events WHERE source_id = ?",
	)
		.bind(id)
		.first<{ count: number }>();

	const connect: Connect = {
		id: existing.id,
		name: existing.name,
		prefix: existing.prefix,
		createdAt: new Date(existing.created_at).toISOString(),
		lastUsedAt:
			existing.last_used_at != null ? new Date(existing.last_used_at).toISOString() : null,
		revokedAt: new Date(revokedAt).toISOString(),
		recordCount: countRow?.count ?? 0,
	};

	return jsonResponse({ data: connect });
}

/**
 * POST /api/ingest
 * Machine ingestion route authenticated by Bearer Connect token.
 * Floor timestamp to UTC hour.
 *
 * Race-Free Ingestion & Revocation Fencing:
 * Atomic single INSERT ... SELECT ... FROM connects WHERE id=? AND revoked_at IS NULL
 * ON CONFLICT(source_id, occurred_at) WHERE external_key IS NULL DO UPDATE ... RETURNING ...
 * If token was revoked concurrently, SELECT returns 0 rows, row is null => 403 token_revoked.
 * last_used_at is updated ONLY after this write succeeds.
 */
export async function handlePostIngest(request: Request, env: WorkerEnv): Promise<Response> {
	const auth = await authenticateConnect(request, env.DB);

	const body = await readJsonBody<unknown>(request);

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new ApiError(400, "invalid_payload", "Expected JSON object body");
	}

	const typedBody = body as {
		timestamp?: unknown;
		title?: unknown;
		content?: unknown;
		data?: unknown;
	};

	const title = validateString(typedBody.title, "title", LIMITS.titleMaxChars);
	const content = validateString(typedBody.content, "content", LIMITS.contentMaxChars, false);
	const dataJson = validateDataField(typedBody.data);

	if (!typedBody.timestamp || typeof typedBody.timestamp !== "string") {
		throw new ApiError(400, "validation_error", "timestamp is required and must be a string");
	}

	let hourFloor: { iso: string; ms: number };
	try {
		hourFloor = floorToUtcHour(typedBody.timestamp);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Invalid timestamp";
		throw new ApiError(400, "invalid_timestamp", msg);
	}

	const now = Date.now();
	const newId = crypto.randomUUID();

	// Single atomic query with revocation fence
	const query = `
		INSERT INTO life_events (
			id, source_id, external_key, occurred_at, end_at, precision, title, content, data, updated_at
		)
		SELECT ?, id, NULL, ?, NULL, 'hour', ?, ?, ?, ?
		FROM connects
		WHERE id = ? AND revoked_at IS NULL
		ON CONFLICT(source_id, occurred_at) WHERE external_key IS NULL DO UPDATE SET
			title = excluded.title,
			content = excluded.content,
			data = excluded.data,
			updated_at = excluded.updated_at
		RETURNING id, occurred_at, precision, updated_at
	`;

	const row = await env.DB.prepare(query)
		.bind(newId, hourFloor.ms, title, content, dataJson, now, auth.connectId)
		.first<{ id: string; occurred_at: number; precision: "hour"; updated_at: number }>();

	// If no row was returned, the connect token was revoked (or not found)
	if (!row) {
		throw new ApiError(403, "token_revoked", "Connect token has been revoked");
	}

	// Update last_used_at ONLY after successful write
	await env.DB.prepare("UPDATE connects SET last_used_at = ? WHERE id = ?")
		.bind(now, auth.connectId)
		.run();

	const receipt: IngestReceipt = {
		id: row.id,
		occurredAt: new Date(row.occurred_at).toISOString(),
		precision: "hour",
		updatedAt: new Date(row.updated_at).toISOString(),
	};

	return jsonResponse({ data: receipt });
}

/**
 * GET /api/live
 * Public health check:
 * JSON { status: "ok", version, timestamp, database: "ok" }
 * Database failure returns 503.
 */
export async function handleGetLive(env: WorkerEnv, version: string): Promise<Response> {
	let dbStatus = "ok";
	let httpStatus = 200;

	try {
		const testQuery = await withD1Retry(() =>
			env.DB.prepare("SELECT 1 as alive").first<{ alive: number }>(),
		);
		if (testQuery?.alive !== 1) {
			dbStatus = "error";
			httpStatus = 503;
		}
	} catch {
		dbStatus = "error";
		httpStatus = 503;
	}

	const body = {
		status: httpStatus === 200 ? "ok" : "error",
		version,
		timestamp: new Date().toISOString(),
		database: dbStatus,
	};

	return jsonResponse(body, httpStatus);
}
