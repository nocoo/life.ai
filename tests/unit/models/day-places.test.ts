import { describe, expect, it } from "vitest";
import { gpsDistanceMeters, type TrackPoint } from "../../../src/models/day-insights";
import { buildDayPlaces, computeObservedMinutes } from "../../../src/models/day-places";

function makePoint(
	lat: number,
	lon: number,
	occurredAt: string,
	precision: "second" | "minute" | "hour" | "day" = "second",
): TrackPoint {
	return {
		latitude: lat,
		longitude: lon,
		occurredAt,
		precision,
		sourceId: "src-footprint",
		sourceName: "Footprint",
		elevation: null,
		speed: null,
	};
}

describe("gpsDistanceMeters", () => {
	it("calculates 0 for identical coordinates", () => {
		expect(
			gpsDistanceMeters(
				{ latitude: 31.23, longitude: 121.47 },
				{ latitude: 31.23, longitude: 121.47 },
			),
		).toBe(0);
	});

	it("calculates accurate distances across coordinates", () => {
		// ~111 km per degree latitude
		const dist = gpsDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
		expect(Math.round(dist / 1000)).toBe(111);
	});

	it("handles the antimeridian (international date line) without wrap-around distortion", () => {
		// Longitude 179.99 to -179.99 at the equator is ~0.02 degrees apart (~2.22 km), not ~39,900 km
		const dist = gpsDistanceMeters(
			{ latitude: 0, longitude: 179.99 },
			{ latitude: 0, longitude: -179.99 },
		);
		expect(dist).toBeLessThan(3_000);
		expect(dist).toBeGreaterThan(2_000);
	});
});

describe("computeObservedMinutes", () => {
	it("returns 0 for single points or empty segments", () => {
		expect(computeObservedMinutes([])).toBe(0);
		expect(computeObservedMinutes([[makePoint(0, 0, "2026-09-14T01:00:00Z")]])).toBe(0);
	});

	it("accumulates delta between consecutive points up to 30 mins", () => {
		const seg = [
			makePoint(0, 0, "2026-09-14T01:00:00Z"),
			makePoint(0, 0, "2026-09-14T01:10:00Z"), // +10 min
			makePoint(0, 0, "2026-09-14T01:25:00Z"), // +15 min
		];
		expect(computeObservedMinutes([seg])).toBe(25);
	});

	it("ignores gaps > 30 mins within segments", () => {
		const seg = [
			makePoint(0, 0, "2026-09-14T01:00:00Z"),
			makePoint(0, 0, "2026-09-14T01:31:00Z"), // 31 min gap (>30 min)
		];
		expect(computeObservedMinutes([seg])).toBe(0);
	});
});

