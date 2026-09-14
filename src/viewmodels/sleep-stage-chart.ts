import type { SleepSegment } from "../models/health-insights";
import { normalizeTimestamp } from "../models/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const STAGE_ROWS = [
	{ kind: "awake", label: "清醒" },
	{ kind: "rem", label: "快速动眼睡眠" },
	{ kind: "core", label: "核心睡眠" },
	{ kind: "deep", label: "深度睡眠" },
	{ kind: "asleep", label: "睡眠（未分期）" },
] as const;

/** Preserve the selected source's intervals, including gaps and unclassified sleep. */
export function buildSleepStageChart(timeline: readonly SleepSegment[]) {
	const samples = timeline
		.flatMap((segment) => {
			if (segment.kind === "inBed") return [];
			try {
				const startAt = normalizeTimestamp(segment.startAt);
				const endAt = normalizeTimestamp(segment.endAt);
				const start = Date.parse(startAt);
				const end = Date.parse(endAt);
				return end > start ? [{ ...segment, startAt, endAt, start, end }] : [];
			} catch {
				return [];
			}
		})
		.sort((a, b) => a.start - b.start || a.end - b.end);
	if (!samples.length) return null;

	const first = Math.min(...samples.map((sample) => sample.start));
	const last = Math.max(...samples.map((sample) => sample.end));
	const step =
		[15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR].find(
			(interval) => interval >= (last - first) / 4,
		) ?? Math.ceil((last - first) / (4 * HOUR)) * HOUR;
	const start = Math.floor(first / step) * step;
	const end = Math.ceil(last / step) * step;
	const kinds = new Set(samples.map((sample) => sample.kind));
	const detailed = kinds.has("core") || kinds.has("deep") || kinds.has("rem");
	const rows = STAGE_ROWS.filter((row) =>
		row.kind === "asleep" ? kinds.has("asleep") : detailed || row.kind === "awake",
	);
	const segments = samples.map((sample) => ({
		...sample,
		id: `${sample.eventId}:${sample.kind}:${sample.start}:${sample.end}`,
		label: STAGE_ROWS.find((row) => row.kind === sample.kind)?.label ?? sample.label,
		minutes: (sample.end - sample.start) / MINUTE,
		row: rows.findIndex((row) => row.kind === sample.kind),
		left: ((sample.start - start) / (end - start)) * 100,
		width: ((sample.end - sample.start) / (end - start)) * 100,
	}));
	const connections = segments.slice(1).flatMap((segment, index) => {
		const previous = segments[index];
		// A missing interval or overlapping observations are not a recorded transition.
		if (!previous || previous.end !== segment.start || previous.kind === segment.kind) return [];
		return [
			{
				id: segment.id,
				left: segment.left,
				from: previous.row,
				to: segment.row,
				kind: segment.kind,
			},
		];
	});
	const ticks = Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) => ({
		at: new Date(start + index * step).toISOString(),
		left: ((index * step) / (end - start)) * 100,
	}));
	return { start, end, rows, segments, connections, ticks };
}
