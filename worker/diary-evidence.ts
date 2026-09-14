/**
 * Bounded diary evidence: weather, sun, a few GPS stays, and date-only spending.
 * Place labels come from public-context; never request every GPS point.
 */
import type { DayContextQuery, DaySun, DayWeather } from "../src/models/day-context.js";
import { weatherDescription } from "../src/models/day-context.js";
import type { DayInsights } from "../src/models/day-insights.js";
import { buildDayPlaces, type DayPlaces, type GpsPlace } from "../src/models/day-places.js";
import { computerActivitySchema, publishedArticleSchema } from "../src/models/day-sources.js";
import { buildFinanceDay, formatMinor } from "../src/models/finance.js";
import {
	type GeneralSettings,
	matchNamedPlace,
	type NamedPlace,
} from "../src/models/general-settings.js";
import { GITHUB_ACTION_LABELS, githubActivitySchema } from "../src/models/github.js";
import { buildGpsJourneys, TRAVEL_MODE_LABELS } from "../src/models/gps-journeys.js";
import type { HealthStory } from "../src/models/health-insights.js";
import { PIXIU_COLUMNS } from "../src/models/pixiu.js";
import type { LifeEvent, Precision } from "../src/models/types.js";
import { withD1Retry } from "./database.js";
import {
	buildPlaceCacheKey,
	buildSunCacheKey,
	buildWeatherCacheKey,
	getDaySun,
	getDayWeather,
	getPlaceLabel,
	roundCoordinate,
} from "./public-context.js";
import type { WorkerEnv } from "./types.js";

export const MAX_DIARY_PLACES = 4;

export function formatDaySourceEvidence(events: LifeEvent[], timeZone: string): string[] {
	return events.flatMap((event) => {
		const clock = formatEvidenceTime(event.occurredAt, event.precision, timeZone);
		const computer =
			event.sourceId === "gecko" ? computerActivitySchema.safeParse(event.data) : null;
		if (computer?.success)
			return [
				`- 电脑前台活动 ${clock} 这一小时（不等同于连续工作，已过滤闲置）：${JSON.stringify({
					activeSeconds: computer.data.activeSeconds,
					apps: computer.data.apps.map((app, index) => ({
						name: app.name,
						seconds: app.seconds,
						titles: index < 6 ? app.titles.slice(0, 3).map((title) => title.slice(0, 160)) : [],
					})),
				})}`,
			];
		const article =
			event.sourceId === "firefly" ? publishedArticleSchema.safeParse(event.data) : null;
		if (article?.success)
			return [
				`- ${clock} 公开发表文章：${JSON.stringify({ title: event.title, summary: event.content, author: article.data.author, url: article.data.url })}`,
			];
		const github = event.sourceId === "github" ? githubActivitySchema.safeParse(event.data) : null;
		if (github?.success)
			return [
				`- ${clock} GitHub ${GITHUB_ACTION_LABELS[github.data.action]}：${JSON.stringify({
					account: github.data.account.login,
					repository: github.data.repository,
					title: event.title,
					url: github.data.url,
					number: github.data.number,
					sha: github.data.sha,
				})}。提交按作者时间；PR 属于该账号创建的 PR，合并或关闭不证明由本人操作，也不代表连续工作时长。`,
			];
		return [];
	});
}

export interface DiaryPublicApi {
	getDaySun(env: WorkerEnv, query: DayContextQuery): Promise<DaySun>;
	getDayWeather(env: WorkerEnv, query: DayContextQuery): Promise<DayWeather | null>;
	getPlaceLabel(
		env: WorkerEnv,
		point: { latitude: number; longitude: number },
	): Promise<string | null>;
}

export interface DiaryEvidenceInput {
	date: string;
	timeZone: string;
	start: string;
	end: string;
	insights: DayInsights;
	health: HealthStory | null;
	pixiuEvents: LifeEvent[];
	settings?: GeneralSettings;
}

const publicApi: DiaryPublicApi = { getDaySun, getDayWeather, getPlaceLabel };

