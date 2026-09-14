import { describe, expect, it } from "vitest";
import type { DayInsights, TrackPoint } from "../../../src/models/day-insights";
import type { NamedPlace } from "../../../src/models/general-settings";
import { buildGpsJourneys } from "../../../src/models/gps-journeys";

const origin = Date.parse("2026-09-13T00:00:00.000Z");
const degreeMeters = 111194.92664455874;
function point(minute: number, meters: number, overrides: Partial<TrackPoint> = {}): TrackPoint {
	return {
		latitude: 0,
		longitude: meters / degreeMeters,
		occurredAt: new Date(origin + minute * 60000).toISOString(),
		precision: "second",
		sourceId: "footprint",
		sourceName: "GPS",
		elevation: null,
		speed: null,
		...overrides,
	};
}
function gps(...segments: TrackPoint[][]): DayInsights["gps"] {
	return {
		pointCount: segments.flat().length,
		segments,
		distanceMeters: 0,
		firstAt: null,
		lastAt: null,
	};
}
function route(kmh: number, duration = 10, start = 0, startMeters = 0): TrackPoint[] {
	return Array.from({ length: duration + 1 }, (_, i) =>
		point(start + i, startMeters + (kmh * 1000 * i) / 60),
	);
}
function place(label: string, meters: number): NamedPlace {
	return { id: label, label, latitude: 0, longitude: meters / degreeMeters, radiusMeters: 100 };
}

