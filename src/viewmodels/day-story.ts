import { buildDayInsights, type DayInsights } from "../models/day-insights";
import type { DayTimeline, HourSlot, JsonValue, LifeEvent } from "../models/types";
import { formatDurationMinutes, formatInterval, formatLocalClock } from "./format";

export type StoryKind = "sleep" | "health" | "workout" | "journey" | "money" | "note" | "connect";

export interface StoryMetric {
	label: string;
	value: string;
	detail?: string;
}

export interface StoryBranch {
	id: string;
	kind: StoryKind;
	side: "left" | "right";
	title: string;
	period: string | null;
	events: LifeEvent[];
	insights: DayInsights;
	metrics: StoryMetric[];
	heartTrace: string | null;
	fromPreviousDay: boolean;
}

export interface StoryContinuation {
	id: string;
	title: string;
	kind: StoryKind;
	side: "left" | "right";
	anchorHour: number;
}

export interface StoryHour {
	slot: HourSlot;
	branches: StoryBranch[];
	continuing: StoryContinuation[];
	activity: number;
}

export interface DayStory {
	hours: StoryHour[];
	allDay: StoryBranch[];
	mapHour: number | null;
}

function dataObject(value: JsonValue): Record<string, JsonValue> {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function storyKind(event: LifeEvent): StoryKind {
	const data = dataObject(event.data);
	if (typeof data.workoutActivityType === "string") return "workout";
	if (typeof data.type === "string" && data.type.endsWith("SleepAnalysis")) return "sleep";
	if (event.sourceId === "pixiu") return "money";
	if (
		event.sourceId === "footprint" ||
		Array.isArray(data.points) ||
		Array.isArray(data.trackPoints) ||
		((data.latitude !== undefined || data.lat !== undefined) &&
			(data.longitude !== undefined || data.lon !== undefined || data.lng !== undefined))
	)
		return "journey";
	if (
		event.sourceId === "apple-health" ||
		(typeof data.type === "string" && /^HK(?:Quantity|Category)TypeIdentifier/.test(data.type))
	)
		return "health";
	return event.sourceKind === "connect" ? "connect" : "note";
}

function sideFor(kind: StoryKind): "left" | "right" {
	return kind === "health" || kind === "sleep" ? "left" : "right";
}

export function storyDistance(meters: number): string {
	return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function healthMetrics(health: DayInsights["health"]): StoryMetric[] {
	const metrics: StoryMetric[] = [];
	if (health.steps !== null)
		metrics.push({ label: "步数", value: `${Math.round(health.steps)} 步` });
	if (health.heartRate)
		metrics.push({
			label: "心率",
			value: `${Math.round(health.heartRate.average)} bpm`,
			detail: `${Math.round(health.heartRate.min)}–${Math.round(health.heartRate.max)} · ${health.heartRate.samples} 次测量`,
		});
	if (health.sleepMinutes !== null)
		metrics.push({ label: "睡眠", value: formatDurationMinutes(health.sleepMinutes) });
	if (health.distanceMeters !== null)
		metrics.push({ label: "步行距离", value: storyDistance(health.distanceMeters) });
	if (health.energyKcal !== null)
		metrics.push({ label: "活动能量", value: `${Math.round(health.energyKcal)} kcal` });
	if (health.waterMl !== null)
		metrics.push({ label: "饮水", value: `${Math.round(health.waterMl)} ml` });
	if (health.exerciseMinutes !== null)
		metrics.push({ label: "锻炼", value: formatDurationMinutes(health.exerciseMinutes) });
	if (health.standHours !== null)
		metrics.push({ label: "站立", value: formatDurationMinutes(health.standHours * 60) });
	if (health.flights !== null)
		metrics.push({ label: "爬楼", value: `${Math.round(health.flights)} 层` });
	return metrics;
}

/** A compact trace of real heart-rate samples; its adjacent text supplies the numeric alternative. */
export function heartTrace(events: LifeEvent[]): string | null {
	const values = events.flatMap((event) => {
		const data = dataObject(event.data);
		if (
			data.type !== "HKQuantityTypeIdentifierHeartRate" ||
			(data.unit !== "count/min" && data.unit !== "bpm") ||
			(typeof data.value !== "string" && typeof data.value !== "number")
		)
			return [];
		const value = Number(data.value);
		return Number.isFinite(value) && value > 0 ? [value] : [];
	});
	if (values.length < 2) return null;
	let min = Infinity;
	let max = -Infinity;
	for (const value of values) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	// At most 64 displayed vertices; the metric and raw disclosure still cover every sample.
	const count = Math.min(values.length, 64);
	return Array.from({ length: count }, (_, index) => {
		const value = values[Math.round((index * (values.length - 1)) / (count - 1))] as number;
		return `${((index * 120) / (count - 1)).toFixed(1)},${(max === min ? 18 : 30 - ((value - min) / (max - min)) * 24).toFixed(1)}`;
	}).join(" ");
}

function periodFor(events: LifeEvent[]): string | null {
	const first = events[0] as LifeEvent;
	if (first.precision === "day") return null;
	if (events.length === 1) return formatInterval(first);
	const last = events.reduce((latest, event) =>
		(event.endAt ?? event.occurredAt) > (latest.endAt ?? latest.occurredAt) ? event : latest,
	);
	const start = formatLocalClock(first.occurredAt, first.precision);
	const end = formatLocalClock(last.endAt ?? last.occurredAt, last.precision);
	return start === end ? start : `${start} — ${end}`;
}

function groupBranches(events: LifeEvent[], timeline: DayTimeline): StoryBranch[] {
	const groups = new Map<string, LifeEvent[]>();
	for (const event of events) {
		const kind = storyKind(event);
		const grouped = kind === "health" || kind === "sleep" || kind === "journey";
		const id = grouped ? `${kind}:${event.sourceId}` : event.id;
		const group = groups.get(id) ?? [];
		group.push(event);
		groups.set(id, group);
	}
	return [...groups].map(([id, records]) => {
		const event = records[0] as LifeEvent;
		const kind = storyKind(event);
		const insights = buildDayInsights(records, timeline);
		let title = event.title;
		let metrics: StoryMetric[] = [];
		if (kind === "health" || kind === "sleep") {
			title = kind === "sleep" ? "睡眠" : "身体记录";
			metrics = healthMetrics(insights.health);
		} else if (kind === "journey") {
			title =
				records.length > 1 && /^(?:GPS\s*)?轨迹点$/.test(event.title)
					? "这一路的足迹"
					: event.title;
			if (insights.gps.pointCount)
				metrics = [
					{ label: "记录轨迹", value: storyDistance(insights.gps.distanceMeters) },
					{ label: "位置", value: `${insights.gps.pointCount} 个点` },
				];
		} else if (kind === "workout") {
			const workout = insights.workouts[0];
			if (workout) {
				metrics = [{ label: workout.title, value: formatDurationMinutes(workout.durationMinutes) }];
				if (workout.distanceMeters !== null)
					metrics.push({ label: "距离", value: storyDistance(workout.distanceMeters) });
				if (workout.energyKcal !== null)
					metrics.push({ label: "消耗", value: `${Math.round(workout.energyKcal)} kcal` });
			}
		} else if (kind === "money") {
			metrics = insights.finance.flatMap((row) => [
				...(row.income !== 0
					? [{ label: `${row.currency} 收入`, value: row.income.toFixed(2) }]
					: []),
				...(row.expense !== 0
					? [{ label: `${row.currency} 支出`, value: row.expense.toFixed(2) }]
					: []),
				...(row.transfers !== 0
					? [{ label: `${row.currency} 转账`, value: row.transfers.toFixed(2) }]
					: []),
			]);
		}
		return {
			id,
			kind,
			side: sideFor(kind),
			title,
			period: periodFor(records),
			events: records,
			insights,
			metrics,
			heartTrace: kind === "health" ? heartTrace(records) : null,
			fromPreviousDay: event.precision !== "day" && event.occurredAt < timeline.start,
		};
	});
}

/** Project already-selected records; no source query, date reinterpretation or invented event times. */
export function buildDayStory(timeline: DayTimeline, insights: DayInsights): DayStory {
	const firstHour = new Map<string, number>();
	const hours = timeline.hours.map((slot) => {
		const fresh: LifeEvent[] = [];
		const continuing = new Map<string, StoryContinuation>();
		for (const event of slot.events) {
			const anchorHour = firstHour.get(event.id);
			if (anchorHour === undefined) {
				firstHour.set(event.id, slot.hour);
				fresh.push(event);
			} else {
				const kind = storyKind(event);
				const grouped = kind === "sleep" || kind === "health" || kind === "journey";
				const key = grouped ? `${kind}:${event.sourceId}:${anchorHour}` : event.id;
				continuing.set(key, {
					id: event.id,
					title: kind === "sleep" ? "睡眠持续" : kind === "health" ? "身体记录持续" : event.title,
					kind,
					side: sideFor(kind),
					anchorHour,
				});
			}
		}
		return {
			slot,
			branches: groupBranches(fresh, timeline),
			continuing: [...continuing.values()],
			activity: Math.min(1, Math.log2(slot.events.length + 1) / 6),
		};
	});
	let firstPoint: string | null = null;
	for (const segment of insights.gps.segments) {
		for (const point of segment) {
			if (point.precision !== "day" && (firstPoint === null || point.occurredAt < firstPoint))
				firstPoint = point.occurredAt;
		}
	}
	return {
		hours,
		allDay: groupBranches(timeline.allDay, timeline),
		mapHour: firstPoint === null ? null : new Date(firstPoint).getHours(),
	};
}
