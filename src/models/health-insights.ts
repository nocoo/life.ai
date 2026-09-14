/**
 * Daily Health stories use the selected local-day UTC window and neighboring
 * sleep evidence. Source/device selection affects presentation only.
 * Sleep belongs to its waking day; workouts and blood pressure retain links
 * to all original observations. Services fetch route and ECG attachments.
 */
import { gpsDistanceMeters, unionMinutes } from "./day-insights";
import { type QuantitySample, quantitySample, sumSensorQuantity } from "./health-quantities";
import { normalizeTimestamp } from "./time";
import type { JsonValue, LifeEvent } from "./types";

export interface UtcWindow {
	start: string;
	end: string;
}

export type SleepStageKind = "inBed" | "awake" | "asleep" | "core" | "deep" | "rem";

export interface HealthXmlNode {
	name: string;
	attributes: Record<string, string>;
	children?: HealthXmlNode[];
	text?: string;
}

export interface SleepSegment {
	kind: SleepStageKind;
	label: string;
	startAt: string;
	endAt: string;
	minutes: number;
	sourceName: string;
	eventId: string;
}

export interface SleepSourceNote {
	sourceName: string;
	role: "selected" | "overlap" | "inBed";
	detail: string;
}

export interface SleepPlaceEvidence {
	latitude: number;
	longitude: number;
	sampleCount: number;
	firstAt: string;
	lastAt: string;
	radiusMeters: number;
	summary: string;
}

export interface SleepNight {
	id: string;
	fellAsleepAt: string;
	wokeAt: string;
	inBedMinutes: number | null;
	asleepMinutes: number;
	awakeMinutes: number | null;
	stages: { kind: SleepStageKind; label: string; minutes: number }[];
	timeline: SleepSegment[];
	sources: SleepSourceNote[];
	place: SleepPlaceEvidence | null;
	evidence: string[];
}

export interface QuantitySummary {
	label: string;
	unit: string;
	min: number;
	max: number;
	mean: number;
	samples: number;
}

export interface HealthDaySummary {
	steps: number | null;
	distanceMeters: number | null;
	flights: number | null;
	energyKcal: number | null;
	oxygen: QuantitySummary | null;
	respiratory: QuantitySummary | null;
	hrv: QuantitySummary | null;
	restingHeartRate: number | null;
	heartRate: { min: number; max: number; mean: number; samples: number } | null;
}

export interface HealthMoment {
	id: string;
	occurredAt: string;
	hour: number | null;
	kind: "heartPeak" | "walk" | "climb";
	title: string;
	detail: string;
	bpm: number | null;
	context: string[];
	evidence: string[];
}

export interface WorkoutStatistic {
	type: string;
	label: string;
	value: number;
	unit: string;
}

export interface WorkoutSession {
	id: string;
	eventId: string;
	activity: string;
	title: string;
	sourceName: string;
	startAt: string;
	endAt: string | null;
	durationMinutes: number;
	distanceMeters: number | null;
	energyKcal: number | null;
	statistics: WorkoutStatistic[];
	routePaths: string[];
	duplicateOf: string | null;
}

export interface WorkoutGroup {
	id: string;
	canonical: WorkoutSession;
	duplicates: WorkoutSession[];
	overlapRatio: number;
}

export interface BloodPressureReading {
	id: string;
	occurredAt: string;
	hour: number | null;
	systolic: number | null;
	diastolic: number | null;
	unit: "mmHg";
	sourceName: string;
	eventIds: string[];
	evidence: string[];
}

export interface EcgRecording {
	id: string;
	occurredAt: string;
	hour: number | null;
	filePath: string | null;
	samplingHz: string | null;
	classification: string | null;
	classificationLabel: string;
	/** Device average heart rate in bpm. */
	averageHeartRate: string | null;
	/** Waveform voltage unit, typically µV. */
	unit: string | null;
	durationSeconds: string | null;
	sampleCount: string | null;
	evidence: string[];
}

export const ECG_SLICE_SECONDS = 5;

export interface EcgWaveformWindow {
	page: number;
	pages: number;
	startSecond: number;
	endSecond: number;
	samples: number[];
	min: number;
	max: number;
}

export function resolveEcgHertz(
	samplingHz: number | string | null | undefined,
	sampleCount: number,
	durationSeconds: number | string | null | undefined,
): number | null {
	const hz = typeof samplingHz === "number" ? samplingHz : Number(samplingHz);
	if (Number.isFinite(hz) && hz > 0) return hz;
	const duration = typeof durationSeconds === "number" ? durationSeconds : Number(durationSeconds);
	if (sampleCount > 1 && Number.isFinite(duration) && duration > 0) return sampleCount / duration;
	return null;
}

/** Consecutive original samples for one 5-second page. Never stride; peaks stay in the series. */
export function ecgWaveformWindow(
	values: number[],
	hz: number,
	page: number,
	sliceSeconds = ECG_SLICE_SECONDS,
): EcgWaveformWindow | null {
	if (values.length < 2 || !(hz > 0) || !(sliceSeconds > 0)) return null;
	const perPage = Math.max(1, Math.round(hz * sliceSeconds));
	const pages = Math.max(1, Math.ceil(values.length / perPage));
	const index = Math.min(Math.max(0, Math.trunc(page)), pages - 1);
	const start = index * perPage;
	const samples = values.slice(start, Math.min(values.length, start + perPage));
	if (samples.length < 2) return null;
	let min = values[0] as number;
	let max = min;
	for (const value of values) {
		if (value < min) min = value;
		if (value > max) max = value;
	}
	return {
		page: index,
		pages,
		startSecond: start / hz,
		endSecond: (start + samples.length) / hz,
		samples,
		min,
		max,
	};
}

