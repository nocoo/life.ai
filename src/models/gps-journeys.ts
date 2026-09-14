import { type DayInsights, gpsDistanceMeters, type TrackPoint, unionMinutes } from "./day-insights";
import { matchNamedPlace, type NamedPlace } from "./general-settings";

export type TravelMode = "walk" | "cycle" | "vehicle" | "rail" | "unknown";
export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
	walk: "可能步行",
	cycle: "可能骑行",
	vehicle: "可能乘车",
	rail: "可能高铁 / 城际列车",
	unknown: "移动方式待判断",
};
export interface GpsJourney {
	id: string;
	startAt: string;
	endAt: string;
	sourceName: string;
	startPoint: TrackPoint;
	endPoint: TrackPoint;
	distanceMeters: number;
	movingMinutes: number;
	stoppedMinutes: number;
	averageKmh: number;
	fastKmh: number;
	mode: TravelMode;
	modeReason: string;
	startPlace: string | null;
	endPlace: string | null;
	pointsOfInterest: { label: string; at: string }[];
	commute: "outbound" | "return" | null;
	commuteReason: string | null;
}

const MAX_GAP_MS = 5 * 60000;
const MAX_STOP_MS = 5 * 60000;
const SAMPLE_MS = 30000;
const STOP_KMH = 2;
interface Edge {
	from: TrackPoint;
	to: TrackPoint;
	ms: number;
	meters: number;
	kmh: number;
}

function usable(point: TrackPoint): boolean {
	return (
		(point.precision === "second" || point.precision === "minute") &&
		Number.isFinite(Date.parse(point.occurredAt)) &&
		Number.isFinite(point.latitude) &&
		Number.isFinite(point.longitude) &&
		Math.abs(point.latitude) <= 90 &&
		Math.abs(point.longitude) <= 180
	);
}

/** Reduce sub-minute jitter while preserving every native boundary and recording gap. */
function sampledSegments(segments: TrackPoint[][]): TrackPoint[][] {
	const result: TrackPoint[][] = [];
	for (const native of segments) {
		let sampled: TrackPoint[] = [];
		let previous: TrackPoint | undefined;
		const finish = () => {
			if (previous && sampled.at(-1) !== previous) sampled.push(previous);
			if (sampled.length > 1) result.push(sampled);
			sampled = [];
		};
		for (const point of native) {
			const gap = previous ? Date.parse(point.occurredAt) - Date.parse(previous.occurredAt) : 0;
			if (!usable(point)) {
				finish();
				previous = undefined;
				continue;
			}
			if (
				previous &&
				(gap <= 0 ||
					gap > MAX_GAP_MS ||
					point.breakBefore ||
					point.sourceId !== previous.sourceId ||
					Math.abs(point.longitude - previous.longitude) > 180)
			)
				finish();
			const last = sampled.at(-1);
			if (!last || Date.parse(point.occurredAt) - Date.parse(last.occurredAt) >= SAMPLE_MS)
				sampled.push(point);
			previous = point;
		}
		finish();
	}
	return result;
}

function weightedFastSpeed(edges: Edge[], movingMs: number): number {
	let duration = 0;
	for (const edge of [...edges].sort((a, b) => a.kmh - b.kmh)) {
		duration += edge.ms;
		if (duration >= movingMs * 0.85) return edge.kmh;
	}
	return 0;
}

function inferMode(
	average: number,
	fast: number,
	edges: Edge[],
	distance: number,
): { mode: TravelMode; reason: string } {
	const minutes = edges.reduce((sum, edge) => sum + edge.ms, 0) / 60000;
	if (edges.length < 3 || minutes < 2)
		return { mode: "unknown", reason: "连续采样较少，速度不足以判断交通方式。" };
	if (fast > 380)
		return { mode: "unknown", reason: "速度超出常见地面出行范围，需要其他记录佐证。" };
	const fastMinutes =
		edges.filter((edge) => edge.kmh >= 160).reduce((sum, edge) => sum + edge.ms, 0) / 60000;
	if (fast >= 160 && fastMinutes >= 3 && distance >= 15000)
		return {
			mode: "rail",
			reason: "有持续高速移动和较长距离，符合高铁或城际列车特征，尚未与铁路线路匹配。",
		};
	if (average <= 8 && fast <= 12)
		return { mode: "walk", reason: "移动均速与大部分采样落在步行范围，也可能包含慢跑。" };
	if (average <= 25 && fast <= 35)
		return {
			mode: "cycle",
			reason: "速度介于步行与常见机动车之间，也可能是跑步、电动车或慢速车辆。",
		};
	return {
		mode: "vehicle",
		reason: "速度符合乘车出行；仅凭 GPS 无法区分汽车、公交、地铁或是否本人驾驶。",
	};
}

