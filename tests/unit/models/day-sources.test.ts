import { describe, expect, it } from "vitest";
import {
	type FireflyPost,
	fireflyDayEvents,
	type GeckoSnapshot,
	geckoHourEvents,
	geckoSnapshotSchema,
	isIdleSession,
} from "../../../src/models/day-sources";

const query = {
	date: "2026-09-10",
	timeZone: "Asia/Shanghai",
	start: "2026-09-09T16:00:00.000Z",
	end: "2026-09-10T16:00:00.000Z",
};
const session = (id: string, at: string, duration: number, appName = "Editor") => ({
	id,
	startTime: Date.parse(at) / 1000,
	duration,
	appName,
	bundleId: null,
	windowTitle: "Life.ai",
});
const snapshot = (sessions: GeckoSnapshot["stats"]["sessions"]): GeckoSnapshot => ({
	date: query.date,
	timezone: query.timeZone,
	stats: { sessions },
});

describe("external day normalization", () => {
	it("preserves both midnight-clipped pieces with the same ID when display and account dates differ", () => {
		const utc = {
			date: query.date,
			timeZone: "UTC",
			start: "2026-09-10T00:00:00.000Z",
			end: "2026-09-11T00:00:00.000Z",
		};
		const events = geckoHourEvents(
			[
				snapshot([session("cross-midnight", "2026-09-10T15:55:00Z", 300)]),
				{
					...snapshot([session("cross-midnight", "2026-09-10T16:00:00Z", 600)]),
					date: "2026-09-11",
				},
			],
			utc,
		);
		expect(events).toHaveLength(2);
		expect(events[0]?.data).toMatchObject({ activeSeconds: 300, sessionCount: 1 });
		expect(events[1]?.data).toMatchObject({ activeSeconds: 600, sessionCount: 1 });
	});
	it("splits active sessions into one card per hour, clips midnight and removes idle time", () => {
		const active = session("a", "2026-09-10T09:50:00+08:00", 1200);
		const events = geckoHourEvents(
			[
				snapshot([
					active,
					active,
					session("overlap", "2026-09-10T09:55:00+08:00", 300, "Browser"),
					{
						...session("idle", "2026-09-10T11:00:00+08:00", 3600, "loginwindow"),
						bundleId: "com.apple.loginwindow",
					},
					session("midnight", "2026-09-09T23:55:00+08:00", 600),
					session("outside", "2026-09-11T00:00:00+08:00", 600),
				]),
			],
			query,
		);
		expect(events).toHaveLength(3);
		expect(events.map((event) => event.occurredAt)).toEqual([
			query.start,
			"2026-09-10T01:00:00.000Z",
			"2026-09-10T02:00:00.000Z",
		]);
		expect(events[1]?.data).toMatchObject({
			activeSeconds: 600,
			sessionCount: 2,
			apps: [
				{ name: "Editor", seconds: 600 },
				{ name: "Browser", seconds: 300 },
			],
		});
		expect(events[2]?.data).toMatchObject({ activeSeconds: 600 });
		expect(events[0]?.data).toMatchObject({ activeSeconds: 300 });
		expect(geckoHourEvents([snapshot([session("zero", query.start, 0)])], query)).toEqual([]);
	});
	it("recognizes provider idle/lock/screen-saver markers without removing ordinary activity", () => {
		for (const marker of [
			{ type: "idle" },
			{ type: "idel" },
			{ idle: true },
			{ appName: "ScreenSaverEngine" },
			{ bundleId: "com.apple.ScreenSaver.Engine" },
			{ bundleId: "com.apple.screenCaptureUI" },
		])
			expect(isIdleSession({ ...session("a", query.start, 100), ...marker })).toBe(true);
		expect(isIdleSession(session("a", query.start, 100))).toBe(false);
	});
	it("groups fractional-offset hours and repeated DST clocks without duplicating cards", () => {
		const fractional = {
			date: query.date,
			timeZone: "Asia/Kathmandu",
			start: "2026-09-09T18:15:00.000Z",
			end: "2026-09-10T18:15:00.000Z",
		};
		expect(
			geckoHourEvents([snapshot([session("a", "2026-09-10T01:00:00Z", 1800)])], fractional),
		).toHaveLength(2);
		const dst = {
			date: "2026-11-01",
			timeZone: "America/New_York",
			start: "2026-11-01T04:00:00.000Z",
			end: "2026-11-02T05:00:00.000Z",
		};
		const events = geckoHourEvents([snapshot([session("a", "2026-11-01T05:00:00Z", 7200)])], dst);
		expect(events).toHaveLength(1);
		expect(events[0]?.data).toMatchObject({ activeSeconds: 7200 });
	});
	it("bounds contextual titles while retaining all activity durations", () => {
		const sessions = Array.from({ length: 12 }, (_, i) => ({
			...session(String(i), "2026-09-10T01:00:00Z", 600),
			windowTitle: `window ${i}`,
		}));
		const events = geckoHourEvents([snapshot(sessions)], query);
		expect(events[0]?.data).toMatchObject({ sessionCount: 12, activeSeconds: 600 });
		const data = events[0]?.data as { apps: { titles: string[] }[] };
		expect(data.apps[0]?.titles).toHaveLength(6);
		expect(geckoSnapshotSchema.safeParse({ ...snapshot([]), timezone: "fake/zone" }).success).toBe(
			false,
		);
	});
	it("selects only published articles in the exact day window and preserves image, authors, link and seconds", () => {
		const post: FireflyPost = {
			id: "post",
			title: "新文章",
			slug: "new-post",
			status: "published",
			published_at: Date.parse("2026-09-10T01:02:03Z") / 1000,
			updated_at: Date.parse("2026-09-12T01:00:00Z") / 1000,
			excerpt: "摘要",
			human_name: "作者",
			agent_name: "助手",
			featured_image: "/cover.jpg",
		};
		const events = fireflyDayEvents(
			[
				post,
				post,
				{ ...post, id: "private", status: "private" },
				{ ...post, id: "tomorrow", published_at: Date.parse(query.end) / 1000 },
				{ ...post, id: "unknown", published_at: null },
			],
			query,
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			occurredAt: "2026-09-10T01:02:03.000Z",
			precision: "second",
			content: "摘要",
			data: {
				author: "作者 · 助手",
				image: "https://lizheng.blog/cover.jpg",
				url: "https://lizheng.blog/2026/09/new-post",
			},
		});
		const missing = fireflyDayEvents(
			[
				{
					...post,
					featured_image: "javascript:alert(1)",
					reference_image: "https://user:pass@example.test/image.jpg",
					human_name: null,
					agent_name: null,
					excerpt: null,
				},
			],
			query,
		);
		expect(missing[0]?.data).toMatchObject({ author: null, image: null });
	});
});