export interface SleepBedtime {
	id: string;
	occurredAt: string;
	title: string;
}

export interface HealthStory {
	window: UtcWindow;
	sleep: SleepNight | null;
	nights: SleepNight[];
	bedtimes: SleepBedtime[];
	day: HealthDaySummary;
	moments: HealthMoment[];
	workouts: WorkoutGroup[];
	bloodPressure: BloodPressureReading[];
	ecg: EcgRecording[];
}

type Data = Record<string, JsonValue>;

const HOUR = 3_600_000;
const CLUSTER_GAP_MS = 90 * 60_000;
const PLACE_RADIUS_M = 400;
const OVERLAP_RATIO = 0.65;
const ENERGY_UNITS = { kcal: 1, kJ: 1 / 4.184, Cal: 1 };
const DISTANCE_UNITS = { m: 1, km: 1000, mi: 1609.344 };
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
const SLEEP_KIND: Record<string, SleepStageKind> = {
	"0": "inBed",
	HKCategoryValueSleepAnalysisInBed: "inBed",
	"1": "asleep",
	HKCategoryValueSleepAnalysisAsleep: "asleep",
	HKCategoryValueSleepAnalysisAsleepUnspecified: "asleep",
	"2": "awake",
	HKCategoryValueSleepAnalysisAwake: "awake",
	"3": "core",
	HKCategoryValueSleepAnalysisAsleepCore: "core",
	"4": "deep",
	HKCategoryValueSleepAnalysisAsleepDeep: "deep",
	"5": "rem",
	HKCategoryValueSleepAnalysisAsleepREM: "rem",
};
const STAGE_LABEL: Record<SleepStageKind, string> = {
	inBed: "在床",
	awake: "清醒",
	asleep: "入睡",
	core: "核心睡眠",
	deep: "深睡",
	rem: "REM",
};

