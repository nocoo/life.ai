import { describe, expect, it } from "vitest";
import type { TrackPoint } from "../../../src/models/day-insights";
import { estimateTrackSpeeds, nearestTrackPoint, speedBand } from "../../../src/models/track-speed";

const point = (
	longitude: number,
	occurredAt: string,
	extra: Partial<TrackPoint> = {},
): TrackPoint => ({
	latitude: 0,
	longitude,
	occurredAt,
	precision: "second",
	sourceId: "footprint",
	sourceName: "Footprint",
	elevation: null,
	speed: -1,
	...extra,
});

describe("GPS speed estimates", () => {
	it("classifies boundary values and keeps unavailable speeds distinct from a measured zero", () => {
		for (const [speed, band] of [
			[null, "unknown"],
			[-1, "unknown"],
			[NaN, "unknown"],
			[Infinity, "unknown"],
			[0, "slow"],
			[5.99, "slow"],
			[6, "medium"],
			[29.99, "medium"],
			[30, "fast"],
			[280, "fast"],
		] as const)
			expect(speedBand(speed)).toBe(band);
	});

	it("derives km/h from adjacent UTC instants without guessing the provider's raw unit", () => {
		const a = point(0, "2026-09-14T00:00:00Z", { speed: 900 });
		const b = point(0.01, "2026-09-14T08:01:00+08:00");
		const c = point(0.01, "2026-09-14T00:02:00Z");
		const speeds = estimateTrackSpeeds([[a, b, c]]);
		expect(speeds.get(b)).toBeCloseTo(66.716956, 4);
		expect(speeds.get(a)).toBe(speeds.get(b));
		expect(speeds.get(c)).toBe(0);
		expect(a.speed).toBe(900);
		expect(b.speed).toBe(-1);
	});

	it("does not bridge native segments, long gaps, equal times, imprecise times, sources or the date line", () => {
		const a = point(0, "2026-09-14T00:00:00Z");
		const cases: TrackPoint[][][] = [
			[[a], [point(0.1, "2026-09-14T00:01:00Z")]],
			[[a, point(0.1, "2026-09-14T00:30:01Z")]],
			[[a, point(0.1, a.occurredAt)]],
			[[a, point(0.1, "2026-09-13T23:59:00Z")]],
			[[a, point(0.1, "invalid")]],
			[[a, point(0.1, "2026-09-14T00:01:00Z", { precision: "day" })]],
			[[a, point(0.1, "2026-09-14T00:01:00Z", { precision: "hour" })]],
			[[{ ...a, precision: "day" }, point(0.1, "2026-09-14T00:01:00Z")]],
			[[{ ...a, precision: "hour" }, point(0.1, "2026-09-14T00:01:00Z")]],
			[[a, point(0.1, "2026-09-14T00:01:00Z", { sourceId: "another" })]],
			[[{ ...a, longitude: 179.9 }, point(-179.9, "2026-09-14T00:01:00Z")]],
		];
		for (const segments of cases) {
			expect([...estimateTrackSpeeds(segments).values()].every((speed) => speed === null)).toBe(
				true,
			);
		}
		expect(estimateTrackSpeeds([[]]).size).toBe(0);
	});

	it("accepts minute-precision sampling and recovers from a gap at the next valid edge", () => {
		const a = point(0, "2026-09-14T00:00:00Z");
		const b = point(0.1, "2026-09-14T00:31:00Z", { precision: "minute" });
		const c = point(0.1, "2026-09-14T01:01:00Z", { precision: "minute" });
		const speeds = estimateTrackSpeeds([[a, b, c]]);
		expect(speeds.get(a)).toBeNull();
		expect(speeds.get(b)).toBe(0);
		expect(speeds.get(c)).toBe(0);
	});

	it("associates area labels with the nearest observation in the displayed route, including return visits", () => {
		const a = point(0.2, "2026-09-14T00:00:00Z");
		const b = point(0.001, "2026-09-14T00:01:00Z");
		const anchor = { latitude: 0, longitude: 0 };
		expect(nearestTrackPoint(anchor, [a, b])).toBe(b);
		expect(nearestTrackPoint(anchor, [b, a])).toBe(b);
		expect(nearestTrackPoint(anchor, [])).toBeNull();
	});
});
