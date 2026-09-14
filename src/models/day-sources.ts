import { z } from "zod";
import type { DaySummaryQuery } from "./ai";
import { unionMinutes } from "./day-insights";
import type { LifeEvent } from "./types";

export const DAY_SOURCE_PROVIDERS = ["gecko", "firefly", "github"] as const;
export type DaySourceProvider = (typeof DAY_SOURCE_PROVIDERS)[number];
export const DAY_SOURCE_NAMES = { gecko: "Gecko", firefly: "Firefly", github: "GitHub" } as const;

export interface DaySourceSettings {
	provider: DaySourceProvider;
	enabled: boolean;
	hasApiKey: boolean;
	account?: { id: number; login: string };
}
export interface DaySourceInput {
	enabled: boolean;
	apiKey?: string;
}
export interface DaySourceConnection {
	provider: DaySourceProvider;
	success: boolean;
	eventCount: number;
	date: string;
	message?: string;
}
export interface DaySourceStatus {
	provider: DaySourceProvider;
	state: "ready" | "error" | "pending";
	message?: string;
	stale: boolean;
}
export interface DaySourcesResult {
	events: LifeEvent[];
	sources: DaySourceStatus[];
	configuration: string;
}

const sessionSchema = z.object({
	id: z.string().min(1).max(200),
	appName: z.string().max(200),
	bundleId: z.string().nullable(),
	windowTitle: z.string().max(4096),
	startTime: z.number().finite(),
	duration: z
		.number()
		.finite()
		.nonnegative()
		.max(7 * 86400),
	type: z.string().optional(),
	idle: z.boolean().optional(),
});
export const geckoSnapshotSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	timezone: z.string().refine((value) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}),
	stats: z.object({ sessions: z.array(sessionSchema).max(30000) }),
});
export type GeckoSnapshot = z.infer<typeof geckoSnapshotSchema>;

const IDLE_BUNDLES = new Set([
	"com.apple.loginwindow",
	"com.apple.screensaver.engine",
	"com.apple.screencaptureui",
]);
export function isIdleSession(session: GeckoSnapshot["stats"]["sessions"][number]): boolean {
	return (
		session.idle === true ||
		/^(?:idle|idel)$/i.test(session.type ?? "") ||
		IDLE_BUNDLES.has((session.bundleId ?? "").toLowerCase()) ||
		/^(?:idle|idel|loginwindow|screensaver(?:engine)?)$/i.test(session.appName.trim())
	);
}

