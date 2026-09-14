import { decodeHealthSeries } from "../src/models/apple-health.js";
import {
	HEALTH_DAY_MS,
	type HealthDay,
	type StoredHealthSeries,
} from "../src/models/health-types.js";
import type { LifeEvent } from "../src/models/types.js";

/** Frequent/rare story evidence; dense engineering and gait metrics load in the raw-record tab. */
export const HEALTH_STORY_DIMENSIONS = [
	"HKCategoryTypeIdentifierSleepAnalysis",
	"HKQuantityTypeIdentifierHeartRate",
	"HKQuantityTypeIdentifierOxygenSaturation",
	"HKQuantityTypeIdentifierRespiratoryRate",
	"HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
	"HKQuantityTypeIdentifierRestingHeartRate",
	"HKQuantityTypeIdentifierStepCount",
	"HKQuantityTypeIdentifierFlightsClimbed",
	"HKQuantityTypeIdentifierDistanceWalkingRunning",
	"HKQuantityTypeIdentifierDistanceCycling",
	"HKQuantityTypeIdentifierActiveEnergyBurned",
	"HKQuantityTypeIdentifierAppleExerciseTime",
	"HKQuantityTypeIdentifierAppleStandTime",
	"HKCategoryTypeIdentifierAppleStandHour",
	"HKQuantityTypeIdentifierDietaryWater",
	"HKQuantityTypeIdentifierBodyMass",
	"HKQuantityTypeIdentifierBloodPressureSystolic",
	"HKQuantityTypeIdentifierBloodPressureDiastolic",
	"HKCorrelationTypeIdentifierBloodPressure",
	"HKQuantityTypeIdentifierVO2Max",
	"HKQuantityTypeIdentifierTimeInDaylight",
	"HKQuantityTypeIdentifierAppleSleepingWristTemperature",
	"HKCategoryTypeIdentifierHighHeartRateEvent",
	"HKCategoryTypeIdentifierLowCardioFitnessEvent",
	"HKCategoryTypeIdentifierAudioExposureEvent",
	"HKCategoryTypeIdentifierHeadphoneAudioExposureEvent",
	"HKCategoryTypeIdentifierHandwashingEvent",
	"Workout",
	"ActivitySummary",
	"Electrocardiogram",
] as const;

export function healthDayHeader(day: HealthDay): { json: string; bytes: number } {
	const json = JSON.stringify({
		v: 1,
		series: day.data.series.map(({ body: _body, ...series }) => series),
	});
	return { json, bytes: new TextEncoder().encode(json).length };
}

/** Executed in the same guarded transaction as the daily manifest. Missing dimensions disappear. */
export function healthDayStatements(
	db: D1Database,
	day: HealthDay,
	now: number,
	guard: string,
	bindings: (string | number)[],
): D1PreparedStatement[] {
	return [
		db
			.prepare(`DELETE FROM health_series WHERE utc_day = ? AND ${guard}`)
			.bind(day.utcDay, ...bindings),
		...day.data.series.map((series) =>
			db
				.prepare(`INSERT INTO health_series
			(utc_day, dimension, part, record_count, first_at, last_at, raw_bytes, payload_bytes, content_hash, body, updated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
				.bind(
					day.utcDay,
					series.dimension,
					series.part,
					series.recordCount,
					series.firstAt,
					series.lastAt,
					series.rawBytes,
					series.payloadBytes,
					series.contentHash,
					series.body,
					now,
					...bindings,
				),
		),
	];
}

interface SeriesRow {
	utc_day: number;
	dimension: string;
	part: number;
	record_count: number;
	first_at: number;
	last_at: number;
	raw_bytes: number;
	payload_bytes: number;
	content_hash: string;
	body: string;
	updated_at: number;
}

export async function readHealthSeries(
	db: D1Database,
	start: number,
	end: number,
	storyOnly = false,
	selectedDimensions?: readonly string[],
): Promise<StoredHealthSeries[]> {
	if (start >= end) return [];
	const dayStart = Math.floor(start / HEALTH_DAY_MS) * HEALTH_DAY_MS;
	const dayEnd = Math.floor((end - 1) / HEALTH_DAY_MS) * HEALTH_DAY_MS;
	const dimensions = selectedDimensions ?? (storyOnly ? HEALTH_STORY_DIMENSIONS : []);
	const filter = dimensions.length
		? ` AND dimension IN (${dimensions.map(() => "?").join(",")})`
		: "";
	const { results } = await db
		.prepare(`SELECT * FROM health_series
		WHERE utc_day >= ? AND utc_day <= ? ${filter}
		UNION ALL SELECT * FROM health_series INDEXED BY idx_health_series_overlap
		WHERE last_at >= utc_day + 86400000 AND utc_day < ? AND first_at < ? AND last_at > ? ${filter}
		ORDER BY utc_day, dimension, part`)
		.bind(dayStart, dayEnd, ...dimensions, dayStart, end, start, ...dimensions)
		.all<SeriesRow>();
	return results.map((row) => ({
		utcDay: row.utc_day,
		dimension: row.dimension,
		part: row.part,
		recordCount: row.record_count,
		firstAt: row.first_at,
		lastAt: row.last_at,
		rawBytes: row.raw_bytes,
		payloadBytes: row.payload_bytes,
		contentHash: row.content_hash,
		body: row.body,
		updatedAt: row.updated_at,
	}));
}

export async function readHealthEvents(
	db: D1Database,
	start: number,
	end: number,
	dimensions?: readonly string[],
): Promise<LifeEvent[]> {
	const events: LifeEvent[] = [];
	for (const series of await readHealthSeries(db, start, end, false, dimensions)) {
		events.push(
			...(await decodeHealthSeries(series, series.utcDay, series.updatedAt, { start, end })),
		);
	}
	return events.sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
	);
}