describe("buildDayPlaces", () => {
	it("handles empty or null gps gracefully", () => {
		const emptyRes = buildDayPlaces(null);
		expect(emptyRes.places).toEqual([]);
		expect(emptyRes.visits).toEqual([]);
		expect(emptyRes.representativePlace).toBeNull();
		expect(emptyRes.totalPoints).toBe(0);
	});

	it("separates all-day points from timed visits without inventing clock time", () => {
		const dayPt = makePoint(31.23, 121.47, "2026-09-14T00:00:00Z", "day");
		const timedPt = makePoint(31.23, 121.47, "2026-09-14T09:30:00Z", "second");

		const res = buildDayPlaces({
			pointCount: 2,
			segments: [[dayPt, timedPt]],
			distanceMeters: 0,
			firstAt: "2026-09-14T00:00:00Z",
			lastAt: "2026-09-14T09:30:00Z",
		});

		expect(res.totalPoints).toBe(2);
		expect(res.timedPoints).toBe(1);
		expect(res.allDayPoints).toEqual([dayPt]);
		expect(res.places).toHaveLength(1);
		expect(res.visits).toHaveLength(1);
		expect(res.visits[0]?.points).toEqual([timedPt]);
		expect(res.visits[0]?.startAt).toBe("2026-09-14T09:30:00Z");
	});

	it("uses first point as anchor and prevents anchor drift", () => {
		// Starting at 0,0
		// Step 1: 0, 0 (anchor)
		// Step 2: 0, 0.03 (~3.3 km from anchor, inside 5km)
		// Step 3: 0, 0.06 (~6.6 km from anchor, OUTSIDE 5km, even though only 3.3km from Step 2)
		const pt1 = makePoint(0, 0, "2026-09-14T08:00:00Z");
		const pt2 = makePoint(0, 0.03, "2026-09-14T08:05:00Z");
		const pt3 = makePoint(0, 0.06, "2026-09-14T08:10:00Z");

		const res = buildDayPlaces(
			{
				pointCount: 3,
				segments: [[pt1, pt2, pt3]],
				distanceMeters: 6600,
				firstAt: "2026-09-14T08:00:00Z",
				lastAt: "2026-09-14T08:10:00Z",
			},
			5,
		);

		// With chaining, pt3 would merge into pt2. With fixed anchor, pt3 forms place-2.
		expect(res.places).toHaveLength(2);
		expect(res.places[0]?.anchor).toEqual({ latitude: 0, longitude: 0 });
		expect(res.places[0]?.pointCount).toBe(2);
		expect(res.places[1]?.anchor).toEqual({ latitude: 0, longitude: 0.06 });
		expect(res.places[1]?.pointCount).toBe(1);
	});

	it("differentiates 5km and 10km radius thresholds", () => {
		// Distance of ~7 km
		const p1 = makePoint(0, 0, "2026-09-14T08:00:00Z");
		const p2 = makePoint(0, 0.063, "2026-09-14T08:10:00Z"); // ~7.0 km

		const res5 = buildDayPlaces(
			{
				pointCount: 2,
				segments: [[p1, p2]],
				distanceMeters: 7000,
				firstAt: "2026-09-14T08:00:00Z",
				lastAt: "2026-09-14T08:10:00Z",
			},
			5,
		);
		expect(res5.places).toHaveLength(2);

		const res10 = buildDayPlaces(
			{
				pointCount: 2,
				segments: [[p1, p2]],
				distanceMeters: 7000,
				firstAt: "2026-09-14T08:00:00Z",
				lastAt: "2026-09-14T08:10:00Z",
			},
			10,
		);
		expect(res10.places).toHaveLength(1);
		expect(res10.visits).toHaveLength(1);
	});

	it("handles A-B-A round-trip pattern with separate visits to the same place", () => {
		// Place A: (31.23, 121.47)
		// Place B: (31.35, 121.47) (~13 km north)
		// Timeline: A(08:00) -> B(10:00) -> A(14:00)
		const a1 = makePoint(31.23, 121.47, "2026-09-14T08:00:00Z");
		const a2 = makePoint(31.231, 121.471, "2026-09-14T08:30:00Z");
		const b1 = makePoint(31.35, 121.47, "2026-09-14T10:00:00Z");
		const a3 = makePoint(31.232, 121.472, "2026-09-14T14:00:00Z");
		const a4 = makePoint(31.23, 121.47, "2026-09-14T14:20:00Z");

		const res = buildDayPlaces(
			{
				pointCount: 5,
				segments: [[a1, a2], [b1], [a3, a4]],
				distanceMeters: 26000,
				firstAt: "2026-09-14T08:00:00Z",
				lastAt: "2026-09-14T14:20:00Z",
			},
			5,
		);

		expect(res.places).toHaveLength(2);
		expect(res.places[0]?.id).toBe("place-1");
		expect(res.places[1]?.id).toBe("place-2");

		expect(res.visits).toHaveLength(3);
		// Visit 1: place-1
		expect(res.visits[0]?.placeId).toBe("place-1");
		expect(res.visits[0]?.pointCount).toBe(2);
		expect(res.visits[0]?.observedMinutes).toBe(30);

		// Visit 2: place-2
		expect(res.visits[1]?.placeId).toBe("place-2");
		expect(res.visits[1]?.pointCount).toBe(1);
		expect(res.visits[1]?.observedMinutes).toBe(0);

		// Visit 3: back to place-1
		expect(res.visits[2]?.placeId).toBe("place-1");
		expect(res.visits[2]?.pointCount).toBe(2);
		expect(res.visits[2]?.observedMinutes).toBe(20);

		// Place-1 aggregate observedMinutes = 30 + 20 = 50 min
		expect(res.places[0]?.totalObservedMinutes).toBe(50);
		expect(res.places[0]?.pointCount).toBe(4);
	});

	it("keeps a single visit during gaps without other locations, but breaks segments and excludes gap from observedMinutes", () => {
		// User stays at home, but GPS stops logging between 10:00 and 13:00 (3 hour gap)
		const p1 = makePoint(31.23, 121.47, "2026-09-14T09:30:00Z");
		const p2 = makePoint(31.23, 121.47, "2026-09-14T10:00:00Z"); // 30 min continuous
		const p3 = makePoint(31.23, 121.47, "2026-09-14T13:00:00Z"); // 3-hr gap, same place
		const p4 = makePoint(31.23, 121.47, "2026-09-14T13:30:00Z"); // 30 min continuous

		const res = buildDayPlaces(
			{
				pointCount: 4,
				segments: [
					[p1, p2],
					[p3, p4],
				],
				distanceMeters: 0,
				firstAt: "2026-09-14T09:30:00Z",
				lastAt: "2026-09-14T13:30:00Z",
			},
			5,
		);

		expect(res.places).toHaveLength(1);
		expect(res.visits).toHaveLength(1);
		const visit = res.visits[0];
		expect(visit).toBeDefined();
		if (!visit) throw new Error("Expected visit");
		expect(visit.startAt).toBe("2026-09-14T09:30:00Z");
		expect(visit.endAt).toBe("2026-09-14T13:30:00Z");
		// Native segments are preserved as 2 separate segments
		expect(visit.segments).toHaveLength(2);
		// Observed minutes does NOT include the 3-hour unrecorded gap
		// Segment 1 (30 min) + Segment 2 (30 min) = 60 min
		expect(visit.observedMinutes).toBe(60);
	});

	it("selects representativePlace based on observedMinutes > pointCount > earliest time", () => {
		// Place 1: 1 point, 0 min
		// Place 2: 2 points 15 min apart (15 min)
		// Place 3: 3 isolated points (0 min)
		const p1 = makePoint(10, 10, "2026-09-14T08:00:00Z");

		const p2a = makePoint(20, 20, "2026-09-14T09:00:00Z");
		const p2b = makePoint(20, 20, "2026-09-14T09:15:00Z");

		const p3a = makePoint(30, 30, "2026-09-14T12:00:00Z");
		const p3b = makePoint(30, 30, "2026-09-14T13:00:00Z"); // 1h gap
		const p3c = makePoint(30, 30, "2026-09-14T15:00:00Z"); // 2h gap

		const res = buildDayPlaces({
			pointCount: 6,
			segments: [[p1], [p2a, p2b], [p3a], [p3b], [p3c]],
			distanceMeters: 0,
			firstAt: "2026-09-14T08:00:00Z",
			lastAt: "2026-09-14T15:00:00Z",
		});

		// Place 2 has 15 min totalObservedMinutes; Place 1 & 3 have 0 min
		expect(res.representativePlace?.id).toBe("place-2");

		// If both have 0 min observed time, tie broken by pointCount
		const resZeroTime = buildDayPlaces({
			pointCount: 4,
			segments: [[p1], [p3a], [p3b], [p3c]],
			distanceMeters: 0,
			firstAt: "2026-09-14T08:00:00Z",
			lastAt: "2026-09-14T15:00:00Z",
		});
		// Place 3 has 3 points vs Place 1 with 1 point
		expect(resZeroTime.representativePlace?.id).toBe("place-2"); // Note: p3 is place-2 in this run
		expect(resZeroTime.representativePlace?.pointCount).toBe(3);
	});

	it("handles day-precision-only GPS datasets without creating places", () => {
		const dayPt = makePoint(31.23, 121.47, "2026-09-14T00:00:00Z", "day");
		const res = buildDayPlaces({
			pointCount: 1,
			segments: [[dayPt]],
			distanceMeters: 0,
			firstAt: "2026-09-14T00:00:00Z",
			lastAt: "2026-09-14T00:00:00Z",
		});
		expect(res.places).toHaveLength(0);
		expect(res.visits).toHaveLength(0);
		expect(res.allDayPoints).toEqual([dayPt]);
		expect(res.representativePlace).toBeNull();
		expect(res.timedPoints).toBe(0);
		expect(res.totalPoints).toBe(1);
	});

	it("breaks ties in representativePlace by place index when observed time, point count, and first observed time are equal", () => {
		// Two places with identical 1 point, 0 min, same timestamp
		const p1 = makePoint(10, 10, "2026-09-14T10:00:00Z");
		const p2 = makePoint(40, 40, "2026-09-14T10:00:00Z");

		const res = buildDayPlaces({
			pointCount: 2,
			segments: [[p1], [p2]],
			distanceMeters: 0,
			firstAt: "2026-09-14T10:00:00Z",
			lastAt: "2026-09-14T10:00:00Z",
		});

		expect(res.places).toHaveLength(2);
		expect(res.representativePlace?.id).toBe("place-1");
	});

	it("handles empty segments array within valid gps object", () => {
		const res = buildDayPlaces({
			pointCount: 0,
			segments: [],
			distanceMeters: 0,
			firstAt: null,
			lastAt: null,
		});
		expect(res.places).toHaveLength(0);
		expect(res.visits).toHaveLength(0);
		expect(res.representativePlace).toBeNull();
		expect(res.totalPoints).toBe(0);
		expect(res.timedPoints).toBe(0);
	});
});

