import type { DayInsights } from "./day-insights";
import type { HealthStory } from "./health-insights";
import { normalizeTimestamp } from "./time";
import type { LifeEvent } from "./types";

export interface QuantitySample {
	start: number;
	end: number;
	value: number;
	priority: number;
	source: string;
	createdAt: number;
	id: string;
}

/** Exported HealthKit source ordering is unavailable. Use an explicit, reproducible wearable-first policy. */
export function quantitySample(event: LifeEvent, value: number): QuantitySample {
	const data =
		event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
	const source = typeof data.sourceName === "string" ? data.sourceName : event.sourceName;
	const device = typeof data.device === "string" ? data.device : "";
	const identity = `${source} ${device}`;
	let createdAt = 0;
	if (typeof data.creationDate === "string") {
		try {
			createdAt = Date.parse(normalizeTimestamp(data.creationDate));
		} catch {
			/* Missing provenance does not invalidate the measurement. */
		}
	}
	return {
		start: Date.parse(event.occurredAt),
		end: Date.parse(event.endAt ?? event.occurredAt),
		value,
		priority: /watch|手表/i.test(identity) ? 3 : /iphone|手机/i.test(identity) ? 2 : 1,
		source: `${source}\0${device}`,
		createdAt,
		id: event.id,
	};
}

function preferred(a: QuantitySample, b: QuantitySample): number {
	return (
		b.priority - a.priority ||
		a.source.localeCompare(b.source) ||
		a.end - a.start - (b.end - b.start) ||
		b.createdAt - a.createdAt ||
		a.id.localeCompare(b.id)
	);
}

/** Integrate the best available sample rate over each UTC interval, filling wearable gaps from other sources. */
export function sumSensorQuantity(
	samples: QuantitySample[],
	window: { start: string; end: string },
): number | null {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
	const boundaries = new Map<
		number,
		{ starts: QuantitySample[]; ends: QuantitySample[]; points: QuantitySample[] }
	>();
	const at = (time: number) => {
		let entry = boundaries.get(time);
		if (!entry) {
			entry = { starts: [], ends: [], points: [] };
			boundaries.set(time, entry);
		}
		return entry;
	};
	for (const sample of samples) {
		if (
			!Number.isFinite(sample.value) ||
			sample.value < 0 ||
			!Number.isFinite(sample.start) ||
			!Number.isFinite(sample.end) ||
			sample.end < sample.start ||
			sample.start >= end ||
			sample.end < start
		)
			continue;
		if (sample.end === sample.start) {
			if (sample.start >= start) at(sample.start).points.push(sample);
		} else if (sample.end > start) {
			at(Math.max(sample.start, start)).starts.push(sample);
			at(Math.min(sample.end, end)).ends.push(sample);
		}
	}
	if (!boundaries.size) return null;
	const active = new Set<QuantitySample>();
	let total = 0;
	let previous = start;
	const best = () => {
		let selected: QuantitySample | undefined;
		for (const sample of active)
			if (!selected || preferred(sample, selected) < 0) selected = sample;
		return selected;
	};
	for (const [time, change] of [...boundaries].sort(([a], [b]) => a - b)) {
		const sample = best();
		if (sample) total += (sample.value * (time - previous)) / (sample.end - sample.start);
		for (const item of change.ends) active.delete(item);
		for (const item of change.starts) active.add(item);
		const point = change.points.sort(preferred)[0];
		if (point) {
			const interval = best();
			if (!interval || point.priority > interval.priority) total += point.value;
		}
		previous = time;
	}
	return total;
}

/** Display waking-day sleep and deduplicated workouts consistently in cards and AI evidence. */
export function applyHealthStoryInsights(insights: DayInsights, health: HealthStory): DayInsights {
	if (health.nights.length) {
		insights.health.sleepMinutes = health.nights.reduce(
			(sum, night) => sum + night.asleepMinutes,
			0,
		);
		const stages = new Map<string, number>();
		for (const night of health.nights)
			for (const stage of night.stages)
				if (stage.kind !== "awake" && stage.kind !== "inBed")
					stages.set(stage.label, (stages.get(stage.label) ?? 0) + stage.minutes);
		insights.health.sleepStages = [...stages].map(([name, minutes]) => ({ name, minutes }));
	}
	if (health.workouts.length) {
		insights.workoutCount = health.workouts.length;
		insights.workouts = health.workouts.map(({ canonical: workout }) => ({
			id: workout.id,
			title: workout.title,
			occurredAt: workout.startAt,
			endAt: workout.endAt,
			precision: "second",
			durationMinutes: workout.durationMinutes,
			distanceMeters: workout.distanceMeters,
			energyKcal: workout.energyKcal,
		}));
	}
	return insights;
}
