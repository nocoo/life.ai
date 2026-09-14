import { createFinanceCollector } from "./finance";
import { type QuantitySample, quantitySample, sumSensorQuantity } from "./health-quantities";
import { normalizeTimestamp } from "./time";
import type { JsonValue, LifeEvent, Precision } from "./types";

export interface TrackPoint {
	latitude: number;
	longitude: number;
	occurredAt: string;
	precision: Precision;
	sourceId: string;
	sourceName: string;
	elevation: number | null;
	speed: number | null;
	/** A native GPX segment boundary, independent of the gap between samples. */
	breakBefore?: boolean;
}

export interface DailyWorkout {
	id: string;
	title: string;
	occurredAt: string;
	endAt: string | null;
	precision: Precision;
	durationMinutes: number;
	distanceMeters: number | null;
	energyKcal: number | null;
}

export interface DayInsights {
	eventCount: number;
	gps: {
		pointCount: number;
		segments: TrackPoint[][];
		distanceMeters: number;
		firstAt: string | null;
		lastAt: string | null;
	};
	health: {
		steps: number | null;
		distanceMeters: number | null;
		flights: number | null;
		waterMl: number | null;
		energyKcal: number | null;
		exerciseMinutes: number | null;
		standHours: number | null;
		sleepMinutes: number | null;
		sleepStages: { name: string; minutes: number }[];
		heartRate: { average: number; min: number; max: number; samples: number } | null;
	};
	workoutCount: number;
	workouts: DailyWorkout[];
	finance: {
		currency: string;
		income: number;
		expense: number;
		transfers: number;
		count: number;
	}[];
}

type Data = Record<string, JsonValue>;
type Window = { start: string; end: string };
type Interval = [number, number];

function object(value: JsonValue | undefined): Data {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numeric(value: JsonValue | undefined): number | null {
	if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function quantity(
	value: JsonValue | undefined,
	unit: JsonValue | undefined,
	units: Record<string, number>,
): number | null {
	const number = numeric(value);
	const multiplier = typeof unit === "string" ? units[unit] : undefined;
	return number !== null && number >= 0 && multiplier !== undefined ? number * multiplier : null;
}

function portion(value: number | null, ratio: number): number | null {
	return value === null ? null : value * ratio;
}

const DISTANCE_UNITS = { m: 1, km: 1000, mi: 1609.344 };
const ENERGY_UNITS = { kcal: 1, kJ: 1 / 4.184, Cal: 1 };
const MINUTE_UNITS = { min: 1, s: 1 / 60, hr: 60, h: 60 };
const WORKOUT_NAMES: Record<string, string> = {
	Walking: "步行",
	Running: "跑步",
	Cycling: "骑行",
	Swimming: "游泳",
	TraditionalStrengthTraining: "力量训练",
	FunctionalStrengthTraining: "功能训练",
	Yoga: "瑜伽",
	Hiking: "徒步",
	Other: "其他运动",
};
const SLEEP_STAGES: Record<string, string> = {
	"1": "未分期",
	"3": "核心",
	"4": "深睡",
	"5": "REM",
	HKCategoryValueSleepAnalysisAsleep: "未分期",
	HKCategoryValueSleepAnalysisAsleepUnspecified: "未分期",
	HKCategoryValueSleepAnalysisAsleepCore: "核心",
	HKCategoryValueSleepAnalysisAsleepDeep: "深睡",
	HKCategoryValueSleepAnalysisAsleepREM: "REM",
};

export function unionMinutes(intervals: Interval[]): number {
	let total = 0;
	let right = -Infinity;
	for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
		total += Math.max(0, end - Math.max(start, right));
		right = Math.max(right, end);
	}
	return total / 60_000;
}

export function gpsDistanceMeters(
	a: Pick<TrackPoint, "latitude" | "longitude">,
	b: Pick<TrackPoint, "latitude" | "longitude">,
): number {
	const radians = Math.PI / 180;
	const latitude = Math.sin(((b.latitude - a.latitude) * radians) / 2) ** 2;
	const longitude = Math.sin(((b.longitude - a.longitude) * radians) / 2) ** 2;
	const chord =
		latitude + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * longitude;
	return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, chord)));
}

