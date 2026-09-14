import { createHash } from "node:crypto";
import {
	type DaySummary,
	type DaySummaryQuery,
	type DaySummaryResult,
	validateSummaryGenerateInput,
	validateSummaryQuery,
} from "../src/models/ai.js";
import { createDayInsightsCollector, type DayInsights } from "../src/models/day-insights.js";
import {
	type DiaryDocument,
	type DiarySections,
	parseDiaryDocument,
	readDiaryContent,
} from "../src/models/diary.js";
import { footprintDayEvents } from "../src/models/footprint.js";
import {
	type GeneralSettings,
	matchNamedPlace,
	type NamedPlace,
	type SleepRoutine,
} from "../src/models/general-settings.js";
import { buildHealthStory, type HealthStory } from "../src/models/health-insights.js";
import { applyHealthStoryInsights } from "../src/models/health-quantities.js";
import { pixiuDayEvents } from "../src/models/pixiu.js";
import type { LifeEvent, Precision } from "../src/models/types.js";
import { generateAiText } from "./ai.js";
import { withD1Retry } from "./database.js";
import { readDaySources } from "./day-sources.js";
import {
	cachedPublicContextFingerprint,
	collectDiaryEvidence,
	formatDaySourceEvidence,
	formatEvidenceTime,
	formatHealthDimensionsEvidence,
	formatPersonalContext,
} from "./diary-evidence.js";
import { DIARY_PROMPT_VERSION, DIARY_SYSTEM_PROMPT } from "./diary-prompt.js";
import { eventRowToEvent, readEventRows } from "./events.js";
import { readFootprintDays } from "./footprint-read.js";
import { readGeneralSettings } from "./general-settings.js";
import { readHealthEvents } from "./health-read.js";
import { readPixiuDays } from "./pixiu-read.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody } from "./utils.js";

// Covers both 45-second source reads, public context, and the 90-second model budget.
const LEASE_DURATION_MS = 300_000;
export const DIARY_GENERATION_TIMEOUT_MS = 90_000;
export const DIARY_OUTPUT_TOKENS = 8_192;
const MAX_SAMPLES_PER_SOURCE = 24;
const MAX_SAMPLED_SOURCES = 32;
const MAX_TOTAL_SAMPLES = 64;
const MAX_SAMPLE_TITLE_LENGTH = 120;
const MAX_SAMPLE_CONTENT_LENGTH = 200;
const PAGE_SIZE = 200;

interface StoredSummaryRow {
	date: string;
	timezone: string;
	start_at: string;
	end_at: string;
	content: string;
	provider: string;
	model: string;
	input_hash: string;
	event_count: number;
	generated_at: number;
}

interface NarrativeSample {
	time: string;
	precision: Precision;
	title: string;
	content?: string;
}

/**
 * Safely wraps validateSummaryQuery mapping Error to ApiError 400.
 */
export function safeValidateSummaryQuery(input: unknown): DaySummaryQuery {
	try {
		return validateSummaryQuery(input);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "请选择有效日期与时区";
		throw new ApiError(400, "invalid_query", msg);
	}
}

export function safeValidateSummaryGenerate(input: unknown) {
	try {
		return validateSummaryGenerateInput(input);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "请选择有效日期与时区";
		throw new ApiError(400, "invalid_query", msg);
	}
}

