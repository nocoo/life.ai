import { PIXIU_DAY_MS, PIXIU_OFFSET_MS, type PixiuDay } from "../src/models/pixiu.js";

/** Index scan by technical date key; only the display day containing the +8 period start owns its total. */
export async function readPixiuDays(
	db: D1Database,
	start: number,
	end: number,
): Promise<PixiuDay[]> {
	const firstKey = Math.ceil((start + PIXIU_OFFSET_MS) / PIXIU_DAY_MS) * PIXIU_DAY_MS;
	const endKey = Math.ceil((end + PIXIU_OFFSET_MS) / PIXIU_DAY_MS) * PIXIU_DAY_MS;
	const result = await db
		.prepare(
			"SELECT * FROM provider_days WHERE source_id = 'pixiu' AND utc_day >= ? AND utc_day < ? ORDER BY utc_day",
		)
		.bind(firstKey, endKey)
		.all<{
			utc_day: number;
			record_count: number;
			first_at: number;
			last_at: number;
			payload_bytes: number;
			content_hash: string;
			summary_json: string;
			data_json: string;
		}>();
	return result.results.map((row) => ({
		utcDay: row.utc_day,
		recordCount: row.record_count,
		firstAt: row.first_at,
		lastAt: row.last_at,
		payloadBytes: row.payload_bytes,
		contentHash: row.content_hash,
		data: JSON.parse(row.data_json) as PixiuDay["data"],
		summary: JSON.parse(row.summary_json) as PixiuDay["summary"],
	}));
}
