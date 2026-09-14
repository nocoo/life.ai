import { describe, expect, it } from "vitest";
import type { SleepSegment } from "../../../../src/models/health-insights";
import { buildSleepStageChart } from "../../../../src/viewmodels/sleep-stage-chart";

function sample(kind: SleepSegment["kind"], startAt: string, endAt: string): SleepSegment {
	return {
		kind,
		startAt,
		endAt,
		label: kind,
		minutes: -1,
		sourceName: "Watch",
		eventId: `${kind}:${startAt}`,
	};
}

describe("sleep stage chart", () => {
	it("keeps a cross-midnight night on one proportional axis without mutating observations", () => {
		const input = Object.freeze([
			Object.freeze(sample("rem", "2026-09-14T02:00:00+08:00", "2026-09-14T03:00:00+08:00")),
			Object.freeze(sample("inBed", "2026-09-13T22:00:00+08:00", "2026-09-14T07:00:00+08:00")),
			Object.freeze(sample("core", "2026-09-13T23:00:00+08:00", "2026-09-14T00:00:00+08:00")),
			Object.freeze(sample("awake", "2026-09-14T00:00:00+08:00", "2026-09-14T00:10:00+08:00")),
			Object.freeze(sample("deep", "2026-09-14T00:10:00+08:00", "2026-09-14T02:00:00+08:00")),
		]);
		const chart = buildSleepStageChart(input);
		expect(chart?.rows.map((row) => row.kind)).toEqual(["awake", "rem", "core", "deep"]);
		expect(chart?.segments.map((segment) => [segment.kind, segment.row, segment.minutes])).toEqual([
			["core", 2, 60],
			["awake", 0, 10],
			["deep", 3, 110],
			["rem", 1, 60],
		]);
		expect(chart?.segments[0]).toMatchObject({
			startAt: "2026-09-13T15:00:00.000Z",
			left: 0,
			width: 25,
		});
		expect(chart?.segments.at(-1)).toMatchObject({ left: 75, width: 25 });
		expect(chart?.connections.map(({ from, to }) => [from, to])).toEqual([
			[2, 0],
			[0, 3],
			[3, 1],
		]);
		expect(chart?.ticks).toHaveLength(5);
		expect(input[0]?.kind).toBe("rem");
	});

	it("treats offsetless timestamps as UTC and derives short durations from instants", () => {
		const chart = buildSleepStageChart([
			sample("deep", "2026-09-14 00:01:15", "2026-09-14 00:01:45"),
		]);
		expect(chart?.segments[0]).toMatchObject({ startAt: "2026-09-14T00:01:15.000Z", minutes: 0.5 });
		expect(chart?.ticks.map((tick) => tick.at)).toEqual([
			"2026-09-14T00:00:00.000Z",
			"2026-09-14T00:15:00.000Z",
		]);
		expect(chart?.segments[0]?.width).toBeCloseTo(100 / 30);
	});

	it("labels unclassified sleep separately without inventing detailed stages", () => {
		const unknown = sample("asleep", "2026-09-14T00:00:00Z", "2026-09-14T06:00:00Z");
		const chart = buildSleepStageChart([unknown]);
		expect(chart?.rows).toEqual([
			{ kind: "awake", label: "清醒" },
			{ kind: "asleep", label: "睡眠（未分期）" },
		]);
		expect(chart?.segments[0]).toMatchObject({ row: 1, label: "睡眠（未分期）" });
		expect(
			buildSleepStageChart([
				unknown,
				sample("core", "2026-09-14T07:00:00Z", "2026-09-14T08:00:00Z"),
			])?.rows.map((row) => row.kind),
		).toEqual(["awake", "rem", "core", "deep", "asleep"]);
	});

	it("does not turn gaps, overlapping intervals or a same-stage boundary into transitions", () => {
		const chart = buildSleepStageChart([
			sample("core", "2026-09-14T00:00:00Z", "2026-09-14T01:00:00Z"),
			sample("core", "2026-09-14T01:00:00Z", "2026-09-14T02:00:00Z"),
			sample("deep", "2026-09-14T03:00:00Z", "2026-09-14T04:00:00Z"),
			sample("rem", "2026-09-14T03:30:00Z", "2026-09-14T04:30:00Z"),
		]);
		expect(chart?.segments).toHaveLength(4);
		expect(chart?.connections).toEqual([]);
		expect(chart?.segments[2]?.left).toBeGreaterThan(
			(chart?.segments[1]?.left ?? 0) + (chart?.segments[1]?.width ?? 0),
		);
	});

	it("ignores bed-only, invalid and non-positive intervals, including within a valid night", () => {
		const invalid = [
			sample("inBed", "2026-09-14T00:00:00Z", "2026-09-14T06:00:00Z"),
			sample("core", "invalid", "2026-09-14T01:00:00Z"),
			sample("core", "2026-09-14T00:00:00Z", "2026-09-31T00:00:00Z"),
			sample("deep", "2026-09-14T01:00:00Z", "2026-09-14T01:00:00Z"),
			sample("deep", "2026-09-14T02:00:00Z", "2026-09-14T01:00:00Z"),
		];
		expect(buildSleepStageChart([])).toBeNull();
		expect(buildSleepStageChart(invalid)).toBeNull();
		expect(
			buildSleepStageChart([
				...invalid,
				sample("awake", "2026-09-14T00:00:00Z", "2026-09-14T00:03:00Z"),
			])?.segments,
		).toHaveLength(1);
	});

	it("bounds unusually long intervals and keeps coincident observations in duration order", () => {
		const chart = buildSleepStageChart([
			sample("asleep", "2026-09-10T00:00:00Z", "2026-09-14T00:00:00Z"),
			sample("awake", "2026-09-10T00:00:00Z", "2026-09-10T01:00:00Z"),
		]);
		expect(chart?.ticks).toHaveLength(5);
		expect(chart?.segments.map((segment) => segment.kind)).toEqual(["awake", "asleep"]);
		expect(chart?.segments.at(-1)?.width).toBe(100);
		expect(chart?.connections).toEqual([]);
	});
});
