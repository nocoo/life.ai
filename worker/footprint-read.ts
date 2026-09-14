import { FOOTPRINT_DAY_MS, type FootprintDay } from "../src/models/footprint.js";

interface StoredFootprintDay {
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

/** The write boundary already validated these packages; reads only decode stored JSON. */
export async function readFootprintDays(
	db: D1Database,
	start: number,
	end: number,
): Promise<(FootprintDay & { updatedAt: number })[]> {
	if (start >= end) return [];
	const firstDay = Math.floor(start / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
	const lastDay = Math.floor((end - 1) / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
	const { results } = await db
		.prepare(
			`SELECT utc_day, record_count, first_at, last_at, payload_bytes,
			 summary_json, data_json, content_hash, updated_at
			 FROM provider_days WHERE source_id = 'footprint' AND utc_day >= ? AND utc_day <= ?
			 ORDER BY utc_day`,
		)
		.bind(firstDay, lastDay)
		.all<StoredFootprintDay>();
	return results.map((row) => ({
		utcDay: row.utc_day,
		recordCount: row.record_count,
		firstAt: row.first_at,
		lastAt: row.last_at,
		payloadBytes: row.payload_bytes,
		summary: JSON.parse(row.summary_json),
		data: JSON.parse(row.data_json),
		contentHash: row.content_hash,
		updatedAt: row.updated_at,
	}));
}