/** Page legacy rows; decode only this day and its bounded sleep context for compact health evidence. */
export async function streamDayEvents(
	env: WorkerEnv,
	startMs: number,
	endMs: number,
	window: { start: string; end: string },
	withEvidence = true,
	additionalEvents: LifeEvent[] = [],
) {
	const collector = createDayInsightsCollector(window, true);
	const hash = createHash("sha256").update(JSON.stringify([DIARY_PROMPT_VERSION, startMs, endMs]));
	const sourceCounts: Record<string, number> = Object.create(null);
	const buckets = new Map<string, Map<number, NarrativeSample[]>>();
	const contextStart = startMs - 86_400_000;
	const [footprintDays, healthEvents, sleepEvents, pixiuDays] = await Promise.all([
		readFootprintDays(env.DB, contextStart, endMs),
		readHealthEvents(env.DB, startMs, endMs),
		readHealthEvents(env.DB, contextStart, endMs + 12 * 3_600_000, [
			"HKCategoryTypeIdentifierSleepAnalysis",
		]),
		readPixiuDays(env.DB, startMs, endMs),
	]);
	const pixiuEvents = pixiuDays.flatMap(pixiuDayEvents);
	const skipLegacyPixiu = pixiuDays.length > 0;
	const footprintContext = footprintDays.flatMap((day) =>
		footprintDayEvents(day, { start: contextStart, end: endMs }),
	);
	const health =
		healthEvents.length || sleepEvents.length
			? buildHealthStory([...footprintContext, ...sleepEvents, ...healthEvents], window)
			: null;
	const healthContent = new Map(
		healthEvents.map((event) => {
			const { id: _id, updatedAt: _updatedAt, ...content } = event;
			return [event, JSON.stringify(content)] as const;
		}),
	);
	const orderKey = (event: LifeEvent) =>
		healthContent.has(event) ? `health:${healthContent.get(event)}` : event.id;
	const compareEvents = (a: LifeEvent, b: LifeEvent) =>
		a.occurredAt.localeCompare(b.occurredAt) || orderKey(a).localeCompare(orderKey(b));
	const footprint = [
		...footprintContext.filter((event) => Date.parse(event.occurredAt) >= startMs),
		...healthEvents,
		...pixiuEvents,
		...additionalEvents,
	].sort(compareEvents);
	let footprintIndex = 0;
	let seenFootprint = false;
	let cursor: { occurredAtMs: number; id: string } | null = null;
	let eventCount = 0;
	const consume = (event: LifeEvent, fromLegacy = false) => {
		if (fromLegacy && skipLegacyPixiu && event.sourceId === "pixiu") return;
		eventCount++;
		// Virtual GPS IDs shift when earlier, out-of-window points change. Hash only the point's content.
		if (event.sourceId === "footprint") {
			let data = event.data;
			if (!seenFootprint && data && typeof data === "object" && !Array.isArray(data)) {
				data = { ...data };
				// The first visible point has no visible predecessor for this boundary to disconnect.
				delete data.breakBefore;
			}
			seenFootprint = true;
			hash.update(
				JSON.stringify([
					event.sourceId,
					event.sourceName,
					event.sourceKind,
					event.occurredAt,
					event.endAt,
					event.precision,
					event.title,
					event.content,
					data,
				]),
			);
		} else if (event.sourceId === "apple-health" || event.sourceId === "pixiu") {
			const { id: _id, updatedAt: _updatedAt, ...content } = event;
			hash.update(JSON.stringify(content));
		} else hash.update(JSON.stringify(event));
		hash.update("\n");
		collector.add(event);
		if (!withEvidence) return;
		const source = event.sourceName;
		sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
		// These sources have separate evidence and cards; do not duplicate their logs in the life story.
		if (["gecko", "firefly", "github"].includes(event.sourceId)) return;
		if (!buckets.has(source) && buckets.size < MAX_SAMPLED_SOURCES) buckets.set(source, new Map());
		const sourceBuckets = buckets.get(source);
		if (sourceBuckets) {
			const bucket =
				event.precision === "day"
					? -1
					: Math.max(0, Math.floor((Date.parse(event.occurredAt) - startMs) / 3_600_000));
			const samples = sourceBuckets.get(bucket) ?? [];
			const sample: NarrativeSample = {
				time: event.occurredAt,
				precision: event.precision,
				title: event.title.slice(0, MAX_SAMPLE_TITLE_LENGTH),
				content: event.content.slice(0, MAX_SAMPLE_CONTENT_LENGTH),
			};
			if (samples.length < 2) samples.push(sample);
			else samples[1] = sample;
			sourceBuckets.set(bucket, samples);
		}
	};
	while (true) {
		const results = await readEventRows(env.DB, {
			start: startMs,
			end: endMs,
			cursor,
			limit: PAGE_SIZE,
		});
		for (const row of results) {
			const event = eventRowToEvent(row);
			while (footprintIndex < footprint.length) {
				const next = footprint[footprintIndex] as LifeEvent;
				if (compareEvents(next, event) > 0) break;
				consume(next);
				footprintIndex++;
			}
			consume(event, true);
		}
		const last = results.at(-1);
		if (results.length < PAGE_SIZE || !last) break;
		cursor = { occurredAtMs: last.occurred_at, id: last.id };
	}
	for (; footprintIndex < footprint.length; footprintIndex++)
		consume(footprint[footprintIndex] as LifeEvent);
	// Previous-night evidence can change the waking-day summary independently of today's samples.
	if (health?.nights.length)
		hash.update(
			JSON.stringify(
				health.nights.map((night) => ({
					start: night.fellAsleepAt,
					end: night.wokeAt,
					asleep: night.asleepMinutes,
					awake: night.awakeMinutes,
					inBed: night.inBedMinutes,
					stages: night.stages,
					sources: night.sources,
					place: night.place,
				})),
			),
		);
	const samplesBySource: Record<string, NarrativeSample[]> = Object.create(null);
	const perSource = Math.min(
		MAX_SAMPLES_PER_SOURCE,
		Math.floor(MAX_TOTAL_SAMPLES / Math.max(1, buckets.size)),
	);
	for (const [source, sourceBuckets] of buckets) {
		const samples = [...sourceBuckets].sort(([a], [b]) => a - b).flatMap(([, items]) => items);
		samplesBySource[source] =
			samples.length <= perSource
				? samples
				: Array.from(
						{ length: perSource },
						(_, index) =>
							samples[
								Math.round((index * (samples.length - 1)) / (perSource - 1))
							] as NarrativeSample,
					);
	}
	const insights = collector.finish();
	if (health && withEvidence) applyHealthStoryInsights(insights, health);
	return {
		insights,
		health,
		pixiuEvents,
		healthEvents: withEvidence ? healthEvents : [],
		inputHash: hash.digest("hex"),
		eventCount,
		sourceCounts,
		samplesBySource,
	};
}