/** Feed unique events in UTC order. The Worker can aggregate pages without retaining raw records. */
export function createDayInsightsCollector(window: Window, retainTrackPoints = false) {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	const finances = createFinanceCollector();
	const result: DayInsights = {
		eventCount: 0,
		gps: { pointCount: 0, segments: [], distanceMeters: 0, firstAt: null, lastAt: null },
		health: {
			steps: null,
			distanceMeters: null,
			flights: null,
			waterMl: null,
			energyKcal: null,
			exerciseMinutes: null,
			standHours: null,
			sleepMinutes: null,
			sleepStages: [],
			heartRate: null,
		},
		workoutCount: 0,
		workouts: [],
		finance: [],
	};
	const lastPoints = new Map<string, { point: TrackPoint; segment: TrackPoint[] }>();
	const sleep = new Map<string, Interval[]>();
	const stand: Interval[] = [];
	let heartTotal = 0;
	let activity: Data = {};
	const sensorQuantities = new Map<
		"steps" | "distanceMeters" | "flights" | "energyKcal" | "exerciseMinutes",
		QuantitySample[]
	>();
	const addQuantity = (
		key: "steps" | "distanceMeters" | "flights" | "waterMl" | "energyKcal" | "exerciseMinutes",
		value: number | null,
		ratio: number,
		event: LifeEvent,
	) => {
		if (value === null) return;
		if (key === "waterMl") result.health.waterMl = (result.health.waterMl ?? 0) + value * ratio;
		else {
			const samples = sensorQuantities.get(key) ?? [];
			samples.push(quantitySample(event, value));
			sensorQuantities.set(key, samples);
		}
	};

	const addPoint = (data: Data, event: LifeEvent) => {
		const latitude = numeric(data.latitude ?? data.lat);
		const longitude = numeric(data.longitude ?? data.lon ?? data.lng);
		if (
			latitude === null ||
			longitude === null ||
			Math.abs(latitude) > 90 ||
			Math.abs(longitude) > 180
		)
			return;
		const rawTime = data.time ?? data.ts ?? data.timestamp ?? data.occurredAt;
		let occurredAt: string;
		try {
			occurredAt = normalizeTimestamp(typeof rawTime === "string" ? rawTime : event.occurredAt);
		} catch {
			return;
		}
		const instant = Date.parse(occurredAt);
		if (instant < start || instant >= end) return;
		const speed = numeric(data.speed);
		const point: TrackPoint = {
			latitude,
			longitude,
			occurredAt,
			sourceId: event.sourceId,
			sourceName: event.sourceName,
			precision:
				typeof rawTime === "string"
					? /^\d{4}-\d{2}-\d{2}$/.test(rawTime.trim())
						? "day"
						: /[T ]\d{2}:\d{2}:\d{2}/.test(rawTime)
							? "second"
							: /[T ]\d{2}:\d{2}/.test(rawTime)
								? "minute"
								: "hour"
					: event.precision,
			elevation: numeric(data.elevation ?? data.ele),
			speed: speed !== null && speed >= 0 ? speed : null,
		};
		const previous = lastPoints.get(event.sourceId);
		const gap = previous ? instant - Date.parse(previous.point.occurredAt) : Infinity;
		// GPX gaps are separate paths: never invent travel through unrecorded periods or across the date line.
		const connected =
			previous &&
			data.breakBefore !== true &&
			point.precision !== "day" &&
			previous.point.precision !== "day" &&
			gap > 0 &&
			gap <= 30 * 60_000 &&
			Math.abs(previous.point.longitude - longitude) <= 180;
		const segment = connected ? previous.segment : [];
		if (connected) result.gps.distanceMeters += gpsDistanceMeters(previous.point, point);
		if (retainTrackPoints) {
			if (!connected) result.gps.segments.push(segment);
			segment.push(point);
		}
		lastPoints.set(event.sourceId, { point, segment });
		result.gps.pointCount++;
		result.gps.firstAt =
			result.gps.firstAt === null || occurredAt < result.gps.firstAt
				? occurredAt
				: result.gps.firstAt;
		result.gps.lastAt =
			result.gps.lastAt === null || occurredAt > result.gps.lastAt ? occurredAt : result.gps.lastAt;
	};

	return {
		add(event: LifeEvent) {
			const eventStart = Date.parse(event.occurredAt);
			const eventEnd = event.endAt ? Date.parse(event.endAt) : eventStart;
			if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) return;
			if (
				event.precision === "day"
					? eventStart < start || eventStart >= end
					: eventStart >= end || Math.max(eventEnd, eventStart + 1) <= start
			)
				return;
			result.eventCount++;
			const data = object(event.data);
			const interval: Interval = [Math.max(start, eventStart), Math.min(end, eventEnd)];
			const durationMinutes = Math.max(0, interval[1] - interval[0]) / 60_000;
			const ratio =
				event.precision !== "day" && eventEnd > eventStart
					? (durationMinutes * 60_000) / (eventEnd - eventStart)
					: 1;
			const points = data.points ?? data.trackPoints;
			if (Array.isArray(points)) {
				for (const point of points) addPoint(object(point), event);
			} else addPoint(data, event);

			const type =
				typeof data.type === "string"
					? data.type.replace(/^HK(?:Quantity|Category)TypeIdentifier/, "")
					: "";
			const value = data.value;
			if (type === "StepCount")
				addQuantity("steps", quantity(value, data.unit, { count: 1 }), ratio, event);
			if (type === "DistanceWalkingRunning")
				addQuantity("distanceMeters", quantity(value, data.unit, DISTANCE_UNITS), ratio, event);
			if (type === "FlightsClimbed")
				addQuantity("flights", quantity(value, data.unit, { count: 1 }), ratio, event);
			if (type === "DietaryWater")
				addQuantity(
					"waterMl",
					quantity(value, data.unit, { mL: 1, ml: 1, L: 1000, l: 1000, fl_oz_us: 29.5735295625 }),
					ratio,
					event,
				);
			if (type === "ActiveEnergyBurned")
				addQuantity("energyKcal", quantity(value, data.unit, ENERGY_UNITS), ratio, event);
			if (type === "AppleExerciseTime")
				addQuantity("exerciseMinutes", quantity(value, data.unit, MINUTE_UNITS), ratio, event);
			if (
				type === "AppleStandHour" &&
				(value === "HKCategoryValueAppleStandHourStood" || value === "0" || value === 0) &&
				durationMinutes > 0
			)
				stand.push(interval);
			if (type === "SleepAnalysis" && durationMinutes > 0) {
				result.health.sleepMinutes ??= 0;
				const stage =
					typeof value === "string" || typeof value === "number" ? SLEEP_STAGES[value] : undefined;
				if (stage) {
					const spans = sleep.get(stage) ?? [];
					spans.push(interval);
					sleep.set(stage, spans);
				}
			}
			if (type === "HeartRate") {
				const bpm = quantity(value, data.unit, { "count/min": 1, bpm: 1 });
				if (bpm !== null && bpm > 0) {
					const previous = result.health.heartRate;
					heartTotal += bpm;
					result.health.heartRate = {
						average: 0,
						min: Math.min(previous?.min ?? bpm, bpm),
						max: Math.max(previous?.max ?? bpm, bpm),
						samples: (previous?.samples ?? 0) + 1,
					};
				}
			}
			if (data.dateComponents && event.sourceId === "apple-health") activity = data;
			if (typeof data.workoutActivityType === "string") {
				const name = data.workoutActivityType.replace(/^HKWorkoutActivityType/, "");
				result.workoutCount++;
				// Keep a bounded list for summaries; all workouts still remain in the timeline.
				if (result.workouts.length < 100)
					result.workouts.push({
						id: event.id,
						title: WORKOUT_NAMES[name] ?? name,
						precision: event.precision,
						occurredAt: new Date(interval[0]).toISOString(),
						endAt: event.endAt ? new Date(interval[1]).toISOString() : null,
						durationMinutes:
							eventEnd > eventStart
								? durationMinutes
								: (quantity(data.duration, data.durationUnit, MINUTE_UNITS) ?? 0),
						distanceMeters: portion(
							quantity(data.totalDistance, data.totalDistanceUnit, DISTANCE_UNITS),
							ratio,
						),
						energyKcal: portion(
							quantity(data.totalEnergyBurned, data.totalEnergyBurnedUnit, ENERGY_UNITS),
							ratio,
						),
					});
			}
			finances.add(event);
		},
		finish(): DayInsights {
			for (const [key, samples] of sensorQuantities)
				result.health[key] = sumSensorQuantity(samples, window);
			if (result.health.heartRate)
				result.health.heartRate.average = heartTotal / result.health.heartRate.samples;
			if (result.health.sleepMinutes !== null)
				result.health.sleepMinutes = unionMinutes([...sleep.values()].flat());
			result.health.sleepStages = [...sleep].map(([name, intervals]) => ({
				name,
				minutes: unionMinutes(intervals),
			}));
			result.health.energyKcal ??= quantity(
				activity.activeEnergyBurned,
				activity.activeEnergyBurnedUnit,
				ENERGY_UNITS,
			);
			result.health.exerciseMinutes ??= quantity(activity.appleExerciseTime, "min", MINUTE_UNITS);
			result.health.standHours = stand.length
				? unionMinutes(stand) / 60
				: quantity(activity.appleStandHours, "count", { count: 1 });
			result.finance = finances.finish().currencies.map((row) => ({
				currency: row.currency,
				income: row.incomeMinor / 100,
				expense: row.expenseMinor / 100,
				transfers: row.transfersMinor / 100,
				count: row.count,
			}));
			return result;
		},
	};
}

export function buildDayInsights(events: LifeEvent[], window: Window): DayInsights {
	const collector = createDayInsightsCollector(window, true);
	const unique = [...new Map(events.map((event) => [event.id, event])).values()];
	for (const event of unique.sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
	))
		collector.add(event);
	return collector.finish();
}
