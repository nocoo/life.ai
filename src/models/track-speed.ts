import { gpsDistanceMeters, type TrackPoint } from "./day-insights";

export type SpeedBand = "slow" | "medium" | "fast" | "unknown";

export function speedBand(kmh: number | null): SpeedBand {
	if (kmh === null || !Number.isFinite(kmh) || kmh < 0) return "unknown";
	return kmh < 6 ? "slow" : kmh < 30 ? "medium" : "fast";
}

/** Segment-average km/h, not the provider's unlabelled speed or a transport-mode inference. */
export function estimateTrackSpeeds(segments: TrackPoint[][]): Map<TrackPoint, number | null> {
	const speeds = new Map<TrackPoint, number | null>();
	for (const segment of segments) {
		for (const point of segment) speeds.set(point, null);
		for (let index = 1; index < segment.length; index++) {
			const previous = segment[index - 1] as TrackPoint;
			const point = segment[index] as TrackPoint;
			const elapsed = Date.parse(point.occurredAt) - Date.parse(previous.occurredAt);
			if (
				!(elapsed > 0 && elapsed <= 30 * 60_000) ||
				point.sourceId !== previous.sourceId ||
				point.precision === "day" ||
				point.precision === "hour" ||
				previous.precision === "day" ||
				previous.precision === "hour" ||
				Math.abs(point.longitude - previous.longitude) > 180
			)
				continue;
			const kmh = (gpsDistanceMeters(previous, point) / elapsed) * 3600;
			speeds.set(point, kmh);
			// A segment's first point uses its following edge; all later points use the preceding edge.
			if (speeds.get(previous) === null) speeds.set(previous, kmh);
		}
	}
	return speeds;
}

export function nearestTrackPoint(
	anchor: Pick<TrackPoint, "latitude" | "longitude">,
	points: Iterable<TrackPoint>,
): TrackPoint | null {
	let nearest: TrackPoint | null = null;
	let distance = Infinity;
	for (const point of points) {
		const candidate = gpsDistanceMeters(anchor, point);
		if (candidate < distance) {
			nearest = point;
			distance = candidate;
		}
	}
	return nearest;
}
