import { healthFilePath } from "../models/apple-health";
import {
	buildDayInsights,
	type DayInsights,
	gpsDistanceMeters,
	type TrackPoint,
} from "../models/day-insights";
import type {
	BloodPressureReading,
	EcgRecording,
	HealthMoment,
	HealthStory,
	SleepNight,
	WorkoutGroup,
} from "../models/health-insights";
import type { SleepLocation } from "../models/health-location";
import type { DayTimeline, LifeEvent } from "../models/types";
import { buildDayStory } from "./day-story";
import { describeJsonData, type EventDetailRow } from "./event-details";
import { healthDimensionLabel, healthRecordSource } from "./health-format";

type MomentBase = { id: string; occurredAt: string };
export type HealthTimelineItem = MomentBase &
	(
		| { kind: "sleep"; night: SleepNight; map: DayInsights | null; location?: SleepLocation }
		| {
				kind: "workout";
				group: WorkoutGroup;
				map: DayInsights;
				routePaths: string[];
				start: string;
				end: string;
		  }
		| { kind: "ecg"; ecg: EcgRecording }
		| { kind: "pressure"; reading: BloodPressureReading }
		| { kind: "moment"; moment: HealthMoment }
		| { kind: "observation"; event: LifeEvent; title: string; details: EventDetailRow[] }
		| { kind: "bedtime"; title: string }
	);

export function routeMapInsights(
	base: DayInsights,
	segments: TrackPoint[][],
	start: string,
	end: string,
): DayInsights {
	const from = Date.parse(start);
	const until = Date.parse(end);
	const clipped: TrackPoint[][] = [];
	for (const original of segments) {
		let segment: TrackPoint[] | null = null;
		for (const point of original) {
			const at = Date.parse(point.occurredAt);
			if (at < from || at >= until) {
				segment = null;
				continue;
			}
			const previous = segment?.at(-1);
			const gap = previous ? at - Date.parse(previous.occurredAt) : Infinity;
			if (
				!segment ||
				point.breakBefore ||
				gap <= 0 ||
				gap > 30 * 60_000 ||
				(previous && Math.abs(previous.longitude - point.longitude) > 180)
			) {
				segment = [];
				clipped.push(segment);
			}
			segment.push(point);
		}
	}
	let distanceMeters = 0;
	let pointCount = 0;
	let firstAt: string | null = null;
	let lastAt: string | null = null;
	for (const segment of clipped)
		for (const [index, point] of segment.entries()) {
			pointCount++;
			if (!firstAt || point.occurredAt < firstAt) firstAt = point.occurredAt;
			if (!lastAt || point.occurredAt > lastAt) lastAt = point.occurredAt;
			if (index > 0) distanceMeters += gpsDistanceMeters(segment[index - 1] as TrackPoint, point);
		}
	return { ...base, gps: { pointCount, segments: clipped, firstAt, lastAt, distanceMeters } };
}

function routePaths(group: WorkoutGroup): string[] {
	for (const workout of [group.canonical, ...group.duplicates]) {
		// Apple exports use root-relative FileReference paths; HTTP file reads use normalized archive paths.
		const paths = workout.routePaths.map((path) =>
			healthFilePath(path.replace(/^\//, "").replace(/^\.\//, "")),
		);
		if (paths.length) return [...new Set(paths)];
	}
	return [];
}

/** Keep the full original timeline for tables, and build only meaningful health cards in the reading tree. */
export function buildHealthTimeline(
	timeline: DayTimeline,
	insights: DayInsights,
	health: HealthStory,
	events: LifeEvent[],
	radiusKm: 5 | 10,
	locations: Record<string, SleepLocation> = {},
) {
	const start = Date.parse(timeline.start);
	const end = Date.parse(timeline.end);
	const items: HealthTimelineItem[] = [];
	for (const bedtime of health.bedtimes) items.push({ kind: "bedtime", ...bedtime });
	for (const night of health.nights) {
		const nightWindow = {
			start: new Date(Date.parse(night.fellAsleepAt) - 45 * 60_000).toISOString(),
			end: new Date(Date.parse(night.wokeAt) + 15 * 60_000).toISOString(),
		};
		const map = night.place
			? buildDayInsights(
					events.filter((event) => event.sourceId === "footprint"),
					nightWindow,
				)
			: null;
		items.push({
			kind: "sleep",
			id: night.id,
			occurredAt: night.wokeAt,
			night,
			map,
			location: locations[night.id],
		});
	}
	for (const group of health.workouts) {
		const from = new Date(Math.max(start, Date.parse(group.canonical.startAt))).toISOString();
		const until = new Date(
			Math.min(end, Date.parse(group.canonical.endAt ?? group.canonical.startAt) + 1),
		).toISOString();
		items.push({
			kind: "workout",
			id: group.id,
			occurredAt: from,
			group,
			map: routeMapInsights(insights, insights.gps.segments, from, until),
			routePaths: routePaths(group),
			start: from,
			end: until,
		});
	}
	for (const ecg of health.ecg)
		items.push({ kind: "ecg", id: ecg.id, occurredAt: ecg.occurredAt, ecg });
	for (const reading of health.bloodPressure)
		items.push({ kind: "pressure", id: reading.id, occurredAt: reading.occurredAt, reading });
	for (const moment of health.moments)
		items.push({ kind: "moment", id: moment.id, occurredAt: moment.occurredAt, moment });
	const rare =
		/(?:BodyMass|VO2Max|HighHeartRateEvent|LowHeartRateEvent|IrregularHeartRhythmEvent|LowCardioFitnessEvent|AudioExposureEvent|HeadphoneAudioExposureEvent)$/;
	for (const event of events) {
		const data =
			event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
		if (
			event.sourceId === "apple-health" &&
			event.precision !== "day" &&
			typeof data.type === "string" &&
			rare.test(data.type)
		)
			items.push({
				kind: "observation",
				id: event.id,
				occurredAt: event.occurredAt,
				event,
				title: healthDimensionLabel(data.type),
				details: describeJsonData({
					...(data.value != null ? { value: data.value } : {}),
					...(data.unit ? { unit: data.unit } : {}),
					sourceName: healthRecordSource(event),
				}),
			});
	}
	const remaining: DayTimeline = {
		...timeline,
		hours: timeline.hours.map((slot) => ({
			...slot,
			events: slot.events.filter((event) => event.sourceId !== "apple-health"),
		})),
		allDay: timeline.allDay,
	};
	const excluded = items.flatMap((item) =>
		item.kind === "workout" && (item.map.gps.pointCount || item.routePaths.length)
			? [{ start: Date.parse(item.start), end: Date.parse(item.end) }]
			: [],
	);
	const story = buildDayStory(remaining, insights, radiusKm, excluded);
	for (const item of items) {
		const at = Date.parse(item.occurredAt);
		if (at < start || at >= end) continue;
		const row = story.hours[new Date(at).getHours()];
		if (!row) continue;
		row.health ??= [];
		row.health.push(item);
		row.activity = Math.max(row.activity, 0.5);
		if (item.kind === "sleep") {
			const asleep = Date.parse(item.night.fellAsleepAt);
			for (const previous of story.hours)
				if (
					previous !== row &&
					previous.slot.instants.some((instant) => instant >= asleep && instant < at)
				)
					previous.continuing.push({
						id: item.id,
						title: "睡眠中 · 查看这一夜",
						kind: "sleep",
						side: "left",
						anchorHour: row.slot.hour,
					});
		}
	}
	return story;
}
