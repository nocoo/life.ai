import type { EventPage, LifeEvent, Precision, SourceKind } from "../src/models/types.js";
import { readFootprintDays } from "./footprint-read.js";
import { readHealthSeries } from "./health-read.js";
import { normalizeTimestamp } from "./time.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { decodeCursor, encodeCursor, jsonResponse, LIMITS } from "./utils.js";

export interface EventRow {
	id: string;
	source_id: string;
	source_name: string;
	source_kind: SourceKind;
	occurred_at: number;
	end_at: number | null;
	precision: Precision;
	title: string;
	content: string;
	data: string;
	updated_at: number;
}

export interface EventRowsQuery {
	start: number;
	end: number;
	source?: string | null;
	cursor?: { occurredAtMs: number; id: string } | null;
	limit: number;
}

/** Two disjoint indexed ranges avoid scanning all historical point events for overlap. */
export async function readEventRows(db: D1Database, query: EventRowsQuery): Promise<EventRow[]> {
	const bindings: (number | string)[] = [query.start, query.end];
	let conditions = `AND (e.source_id NOT IN ('footprint', 'apple-health') OR NOT EXISTS (
		SELECT 1 FROM provider_days p WHERE p.source_id = e.source_id
		AND p.utc_day = e.occurred_at - ((e.occurred_at % 86400000 + 86400000) % 86400000)
	))`;
	if (query.source) {
		bindings.push(query.source);
		conditions += ` AND e.source_id = ?${bindings.length}`;
	}
	if (query.cursor) {
		bindings.push(query.cursor.occurredAtMs, query.cursor.id);
		conditions += ` AND (e.occurred_at, e.id) > (?${bindings.length - 1}, ?${bindings.length})`;
	}
	bindings.push(query.limit);
	const columns = `e.id AS id, e.source_id, s.name AS source_name, s.kind AS source_kind,
		e.occurred_at AS occurred_at, e.end_at, e.precision, e.title, e.content, e.data, e.updated_at`;
	const occurrenceIndex = query.source ? "idx_life_events_source_range" : "idx_life_events_range";
	const sql = `SELECT ${columns}
		FROM life_events e INDEXED BY ${occurrenceIndex} JOIN sources s ON s.id = e.source_id
		WHERE e.occurred_at >= ?1 AND e.occurred_at < ?2 ${conditions}
		UNION ALL
		SELECT ${columns}
		FROM life_events e INDEXED BY idx_life_events_interval JOIN sources s ON s.id = e.source_id
		WHERE e.precision != 'day' AND e.end_at > e.occurred_at
		AND e.occurred_at < ?1 AND e.end_at > ?1 ${conditions}
		ORDER BY occurred_at, id LIMIT ?${bindings.length}`;
	const { results } = await db
		.prepare(sql)
		.bind(...bindings)
		.all<EventRow>();
	return results;
}

export function eventRowToEvent(row: EventRow): LifeEvent {
	return {
		id: row.id,
		sourceId: row.source_id,
		sourceName: row.source_name,
		sourceKind: row.source_kind,
		occurredAt: new Date(row.occurred_at).toISOString(),
		endAt: row.end_at === null ? null : new Date(row.end_at).toISOString(),
		precision: row.precision,
		title: row.title,
		content: row.content,
		data: JSON.parse(row.data),
		updatedAt: new Date(row.updated_at).toISOString(),
	};
}

/** GPS packages accompany the first page only; the cursor continues to paginate ordinary records. */
export async function handleGetEvents(env: WorkerEnv, url: URL): Promise<Response> {
	const startParam = url.searchParams.get("start");
	const endParam = url.searchParams.get("end");
	if (!startParam || !endParam) {
		throw new ApiError(400, "missing_parameter", "start and end query parameters are required");
	}
	let start: number;
	let end: number;
	try {
		start = Date.parse(normalizeTimestamp(startParam));
		end = Date.parse(normalizeTimestamp(endParam));
	} catch (error) {
		throw new ApiError(
			400,
			"invalid_timestamp",
			error instanceof Error ? error.message : "Invalid timestamp",
		);
	}
	if (start >= end) throw new ApiError(400, "invalid_range", "start must be strictly before end");
	if (end - start > LIMITS.maxWindowDays * 86_400_000) {
		throw new ApiError(
			400,
			"range_too_large",
			`Time window cannot exceed ${LIMITS.maxWindowDays} days`,
		);
	}
	const source = url.searchParams.get("source");
	const cursorParam = url.searchParams.get("cursor");
	const cursor = cursorParam ? decodeCursor(cursorParam) : null;
	const [rows, footprintDays, healthSeries] = await Promise.all([
		readEventRows(env.DB, { start, end, source, cursor, limit: LIMITS.pageSize + 1 }),
		!cursor && (!source || source === "footprint")
			? readFootprintDays(env.DB, start, end)
			: undefined,
		!cursor && (!source || source === "apple-health")
			? readHealthSeries(env.DB, start, end, url.searchParams.get("healthView") === "story")
			: undefined,
	]);
	const items = rows.slice(0, LIMITS.pageSize);
	const last = items.at(-1);
	const page: EventPage = {
		events: items.map(eventRowToEvent),
		nextCursor:
			rows.length > LIMITS.pageSize && last ? encodeCursor(last.occurred_at, last.id) : null,
		...(footprintDays ? { footprintDays } : {}),
		...(healthSeries ? { healthSeries } : {}),
	};
	return jsonResponse({ data: page });
}
