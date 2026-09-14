import { type DayInsights, gpsDistanceMeters, type TrackPoint, unionMinutes } from "./day-insights";
import { matchNamedPlace, type NamedPlace } from "./general-settings";

export interface GpsPlace {
	id: string;
	index: number;
	anchor: {
		latitude: number;
		longitude: number;
	};
	radiusKm: 5 | 10;
	pointCount: number;
	totalObservedMinutes: number;
	firstObservedAt: string;
	lastObservedAt: string;
	namedPlace?: NamedPlace;
}

export interface GpsVisit {
	id: string;
	visitIndex: number;
	placeId: string;
	placeIndex: number;
	startAt: string;
	endAt: string;
	pointCount: number;
	observedMinutes: number;
	points: TrackPoint[];
	segments: TrackPoint[][];
}

export interface DayPlaces {
	radiusKm: 5 | 10;
	places: GpsPlace[];
	visits: GpsVisit[];
	representativePlace: GpsPlace | null;
	allDayPoints: TrackPoint[];
	totalPoints: number;
	timedPoints: number;
}

const MAX_GAP_MS = 30 * 60_000;

/** Count the union of observed intervals, excluding recording gaps and overlapping sources. */
export function computeObservedMinutes(segments: TrackPoint[][]): number {
	const intervals: [number, number][] = [];
	for (const segment of segments) {
		for (let index = 1; index < segment.length; index++) {
			const previous = segment[index - 1] as TrackPoint;
			const point = segment[index] as TrackPoint;
			const start = Date.parse(previous.occurredAt);
			const end = Date.parse(point.occurredAt);
			if (end > start && end - start <= MAX_GAP_MS) intervals.push([start, end]);
		}
	}
	return unionMinutes(intervals);
}

/** Group observations into fixed-radius areas, preserving chronological A → B → A visits. */
export function buildDayPlaces(
	gps: DayInsights["gps"] | undefined | null,
	radiusKm: 5 | 10 = 5,
	namedPlaces: readonly NamedPlace[] = [],
): DayPlaces {
	const nativeSegments = gps?.segments ?? [];
	const points = nativeSegments.flat();
	const allDayPoints = points.filter((point) => point.precision === "day");
	const timed = points
		.filter((point) => point.precision !== "day")
		.sort(
			(a, b) =>
				Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
				a.latitude - b.latitude ||
				a.longitude - b.longitude,
		);
	const places: GpsPlace[] = [];
	const visits: GpsVisit[] = [];
	const pointVisit = new Map<TrackPoint, GpsVisit>();
	let visit: GpsVisit | undefined;
	for (const point of timed) {
		// ponytail: a linear area scan suits one day's points; add a spatial index only if profiling requires it.
		const named = matchNamedPlace(point, namedPlaces);
		let place = places.find((item) =>
			named
				? item.namedPlace?.id === named.id
				: !item.namedPlace && gpsDistanceMeters(item.anchor, point) <= radiusKm * 1000,
		);
		if (!place) {
			place = {
				id: `place-${places.length + 1}`,
				index: places.length + 1,
				anchor: { latitude: point.latitude, longitude: point.longitude },
				radiusKm,
				pointCount: 0,
				totalObservedMinutes: 0,
				firstObservedAt: point.occurredAt,
				lastObservedAt: point.occurredAt,
				...(named ? { namedPlace: named } : {}),
			};
			places.push(place);
		}
		place.pointCount++;
		place.lastObservedAt = point.occurredAt;
		if (!visit || visit.placeId !== place.id) {
			visit = {
				id: `visit-${visits.length + 1}`,
				visitIndex: visits.length + 1,
				placeId: place.id,
				placeIndex: place.index,
				startAt: point.occurredAt,
				endAt: point.occurredAt,
				pointCount: 0,
				observedMinutes: 0,
				points: [],
				segments: [],
			};
			visits.push(visit);
		}
		visit.points.push(point);
		visit.pointCount++;
		visit.endAt = point.occurredAt;
		pointVisit.set(point, visit);
	}
	// Walk each original route independently so interleaved sources cannot break or join its edges.
	for (const native of nativeSegments) {
		let previous: TrackPoint | undefined;
		let segment: TrackPoint[] = [];
		for (const point of native) {
			const owner = pointVisit.get(point);
			if (owner) {
				const gap = previous ? Date.parse(point.occurredAt) - Date.parse(previous.occurredAt) : 0;
				if (
					previous &&
					pointVisit.get(previous) === owner &&
					gap > 0 &&
					gap <= MAX_GAP_MS &&
					Math.abs(point.longitude - previous.longitude) <= 180
				) {
					segment.push(point);
				} else {
					segment = [point];
					owner.segments.push(segment);
				}
			}
			previous = point;
		}
	}
	for (const item of visits) {
		item.observedMinutes = computeObservedMinutes(item.segments);
		const place = places[item.placeIndex - 1] as GpsPlace;
		place.totalObservedMinutes += item.observedMinutes;
	}
	const representativePlace =
		[...places].sort(
			(a, b) =>
				b.totalObservedMinutes - a.totalObservedMinutes ||
				b.pointCount - a.pointCount ||
				a.index - b.index,
		)[0] ?? null;
	return {
		radiusKm,
		places,
		visits,
		representativePlace,
		allDayPoints,
		totalPoints: points.length,
		timedPoints: timed.length,
	};
}