describe("native GPS evidence", () => {
	function project(segments: TrackPoint[][]) {
		return buildDayPlaces({
			segments,
			pointCount: segments.flat().length,
			distanceMeters: 0,
			firstAt: null,
			lastAt: null,
		});
	}
	it("keeps interleaved sources connected on their own routes without double-counting observed time", () => {
		const a = [
			makePoint(0, 0, "2026-09-14T08:00:00Z"),
			makePoint(0, 0.001, "2026-09-14T08:20:00Z"),
			makePoint(0, 0.002, "2026-09-14T08:40:00Z"),
		];
		const b = [
			makePoint(0, 0, "2026-09-14T08:10:00Z"),
			makePoint(0, 0.001, "2026-09-14T08:30:00Z"),
		].map((point) => ({ ...point, sourceId: "other-gps" }));
		const result = project([a, b]);
		expect(result.visits[0]?.segments).toEqual([a, b]);
		expect(result.visits[0]?.observedMinutes).toBe(40);
		expect(result.places[0]?.totalObservedMinutes).toBe(40);
		expect(computeObservedMinutes([[a[1] as TrackPoint, a[0] as TrackPoint]])).toBe(0);
	});
	it("uses geographic distance across the date line while breaking the drawn world-spanning edge", () => {
		const result = project([
			[makePoint(0, 179.99, "2026-09-14T08:00:00Z"), makePoint(0, -179.99, "2026-09-14T08:10:00Z")],
		]);
		expect(result.places).toHaveLength(1);
		expect(result.visits[0]?.segments.map((segment) => segment.length)).toEqual([1, 1]);
		expect(result.visits[0]?.observedMinutes).toBe(0);
	});
	it("does not connect across a date-only point, equal timestamps, or a long gap", () => {
		const result = project([
			[
				makePoint(0, 0, "2026-09-14T08:00:00Z"),
				makePoint(0, 0, "2026-09-14T00:00:00Z", "day"),
				makePoint(0, 0, "2026-09-14T08:10:00Z"),
				makePoint(0, 0.001, "2026-09-14T08:10:00Z"),
				makePoint(0, 0, "2026-09-14T10:00:00Z"),
			],
		]);
		expect(result.visits).toHaveLength(1);
		expect(result.visits[0]?.segments.map((segment) => segment.length)).toEqual([1, 1, 1, 1]);
		expect(result.visits[0]?.observedMinutes).toBe(0);
		expect(result.allDayPoints).toHaveLength(1);
	});
});