describe("GPS movement evidence", () => {
	it("uses total distance / moving time and excludes a two-minute traffic-light stop", () => {
		const points = [
			point(0, 0),
			point(1, 1000),
			point(2, 2000),
			point(3, 2000),
			point(4, 2000),
			point(6, 3000),
			point(7, 4000),
		];
		const before = structuredClone(points);
		const result = buildGpsJourneys(gps(points));
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ movingMinutes: 5, stoppedMinutes: 2, mode: "vehicle" });
		expect(result[0]?.distanceMeters).toBeCloseTo(4000);
		expect(result[0]?.averageKmh).toBeCloseTo(48);
		expect(points).toEqual(before);
	});
	it.each([
		[5, "walk"],
		[18, "cycle"],
		[60, "vehicle"],
		[200, "rail"],
		[400, "unknown"],
	] as const)("classifies sustained %s km/h as %s, with an explanation", (speed, expected) => {
		const [journey] = buildGpsJourneys(gps(route(speed)));
		expect(journey?.mode).toBe(expected);
		expect(journey?.modeReason.length).toBeGreaterThan(10);
		expect(journey?.averageKmh).toBeCloseTo(speed);
	});
	it("does not infer rail from a brief speed peak or a short distance", () => {
		const [brief] = buildGpsJourneys(
			gps([point(0, 0), point(1, 3000), point(2, 4000), point(3, 5000), point(4, 6000)]),
		);
		expect(brief?.mode).toBe("vehicle");
		const [short] = buildGpsJourneys(gps(route(180, 3)));
		expect(short?.mode).toBe("vehicle");
	});
	it("weights speed percentiles by elapsed time, not the number of points", () => {
		const [journey] = buildGpsJourneys(
			gps([point(0, 0), point(0.5, 1000), point(1, 2000), point(5, 4000), point(9, 6000)]),
		);
		expect(journey?.averageKmh).toBeCloseTo(40);
		expect(journey?.fastKmh).toBeCloseTo(30);
	});
	it("keeps short evidence unknown, omits tiny trips and stationary drift", () => {
		expect(buildGpsJourneys(gps(route(12, 2)))[0]?.mode).toBe("unknown");
		expect(buildGpsJourneys(gps(route(18, 1)))).toEqual([]);
		expect(buildGpsJourneys(gps([point(0, 0), point(0.5, 20), point(1, 40)]))).toEqual([]);
		expect(
			buildGpsJourneys(gps(Array.from({ length: 21 }, (_, i) => point(i * 0.5, i % 2 ? 40 : -40)))),
		).toEqual([]);
	});
	it("splits a long stop and recording gap while omitting leading/trailing stops", () => {
		const points = [
			point(0, 0),
			point(1, 0),
			...route(60, 3, 2),
			...Array.from({ length: 7 }, (_, i) => point(i + 6, 3000)),
			...route(60, 3, 13, 3000),
			...route(60, 3, 30, 6000),
			point(34, 9000),
		];
		const journeys = buildGpsJourneys(gps(points));
		expect(journeys).toHaveLength(3);
		expect(journeys.map((trip) => trip.movingMinutes)).toEqual([3, 3, 3]);
		expect(journeys.every((trip) => trip.stoppedMinutes === 0)).toBe(true);
	});
	it("keeps native/source/explicit boundaries, out-of-order times, invalid fixes and coarse precision separate", () => {
		const a = route(60, 3),
			b = route(60, 3, 4, 4000);
		expect(buildGpsJourneys(gps(a, b))).toHaveLength(2);
		for (const overrides of [
			{ breakBefore: true },
			{ sourceId: "other" },
			{ precision: "hour" as const },
			{ precision: "day" as const },
			{ occurredAt: "invalid" },
			{ latitude: 91 },
			{ longitude: 181 },
			{ latitude: Number.NaN },
		]) {
			const journeys = buildGpsJourneys(
				gps([
					...a,
					{ ...(b[0] as TrackPoint), ...overrides },
					...b.slice(1),
					...route(60, 3, 8, 8000),
				]),
			);
			expect(journeys.length).toBeGreaterThanOrEqual(2);
		}
		expect(buildGpsJourneys(gps([...a, point(3, 3000), ...b]))).toHaveLength(2);
	});
	it("never bridges the date line or an impossible speed jump", () => {
		const west = route(60, 3).map((p) => ({ ...p, longitude: p.longitude - 179.9 }));
		const east = route(60, 3, 4).map((p) => ({ ...p, longitude: p.longitude + 179.8 }));
		expect(buildGpsJourneys(gps([...west, ...east]))).toHaveLength(2);
		const jumps = buildGpsJourneys(gps([...route(60, 3), ...route(60, 3, 4, 100000)]));
		expect(jumps).toHaveLength(2);
		expect(jumps.every((trip) => trip.distanceMeters < 3100)).toBe(true);
	});
	it("resamples dense fixes and retains the last short edge and loops", () => {
		const points = Array.from({ length: 82 }, (_, i) => point(i / 20, i * 5));
		const [journey] = buildGpsJourneys(gps(points));
		expect(journey?.endAt).toBe(points.at(-1)?.occurredAt);
		expect(journey?.distanceMeters).toBeCloseTo(405);
		const loop = [...route(12, 3), point(4, 400), point(5, 200), point(6, 0)];
		expect(buildGpsJourneys(gps(loop))[0]?.distanceMeters).toBeCloseTo(1200);
		expect(buildGpsJourneys(gps())).toEqual([]);
	});
	it("recognizes named home/work commutes and records POIs only when samples hit their circles", () => {
		const named = [
			place("家", 0),
			place("公司", 10000),
			place("车站", 5000),
			place("未到过", 20000),
		];
		const outward = route(60),
			back = route(-60, 10, 500, 10000);
		const journeys = buildGpsJourneys(gps(outward, back), named);
		expect(journeys.map((trip) => trip.commute)).toEqual(["outbound", "return"]);
		expect(journeys[0]?.pointsOfInterest.map((p) => p.label)).toEqual(["家", "车站", "公司"]);
		expect(journeys[0]?.commuteReason).toContain("用户命名");
		expect(journeys[0]?.modeReason).toContain("是否本人驾驶");
	});
	it("recognizes an unnamed round trip only with observed destination time, not from a GPS gap", () => {
		const outward = route(60),
			back = route(-60, 10, 500, 10000);
		expect(buildGpsJourneys(gps(outward, back)).every((trip) => trip.commute === null)).toBe(true);
		const stay = Array.from({ length: 11 }, (_, i) => point(15 + i * 3, 10000));
		const journeys = buildGpsJourneys(gps(outward, stay, back));
		expect(journeys.map((trip) => trip.commute)).toEqual(["outbound", "return"]);
		expect(journeys[0]?.commuteReason).toContain("实际采样覆盖约 30 分钟");
		const named = buildGpsJourneys(gps(outward, stay, back), [place("公园", 10000)]);
		expect(named.every((trip) => trip.commute === null)).toBe(true);
	});
	it("does not sum overlapping sensors or bridge native breaks into a destination stay", () => {
		const outward = route(60),
			back = route(-60, 10, 500, 10000);
		const shortStay = Array.from({ length: 6 }, (_, i) => point(15 + i * 4, 10000));
		const duplicate = shortStay.map((p) => ({ ...p, sourceId: "other" }));
		expect(
			buildGpsJourneys(gps(outward, shortStay, duplicate, back)).every(
				(trip) => trip.commute === null,
			),
		).toBe(true);
		const brokenStay = Array.from({ length: 15 }, (_, i) =>
			point(15 + i * 4, 10000, { breakBefore: true }),
		);
		expect(
			buildGpsJourneys(gps(outward, brokenStay, back)).every((trip) => trip.commute === null),
		).toBe(true);
	});
});
