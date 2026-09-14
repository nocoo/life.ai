import type {
	DataOverview,
	HealthProviderStats,
	ImportChannel,
	ProviderCoverageDay,
	ProviderOverview,
} from "../src/models/data-management.js";
import { FOOTPRINT_DAY_MS } from "../src/models/footprint.js";
import type { ImportSourceId } from "../src/models/types.js";
import { dataTarget } from "./footprint-imports.js";
import type { WorkerEnv } from "./types.js";
import { jsonResponse } from "./utils.js";

export const IMPORT_PROVIDERS: Record<ImportSourceId, string> = {
	"apple-health": "Apple Health",
	footprint: "Footprint",
	pixiu: "貔貅记账",
	journal: "Journal",
};

interface ProviderState {
	source_id: ImportSourceId;
	revision: number;
	record_count: number;
	data_rows: number;
	payload_bytes: number;
	last_changed_at: number | null;
	last_imported_at: number | null;
	last_import_channel: ImportChannel | null;
	stats_revision: number;
	stats_json: string | null;
}

interface CoverageStats {
	coverage: ProviderCoverageDay[];
	firstAt: number | null;
	lastAt: number | null;
	health?: HealthProviderStats;
}

interface EventSpan {
	occurred_at: number;
	end_at: number | null;
	precision: string;
}

interface DayMetadata {
	utc_day: number;
	record_count: number;
	first_at: number;
	last_at: number;
}

function iso(timestamp: number | null | undefined): string | null {
	return timestamp == null ? null : new Date(timestamp).toISOString();
}

function coverageStats(events: EventSpan[], days: DayMetadata[]): CoverageStats {
	const coverage = new Map<number, number>();
	let firstAt: number | null = null;
	let lastAt: number | null = null;
	const extent = (first: number, last: number) => {
		firstAt = firstAt === null ? first : Math.min(firstAt, first);
		lastAt = lastAt === null ? last : Math.max(lastAt, last);
	};
	for (const day of days) {
		coverage.set(day.utc_day, (coverage.get(day.utc_day) ?? 0) + day.record_count);
		extent(day.first_at, day.last_at);
	}
	for (const event of events) {
		const first = Math.floor(event.occurred_at / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
		const end =
			event.precision !== "day" && event.end_at !== null && event.end_at > event.occurred_at
				? event.end_at
				: event.occurred_at;
		const last =
			Math.floor((end > event.occurred_at ? end - 1 : end) / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
		for (let day = first; day <= last; day += FOOTPRINT_DAY_MS) {
			coverage.set(day, (coverage.get(day) ?? 0) + 1);
		}
		extent(event.occurred_at, end);
	}
	return {
		coverage: [...coverage]
			.sort(([left], [right]) => left - right)
			.map(([utcDay, recordCount]) => ({ utcDay, recordCount })),
		firstAt,
		lastAt,
	};
}

async function overview(
	db: D1Database,
	id: ImportSourceId,
	initial: ProviderState | undefined,
): Promise<ProviderOverview> {
	let state = initial;
	let stats: CoverageStats = { coverage: [], firstAt: null, lastAt: null };
	const cached = state?.stats_json ? (JSON.parse(state.stats_json) as CoverageStats) : null;
	if (
		state &&
		cached &&
		state.stats_revision === state.revision &&
		(id !== "apple-health" || cached.health?.epochRecordCount !== undefined)
	) {
		stats = cached;
	} else if (state) {
		// A read batch gives coverage and totals the same database snapshot. The
		// conditional cache write cannot mark an older revision as current.
		const [stateResult, eventsResult, daysResult, dimensionsResult, filesResult, epochResult] =
			await db.batch([
				db.prepare("SELECT * FROM provider_state WHERE source_id = ?").bind(id),
				db
					.prepare(
						"SELECT occurred_at, end_at, precision FROM life_events WHERE source_id = ? ORDER BY occurred_at",
					)
					.bind(id),
				db
					.prepare(
						id === "apple-health"
							? "SELECT utc_day, SUM(record_count) AS record_count, MIN(first_at) AS first_at, MAX(last_at) AS last_at FROM health_series WHERE utc_day <> 0 AND dimension <> 'HKDataTypeSleepDurationGoal' AND ? = 'apple-health' GROUP BY utc_day ORDER BY utc_day"
							: "SELECT utc_day, record_count, first_at, last_at FROM provider_days WHERE source_id = ? ORDER BY utc_day",
					)
					.bind(id),
				...(id === "apple-health"
					? [
							db.prepare(
								"SELECT dimension AS id, SUM(record_count) AS recordCount, COUNT(DISTINCT CASE WHEN utc_day <> 0 AND dimension <> 'HKDataTypeSleepDurationGoal' THEN utc_day END) AS coverageDays, COUNT(*) AS dataRows, SUM(payload_bytes) AS payloadBytes FROM health_series GROUP BY dimension ORDER BY recordCount DESC",
							),
							db.prepare(
								"SELECT kind, COUNT(*) AS fileCount, SUM(record_count) AS recordCount, SUM(raw_bytes) AS rawBytes FROM health_files GROUP BY kind ORDER BY kind",
							),
							db.prepare(
								"SELECT COALESCE(SUM(record_count), 0) AS recordCount FROM health_series WHERE utc_day = 0 AND dimension <> 'HKDataTypeSleepDurationGoal'",
							),
						]
					: []),
			]);
		state = stateResult?.results[0] as ProviderState;
		stats = coverageStats(
			eventsResult?.results as unknown as EventSpan[],
			daysResult?.results as unknown as DayMetadata[],
		);
		if (id === "apple-health")
			stats.health = {
				epochRecordCount:
					(epochResult?.results[0] as { recordCount: number } | undefined)?.recordCount ?? 0,
				dimensions: dimensionsResult?.results as unknown as HealthProviderStats["dimensions"],
				files: filesResult?.results as unknown as HealthProviderStats["files"],
			};
		await db
			.prepare(
				"UPDATE provider_state SET stats_revision = ?, stats_json = ? WHERE source_id = ? AND revision = ?",
			)
			.bind(state.revision, JSON.stringify(stats), id, state.revision)
			.run();
	}
	return {
		id,
		name: IMPORT_PROVIDERS[id],
		storage:
			id === "footprint" || id === "pixiu"
				? "daily-json"
				: id === "apple-health"
					? "day-dimension"
					: "events",
		coverageDays: stats.coverage.length,
		recordCount: state?.record_count ?? 0,
		dataRows: state?.data_rows ?? 0,
		payloadBytes: state?.payload_bytes ?? 0,
		firstAt: iso(stats.firstAt),
		lastAt: iso(stats.lastAt),
		lastImportedAt: iso(state?.last_imported_at),
		lastChangedAt: iso(state?.last_changed_at),
		lastImportChannel: state?.last_import_channel ?? null,
		coverage: stats.coverage,
		...(stats.health ? { health: stats.health } : {}),
	};
}

export async function getDataOverview(env: WorkerEnv): Promise<Response> {
	const result = await env.DB.prepare(
		"SELECT p.* FROM provider_state p JOIN sources s ON s.id = p.source_id WHERE s.kind = 'import'",
	).all<ProviderState>();
	const states = new Map(result.results.map((state) => [state.source_id, state]));
	const providers: ProviderOverview[] = [];
	for (const id of Object.keys(IMPORT_PROVIDERS) as ImportSourceId[]) {
		providers.push(await overview(env.DB, id, states.get(id)));
	}
	const data: DataOverview = {
		target: dataTarget(env),
		providers,
		computedAt: new Date().toISOString(),
	};
	return jsonResponse({ data });
}
