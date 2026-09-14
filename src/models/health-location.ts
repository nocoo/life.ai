import { gpsDistanceMeters } from "./day-insights";
import type { FootprintDay } from "./footprint";
import type { SleepNight } from "./health-insights";
import { localDateKey } from "./time";

export interface SleepLocation {
	kind: "residence" | "familiar" | "travel" | "unknown";
	label: string;
	detail: string;
	matchedNights: number;
	observedNights: number;
}

/** A conservative suggestion from repeated overnight GPS, never a place-of-business lookup. */
export function interpretSleepLocation(night: SleepNight, days: FootprintDay[]): SleepLocation {
	const unknown: SleepLocation = {
		kind: "unknown",
		label: "这一夜的停留地",
		detail: "现有轨迹不足以判断住所或临时住宿。",
		matchedNights: 0,
		observedNights: 0,
	};
	if (!night.place) return unknown;
	const nightStart = Date.parse(night.fellAsleepAt);
	const samples = new Map<string, { latitude: number; longitude: number; at: number }[]>();
	for (const day of days)
		for (const [offset, latitude, longitude] of day.data.points) {
			const at = day.utcDay + offset * 1000;
			if (at >= nightStart || at < nightStart - 31 * 86_400_000) continue;
			const date = new Date(at);
			// Midnight to 06:00 is a consistent baseline; daytime naps do not redefine home.
			if (date.getHours() >= 6) continue;
			const key = localDateKey(date);
			const list = samples.get(key) ?? [];
			list.push({ latitude, longitude, at });
			samples.set(key, list);
		}
	const clusters: { latitude: number; longitude: number; dates: string[] }[] = [];
	for (const [date, points] of samples) {
		if (points.length < 2) continue;
		const first = points[0];
		if (!first) continue;
		let earliest = Infinity;
		let latest = -Infinity;
		for (const point of points) {
			earliest = Math.min(earliest, point.at);
			latest = Math.max(latest, point.at);
		}
		if (
			latest - earliest < 90 * 60_000 ||
			points.some((point) => gpsDistanceMeters(first, point) > 500)
		)
			continue;
		const cluster = clusters.find((candidate) => gpsDistanceMeters(candidate, first) <= 500);
		if (cluster) cluster.dates.push(date);
		else clusters.push({ latitude: first.latitude, longitude: first.longitude, dates: [date] });
	}
	clusters.sort((a, b) => b.dates.length - a.dates.length);
	const observedNights = clusters.reduce((sum, cluster) => sum + cluster.dates.length, 0);
	const matched = clusters.find(
		(cluster) => gpsDistanceMeters(cluster, night.place as NonNullable<SleepNight["place"]>) <= 500,
	);
	const matchedNights = matched?.dates.length ?? 0;
	const main = clusters[0];
	if (!main) return unknown;
	const dates = [...main.dates].sort();
	const span = Date.parse(dates.at(-1) as string) - Date.parse(dates[0] as string);
	const established =
		main.dates.length >= 5 && main.dates.length / observedNights >= 0.6 && span >= 7 * 86_400_000;
	if (established && matched === main)
		return {
			kind: "residence",
			label: "可能在常住地",
			detail: `近一个月有 ${observedNights} 夜的有效轨迹，其中 ${matchedNights} 夜停留在附近 500 米内。`,
			matchedNights,
			observedNights,
		};
	const distance = gpsDistanceMeters(main, night.place);
	if (established && distance >= 50_000 && matchedNights <= 4)
		return {
			kind: "travel",
			label: "可能在旅途中住宿",
			detail: `距主要夜间停留地约 ${Math.round(distance / 1000)} 公里，可能是酒店或临时住所；地点性质尚未确认。`,
			matchedNights,
			observedNights,
		};
	if (matchedNights >= 3)
		return {
			kind: "familiar",
			label: "熟悉的夜间停留地",
			detail: `近一个月另有 ${matchedNights} 夜停留在附近，尚不足以确定是否为家。`,
			matchedNights,
			observedNights,
		};
	return { ...unknown, matchedNights, observedNights };
}