function asObject(value: JsonValue | undefined): Data {
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

function healthKind(data: Data): string {
	return typeof data._healthKind === "string" ? data._healthKind : "";
}

function recordType(data: Data): string {
	if (typeof data.type !== "string") return "";
	return data.type.replace(/^HK(?:Quantity|Category|Correlation)TypeIdentifier/, "");
}

function xmlNodes(value: JsonValue | undefined): HealthXmlNode[] {
	if (!Array.isArray(value)) return [];
	const nodes: HealthXmlNode[] = [];
	for (const item of value) {
		const record = asObject(item);
		if (typeof record.name !== "string" || !record.name.trim()) continue;
		const raw = asObject(record.attributes);
		const attributes: Record<string, string> = {};
		for (const [key, entry] of Object.entries(raw)) {
			if (typeof entry === "string") attributes[key] = entry;
		}
		nodes.push({
			name: record.name,
			attributes,
			children: xmlNodes(record.children),
			text: typeof record.text === "string" ? record.text : undefined,
		});
	}
	return nodes;
}

function walkXml(nodes: HealthXmlNode[], visit: (node: HealthXmlNode) => void): void {
	for (const node of nodes) {
		visit(node);
		if (node.children?.length) walkXml(node.children, visit);
	}
}

function isWatchSource(name: string): boolean {
	return /watch/i.test(name) || /手表/.test(name);
}

function sensorSource(event: LifeEvent): string {
	const data = asObject(event.data);
	if (typeof data.sourceName === "string" && data.sourceName.trim()) return data.sourceName.trim();
	if (typeof data.device === "string" && data.device.trim()) return data.device.trim();
	return event.sourceName;
}

function isAsleepKind(kind: SleepStageKind): boolean {
	return kind === "asleep" || kind === "core" || kind === "deep" || kind === "rem";
}

function isStagedKind(kind: SleepStageKind): boolean {
	return kind === "core" || kind === "deep" || kind === "rem";
}

function iso(ms: number): string {
	return new Date(ms).toISOString();
}

function hourOf(instant: number, start: number, end: number): number | null {
	if (instant < start || instant >= end) return null;
	return Math.floor((instant - start) / HOUR);
}

interface SleepSample {
	event: LifeEvent;
	eventId: string;
	sourceName: string;
	kind: SleepStageKind;
	start: number;
	end: number;
}

interface GpsSample {
	latitude: number;
	longitude: number;
	occurredAt: number;
}

function readSleepSample(event: LifeEvent): SleepSample | null {
	if (event.sourceId !== "apple-health") return null;
	const data = asObject(event.data);
	if (recordType(data) !== "SleepAnalysis") return null;
	const kind =
		typeof data.value === "string" || typeof data.value === "number"
			? SLEEP_KIND[String(data.value)]
			: undefined;
	const start = Date.parse(event.occurredAt);
	const end = Date.parse(event.endAt ?? event.occurredAt);
	if (!kind || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
	return { event, eventId: event.id, sourceName: sensorSource(event), kind, start, end };
}

function clusterSleep(samples: SleepSample[]): SleepSample[][] {
	const ordered = [...samples].sort((a, b) => a.start - b.start || a.end - b.end);
	const clusters: SleepSample[][] = [];
	for (const sample of ordered) {
		const cluster = clusters.find((item) => {
			const start = Math.min(...item.map((entry) => entry.start));
			const end = Math.max(...item.map((entry) => entry.end));
			return sample.start <= end + CLUSTER_GAP_MS && sample.end >= start - CLUSTER_GAP_MS;
		});
		if (cluster) cluster.push(sample);
		else clusters.push([sample]);
	}
	return clusters;
}

function sourceScore(name: string, samples: SleepSample[]): number {
	const kinds = new Set(samples.map((sample) => sample.kind));
	let score = 0;
	if (isWatchSource(name)) score += 4;
	if ([...kinds].some(isStagedKind)) score += 3;
	if ([...kinds].some(isAsleepKind)) score += 1;
	if (/iphone|手机/i.test(name)) score += 1;
	if (/autosleep/i.test(name)) score -= 1;
	return score;
}

function unionKind(samples: SleepSample[], match: (kind: SleepStageKind) => boolean): number {
	return unionMinutes(
		samples.filter((sample) => match(sample.kind)).map((sample) => [sample.start, sample.end]),
	);
}

function sumSleepKind(
	samples: SleepSample[],
	match: (kind: SleepStageKind) => boolean,
	from: number,
	to: number,
	holdAwake = false,
): number | null {
	const quantities = samples
		.filter((sample) => match(sample.kind) || (holdAwake && sample.kind === "awake"))
		.map((sample) =>
			quantitySample(sample.event, match(sample.kind) ? (sample.end - sample.start) / 60_000 : 0),
		);
	return sumSensorQuantity(quantities, { start: iso(from), end: iso(to) });
}

function mergeTimeline(samples: SleepSample[]): SleepSegment[] {
	const ordered = [...samples]
		.filter((sample) => sample.kind !== "inBed")
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const segments: SleepSegment[] = [];
	for (const sample of ordered) {
		const last = segments.at(-1);
		if (last && last.kind === sample.kind && Date.parse(last.endAt) >= sample.start) {
			const end = Math.max(Date.parse(last.endAt), sample.end);
			last.endAt = iso(end);
			last.minutes = (end - Date.parse(last.startAt)) / 60_000;
			continue;
		}
		segments.push({
			kind: sample.kind,
			label: STAGE_LABEL[sample.kind],
			startAt: iso(sample.start),
			endAt: iso(sample.end),
			minutes: (sample.end - sample.start) / 60_000,
			sourceName: sample.sourceName,
			eventId: sample.eventId,
		});
	}
	return segments;
}

function buildPlace(
	points: GpsSample[],
	nightStart: number,
	nightEnd: number,
): SleepPlaceEvidence | null {
	const nearby = points.filter(
		(point) =>
			point.occurredAt >= nightStart - 45 * 60_000 && point.occurredAt <= nightEnd + 15 * 60_000,
	);
	if (nearby.length < 2) return null;
	const latitude = nearby.reduce((sum, point) => sum + point.latitude, 0) / nearby.length;
	const longitude = nearby.reduce((sum, point) => sum + point.longitude, 0) / nearby.length;
	const radiusMeters = Math.max(
		...nearby.map((point) => gpsDistanceMeters(point, { latitude, longitude })),
	);
	if (radiusMeters > PLACE_RADIUS_M) return null;
	const firstAt = iso(Math.min(...nearby.map((point) => point.occurredAt)));
	const lastAt = iso(Math.max(...nearby.map((point) => point.occurredAt)));
	return {
		latitude,
		longitude,
		sampleCount: nearby.length,
		firstAt,
		lastAt,
		radiusMeters,
		summary: `入睡前后附近约 ${Math.round(radiusMeters)} 米内有停留轨迹`,
	};
}

function buildNight(cluster: SleepSample[], points: GpsSample[]): SleepNight | null {
	const bySource = new Map<string, SleepSample[]>();
	for (const sample of cluster) {
		const list = bySource.get(sample.sourceName) ?? [];
		list.push(sample);
		bySource.set(sample.sourceName, list);
	}
	const ranked = [...bySource.entries()]
		.map(([sourceName, samples]) => ({
			sourceName,
			samples,
			asleep: unionKind(samples, isAsleepKind),
			score: sourceScore(sourceName, samples),
		}))
		.filter((item) => item.asleep > 0)
		.sort((a, b) => b.score - a.score || b.asleep - a.asleep);
	const selected = ranked[0];
	if (!selected) return null;
	const asleepSamples = selected.samples.filter((sample) => isAsleepKind(sample.kind));
	const fellAsleepAt = Math.min(...asleepSamples.map((sample) => sample.start));
	const wokeAt = Math.max(
		...selected.samples.filter((sample) => sample.kind !== "inBed").map((sample) => sample.end),
	);
	const coverStart = Math.min(fellAsleepAt, ...cluster.map((sample) => sample.start));
	const coverEnd = Math.max(wokeAt, ...cluster.map((sample) => sample.end));
	const asleep = sumSleepKind(cluster, isAsleepKind, fellAsleepAt, wokeAt, true);
	const inBed = sumSleepKind(cluster, (kind) => kind === "inBed", coverStart, coverEnd);
	const awake = sumSleepKind(selected.samples, (kind) => kind === "awake", fellAsleepAt, wokeAt);
	const stageMinutes = (["core", "deep", "rem", "asleep", "awake"] as const).map((kind) => ({
		kind,
		label: STAGE_LABEL[kind],
		minutes: unionKind(selected.samples, (item) => item === kind),
	}));
	const sources: SleepSourceNote[] = ranked.map((item) => ({
		sourceName: item.sourceName,
		role: item.sourceName === selected.sourceName ? "selected" : "overlap",
		detail:
			item.sourceName === selected.sourceName
				? isWatchSource(item.sourceName) &&
					selected.samples.some((sample) => isStagedKind(sample.kind))
					? `分期来自${item.sourceName}`
					: `睡眠来自${item.sourceName}`
				: `另有${item.sourceName}记录，没有重复计算`,
	}));
	if (inBed && inBed > 0) {
		sources.push({
			sourceName: "在床",
			role: "inBed",
			detail: "在床时间单独计算",
		});
	}
	const place = buildPlace(points, fellAsleepAt, wokeAt);
	const evidence = [...sources.map((note) => note.detail)];
	if (place) evidence.push(place.summary);
	else evidence.push("附近没有足够的轨迹");
	return {
		id: `sleep-${iso(fellAsleepAt)}`,
		fellAsleepAt: iso(fellAsleepAt),
		wokeAt: iso(wokeAt),
		inBedMinutes: inBed && inBed > 0 ? inBed : null,
		asleepMinutes: asleep ?? selected.asleep,
		awakeMinutes: awake && awake > 0 ? awake : null,
		stages: stageMinutes.filter((stage) => stage.minutes > 0),
		timeline: mergeTimeline(selected.samples),
		sources,
		place,
		evidence,
	};
}

function readGps(event: LifeEvent): GpsSample[] {
	const data = asObject(event.data);
	const points = data.points ?? data.trackPoints;
	const rows = Array.isArray(points) ? points.map((point) => asObject(point)) : [data];
	const samples: GpsSample[] = [];
	for (const row of rows) {
		const latitude = numeric(row.latitude ?? row.lat);
		const longitude = numeric(row.longitude ?? row.lon ?? row.lng);
		if (
			latitude === null ||
			longitude === null ||
			Math.abs(latitude) > 90 ||
			Math.abs(longitude) > 180
		)
			continue;
		const raw = row.time ?? row.ts ?? row.timestamp ?? row.occurredAt ?? event.occurredAt;
		const occurredAt = Date.parse(typeof raw === "string" ? raw : event.occurredAt);
		if (!Number.isFinite(occurredAt)) continue;
		samples.push({ latitude, longitude, occurredAt });
	}
	return samples;
}

function clipRatio(start: number, end: number, windowStart: number, windowEnd: number): number {
	if (end <= start) return start >= windowStart && start < windowEnd ? 1 : 0;
	const overlap = Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
	return overlap / (end - start);
}

function summarize(
	label: string,
	unit: string,
	values: number[],
	scale = 1,
): QuantitySummary | null {
	if (!values.length) return null;
	const scaled = values.map((value) => value * scale);
	const sum = scaled.reduce((total, value) => total + value, 0);
	return {
		label,
		unit,
		min: Math.min(...scaled),
		max: Math.max(...scaled),
		mean: sum / scaled.length,
		samples: scaled.length,
	};
}

function statisticLabel(type: string): string {
	const name = type.replace(/^HKQuantityTypeIdentifier/, "");
	if (name === "HeartRate") return "心率";
	if (name === "ActiveEnergyBurned") return "活动能量";
	if (name === "DistanceWalkingRunning" || name === "DistanceCycling") return "距离";
	if (name === "StepCount") return "步数";
	return name;
}

function readWorkout(event: LifeEvent): WorkoutSession | null {
	const data = asObject(event.data);
	const activityRaw =
		typeof data.workoutActivityType === "string"
			? data.workoutActivityType
			: healthKind(data) === "Workout"
				? "Other"
				: "";
	if (!activityRaw && healthKind(data) !== "Workout") return null;
	const activity = activityRaw.replace(/^HKWorkoutActivityType/, "") || "Other";
	const start = Date.parse(event.occurredAt);
	const end = event.endAt ? Date.parse(event.endAt) : Number.NaN;
	if (!Number.isFinite(start)) return null;
	const exported = quantity(data.duration, data.durationUnit, MINUTE_UNITS);
	const wall = Number.isFinite(end) && end > start ? (end - start) / 60_000 : 0;
	const durationMinutes = exported && exported > 0 ? exported : wall;
	if (durationMinutes <= 0) return null;
	const statistics: WorkoutStatistic[] = [];
	const routePaths: string[] = [];
	walkXml(xmlNodes(data._healthChildren), (node) => {
		if (node.name === "FileReference" && node.attributes.path?.trim()) {
			routePaths.push(node.attributes.path.trim());
			return;
		}
		if (node.name !== "WorkoutStatistics") return;
		const value = numeric(node.attributes.sum) ?? numeric(node.attributes.average);
		if (value === null || value < 0) return;
		statistics.push({
			type: node.attributes.type ?? "",
			label: statisticLabel(node.attributes.type ?? ""),
			value,
			unit: node.attributes.unit ?? "",
		});
	});
	const fromStats = (match: (type: string) => boolean, units: Record<string, number>) => {
		for (const item of statistics) {
			if (!match(item.type)) continue;
			const converted = quantity(item.value, item.unit, units);
			if (converted !== null) return converted;
		}
		return null;
	};
	return {
		id: event.id,
		eventId: event.id,
		activity,
		title: WORKOUT_NAMES[activity] ?? activity,
		sourceName: sensorSource(event),
		startAt: iso(start),
		endAt: Number.isFinite(end) ? iso(end) : null,
		durationMinutes,
		distanceMeters:
			quantity(data.totalDistance, data.totalDistanceUnit, DISTANCE_UNITS) ??
			fromStats((type) => /Distance/i.test(type), DISTANCE_UNITS),
		energyKcal:
			quantity(data.totalEnergyBurned, data.totalEnergyBurnedUnit, ENERGY_UNITS) ??
			fromStats((type) => /ActiveEnergyBurned/i.test(type), ENERGY_UNITS),
		statistics,
		routePaths: [...new Set(routePaths)],
		duplicateOf: null,
	};
}

function sessionOverlap(left: WorkoutSession, right: WorkoutSession): number {
	const start = Math.max(Date.parse(left.startAt), Date.parse(right.startAt));
	const end = Math.min(
		Date.parse(left.endAt ?? left.startAt),
		Date.parse(right.endAt ?? right.startAt),
	);
	return Math.max(0, end - start);
}

function groupWorkouts(sessions: WorkoutSession[]): WorkoutGroup[] {
	const remaining = [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt));
	const groups: WorkoutGroup[] = [];
	while (remaining.length) {
		const canonical = remaining.shift() as WorkoutSession;
		const members = [canonical];
		for (let index = remaining.length - 1; index >= 0; index--) {
			const other = remaining[index] as WorkoutSession;
			if (other.activity !== canonical.activity) continue;
			const overlap = sessionOverlap(canonical, other);
			const longer = Math.max(sessionOverlap(canonical, canonical), sessionOverlap(other, other));
			if (longer <= 0 || overlap / longer < OVERLAP_RATIO) continue;
			remaining.splice(index, 1);
			members.push(other);
		}
		members.sort((a, b) => {
			const watch = Number(isWatchSource(b.sourceName)) - Number(isWatchSource(a.sourceName));
			if (watch) return watch;
			const phone =
				Number(/iphone|手机/i.test(b.sourceName)) - Number(/iphone|手机/i.test(a.sourceName));
			if (phone) return phone;
			return b.durationMinutes - a.durationMinutes;
		});
		const chosen = members[0] as WorkoutSession;
		const duplicates = members.slice(1).map((item) => ({ ...item, duplicateOf: chosen.id }));
		const overlapRatio = duplicates[0]
			? sessionOverlap(chosen, duplicates[0]) /
				Math.max(sessionOverlap(chosen, chosen), sessionOverlap(duplicates[0], duplicates[0]))
			: 1;
		groups.push({
			id: chosen.id,
			canonical: { ...chosen, duplicateOf: null },
			duplicates,
			overlapRatio,
		});
	}
	return groups;
}

function buildMoments(
	windowStart: number,
	windowEnd: number,
	heart: { bpm: number; at: number }[],
	workouts: WorkoutSession[],
	walkMeters: Map<number, number>,
	steps: Map<number, number>,
	flights: Map<number, number>,
	gpsByHour: Map<number, GpsSample[]>,
): HealthMoment[] {
	const moments: HealthMoment[] = [];
	if (heart.length >= 3) {
		const mean = heart.reduce((sum, item) => sum + item.bpm, 0) / heart.length;
		const peaks = [...heart]
			.sort((a, b) => b.bpm - a.bpm)
			.filter(
				(item, index, list) =>
					item.bpm >= mean + 12 &&
					list.findIndex((other) => Math.abs(other.at - item.at) < 20 * 60_000) === index,
			)
			.slice(0, 4);
		for (const peak of peaks) {
			const hour = hourOf(peak.at, windowStart, windowEnd);
			const nearbyWorkout = workouts.find((session) => {
				const start = Date.parse(session.startAt);
				const end = Date.parse(session.endAt ?? session.startAt) + 10 * 60_000;
				return peak.at >= start - 10 * 60_000 && peak.at <= end;
			});
			const context: string[] = [];
			if (nearbyWorkout)
				context.push(`同时段有 ${nearbyWorkout.title}（${nearbyWorkout.sourceName}）`);
			const walk = hour !== null ? walkMeters.get(hour) : undefined;
			if (walk && walk > 0) context.push(`该小时步行 ${Math.round(walk)} m`);
			const climb = hour !== null ? flights.get(hour) : undefined;
			if (climb && climb > 0) context.push(`该小时爬楼 ${climb.toFixed(1)} 层`);
			moments.push({
				id: `hr-${iso(peak.at)}`,
				occurredAt: iso(peak.at),
				hour,
				kind: "heartPeak",
				title: "心率峰值",
				detail: `${Math.round(peak.bpm)} bpm，来自实测样本`,
				bpm: peak.bpm,
				context,
				evidence: [...context, "这是测到的数值，不是诊断"],
			});
		}
	}
	const activeHours = [...new Set([...walkMeters.keys(), ...steps.keys()])].sort((a, b) => a - b);
	for (const hour of activeHours) {
		const meters = walkMeters.get(hour) ?? 0;
		const count = steps.get(hour) ?? 0;
		if (meters < 200 && count < 300) continue;
		const samples = gpsByHour.get(hour) ?? [];
		const context: string[] = [];
		if (samples.length >= 2) {
			const anchor = samples[0] as GpsSample;
			const radius = Math.max(...samples.map((item) => gpsDistanceMeters(item, anchor)));
			if (radius <= PLACE_RADIUS_M)
				context.push(`这一小时的位置变化约 ${Math.round(radius)} m，脚步记录了附近的活动`);
		}
		const detail = [
			count > 0 ? `${Math.round(count)} 步` : "",
			meters > 0 ? `${Math.round(meters)} m` : "",
		]
			.filter(Boolean)
			.join(" · ");
		moments.push({
			id: `walk-${hour}`,
			occurredAt: iso(windowStart + hour * HOUR),
			hour,
			kind: "walk",
			title: "这一小时的脚步",
			detail,
			bpm: null,
			context,
			evidence: context,
		});
	}
	for (const [hour, count] of flights) {
		if (count < 1) continue;
		moments.push({
			id: `climb-${hour}`,
			occurredAt: iso(windowStart + hour * HOUR),
			hour,
			kind: "climb",
			title: "爬楼",
			detail: `该小时 ${count.toFixed(1)} 层`,
			bpm: null,
			context: [],
			evidence: [],
		});
	}
	return moments.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function textField(value: JsonValue | undefined): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return value;
}

function mmHg(value: JsonValue | undefined, unit: JsonValue | undefined): number | null {
	const number = numeric(value);
	if (number === null || number <= 0) return null;
	if (unit === undefined || unit === null || unit === "" || unit === "mmHg" || unit === "mmhg")
		return number;
	if (unit === "kPa" || unit === "kpa") return number * 7.50062;
	return null;
}

function pressureRole(type: string): "systolic" | "diastolic" | null {
	if (type.includes("BloodPressureSystolic")) return "systolic";
	if (type.includes("BloodPressureDiastolic")) return "diastolic";
	return null;
}

const ECG_CLASS: Record<string, string> = {
	SinusRhythm: "窦性心律",
	AtrialFibrillation: "心房颤动",
	HighOrLowHeartRate: "心率过高或过低",
	Inconclusive: "无法判定",
	InconclusivePoorReading: "无法判定（信号不足）",
	InconclusiveOther: "无法判定",
	NotSet: "未设置",
	Unrecognized: "未识别",
};

function ecgClassificationLabel(raw: string | null): string {
	if (!raw) return "未知";
	const key = raw.replace(/^HKElectrocardiogramClassification/, "");
	return ECG_CLASS[key] ?? raw;
}

function pressureKey(sourceName: string, sourceVersion: string | null, at: number): string {
	return `${sourceName}\0${sourceVersion ?? ""}\0${at}`;
}

function childMatchesParent(
	attrs: Record<string, string>,
	parentAt: number,
	parentSource: string,
	parentVersion: string | null,
): boolean {
	if (attrs.sourceName && attrs.sourceName !== parentSource) return false;
	if (attrs.sourceVersion && parentVersion && attrs.sourceVersion !== parentVersion) return false;
	const raw = attrs.startDate ?? attrs.start_date;
	if (!raw) return true;
	try {
		return Date.parse(normalizeTimestamp(raw)) === parentAt;
	} catch {
		return false;
	}
}

function readingFromPair(
	id: string,
	at: number,
	windowStart: number,
	windowEnd: number,
	sourceName: string,
	systolic: number | null,
	diastolic: number | null,
	eventIds: string[],
	how: string,
): BloodPressureReading | null {
	if (systolic === null && diastolic === null) return null;
	const evidence = [how, `${sourceName} · mmHg`];
	if (systolic === null || diastolic === null) evidence.push("另一侧没有成对读数");
	return {
		id,
		occurredAt: iso(at),
		hour: hourOf(at, windowStart, windowEnd),
		systolic,
		diastolic,
		unit: "mmHg",
		sourceName,
		eventIds,
		evidence,
	};
}

function buildBloodPressure(
	events: LifeEvent[],
	windowStart: number,
	windowEnd: number,
): BloodPressureReading[] {
	const used = new Set<string>();
	const readings: BloodPressureReading[] = [];
	for (const event of events) {
		if (event.sourceId !== "apple-health") continue;
		const data = asObject(event.data);
		if (recordType(data) !== "BloodPressure") continue;
		const at = Date.parse(event.occurredAt);
		if (!Number.isFinite(at) || at < windowStart || at >= windowEnd) continue;
		const version = textField(data.sourceVersion);
		let systolic: number | null = null;
		let diastolic: number | null = null;
		walkXml(xmlNodes(data._healthChildren), (node) => {
			if (node.name !== "Record") return;
			if (!childMatchesParent(node.attributes, at, sensorSource(event), version)) return;
			const role = pressureRole(node.attributes.type ?? "");
			const value = mmHg(node.attributes.value, node.attributes.unit);
			if (role === "systolic" && systolic === null) systolic = value;
			if (role === "diastolic" && diastolic === null) diastolic = value;
		});
		const reading = readingFromPair(
			event.id,
			at,
			windowStart,
			windowEnd,
			sensorSource(event),
			systolic,
			diastolic,
			[event.id],
			"成对读数",
		);
		if (!reading) continue;
		used.add(event.id);
		readings.push(reading);
	}
	for (const event of events) {
		if (used.has(event.id) || event.sourceId !== "apple-health") continue;
		const data = asObject(event.data);
		const role = pressureRole(recordType(data) || (typeof data.type === "string" ? data.type : ""));
		if (!role) continue;
		const at = Date.parse(event.occurredAt);
		if (!Number.isFinite(at)) continue;
		const value = mmHg(data.value, data.unit);
		const match = readings.find(
			(item) =>
				item.sourceName === sensorSource(event) &&
				Date.parse(item.occurredAt) === at &&
				((role === "systolic" && item.systolic === value) ||
					(role === "diastolic" && item.diastolic === value)),
		);
		if (match) {
			match.eventIds.push(event.id);
			used.add(event.id);
		}
	}
	const leftover = new Map<
		string,
		{ event: LifeEvent; role: "systolic" | "diastolic"; at: number; value: number }[]
	>();
	for (const event of events) {
		if (used.has(event.id) || event.sourceId !== "apple-health") continue;
		const data = asObject(event.data);
		const role = pressureRole(typeof data.type === "string" ? data.type : "");
		const at = Date.parse(event.occurredAt);
		const value = mmHg(data.value, data.unit);
		if (!role || value === null || !Number.isFinite(at) || at < windowStart || at >= windowEnd)
			continue;
		const key = pressureKey(sensorSource(event), textField(data.sourceVersion), at);
		const list = leftover.get(key) ?? [];
		list.push({ event, role, at, value });
		leftover.set(key, list);
	}
	for (const group of leftover.values()) {
		const sys = group.filter((item) => item.role === "systolic");
		const dia = group.filter((item) => item.role === "diastolic");
		if (sys.length === 1 && dia.length === 1) {
			const systolic = sys[0] as (typeof group)[0];
			const diastolic = dia[0] as (typeof group)[0];
			const reading = readingFromPair(
				systolic.event.id,
				systolic.at,
				windowStart,
				windowEnd,
				sensorSource(systolic.event),
				systolic.value,
				diastolic.value,
				[systolic.event.id, diastolic.event.id],
				"同一时刻的成对读数",
			);
			if (reading) readings.push(reading);
			continue;
		}
		for (const item of group) {
			const reading = readingFromPair(
				item.event.id,
				item.at,
				windowStart,
				windowEnd,
				sensorSource(item.event),
				item.role === "systolic" ? item.value : null,
				item.role === "diastolic" ? item.value : null,
				[item.event.id],
				"只有一侧读数",
			);
			if (reading) readings.push(reading);
		}
	}
	return readings.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function buildEcg(events: LifeEvent[], windowStart: number, windowEnd: number): EcgRecording[] {
	const recordings: EcgRecording[] = [];
	for (const event of events) {
		if (event.sourceId !== "apple-health") continue;
		const data = asObject(event.data);
		if (healthKind(data) !== "Electrocardiogram" && recordType(data) !== "Electrocardiogram")
			continue;
		const at = Date.parse(event.occurredAt);
		if (!Number.isFinite(at) || at < windowStart || at >= windowEnd) continue;
		const classification = textField(data.classification);
		recordings.push({
			id: event.id,
			occurredAt: iso(at),
			hour: hourOf(at, windowStart, windowEnd),
			filePath: textField(data.filePath),
			samplingHz: textField(data.samplingHz),
			classification,
			classificationLabel: ecgClassificationLabel(classification),
			averageHeartRate: textField(data.averageHeartRate),
			unit: textField(data.unit),
			durationSeconds: textField(data.durationSeconds),
			sampleCount: textField(data.sampleCount),
			evidence: [
				classification
					? `设备记录为「${ecgClassificationLabel(classification)}」，不是诊断`
					: "分类未知",
			],
		});
	}
	return recordings.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function hourlySums(
	samples: QuantitySample[],
	windowStart: number,
	windowEnd: number,
): Map<number, number> {
	const totals = new Map<number, number>();
	const hours = Math.max(0, Math.ceil((windowEnd - windowStart) / HOUR));
	for (let hour = 0; hour < hours; hour++) {
		const start = windowStart + hour * HOUR;
		const end = Math.min(windowStart + (hour + 1) * HOUR, windowEnd);
		const value = sumSensorQuantity(samples, { start: iso(start), end: iso(end) });
		if (value !== null && value > 0) totals.set(hour, value);
	}
	return totals;
}

export function readHealthXml(value: JsonValue | undefined): HealthXmlNode[] {
	return xmlNodes(value);
}

export function buildHealthStory(events: LifeEvent[], window: UtcWindow): HealthStory {
	const windowStart = Date.parse(window.start);
	const windowEnd = Date.parse(window.end);
	const unique = [...new Map(events.map((event) => [event.id, event])).values()].sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
	);
	const sleepSamples: SleepSample[] = [];
	const gps: GpsSample[] = [];
	const heart: { bpm: number; at: number }[] = [];
	const oxygen: number[] = [];
	const respiratory: number[] = [];
	const hrv: number[] = [];
	let restingHeartRate: number | null = null;
	let summaryEnergy: number | null = null;
	const stepSamples: QuantitySample[] = [];
	const distanceSamples: QuantitySample[] = [];
	const flightSamples: QuantitySample[] = [];
	const energySamples: QuantitySample[] = [];
	const gpsByHour = new Map<number, GpsSample[]>();
	const workouts: WorkoutSession[] = [];

	const addWorkout = (session: WorkoutSession | null) => {
		if (!session) return;
		const workoutStart = Date.parse(session.startAt);
		const workoutEnd = Date.parse(session.endAt ?? session.startAt);
		if (workoutEnd > windowStart && workoutStart < windowEnd) workouts.push(session);
	};

	for (const event of unique) {
		const sleep = readSleepSample(event);
		if (sleep) sleepSamples.push(sleep);
		for (const point of readGps(event)) {
			gps.push(point);
			const hour = hourOf(point.occurredAt, windowStart, windowEnd);
			if (hour === null) continue;
			const bucket = gpsByHour.get(hour) ?? [];
			bucket.push(point);
			gpsByHour.set(hour, bucket);
		}
		const data = asObject(event.data);
		const start = Date.parse(event.occurredAt);
		const end = Date.parse(event.endAt ?? event.occurredAt);
		const ratio = clipRatio(start, Number.isFinite(end) ? end : start, windowStart, windowEnd);
		addWorkout(readWorkout(event));
		if (ratio <= 0) continue;
		const type = recordType(data);
		if (type === "StepCount") {
			const value = quantity(data.value, data.unit, { count: 1 });
			if (value !== null) stepSamples.push(quantitySample(event, value));
		}
		if (type === "DistanceWalkingRunning") {
			const value = quantity(data.value, data.unit, DISTANCE_UNITS);
			if (value !== null) distanceSamples.push(quantitySample(event, value));
		}
		if (type === "FlightsClimbed") {
			const value = quantity(data.value, data.unit, { count: 1 });
			if (value !== null) flightSamples.push(quantitySample(event, value));
		}
		if (type === "ActiveEnergyBurned") {
			const value = quantity(data.value, data.unit, ENERGY_UNITS);
			if (value !== null) energySamples.push(quantitySample(event, value));
		}
		if (type === "HeartRate") {
			const bpm = quantity(data.value, data.unit, { "count/min": 1, bpm: 1 });
			if (bpm !== null && bpm > 0) heart.push({ bpm, at: start });
		}
		if (type === "OxygenSaturation") {
			const value = numeric(data.value);
			if (value !== null && value > 0) oxygen.push(value <= 1 ? value * 100 : value);
		}
		if (type === "RespiratoryRate") {
			const value = quantity(data.value, data.unit, { "count/min": 1 });
			if (value !== null) respiratory.push(value);
		}
		if (type === "HeartRateVariabilitySDNN") {
			const value = quantity(data.value, data.unit, { ms: 1, s: 1000 });
			if (value !== null) hrv.push(value);
		}
		if (type === "RestingHeartRate") {
			const value = quantity(data.value, data.unit, { "count/min": 1, bpm: 1 });
			if (value !== null) restingHeartRate = value;
		}
		if (healthKind(data) === "ActivitySummary") {
			const value = quantity(data.activeEnergyBurned, data.activeEnergyBurnedUnit, ENERGY_UNITS);
			if (value !== null) summaryEnergy = value;
		}
	}

	const steps = sumSensorQuantity(stepSamples, window);
	const distanceMeters = sumSensorQuantity(distanceSamples, window);
	const flightCount = sumSensorQuantity(flightSamples, window);
	const energyKcal = sumSensorQuantity(energySamples, window);
	const walkMeters = hourlySums(distanceSamples, windowStart, windowEnd);
	const flights = hourlySums(flightSamples, windowStart, windowEnd);

	const nights: SleepNight[] = [];
	const bedtimes: SleepBedtime[] = [];
	for (const cluster of clusterSleep(sleepSamples)) {
		const night = buildNight(cluster, gps);
		if (!night) continue;
		const fellAsleepAt = Date.parse(night.fellAsleepAt);
		const wokeAt = Date.parse(night.wokeAt);
		if (wokeAt >= windowStart && wokeAt < windowEnd) nights.push(night);
		else if (fellAsleepAt >= windowStart && fellAsleepAt < windowEnd && wokeAt >= windowEnd)
			bedtimes.push({
				id: `bedtime-${night.fellAsleepAt}`,
				occurredAt: night.fellAsleepAt,
				title: "今晚入睡",
			});
	}
	nights.sort((a, b) => b.asleepMinutes - a.asleepMinutes);

	return {
		window,
		sleep: nights[0] ?? null,
		nights,
		bedtimes,
		day: {
			steps,
			distanceMeters,
			flights: flightCount,
			energyKcal: energyKcal ?? summaryEnergy,
			oxygen: summarize("血氧", "%", oxygen),
			respiratory: summarize("呼吸", "次/分", respiratory),
			hrv: summarize("HRV", "ms", hrv),
			restingHeartRate,
			heartRate: heart.length
				? {
						min: Math.min(...heart.map((item) => item.bpm)),
						max: Math.max(...heart.map((item) => item.bpm)),
						mean: heart.reduce((sum, item) => sum + item.bpm, 0) / heart.length,
						samples: heart.length,
					}
				: null,
		},
		moments: buildMoments(
			windowStart,
			windowEnd,
			heart,
			workouts,
			walkMeters,
			hourlySums(stepSamples, windowStart, windowEnd),
			flights,
			gpsByHour,
		),
		workouts: groupWorkouts(workouts),
		bloodPressure: buildBloodPressure(unique, windowStart, windowEnd),
		ecg: buildEcg(unique, windowStart, windowEnd),
	};
}
