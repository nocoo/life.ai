import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptApiKey } from "../../worker/ai";
import {
	fetchFireflyDay,
	fetchGeckoDay,
	handleDaySourceSettings,
	handleGetDaySources,
	readDaySources,
} from "../../worker/day-sources";
import { sqliteD1 } from "../helpers/sqlite-d1";

const query = {
	date: "2026-09-10",
	timeZone: "Asia/Shanghai",
	start: "2026-09-09T16:00:00.000Z",
	end: "2026-09-10T16:00:00.000Z",
};
const key = `gk_${"a".repeat(64)}`;
const databases: ReturnType<typeof sqliteD1>[] = [];
function setup() {
	const db = sqliteD1();
	databases.push(db);
	return db;
}
afterEach(() => {
	for (const db of databases.splice(0)) db.sqlite.close();
});
function settings(
	env: ReturnType<typeof setup>["env"],
	provider = "",
	method = "GET",
	body?: unknown,
) {
	const url = new URL(`http://localhost/api/settings/sources${provider ? `/${provider}` : ""}`);
	return handleDaySourceSettings(
		new Request(url, {
			method,
			headers: body === undefined ? {} : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		env,
		url,
	);
}
const post = (id = "post", published_at = Date.parse("2026-09-10T01:02:03Z") / 1000) => ({
	id,
	title: "文章",
	slug: id,
	status: "published",
	published_at,
	updated_at: published_at,
	excerpt: "摘要",
	human_name: "作者",
	agent_name: null,
	featured_image: null,
});
const gecko = (date = query.date, timezone = query.timeZone) => ({
	date,
	timezone,
	stats: {
		sessions: [
			{
				id: "activity",
				appName: "Editor",
				bundleId: null,
				windowTitle: "Life.ai",
				startTime: Date.parse("2026-09-10T01:00:00Z") / 1000,
				duration: 1800,
			},
		],
	},
});

describe("private source settings and isolated reads", () => {
	it("never repopulates private cache when a source is removed during its upstream read", async () => {
		const { env, sqlite } = setup();
		await settings(env, "gecko", "PUT", { enabled: true, apiKey: key });
		let finish: ((response: Response) => void) | undefined;
		const fetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		vi.stubGlobal("fetch", fetch);
		const reading = readDaySources(env, query);
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		await settings(env, "gecko", "DELETE");
		finish?.(Response.json(gecko()));
		await reading;
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_source_cache").get()?.n).toBe(0);
	});
	it("tests only enabled sources with a valid day and refreshes complete results", async () => {
		const { env } = setup();
		await expect(settings(env, "firefly/test", "GET")).rejects.toMatchObject({ status: 405 });
		await expect(settings(env, "firefly/test", "POST", {})).rejects.toMatchObject({ status: 400 });
		await expect(settings(env, "firefly/test", "POST", query)).rejects.toMatchObject({
			code: "source_disabled",
		});
		await settings(env, "firefly", "PUT", { enabled: true });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ posts: [post()], total: 1 })),
		);
		expect(await (await settings(env, "firefly/test", "POST", query)).json()).toMatchObject({
			data: { success: true, eventCount: 1, date: query.date },
		});
	});
	it.each([
		{ posts: [], total: 10 },
		{ posts: [post("earlier", 1), post("later", 2)], total: 2 },
		{ posts: [post()], total: "bad" },
	])(
		"rejects partial or invalid public pagination instead of silently skipping posts %#",
		async (page) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => Response.json(page)),
			);
			await expect(fetchFireflyDay(query, new AbortController().signal)).rejects.toMatchObject({
				status: 502,
			});
		},
	);
	it("encrypts the Gecko key, never returns it, preserves it on toggles and erases it on removal", async () => {
		const { env, sqlite } = setup();
		expect(await (await settings(env)).json()).toEqual({
			data: [
				{ provider: "gecko", enabled: false, hasApiKey: false },
				{ provider: "firefly", enabled: false, hasApiKey: false },
				{ provider: "github", enabled: false, hasApiKey: false },
			],
		});
		const response = await settings(env, "gecko", "PUT", { enabled: true, apiKey: key });
		expect(await response.text()).not.toContain(key);
		const ciphertext = String(
			sqlite.prepare("SELECT encrypted_api_key FROM day_source_settings").get()?.encrypted_api_key,
		);
		expect(ciphertext).not.toContain(key);
		expect(await decryptApiKey(ciphertext, env.AI_SETTINGS_KEY)).toBe(key);
		await settings(env, "gecko", "PUT", { enabled: false });
		expect(
			sqlite.prepare("SELECT encrypted_api_key FROM day_source_settings").get()?.encrypted_api_key,
		).toBe(ciphertext);
		await settings(env, "gecko", "DELETE");
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_source_settings").get()?.n).toBe(0);
	});
	it("rejects missing, malformed, misplaced and unstorable credentials before writes", async () => {
		const { env, sqlite } = setup();
		for (const [provider, body] of [
			["gecko", { enabled: true }],
			["gecko", { enabled: true, apiKey: "invalid" }],
			["gecko", { enabled: true, apiKey: `${key}\nheader` }],
			["firefly", { enabled: true, apiKey: key }],
			["gecko", { enabled: "yes" }],
			["gecko", { enabled: true, endpoint: "https://elsewhere.test" }],
		] as const)
			await expect(settings(env, provider, "PUT", body)).rejects.toMatchObject({ status: 400 });
		await expect(
			settings({ ...env, AI_SETTINGS_KEY: "" }, "gecko", "PUT", { enabled: true, apiKey: key }),
		).rejects.toMatchObject({ status: 503 });
		await expect(settings(env, "other", "PUT", {})).rejects.toMatchObject({ status: 404 });
		await expect(settings(env, "", "POST")).rejects.toMatchObject({ status: 405 });
		await expect(settings(env, "gecko", "PATCH")).rejects.toMatchObject({ status: 405 });
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_source_settings").get()?.n).toBe(0);
	});
	it("authenticates Gecko only, caches complete day data and lets one failed source preserve the other", async () => {
		const { env, sqlite } = setup();
		await settings(env, "gecko", "PUT", { enabled: true, apiKey: key });
		await settings(env, "firefly", "PUT", { enabled: true });
		const fetch = vi.fn(async (input: string, init?: RequestInit) => {
			if (input.startsWith("https://gecko.hexly.ai/")) {
				expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${key}`);
				return Response.json(gecko());
			}
			expect(new Headers(init?.headers).has("Authorization")).toBe(false);
			expect(init?.redirect).toBe("manual");
			return Response.json({ posts: [post()], total: 1 });
		});
		vi.stubGlobal("fetch", fetch);
		const first = await readDaySources(env, query);
		expect(first.events).toHaveLength(2);
		expect(first.sources.every((source) => source.state === "ready")).toBe(true);
		const calls = fetch.mock.calls.length;
		expect(await readDaySources(env, query)).toEqual(first);
		expect(fetch).toHaveBeenCalledTimes(calls);
		sqlite.exec("UPDATE day_source_cache SET fetched_at = 0");
		fetch.mockImplementation(async () => {
			throw new Error(`upstream ${key}`);
		});
		const stale = await readDaySources(env, query);
		expect(stale.events).toEqual(first.events);
		expect(stale.sources.every((source) => source.state === "error" && source.stale)).toBe(true);
		expect(JSON.stringify(stale)).not.toContain(key);
		await settings(env, "gecko", "DELETE");
		fetch.mockImplementation(async () => Response.json({ posts: [post()], total: 1 }));
		expect((await readDaySources(env, query)).events).toHaveLength(1);
	});
	it("reads diary cache without upstream calls, reports a missing snapshot and keeps failed responses out of cache", async () => {
		const { env, sqlite } = setup();
		await settings(env, "gecko", "PUT", { enabled: true, apiKey: key });
		const fetch = vi.fn(async () => new Response("login", { status: 302 }));
		vi.stubGlobal("fetch", fetch);
		expect((await readDaySources(env, query, "cached-only")).sources).toMatchObject([
			{ state: "pending" },
		]);
		expect(fetch).not.toHaveBeenCalled();
		expect((await readDaySources(env, query)).sources).toMatchObject([
			{ state: "error", stale: false },
		]);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_source_cache").get()?.n).toBe(0);
		const result = await readDaySources({ ...env, AI_SETTINGS_KEY: "02".repeat(32) }, query);
		expect(result.sources[0]?.message).toContain("密钥不可用");
	});
	it("reads neighboring provider days when the account timezone differs", async () => {
		const dates: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const date = new URL(input).searchParams.get("date") ?? "";
				dates.push(date);
				return Response.json(gecko(date, "America/New_York"));
			}),
		);
		expect(await fetchGeckoDay(query, key, new AbortController().signal)).toHaveLength(1);
		expect(dates.sort()).toEqual(["2026-09-09", "2026-09-10"]);
	});
	it("locates old Firefly dates by publication time across pages and filters out updates or private posts", async () => {
		const posts = Array.from({ length: 500 }, (_, i) =>
			post(`p${i}`, Date.parse("2026-09-14T12:00:00Z") / 1000 - i * 3600),
		);
		const calls: number[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const page = Number(new URL(input).searchParams.get("page"));
				calls.push(page);
				return Response.json({
					total: posts.length,
					posts: posts.slice((page - 1) * 20, page * 20),
				});
			}),
		);
		const events = await fetchFireflyDay(query, new AbortController().signal);
		expect(events).toHaveLength(24);
		expect(
			events.every((event) => event.occurredAt >= query.start && event.occurredAt < query.end),
		).toBe(true);
		expect(calls.length).toBeLessThan(10);
	});
	it.each([
		new Response("secret body", { status: 401 }),
		new Response("blocked", { status: 403 }),
		Response.json({ wrong: "format" }),
		new Response("not-json", { headers: { "content-type": "application/json" } }),
		new Response("", {
			headers: { "content-type": "application/json", "content-length": "9999999" },
		}),
	])("rejects bad upstream responses without exposing their body %#", async (response) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response),
		);
		await expect(fetchGeckoDay(query, key, new AbortController().signal)).rejects.toMatchObject({
			status: 502,
		});
	});
	it("validates the requested day before reading providers", async () => {
		const { env } = setup();
		const invalid = new URL("http://localhost/api/day-sources?date=bad");
		await expect(handleGetDaySources(new Request(invalid), env, invalid)).rejects.toMatchObject({
			status: 400,
		});
		const valid = new URL(`http://localhost/api/day-sources?${new URLSearchParams(query)}`);
		expect(await (await handleGetDaySources(new Request(valid), env, valid)).json()).toEqual({
			data: { events: [], sources: [], configuration: "[]" },
		});
	});
});