/** Self-reported context is separate from the day's observed evidence. */
export function formatPersonalContext(settings: GeneralSettings): string[] {
	const lines: string[] = [];
	if (settings.places.length) {
		lines.push(
			`用户命名的地点范围：${JSON.stringify(settings.places.map(({ label, radiusMeters }) => ({ label, radiusMeters })))}`,
			"这些名称是用户的背景设置，并非当天到访清单。下方只有采样命中的范围才带上名称；范围内采样不证明进入具体建筑，当前名称也不证明历史用途。",
		);
	}
	if (settings.routine) {
		const { bedtime, wakeTime, timeZone } = settings.routine;
		lines.push(
			`用户自述平时作息：通常 ${bedtime} 入睡，${wakeTime} 起床；每天按 ${timeZone} 的当地钟表时间理解，不是 UTC 事件。`,
			"用这份个人作息理解当天，而非按一般人的睡觉起床时间评价早晚。它只是习惯，不是当天的睡眠记录；实际观测优先，缺失处不能用习惯填满。展示时区不同时，应先区分两个时区再比较。",
		);
	}
	return lines;
}

async function quiet<T>(work: Promise<T>): Promise<T | null> {
	try {
		return await work;
	} catch {
		return null;
	}
}

function clock(at: string, timeZone: string): string {
	return new Intl.DateTimeFormat("zh-CN", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(at));
}

