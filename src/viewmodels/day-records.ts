import { normalizeTimestamp } from "../models/time";
import type { DayTimeline, JsonValue, LifeEvent } from "../models/types";
import { storyKind } from "./day-story";
import { describeEventData } from "./event-details";
import { formatLocalClock } from "./format";

export type DayRecordKind = "locations" | "records";
type RawValue = number | string | null;

export interface DayRecordRow {
	event: LifeEvent;
	instant: number;
	latitude: RawValue;
	longitude: RawValue;
	elevation: RawValue;
	speed: RawValue;
	course: RawValue;
	pointCount: number | null;
}

function rawValue(value: JsonValue | undefined): RawValue {
	return typeof value === "number" || typeof value === "string" ? value : null;
}

function utcInstant(value: string): number {
	try {
		return Date.parse(normalizeTimestamp(value));
	} catch {
		// Keep malformed historical records inspectable, after records with valid times.
		return Infinity;
	}
}

/** One row per original event; never expand legacy track arrays a second time. */
export function buildDayRecords(timeline: DayTimeline, kind: DayRecordKind): DayRecordRow[] {
	const unique = new Map<string, LifeEvent>();
	for (const events of [timeline.allDay, ...timeline.hours.map((slot) => slot.events)]) {
		for (const event of events) {
			if (!unique.has(event.id)) unique.set(event.id, event);
		}
	}
	return [...unique.values()]
		.filter((event) => (storyKind(event) === "journey") === (kind === "locations"))
		.map((event) => {
			const data =
				event.data && typeof event.data === "object" && !Array.isArray(event.data)
					? event.data
					: {};
			const points = Array.isArray(data.points)
				? data.points
				: Array.isArray(data.trackPoints)
					? data.trackPoints
					: null;
			return {
				event,
				instant: utcInstant(event.occurredAt),
				latitude: rawValue(data.latitude ?? data.lat),
				longitude: rawValue(data.longitude ?? data.lon ?? data.lng),
				elevation: rawValue(data.elevation ?? data.ele),
				speed: rawValue(data.speed),
				course: rawValue(data.course),
				pointCount: points?.length ?? null,
			};
		})
		.sort((a, b) => a.instant - b.instant || a.event.id.localeCompare(b.event.id));
}

/** Clocks are presented locally; the original event remains untouched for inspection. */
export function dayRecordTime(row: DayRecordRow): string {
	if (row.event.precision === "day") return "全天";
	if (!Number.isFinite(row.instant)) return row.event.occurredAt;
	return formatLocalClock(new Date(row.instant).toISOString(), row.event.precision) as string;
}

export function dayRecordSummary(event: LifeEvent): string {
	const text =
		event.content.trim() ||
		describeEventData(event)
			.slice(0, 3)
			.map((row) => `${row.term}：${row.value}`)
			.join(" · ");
	return text.length > 180 ? `${text.slice(0, 180)}…` : text || "—";
}