function makeJourney(edges: Edge[], places: readonly NamedPlace[]): GpsJourney | null {
	const first = edges[0],
		last = edges.at(-1);
	const moving = edges.filter((edge) => edge.kmh >= STOP_KMH);
	const meters = moving.reduce((sum, edge) => sum + edge.meters, 0);
	const movingMs = moving.reduce((sum, edge) => sum + edge.ms, 0);
	if (!first || !last || moving.length < 2 || meters < 150 || movingMs < 60000) return null;
	// A wandering fix within a small area is not a journey, even if its path accumulates distance.
	if (!edges.some((edge) => gpsDistanceMeters(first.from, edge.to) >= 100)) return null;
	const average = (meters / movingMs) * 3600;
	const fast = weightedFastSpeed(moving, movingMs);
	const mode = inferMode(average, fast, moving, meters);
	const pois = new Map<string, { label: string; at: string }>();
	for (const point of [first.from, ...edges.map((edge) => edge.to)]) {
		const named = matchNamedPlace(point, places);
		if (named && !pois.has(named.id))
			pois.set(named.id, { label: named.label, at: point.occurredAt });
	}
	return {
		id: `journey:${first.from.sourceId}:${first.from.occurredAt}:${last.to.occurredAt}`,
		startAt: first.from.occurredAt,
		endAt: last.to.occurredAt,
		sourceName: first.from.sourceName,
		startPoint: first.from,
		endPoint: last.to,
		distanceMeters: meters,
		movingMinutes: movingMs / 60000,
		stoppedMinutes:
			edges.filter((edge) => edge.kmh < STOP_KMH).reduce((sum, edge) => sum + edge.ms, 0) / 60000,
		averageKmh: average,
		fastKmh: fast,
		mode: mode.mode,
		modeReason: mode.reason,
		startPlace: matchNamedPlace(first.from, places)?.label ?? null,
		endPlace: matchNamedPlace(last.to, places)?.label ?? null,
		pointsOfInterest: [...pois.values()],
		commute: null,
		commuteReason: null,
	};
}

function placeRole(label: string | null): "home" | "work" | null {
	if (!label) return null;
	if (/(?:公司|办公室|工作室|单位|工作地|\boffice\b|\bwork\b)/i.test(label)) return "work";
	if (/(?:^家$|的家$|家里$|住所|住处|\bhome\b)/i.test(label)) return "home";
	return null;
}

function identifyCommutes(journeys: GpsJourney[], gps: DayInsights["gps"]): void {
	for (const journey of journeys) {
		const from = placeRole(journey.startPlace),
			to = placeRole(journey.endPlace);
		if ((from === "home" && to === "work") || (from === "work" && to === "home")) {
			journey.commute = from === "home" ? "outbound" : "return";
			journey.commuteReason =
				"路线连接用户命名的住所与工作地点，推测为通勤；范围采样不等同进入建筑。";
		}
	}
	// A same-day return with a substantial intervening stay is only a commute candidate.
	// Explicit non-work destinations are not reclassified from their time of day.
	for (let index = 0; index + 1 < journeys.length; index++) {
		const outward = journeys[index],
			back = journeys[index + 1];
		if (!outward || !back || outward.commute || back.commute || outward.endPlace || back.startPlace)
			continue;
		const stayMinutes = (Date.parse(back.startAt) - Date.parse(outward.endAt)) / 60000;
		if (
			stayMinutes < 90 ||
			stayMinutes > 16 * 60 ||
			outward.movingMinutes > 240 ||
			back.movingMinutes > 240 ||
			gpsDistanceMeters(outward.startPoint, outward.endPoint) < 500 ||
			gpsDistanceMeters(outward.endPoint, back.startPoint) > 300 ||
			gpsDistanceMeters(outward.startPoint, back.endPoint) > 300
		)
			continue;
		const observed: [number, number][] = [];
		for (const segment of gps.segments) {
			for (let pointIndex = 1; pointIndex < segment.length; pointIndex++) {
				const from = segment[pointIndex - 1],
					to = segment[pointIndex];
				if (
					!from ||
					!to ||
					!usable(from) ||
					!usable(to) ||
					to.breakBefore ||
					from.sourceId !== to.sourceId
				)
					continue;
				const start = Date.parse(from.occurredAt),
					end = Date.parse(to.occurredAt);
				if (
					start >= Date.parse(outward.endAt) &&
					end <= Date.parse(back.startAt) &&
					end > start &&
					end - start <= MAX_GAP_MS &&
					gpsDistanceMeters(from, outward.endPoint) <= 300 &&
					gpsDistanceMeters(to, outward.endPoint) <= 300
				)
					observed.push([start, end]);
			}
		}
		const observedMinutes = unionMinutes(observed);
		if (observedMinutes < 30) continue;
		outward.commute = "outbound";
		back.commute = "return";
		outward.commuteReason =
			back.commuteReason = `同日沿相近起终点往返，间隔约 ${Math.round(stayMinutes)} 分钟，目的地附近实际采样覆盖约 ${Math.round(observedMinutes)} 分钟；可能是通勤，也可能是办事或探访，未确认工作地点。`;
	}
}

/** Ground movement from observed edges only. Gaps or stops longer than five minutes split journeys. */
export function buildGpsJourneys(
	gps: DayInsights["gps"],
	places: readonly NamedPlace[] = [],
): GpsJourney[] {
	const journeys: GpsJourney[] = [];
	for (const segment of sampledSegments(gps.segments)) {
		let edges: Edge[] = [],
			pending: Edge[] = [];
		let stopMs = 0;
		const finish = () => {
			const journey = makeJourney(edges, places);
			if (journey) journeys.push(journey);
			edges = [];
			pending = [];
			stopMs = 0;
		};
		for (let index = 1; index < segment.length; index++) {
			const from = segment[index - 1],
				to = segment[index];
			if (!from || !to) continue;
			const ms = Date.parse(to.occurredAt) - Date.parse(from.occurredAt);
			const meters = gpsDistanceMeters(from, to),
				kmh = (meters / ms) * 3600;
			if (ms <= 0 || ms > MAX_GAP_MS || kmh > 450) {
				finish();
				continue;
			}
			const edge = { from, to, ms, meters, kmh };
			if (kmh < STOP_KMH) {
				if (edges.length) {
					pending.push(edge);
					stopMs += ms;
					if (stopMs > MAX_STOP_MS) finish();
				}
			} else {
				edges.push(...pending, edge);
				pending = [];
				stopMs = 0;
			}
		}
		finish();
	}
	journeys.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
	identifyCommutes(journeys, gps);
	return journeys;
}