/** Present only the precision the source actually recorded. */
export function formatEvidenceTime(iso: string, precision: Precision, timeZone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("zh-CN", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(new Date(iso))
			.map(({ type, value }) => [type, value]),
	);
	const date = `${parts.year}/${parts.month}/${parts.day}`;
	if (precision === "day") return date;
	if (precision === "hour") return `${date} ${parts.hour}时`;
	if (precision === "minute") return `${date} ${parts.hour}:${parts.minute}`;
	return `${date} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function selectDiaryPlaces(built: DayPlaces): GpsPlace[] {
	const ranked = [...built.places].sort(
		(a, b) =>
			b.totalObservedMinutes - a.totalObservedMinutes ||
			b.pointCount - a.pointCount ||
			a.index - b.index,
	);
	const selected: GpsPlace[] = [];
	if (built.representativePlace) selected.push(built.representativePlace);
	for (const place of ranked) {
		if (selected.some((item) => item.id === place.id)) continue;
		selected.push(place);
		if (selected.length >= MAX_DIARY_PLACES) break;
	}
	return selected.slice(0, MAX_DIARY_PLACES);
}

export function formatWeatherEvidence(weather: DayWeather | null, timeZone: string): string[] {
	void timeZone;
	if (!weather) return [];
	const sky = weatherDescription(weather.weatherCode);
	const range =
		weather.temperatureMin !== null && weather.temperatureMax !== null
			? `当日最低 ${weather.temperatureMin.toFixed(0)}°C，最高 ${weather.temperatureMax.toFixed(0)}°C（不能据此判断升降温顺序）`
			: weather.temperatureMean !== null
				? `气温约 ${weather.temperatureMean.toFixed(0)}°C`
				: "气温未知";
	const rain =
		weather.precipitationMm === null ? "降水未知" : `降水 ${weather.precipitationMm.toFixed(1)} mm`;
	const wind =
		weather.windMaxKmh === null ? "风力未知" : `最大风 ${Math.round(weather.windMaxKmh)} km/h`;
	const kind = weather.kind === "historical" ? "历史再分析" : "预报资料";
	return [
		`- 天气：${sky}，${range}，${rain}，${wind}（${kind}；${weather.complete ? "完整日窗口" : "部分时段资料，不能代表全天"}）`,
	];
}

export function formatSunEvidence(sun: DaySun | null, timeZone: string): string[] {
	if (!sun) return [];
	if (sun.status === "polar_night") return ["- 天光：极夜，没有日出日落"];
	if (sun.status === "midnight_sun") return ["- 天光：极昼"];
	return sun.events.map((event) => {
		const label = event.kind === "sunrise" ? "日出" : "日落";
		return `- ${label} ${clock(event.occurredAt, timeZone)}`;
	});
}

/** Every record dimension participates, including rare observations missed by hourly sampling.
 * Raw ranges never sum overlapping devices or units into the deduplicated day totals. */
export function formatHealthDimensionsEvidence(events: LifeEvent[], timeZone: string): string[] {
	const dimensions = new Map<
		string,
		{
			type: string;
			unit: string;
			count: number;
			min: number;
			max: number;
			first: LifeEvent;
			last: LifeEvent;
		}
	>();
	for (const event of events) {
		const data = event.data;
		if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.type !== "string")
			continue;
		const unit = typeof data.unit === "string" ? data.unit : "";
		const key = JSON.stringify([data.type, unit]);
		const group = dimensions.get(key) ?? {
			type: data.type,
			unit,
			count: 0,
			min: Infinity,
			max: -Infinity,
			first: event,
			last: event,
		};
		group.count++;
		if (event.occurredAt < group.first.occurredAt) group.first = event;
		if (event.occurredAt > group.last.occurredAt) group.last = event;
		const value =
			typeof data.value === "number" || (typeof data.value === "string" && data.value.trim())
				? Number(data.value)
				: NaN;
		if (Number.isFinite(value)) {
			group.min = Math.min(group.min, value);
			group.max = Math.max(group.max, value);
		}
		dimensions.set(key, group);
	}
	const sample = (event: LifeEvent) => {
		const data = event.data as Record<string, unknown>;
		const value =
			typeof data.value === "string" || typeof data.value === "number"
				? `，原值 ${String(data.value).slice(0, 160)}`
				: "";
		return `${formatEvidenceTime(event.occurredAt, event.precision, timeZone)}${value}`;
	};
	return [...dimensions.values()]
		.sort((a, b) => a.type.localeCompare(b.type) || a.unit.localeCompare(b.unit))
		.map((group) => {
			const range = Number.isFinite(group.min) ? `，原数值范围 ${group.min}–${group.max}` : "";
			const last = group.first === group.last ? "" : `；末条 ${sample(group.last)}`;
			const meaning = group.type.endsWith("AppleStandHour")
				? " 小时达标状态：Idle=未达标，Stood=达标，不代表整小时站立，不能推断清醒或睡眠质量。"
				: "";
			return `- 原始健康维度 ${group.type}（单位 ${group.unit || "无"}）：${group.count} 条观测${range}；首条 ${sample(group.first)}${last}。不与全天去重汇总相加。${meaning}`;
		});
}

export function formatSpendingEvidence(events: LifeEvent[]): string[] {
	const rows = events.filter((event) => event.sourceId === "pixiu" && event.precision === "day");
	const day = buildFinanceDay(rows);
	if (!day.recordCount) return [];
	const lines: string[] = [];
	if (day.sourceDates.length)
		lines.push(`- 记账日：${day.sourceDates.join("、")}（源记账日期，无交易时刻）`);
	for (const row of day.currencies) {
		const prefix = row.currency;
		if (row.expenseMinor)
			lines.push(`- ${prefix} 日常消费（仅「日常支出」流出）：${formatMinor(row.expenseMinor)}`);
		if (row.expenseInflowMinor)
			lines.push(
				`- ${prefix} 「日常支出」类流入 ${formatMinor(row.expenseInflowMinor)}（仅凭分类不可当作退款；具体性质以本笔备注为准）`,
			);
		if (row.incomeMinor) lines.push(`- ${prefix} 日常收入：${formatMinor(row.incomeMinor)}`);
		if (row.transfersMinor)
			lines.push(`- ${prefix} 转账：${formatMinor(row.transfersMinor)}（不算消费或收入）`);
		if (row.otherInflowMinor || row.otherOutflowMinor)
			lines.push(
				`- ${prefix} 其他分类流入 ${formatMinor(row.otherInflowMinor)}、流出 ${formatMinor(row.otherOutflowMinor)}（还款/余额调整/投资等，不算消费或收入）`,
			);
		for (const group of row.classifications) {
			lines.push(
				`- ${prefix} 原分类「${group.name}」：${group.count} 笔，流入 ${formatMinor(group.inflowMinor)}，流出 ${formatMinor(group.outflowMinor)}`,
			);
		}
		for (const category of row.categories) {
			lines.push(
				`- ${prefix} 日常消费类型「${category.name}」：${category.count} 笔，${formatMinor(category.amountMinor)}`,
			);
		}
	}
	const types = new Map<string, number>();
	for (const event of rows) {
		const data =
			event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
		const classification =
			typeof data.交易分类 === "string" && data.交易分类 ? data.交易分类 : "未分类";
		const type = typeof data.交易类型 === "string" && data.交易类型 ? data.交易类型 : event.title;
		const key = `${classification}\0${type}`;
		types.set(key, (types.get(key) ?? 0) + 1);
	}
	for (const [key, count] of [...types].sort(([a], [b]) => a.localeCompare(b))) {
		const [classification, type] = key.split("\0");
		lines.push(`- 记账类型「${classification} / ${type}」：${count} 笔`);
	}
	lines.push("- 逐笔记账线索：每行是一笔完整原记录，重点理解备注；行序不是交易先后，无交易时刻。");
	for (const event of rows) {
		const data =
			event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
		// Keep all nine original cells together: a preorder, reimbursement or duplicate note
		// means something different beside its own classification, currency and flow direction.
		lines.push(
			JSON.stringify(
				Object.fromEntries(PIXIU_COLUMNS.map((column) => [column, data[column] ?? ""])),
			),
		);
	}
	return lines;
}

export async function collectDiaryEvidence(
	env: WorkerEnv,
	input: DiaryEvidenceInput,
	api: DiaryPublicApi = publicApi,
): Promise<string[]> {
	const built = buildDayPlaces(input.insights.gps, 5, input.settings?.places);
	const places = selectDiaryPlaces(built);
	const anchor = places[0]?.anchor ?? built.allDayPoints[0];
	const query: DayContextQuery | null = anchor
		? {
				date: input.date,
				timeZone: input.timeZone,
				start: input.start,
				end: input.end,
				latitude: roundCoordinate(anchor.latitude),
				longitude: roundCoordinate(anchor.longitude),
			}
		: null;
	const [weather, sun, labels] = query
		? await Promise.all([
				quiet(api.getDayWeather(env, query)),
				quiet(api.getDaySun(env, query)),
				Promise.all(
					places.map((place) =>
						place.namedPlace
							? Promise.resolve(place.namedPlace.label)
							: quiet(
									api.getPlaceLabel(env, {
										latitude: roundCoordinate(place.anchor.latitude),
										longitude: roundCoordinate(place.anchor.longitude),
									}),
								),
					),
				),
			])
		: [null, null, [] as (string | null)[]];
	const placeLabels = new Map(
		places.map((place, index) => [
			place.id,
			labels[index] ?? `未命名区域 ${place.index}（场所未知）`,
		]),
	);
	// Saved names need no GIS request. Include them even if they are outside the four public lookups.
	for (const place of built.places)
		if (place.namedPlace) placeLabels.set(place.id, place.namedPlace.label);
	const visits = built.visits.filter((visit) => placeLabels.has(visit.placeId));
	// Keep early and late returns even on a day with many area changes; no extra GIS requests.
	const sampledVisits =
		visits.length <= 24
			? visits
			: Array.from(
					{ length: 24 },
					(_, index) =>
						visits[Math.round((index * (visits.length - 1)) / 23)] as (typeof visits)[number],
				);
	const placeLines = sampledVisits.map((visit) => {
		const first = visit.points[0] as (typeof visit.points)[number];
		const last = visit.points.at(-1) as (typeof visit.points)[number];
		const start = formatEvidenceTime(visit.startAt, first.precision, input.timeZone);
		const end = formatEvidenceTime(visit.endAt, last.precision, input.timeZone);
		const named = built.places.find((place) => place.id === visit.placeId)?.namedPlace;
		return `- 定位时段 ${start}${start === end ? "" : ` 至 ${end}`}：在${named ? "用户命名的" : ""}「${placeLabels.get(visit.placeId)}」${named ? `范围内（半径 ${named.radiusMeters} 米）有采样` : "一带有记录"}。`;
	});
	const dailyNames = [
		...new Set(
			built.allDayPoints.flatMap((point) => {
				const named = matchNamedPlace(point, input.settings?.places ?? []);
				return named ? [named.label] : [];
			}),
		),
	];
	const pointLabels = new Map(
		built.visits.flatMap((visit) =>
			visit.points.map(
				(point) =>
					[
						point,
						placeLabels.get(visit.placeId) ?? `区域 ${visit.placeIndex}（场所未知）`,
					] as const,
			),
		),
	);
	const journeyLines = buildGpsJourneys(input.insights.gps, input.settings?.places).map(
		(journey) =>
			`- 连续移动 ${formatEvidenceTime(journey.startAt, journey.startPoint.precision, input.timeZone)} 至 ${formatEvidenceTime(journey.endAt, journey.endPoint.precision, input.timeZone)}：${JSON.stringify(
				{
					from: journey.startPlace ?? pointLabels.get(journey.startPoint),
					to: journey.endPlace ?? pointLabels.get(journey.endPoint),
					distanceKm: Number((journey.distanceMeters / 1000).toFixed(2)),
					movingMinutes: Number(journey.movingMinutes.toFixed(1)),
					excludedStopMinutes: Number(journey.stoppedMinutes.toFixed(1)),
					movingAverageKmh: Number(journey.averageKmh.toFixed(1)),
					likelyMode: TRAVEL_MODE_LABELS[journey.mode],
					modeEvidence: journey.modeReason,
					commute: journey.commute
						? `可能的通勤${journey.commute === "outbound" ? "去程" : "返程"}`
						: null,
					commuteEvidence: journey.commuteReason,
					pointsOfInterest: journey.pointsOfInterest.map((point) => ({
						label: point.label,
						sampledAt: formatEvidenceTime(point.at, "minute", input.timeZone),
					})),
				},
			)}`,
	);
	return [
		...formatWeatherEvidence(weather, input.timeZone),
		...formatSunEvidence(sun, input.timeZone),
		...(places.length
			? [
					"- 以下关键位置按时间排列，保留离开再返回。定位时段并非实际抵达、离开或持续停留时间，采样空档未知；这是大致区域，场所类型没有直接标注，可结合记账与睡眠等线索理解。",
				]
			: []),
		...placeLines,
		...(journeyLines.length
			? [
					"- 以下交通方式与通勤均为候选解释：均速按有效采样距离 / 移动时间估算，排除短暂停等；超过 5 分钟的断档、停留拆段，不能补全未采样行程。途经兴趣点只表示命名范围内有采样，不证明入内或消费；与同段健康运动不要重复算作另一次出行。",
					...journeyLines,
				]
			: []),
		...(dailyNames.length
			? [
					`- 只有日期、没有时刻的位置采样命中用户命名范围：${JSON.stringify(dailyNames)}，不能安排日内顺序。`,
				]
			: []),
		...formatSpendingEvidence(input.pixiuEvents),
	];
}

async function readCacheJson(
	env: WorkerEnv,
	kind: "sun" | "weather" | "place",
	cacheKey: string,
): Promise<string | null> {
	try {
		const row = await withD1Retry(() =>
			env.DB.prepare(
				"SELECT data_json, expires_at FROM public_context_cache WHERE kind = ? AND cache_key = ?",
			)
				.bind(kind, cacheKey)
				.first<{ data_json: string; expires_at: number | null }>(),
		);
		if (!row?.data_json) return null;
		if (row.expires_at !== null && row.expires_at <= Date.now()) return null;
		return row.data_json;
	} catch {
		return null;
	}
}

/** D1 cache only — never calls sunrise/weather/Nominatim. Empty cache hashes as null. */
export async function cachedPublicContextFingerprint(
	env: WorkerEnv,
	query: { date: string; timeZone: string; start: string; end: string },
	insights: DayInsights,
	namedPlaces: readonly NamedPlace[] = [],
): Promise<string> {
	const built = buildDayPlaces(insights.gps, 5, namedPlaces);
	const places = selectDiaryPlaces(built);
	const anchor = places[0]?.anchor ?? built.allDayPoints[0];
	if (!anchor) return JSON.stringify(null);
	const contextQuery: DayContextQuery = {
		date: query.date,
		timeZone: query.timeZone,
		start: query.start,
		end: query.end,
		latitude: roundCoordinate(anchor.latitude),
		longitude: roundCoordinate(anchor.longitude),
	};
	const [sun, weather, labels] = await Promise.all([
		readCacheJson(env, "sun", buildSunCacheKey(contextQuery)),
		readCacheJson(env, "weather", buildWeatherCacheKey(contextQuery)),
		Promise.all(
			places.map((place) =>
				place.namedPlace
					? Promise.resolve(null)
					: readCacheJson(
							env,
							"place",
							buildPlaceCacheKey(
								roundCoordinate(place.anchor.latitude),
								roundCoordinate(place.anchor.longitude),
							),
						),
			),
		),
	]);
	return JSON.stringify({ sun, weather, places: labels });
}