/**
 * Format DayInsights numeric evidence into concise Chinese bullet points.
 */
export function formatInsightsEvidence(insights: DayInsights): string[] {
	const lines: string[] = [];

	// GPS
	if (insights.gps.pointCount > 0) {
		const km = (insights.gps.distanceMeters / 1000).toFixed(2);
		lines.push(`- 轨迹定位: 记录 ${insights.gps.pointCount} 个点，位移约 ${km} 公里`);
	}

	// Health
	const h = insights.health;
	const healthParts: string[] = [];
	if (h.steps != null && h.steps > 0) healthParts.push(`步数 ${Math.round(h.steps)} 步`);
	if (h.distanceMeters != null && h.distanceMeters > 0) {
		healthParts.push(`步行距离 ${(h.distanceMeters / 1000).toFixed(2)} 公里`);
	}
	if (h.energyKcal != null && h.energyKcal > 0) {
		healthParts.push(`消耗 ${Math.round(h.energyKcal)} 千卡`);
	}
	if (h.exerciseMinutes != null && h.exerciseMinutes > 0) {
		healthParts.push(`锻炼 ${Math.round(h.exerciseMinutes)} 分钟`);
	}
	if (h.standHours != null && h.standHours > 0) {
		healthParts.push(`站立目标覆盖 ${h.standHours.toFixed(1)} 个小时（并非连续站立时长）`);
	}
	if (h.flights != null && h.flights > 0) {
		healthParts.push(`爬楼 ${Math.round(h.flights)} 层`);
	}
	if (h.waterMl != null && h.waterMl > 0) {
		healthParts.push(`饮水 ${Math.round(h.waterMl)} 毫升`);
	}
	if (h.sleepMinutes != null && h.sleepMinutes > 0) {
		const minutes = Math.round(h.sleepMinutes);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		healthParts.push(`睡眠 ${hours}小时${mins}分`);
	}
	if (h.heartRate && h.heartRate.samples > 0) {
		healthParts.push(
			`心率平均 ${Math.round(h.heartRate.average)} bpm (${Math.round(h.heartRate.min)}-${Math.round(h.heartRate.max)})`,
		);
	}
	if (healthParts.length > 0) {
		lines.push(`- 健康体征: ${healthParts.join("，")}`);
	}

	// Workouts
	if (insights.workoutCount > 0) {
		const wNames = insights.workouts.slice(0, 5).map((w) => {
			const dur = w.durationMinutes > 0 ? ` (${Math.round(w.durationMinutes)}分钟)` : "";
			return `${w.title}${dur}`;
		});
		lines.push(`- 运动健身: 共 ${insights.workoutCount} 次运动 [${wNames.join("、")}]`);
	}

	return lines;
}