export function dateInTimeZone(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/** Wall-clock hours also handle fractional UTC offsets and repeated DST hours. */
function hourWindows(query: DaySummaryQuery) {
	const clock = new Intl.DateTimeFormat("en", {
		timeZone: query.timeZone,
		hour: "2-digit",
		hourCycle: "h23",
	});
	const hours = new Map<string, { start: number; end: number }[]>();
	const end = Date.parse(query.end);
	for (let at = Date.parse(query.start); at < end; at += 60000) {
		const key = clock.format(at);
		const spans = hours.get(key) ?? [];
		const last = spans.at(-1);
		if (last?.end === at) last.end = Math.min(at + 60000, end);
		else spans.push({ start: at, end: Math.min(at + 60000, end) });
		hours.set(key, spans);
	}
	return hours;
}

export const computerActivitySchema = z.object({
	type: z.literal("computer-activity"),
	activeSeconds: z.number(),
	sessionCount: z.number(),
	apps: z.array(z.object({ name: z.string(), seconds: z.number(), titles: z.array(z.string()) })),
});
export type ComputerActivity = z.infer<typeof computerActivitySchema>;

/** Split sessions at local hour boundaries; overlapping devices count active time only once. */
export function geckoHourEvents(snapshots: GeckoSnapshot[], query: DaySummaryQuery): LifeEvent[] {
	const sessions = [
		...new Map(
			snapshots
				.flatMap((snapshot) => snapshot.stats.sessions)
				// Gecko clips the same ID into distinct pieces on adjacent account dates.
				.map((session) => [`${session.id}:${session.startTime}:${session.duration}`, session]),
		).values(),
	]
		.filter((session) => !isIdleSession(session) && session.duration > 0)
		.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
	const events: LifeEvent[] = [];
	for (const [hour, spans] of hourWindows(query)) {
		const active: [number, number][] = [];
		const ids = new Set<string>();
		const apps = new Map<string, { intervals: [number, number][]; titles: Set<string> }>();
		for (const session of sessions) {
			for (const span of spans) {
				const start = Math.max(span.start, session.startTime * 1000);
				const end = Math.min(span.end, (session.startTime + session.duration) * 1000);
				if (end <= start) continue;
				active.push([start, end]);
				ids.add(session.id);
				const name = session.appName.trim() || "未命名应用";
				const app = apps.get(name) ?? { intervals: [], titles: new Set<string>() };
				app.intervals.push([start, end]);
				// Keep a few distinct window titles per app, not thousands of focus switches.
				if (session.windowTitle.trim() && app.titles.size < 6)
					app.titles.add(session.windowTitle.trim().slice(0, 300));
				apps.set(name, app);
			}
		}
		if (!active.length) continue;
		const appRows = [...apps]
			.map(([name, app]) => ({
				name,
				seconds: Math.round(unionMinutes(app.intervals) * 60),
				titles: [...app.titles],
			}))
			.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
		const activity: ComputerActivity = {
			type: "computer-activity",
			activeSeconds: Math.round(unionMinutes(active) * 60),
			sessionCount: ids.size,
			apps: appRows,
		};
		events.push({
			id: `gecko:${query.date}:${query.timeZone}:${hour}`,
			sourceId: "gecko",
			sourceName: "Gecko",
			sourceKind: "external",
			occurredAt: new Date(spans[0]?.start ?? 0).toISOString(),
			endAt: new Date(spans.at(-1)?.end ?? 0).toISOString(),
			precision: "hour",
			title: "电脑活动",
			content: appRows
				.slice(0, 4)
				.map((app) => app.name)
				.join(" · "),
			data: activity,
			updatedAt: new Date(Math.max(...active.map((interval) => interval[1]))).toISOString(),
		});
	}
	return events;
}

const fireflyPostSchema = z.object({
	id: z.string().min(1).max(200),
	title: z.string().min(1).max(1000),
	slug: z.string().min(1).max(1000),
	status: z.string(),
	published_at: z.number().finite().nullable(),
	updated_at: z.number().finite(),
	excerpt: z.string().nullable(),
	featured_image: z.string().nullable(),
	reference_description: z.string().nullable().optional(),
	reference_image: z.string().nullable().optional(),
	human_name: z.string().nullable(),
	agent_name: z.string().nullable(),
});
export const fireflyPageSchema = z.object({
	posts: z.array(fireflyPostSchema).max(50),
	total: z.number().int().nonnegative(),
});
export type FireflyPost = z.infer<typeof fireflyPostSchema>;
export const publishedArticleSchema = z.object({
	type: z.literal("published-article"),
	url: z.string().url(),
	image: z.string().nullable(),
	author: z.string().nullable(),
});
export type PublishedArticle = z.infer<typeof publishedArticleSchema>;

function imageUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value, "https://lizheng.blog");
		return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
	} catch {
		return null;
	}
}

export function fireflyDayEvents(posts: FireflyPost[], query: DaySummaryQuery): LifeEvent[] {
	const start = Date.parse(query.start),
		end = Date.parse(query.end);
	return [...new Map(posts.map((post) => [post.id, post])).values()]
		.flatMap((post) => {
			if (
				post.status !== "published" ||
				post.published_at === null ||
				post.published_at * 1000 < start ||
				post.published_at * 1000 >= end
			)
				return [];
			const published = new Date(post.published_at * 1000).toISOString();
			const article: PublishedArticle = {
				type: "published-article",
				url: `https://lizheng.blog/${published.slice(0, 4)}/${published.slice(5, 7)}/${encodeURIComponent(post.slug)}`,
				image: imageUrl(post.featured_image) ?? imageUrl(post.reference_image),
				author:
					[...new Set([post.human_name, post.agent_name].filter(Boolean))].join(" · ") || null,
			};
			return [
				{
					id: `firefly:${post.id}`,
					sourceId: "firefly",
					sourceName: "Firefly",
					sourceKind: "external" as const,
					occurredAt: published,
					endAt: null,
					precision: "second" as const,
					title: post.title,
					content: (post.excerpt || post.reference_description || "").slice(0, 4000),
					data: article,
					updatedAt: new Date(post.updated_at * 1000).toISOString(),
				},
			];
		})
		.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}