async function foldSummaryInputHash(
	env: WorkerEnv,
	query: { date: string; timeZone: string; start: string; end: string },
	eventsHash: string,
	insights: DayInsights,
	settings: GeneralSettings,
	sourceConfiguration = "[]",
): Promise<string> {
	return createHash("sha256")
		.update(eventsHash)
		.update(JSON.stringify(settings))
		.update(sourceConfiguration)
		.update(await cachedPublicContextFingerprint(env, query, insights, settings.places))
		.digest("hex");
}

export function formatHealthEvidence(
	health: HealthStory | null,
	timeZone: string,
	namedPlaces: readonly NamedPlace[] = [],
	routine: SleepRoutine | null = null,
): string[] {
	const noObservedSleep = routine
		? [
				"- 没有归属本日起床的实测睡眠时段。个人作息只是平日习惯，不能据此写出今天几点入睡、几点起床或睡了多久；今晚入睡如有观测，以该记录为准。",
			]
		: [];
	if (!health) return noObservedSleep;
	const clock = (at: string) =>
		new Intl.DateTimeFormat("zh-CN", {
			timeZone,
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).format(new Date(at));
	return [
		...(health.nights.length ? [] : noObservedSleep),
		...health.nights.flatMap((night) => {
			const named = night.place ? matchNamedPlace(night.place, namedPlaces) : null;
			const observed = `- 醒来的这一夜：${clock(night.fellAsleepAt)} 入睡，${clock(night.wokeAt)} 睡眠结束，实际睡眠 ${Math.round(night.asleepMinutes)} 分钟${night.inBedMinutes !== null ? `；卧床 ${Math.round(night.inBedMinutes)} 分钟（不等于实际睡眠）` : ""}${night.awakeMinutes !== null ? `；夜间清醒 ${Math.round(night.awakeMinutes)} 分钟` : ""}；睡眠阶段 ${night.stages.map((stage) => `${stage.label} ${Math.round(stage.minutes)} 分钟`).join("、")}${night.place ? `；夜间 ${night.place.sampleCount} 个 GPS 采样位于约 ${Math.round(night.place.radiusMeters)} 米范围，${named ? `采样中心落在用户命名的「${named.label}」范围内（半径 ${named.radiusMeters} 米）` : "场所性质未知"}` : ""}`;
			return routine
				? [
						observed,
						`- 同一段睡眠改用作息设置的 ${routine.timeZone} 钟表：${formatEvidenceTime(night.fellAsleepAt, "minute", routine.timeZone)} 入睡，${formatEvidenceTime(night.wokeAt, "minute", routine.timeZone)} 这段记录结束；平时 ${routine.bedtime} 入睡、${routine.wakeTime} 起床。比较早晚时使用这一组同一时区的钟点，不能拿展示时区的钟点直接与另一时区的习惯比较，也不能据此填补这段以外的睡眠。`,
					]
				: [observed];
		}),
		...health.bedtimes.map(
			(bedtime) => `- 今晚 ${clock(bedtime.occurredAt)} 入睡，完整睡眠归属次日起床日。`,
		),
		...health.workouts.map(
			({ canonical: workout }) =>
				`- ${clock(workout.startAt)}${workout.endAt ? ` 至 ${clock(workout.endAt)}` : ""} ${workout.title}，锻炼 ${Math.round(workout.durationMinutes)} 分钟${workout.distanceMeters !== null ? `，距离 ${(workout.distanceMeters / 1000).toFixed(2)} 公里` : ""}${workout.energyKcal !== null ? `，活动能量 ${Math.round(workout.energyKcal)} 千卡` : ""}。同段地图与锻炼是同一活动的证据，不算两次出行。`,
		),
		...health.moments
			.filter((moment) => moment.kind !== "heartPeak")
			.map(
				(moment) =>
					`- ${formatEvidenceTime(moment.occurredAt, "hour", timeZone)} 这一小时：${moment.title}，${moment.detail}${moment.context.length ? `；${moment.context.join("；")}` : ""}`,
			),
		...health.moments
			.filter((moment) => moment.kind === "heartPeak")
			.map(
				(moment) =>
					`- ${clock(moment.occurredAt)} 心率 ${moment.bpm} bpm；${moment.context.join("；") || "无同时段活动记录"}`,
			),
		...health.bloodPressure.map(
			(reading) =>
				`- ${clock(reading.occurredAt)} 血压 ${reading.systolic ?? "未记录"}/${reading.diastolic ?? "未记录"} mmHg（${reading.sourceName}）`,
		),
		...health.ecg.map(
			(ecg) =>
				`- ${clock(ecg.occurredAt)} 心电图测量；设备原始分类：${ecg.classificationLabel}${ecg.averageHeartRate ? `；平均心率 ${ecg.averageHeartRate} bpm` : ""}${ecg.durationSeconds ? `；持续 ${ecg.durationSeconds} 秒` : ""}`,
		),
		...(health.day.oxygen
			? [
					`- 血氧：${health.day.oxygen.samples} 次测量，均值 ${health.day.oxygen.mean.toFixed(1)}%（当日样本汇总，无时段归属）`,
				]
			: []),
		...(health.day.respiratory
			? [
					`- 呼吸频率：${health.day.respiratory.samples} 次测量，均值 ${health.day.respiratory.mean.toFixed(1)} 次/分（当日样本汇总，无时段归属）`,
				]
			: []),
		...(health.day.hrv
			? [
					`- 心率变异性 HRV：当日样本均值 ${health.day.hrv.mean.toFixed(1)} ms，无时段归属，不能作医学判断。`,
				]
			: []),
		...(health.day.restingHeartRate !== null
			? [`- 静息心率：当日记录 ${health.day.restingHeartRate} bpm，不代表某一时段的实时心率。`]
			: []),
	];
}

/**
 * Assemble the complete day evidence. The writing contract is a separate system message,
 * so imported notes cannot redefine the task or override the narrator's instructions.
 */
export function buildDaySummaryPrompt(
	date: string,
	timeZone: string,
	eventCount: number,
	sourceCounts: Record<string, number>,
	samplesBySource: Record<string, NarrativeSample[]>,
	insights: DayInsights,
	healthEvidence: string[] = [],
	diaryEvidence: string[] = [],
	previous?: { content: string; revision?: string },
	personalContext: string[] = [],
	sourceEvidence: Partial<Record<keyof DiarySections, string[]>> = {},
): string {
	const statsLines = Object.entries(sourceCounts)
		.slice(0, MAX_SAMPLED_SOURCES)
		.map(([source, count]) => `- ${source.slice(0, 80)}: 共 ${count} 条记录`);

	const healthLines = [...formatInsightsEvidence(insights), ...healthEvidence];

	const samples = Object.entries(samplesBySource)
		.flatMap(([source, list]) => list.map((item) => ({ ...item, source })))
		.sort((a, b) => a.time.localeCompare(b.time) || a.source.localeCompare(b.source));
	const sampleLine = (item: (typeof samples)[number]) =>
		`[${formatEvidenceTime(item.time, item.precision, timeZone)}; precision=${item.precision}] ${item.source.slice(0, 80)}：${item.title}${item.content ? ` - ${item.content}` : ""}`;
	const timedSamples = samples.filter((item) => item.precision !== "day").map(sampleLine);
	const dailySamples = samples.filter((item) => item.precision === "day").map(sampleLine);

	const previousParts: string[] = [];
	// The stored document is bounded by the AI transport's 16,000-character limit.
	// Keep its complete JSON, including late cards, when feedback refers to the previous wording.
	if (previous?.content) previousParts.push(`【上一则日记】\n${previous.content.slice(0, 16_000)}`);
	if (previous?.revision)
		previousParts.push(
			`【作者希望这次改动】\n${previous.revision.slice(0, 2_000)}\n请吸收意见后重写，不要复述意见本身。`,
		);
	const previousBlock = previousParts.length ? `\n\n${previousParts.join("\n\n")}` : "";

	return `请为 ${date}（展示时区 ${timeZone}）写当天生活实录，遵守系统给定的 JSON 结构。材料已经分层；记录多不代表重要，先用 GPS 与消费备注还原个人生活，再单独理解开发、文章和 GitHub。

${personalContext.length ? `【用户确认的地点与作息背景，与当日观测分开】\n${personalContext.join("\n")}\n\n` : ""}${diaryEvidence.join("\n")}

【有时刻的个人事件样本，跨来源按时间排列】
${timedSamples.join("\n")}

【只有日期的事件样本，无日内顺序】
${dailySamples.join("\n")}

【第二层：完整日窗口的身体证据，辅助生活主线，不写指标清单】
${healthLines.length > 0 ? healthLines.join("\n") : "- 当天没有额外的身体证据"}

【独立创作区 → sections.writing；低频但重要，不得被开发日志挤掉】
${sourceEvidence.writing?.length ? sourceEvidence.writing.join("\n") : "无对应来源记录，writing 必须为 null。"}

【独立开发区 → sections.development；电脑观测不等于本人持续工作】
${sourceEvidence.development?.length ? sourceEvidence.development.join("\n") : "无对应来源记录，development 必须为 null。"}

【独立 GitHub 区 → sections.github；按项目理解，自动化活动只是辅助信号】
${sourceEvidence.github?.length ? sourceEvidence.github.join("\n") : "无对应来源记录，github 必须为 null。"}

【数据覆盖，仅供判断依据多少，不写入日记】
总事件数: ${eventCount} 条
${statsLines.join("\n")}${previousBlock}

${personalContext.length ? "个人背景最后核对：如果设置了作息，只按本人习惯和同一时区下的实测钟点理解早晚，不按常见作息判断异常；习惯不能填入记录空白。配置中的地点不是当天到访清单，家附近的单点也不是全天在家的证明。\n\n" : ""}输出前静默自检：生活正文是否仍以 GPS 和消费备注为主，天气与健康作为支持？单篇文章有没有得到重视？开发和 GitHub 是否主要在各自卡片，未被写成人持续工作的证明？只有一两条个人线索时，narrative 只写一段、不超过 100 字；只有电脑/GitHub 时，只写一句不超过 60 字的个人生活资料不足说明，不复述数字活动、不猜测本人操作或监看。保留日期精度与备注中的反证，不把记录空白写成经历。最后检查 JSON 能否解析、version 是否为 1、narrative 是否非空、三个卡片是否都在 sections 内、无记录时是否为 null、summary 与 highlights 的类型和长度是否正确；修正后只输出 JSON，不展示检查过程。`;
}

/**
 * Attempt to acquire lease for generating summary carrying a unique token.
 * Returns lease token string if acquired, null if another generator holds active lease.
 */
async function acquireLease(
	db: D1Database,
	date: string,
	timezone: string,
	now: number,
): Promise<string | null> {
	const token = crypto.randomUUID();
	const result = await withD1Retry(() =>
		db
			.prepare(
				"INSERT INTO day_summary_leases (date, timezone, lease_token, leased_until) VALUES (?, ?, ?, ?) ON CONFLICT(date, timezone) DO UPDATE SET lease_token = excluded.lease_token, leased_until = excluded.leased_until WHERE day_summary_leases.leased_until <= ? OR day_summary_leases.lease_token = excluded.lease_token",
			)
			.bind(date, timezone, token, now + LEASE_DURATION_MS, now)
			.run(),
	);
	return result.meta.changes > 0 ? token : null;
}

/** Release generation lease ONLY if this request owns it via matching lease_token. */
async function releaseLease(
	db: D1Database,
	date: string,
	timezone: string,
	leaseToken: string,
): Promise<void> {
	try {
		await withD1Retry(() =>
			db
				.prepare(
					"DELETE FROM day_summary_leases WHERE date = ? AND timezone = ? AND lease_token = ?",
				)
				.bind(date, timezone, leaseToken)
				.run(),
		);
	} catch {
		// ignore
	}
}

/**
 * GET /api/day-summary?date=YYYY-MM-DD&timeZone=...&start=ISO&end=ISO
 */
export async function handleGetDaySummary(env: WorkerEnv, url: URL): Promise<Response> {
	const query = safeValidateSummaryQuery({
		date: url.searchParams.get("date"),
		timeZone: url.searchParams.get("timeZone"),
		start: url.searchParams.get("start"),
		end: url.searchParams.get("end"),
	});

	const row = await withD1Retry(() =>
		env.DB.prepare(`
		SELECT date, timezone, start_at, end_at, content, provider, model, input_hash, event_count, generated_at
		FROM day_summaries
		WHERE date = ? AND timezone = ?
	`)
			.bind(query.date, query.timeZone)
			.first<StoredSummaryRow>(),
	);

	const startMs = new Date(query.start).getTime();
	const endMs = new Date(query.end).getTime();
	const external = await readDaySources(env, query, "cached-only");
	const [streamed, settings] = await Promise.all([
		streamDayEvents(env, startMs, endMs, query, false, external.events),
		readGeneralSettings(env),
	]);
	const inputHash = await foldSummaryInputHash(
		env,
		query,
		streamed.inputHash,
		streamed.insights,
		settings,
		external.configuration,
	);
	const eventCount = streamed.eventCount;

	if (!row) {
		const result: DaySummaryResult = {
			summary: null,
			stale: false,
			eventCount,
		};
		return jsonResponse({ data: result });
	}

	const isStale =
		row.input_hash !== inputHash ||
		row.event_count !== eventCount ||
		row.start_at !== query.start ||
		row.end_at !== query.end;

	const summary: DaySummary = {
		date: row.date,
		timeZone: row.timezone,
		start: row.start_at,
		end: row.end_at,
		...readDiaryContent(row.content),
		provider: row.provider,
		model: row.model,
		generatedAt: new Date(row.generated_at).toISOString(),
		eventCount: row.event_count,
		inputHash: row.input_hash,
	};

	const result: DaySummaryResult = {
		summary,
		stale: isStale,
		eventCount,
	};

	return jsonResponse({ data: result });
}

/**
 * POST /api/day-summary
 * Body: { date, timeZone, start, end }
 * Generates or regenerates daily summary.
 * Empty-day returns 400 no_records (does not write an invented empty summary).
 * Keeps previous successful summary in DB on generation failure.
 * Atomic CAS lease: writes summary using single INSERT ... SELECT ... WHERE EXISTS (...) check.
 */
export async function handlePostDaySummary(request: Request, env: WorkerEnv): Promise<Response> {
	const body = await readJsonBody<unknown>(request);
	const query = safeValidateSummaryGenerate(body);

	const startMs = new Date(query.start).getTime();
	const endMs = new Date(query.end).getTime();

	const now = Date.now();

	// Acquire concurrency lease with unique token
	const leaseToken = await acquireLease(env.DB, query.date, query.timeZone, now);
	if (!leaseToken) {
		throw new ApiError(409, "generation_in_progress", "该日期的总结正在生成中，请稍候");
	}

	try {
		// Stream events page-by-page, accumulating bounded evidence & hash
		const external = await readDaySources(env, query);
		if (external.sources.some((source) => source.state !== "ready"))
			throw new ApiError(
				503,
				"source_unavailable",
				"部分数据源暂时无法读取，日记未更新，请稍后重试。",
			);
		const [streamed, settings] = await Promise.all([
			streamDayEvents(env, startMs, endMs, query, true, external.events),
			readGeneralSettings(env),
		]);
		const {
			insights,
			health,
			healthEvents,
			pixiuEvents,
			inputHash,
			eventCount,
			sourceCounts,
			samplesBySource,
		} = streamed;

		// Empty-day: reject with 400 no_records
		if (eventCount === 0) {
			throw new ApiError(400, "no_records", "当日没有任何活动记录，无法生成总结");
		}

		// Feedback may refer to the previous wording. A fresh generation uses only source evidence.
		const previousRow = query.revision
			? await withD1Retry(() =>
					env.DB.prepare("SELECT content FROM day_summaries WHERE date = ? AND timezone = ?")
						.bind(query.date, query.timeZone)
						.first<{ content: string }>(),
				)
			: null;
		const diaryEvidence = await collectDiaryEvidence(env, {
			date: query.date,
			timeZone: query.timeZone,
			start: query.start,
			end: query.end,
			insights,
			health,
			pixiuEvents,
			settings,
		});
		const sourceEvidence = {
			development: formatDaySourceEvidence(
				external.events.filter((event) => event.sourceId === "gecko"),
				query.timeZone,
			),
			writing: formatDaySourceEvidence(
				external.events.filter((event) => event.sourceId === "firefly"),
				query.timeZone,
			),
			github: formatDaySourceEvidence(
				external.events.filter((event) => event.sourceId === "github"),
				query.timeZone,
			),
		};
		const inputHashWithContext = await foldSummaryInputHash(
			env,
			query,
			inputHash,
			insights,
			settings,
			external.configuration,
		);
		const prompt = buildDaySummaryPrompt(
			query.date,
			query.timeZone,
			eventCount,
			sourceCounts,
			samplesBySource,
			insights,
			[
				...formatHealthEvidence(health, query.timeZone, settings.places, settings.routine),
				...formatHealthDimensionsEvidence(healthEvents, query.timeZone),
			],
			diaryEvidence,
			previousRow?.content
				? { content: previousRow.content, revision: query.revision }
				: query.revision
					? { content: "", revision: query.revision }
					: undefined,
			formatPersonalContext(settings),
			sourceEvidence,
		);

		const { content, provider, model } = await generateAiText(
			env,
			prompt,
			DIARY_GENERATION_TIMEOUT_MS,
			DIARY_OUTPUT_TOKENS,
			{ system: DIARY_SYSTEM_PROMPT, reasoning: true },
		);
		let document: DiaryDocument;
		try {
			document = parseDiaryDocument(content);
			for (const key of ["development", "writing", "github"] as const) {
				if ((document.sections[key] !== null) !== sourceEvidence[key].length > 0)
					throw new Error("Diary section does not match its source evidence");
			}
		} catch {
			throw new ApiError(
				502,
				"invalid_diary_format",
				"AI 返回的日记格式不完整或不符合要求，请重新生成；已有日记会保留。",
			);
		}
		const currentExternal = await readDaySources(env, query);
		if (currentExternal.sources.some((source) => source.state !== "ready"))
			throw new ApiError(
				503,
				"source_unavailable",
				"部分数据源暂时无法读取，日记未更新，请稍后重试。",
			);
		const [current, currentSettings] = await Promise.all([
			streamDayEvents(env, startMs, endMs, query, false, currentExternal.events),
			readGeneralSettings(env),
		]);
		const currentHash = await foldSummaryInputHash(
			env,
			query,
			current.inputHash,
			current.insights,
			currentSettings,
			currentExternal.configuration,
		);

		const generatedAt = Date.now();

		// Single-query atomic CAS: insert/update summary ONLY if active lease still holds our leaseToken and has not expired
		const saveQuery = `
			INSERT INTO day_summaries (date, timezone, start_at, end_at, content, provider, model, input_hash, event_count, generated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			WHERE EXISTS (
				SELECT 1 FROM day_summary_leases
				WHERE date = ? AND timezone = ? AND lease_token = ? AND leased_until > ?
			)
			ON CONFLICT(date, timezone) DO UPDATE SET
				start_at = excluded.start_at,
				end_at = excluded.end_at,
				content = excluded.content,
				provider = excluded.provider,
				model = excluded.model,
				input_hash = excluded.input_hash,
				event_count = excluded.event_count,
				generated_at = excluded.generated_at
		`;

		const saved = await withD1Retry(() =>
			env.DB.prepare(saveQuery)
				.bind(
					query.date,
					query.timeZone,
					query.start,
					query.end,
					JSON.stringify(document),
					provider,
					model,
					inputHashWithContext,
					eventCount,
					generatedAt,
					query.date,
					query.timeZone,
					leaseToken,
					generatedAt,
				)
				.run(),
		);

		if (saved.meta.changes === 0)
			throw new ApiError(409, "generation_expired", "生成已过期，请重新生成");

		const summary: DaySummary = {
			date: query.date,
			timeZone: query.timeZone,
			start: query.start,
			end: query.end,
			content: document.narrative,
			sections: document.sections,
			provider,
			model,
			generatedAt: new Date(generatedAt).toISOString(),
			eventCount,
			inputHash: inputHashWithContext,
		};

		return jsonResponse({
			data: {
				summary,
				stale: currentHash !== inputHashWithContext,
				eventCount: current.eventCount,
			},
		});
	} finally {
		await releaseLease(env.DB, query.date, query.timeZone, leaseToken);
	}
}
