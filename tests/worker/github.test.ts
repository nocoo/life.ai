import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptApiKey } from "../../worker/ai";
import { handleDaySourceSettings, readDaySources } from "../../worker/day-sources";
import { fetchGitHubAccount, fetchGitHubDay } from "../../worker/github";
import {
	githubFixtureAccount as account,
	githubCommit,
	githubFixtureResponse,
	githubFixtureKey as key,
	githubFixtureQuery as query,
} from "../github-fixture";
import { sqliteD1 } from "../helpers/sqlite-d1";

const databases: ReturnType<typeof sqliteD1>[] = [];
function setup() {
	const db = sqliteD1();
	databases.push(db);
	const upstream = vi.fn(async (input: string, init?: RequestInit) =>
		githubFixtureResponse(new URL(input), new Headers(init?.headers).get("Authorization")),
	);
	vi.stubGlobal("fetch", upstream);
	return { ...db, upstream };
}
afterEach(() => {
	for (const db of databases.splice(0)) db.sqlite.close();
});
function settings(
	env: ReturnType<typeof sqliteD1>["env"],
	method = "PUT",
	body?: unknown,
	suffix = "/github",
) {
	const url = new URL(`http://localhost/api/settings/sources${suffix}`);
	return handleDaySourceSettings(
		new Request(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		env,
		url,
	);
}
const enable = (env: ReturnType<typeof sqliteD1>["env"]) =>
	settings(env, "PUT", { enabled: true, apiKey: key });

describe("GitHub private configuration and permanent account/day cache", () => {
	it("validates identity, encrypts the PAT, returns only saved metadata, and preserves credentials on invalid replacement", async () => {
		const { env, sqlite, upstream } = setup();
		const saved = await enable(env);
		const body = await saved.text();
		expect(body).not.toContain(key);
		expect(JSON.parse(body).data).toContainEqual({
			provider: "github",
			enabled: true,
			hasApiKey: true,
			account,
		});
		const row = sqlite.prepare("SELECT * FROM day_source_settings WHERE provider='github'").get();
		expect(row?.account_id).toBe(account.id);
		expect(row?.encrypted_api_key).not.toBe(key);
		expect(await decryptApiKey(String(row?.encrypted_api_key), env.AI_SETTINGS_KEY)).toBe(key);
		expect(upstream).toHaveBeenCalledWith(
			"https://api.github.com/user",
			expect.objectContaining({ redirect: "manual" }),
		);
		await expect(
			settings(env, "PUT", { enabled: true, apiKey: "not-a-real-pat" }),
		).rejects.toMatchObject({ status: 502 });
		expect(
			sqlite.prepare("SELECT * FROM day_source_settings WHERE provider='github'").get(),
		).toEqual(row);
		expect(await (await settings(env, "GET", undefined, "")).text()).not.toContain(key);
	});
	it("rejects absent credentials, control characters, injected identity, missing encryption key and malformed identity", async () => {
		const { env, sqlite, upstream } = setup();
		for (const body of [
			{ enabled: true },
			{ enabled: true, apiKey: `${key}\nleak` },
			{ enabled: true, apiKey: key, account },
		])
			await expect(settings(env, "PUT", body)).rejects.toMatchObject({ status: 400 });
		await expect(enable({ ...env, AI_SETTINGS_KEY: "" })).rejects.toMatchObject({ status: 503 });
		expect(upstream).not.toHaveBeenCalled();
		upstream.mockResolvedValueOnce(Response.json({ id: 7, login: "someone author:other" }));
		await expect(enable(env)).rejects.toMatchObject({ code: "source_invalid_response" });
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM day_source_settings").get()?.n).toBe(0);
	});
	it("queries author/action UTC windows and serves repeat reads, connection tests and rotated PATs entirely from D1", async () => {
		const { env, sqlite, upstream, queries } = setup();
		await enable(env);
		upstream.mockClear();
		const first = await readDaySources(env, query);
		expect(first.events).toHaveLength(5);
		expect(first.sources).toEqual([{ provider: "github", state: "ready", stale: false }]);
		expect(first.configuration).toBe('["github:7123"]');
		expect(upstream).toHaveBeenCalledTimes(3);
		for (const [input, init] of upstream.mock.calls) {
			const url = new URL(input);
			expect(url.origin).toBe("https://api.github.com");
			expect(url.searchParams.get("q")).toContain("author:life-fixture");
			expect(url.searchParams.get("q")).toContain("2026-09-09T16:00:00Z..2026-09-10T15:59:59Z");
			expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${key}`);
			expect(new Headers(init?.headers).get("User-Agent")).toBe("Life.ai");
			expect(init?.signal).toBeInstanceOf(AbortSignal);
		}
		const cached = sqlite.prepare("SELECT * FROM github_day_cache").all();
		upstream.mockClear();
		queries.length = 0;
		expect(await readDaySources(env, query, "refresh")).toEqual(first);
		expect(await readDaySources(env, query, "cached-only")).toEqual(first);
		expect(await (await settings(env, "POST", query, "/github/test")).json()).toMatchObject({
			data: { success: true, eventCount: 5 },
		});
		expect(upstream).not.toHaveBeenCalled();
		expect(queries.every((sql) => sql.startsWith("SELECT"))).toBe(true);
		expect(sqlite.prepare("SELECT * FROM github_day_cache").all()).toEqual(cached);
		await enable(env); // Revalidation may contact /user, but never re-fetches this day's activity.
		upstream.mockClear();
		expect(await readDaySources(env, query)).toEqual(first);
		expect(upstream).not.toHaveBeenCalled();
	});
	it("persists empty results, keeps them through toggles/removal, and separates accounts, days and timezones", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		const emptyDay = {
			...query,
			date: "2026-09-11",
			start: query.end,
			end: "2026-09-11T16:00:00.000Z",
		};
		const empty = await readDaySources(env, emptyDay);
		expect(empty.events).toEqual([]);
		expect(empty.sources[0]?.state).toBe("ready");
		upstream.mockClear();
		await settings(env, "PUT", { enabled: false });
		expect((await readDaySources(env, emptyDay)).sources).toEqual([]);
		await settings(env, "PUT", { enabled: true });
		expect(await readDaySources(env, emptyDay)).toEqual(empty);
		expect(upstream).not.toHaveBeenCalled();
		await settings(env, "DELETE");
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM github_day_cache").get()?.n).toBe(1);
		await enable(env);
		upstream.mockClear();
		expect(await readDaySources(env, emptyDay)).toEqual(empty);
		expect(upstream).not.toHaveBeenCalled();
		await readDaySources(env, query);
		expect(upstream).toHaveBeenCalledTimes(3);
		await readDaySources(env, {
			...query,
			timeZone: "UTC",
			start: "2026-09-10T00:00:00.000Z",
			end: "2026-09-11T00:00:00.000Z",
		});
		expect(upstream).toHaveBeenCalledTimes(6);
		upstream.mockResolvedValueOnce(Response.json({ id: 999, login: "other-owner" }));
		await enable(env);
		const other = await readDaySources(env, query);
		expect(other.events).toEqual([]);
		expect(other.configuration).toBe('["github:999"]');
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM github_day_cache").get()?.n).toBe(4);
	});
	it("shares a concurrent first query across independent requests through a D1 lease", async () => {
		const { env, upstream } = setup();
		await enable(env);
		upstream.mockClear();
		let finish!: (response: Response) => void;
		upstream.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const first = readDaySources(env, query);
		await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
		const second = readDaySources(env, query);
		const third = readDaySources(env, query);
		finish(Response.json({ total_count: 1, incomplete_results: false, items: [githubCommit()] }));
		const results = await Promise.all([first, second, third]);
		expect(results[0]?.events).toHaveLength(5);
		expect(results[1]).toEqual(results[0]);
		expect(results[2]).toEqual(results[0]);
		expect(upstream).toHaveBeenCalledTimes(3);
	});
	it("does not query upstream for missing diary cache and recovers abandoned leases", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		upstream.mockClear();
		expect((await readDaySources(env, query, "cached-only")).sources[0]?.state).toBe("pending");
		expect(upstream).not.toHaveBeenCalled();
		sqlite
			.prepare(
				"INSERT INTO github_day_cache(account_id,date,timezone,start_at,end_at,lease_token,leased_until) VALUES(?,?,?,?,?,'abandoned',0)",
			)
			.run(account.id, query.date, query.timeZone, query.start, query.end);
		expect((await readDaySources(env, query)).events).toHaveLength(5);
		expect(
			sqlite.prepare("SELECT lease_token, leased_until FROM github_day_cache").get(),
		).toMatchObject({ lease_token: null, leased_until: 0 });
	});
	it("never stores a partial day and retries only after a failed upstream attempt", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		upstream
			.mockImplementationOnce(async (input, init) =>
				githubFixtureResponse(new URL(input), new Headers(init?.headers).get("Authorization")),
			)
			.mockResolvedValueOnce(new Response(key, { status: 503 }));
		const failed = await readDaySources(env, query);
		expect(failed.events).toEqual([]);
		expect(failed.sources[0]?.state).toBe("error");
		expect(JSON.stringify(failed)).not.toContain(key);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM github_day_cache").get()?.n).toBe(0);
		expect((await readDaySources(env, query)).events).toHaveLength(5);
	});
	it("keeps an in-flight snapshot when settings are re-saved for the same account", async () => {
		const { env, upstream } = setup();
		await enable(env);
		let finish!: (response: Response) => void;
		upstream.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const reading = readDaySources(env, query);
		await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
		await enable(env);
		finish(Response.json({ total_count: 1, incomplete_results: false, items: [githubCommit()] }));
		const first = await reading;
		expect(first.events).toHaveLength(5);
		upstream.mockClear();
		expect(await readDaySources(env, query)).toEqual(first);
		expect(upstream).not.toHaveBeenCalled();
	});
	it("fences an in-flight read when its connection is removed", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		let finish!: (response: Response) => void;
		upstream.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const reading = readDaySources(env, query);
		await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
		await settings(env, "DELETE");
		finish(Response.json({ total_count: 1, incomplete_results: false, items: [githubCommit()] }));
		expect((await reading).events).toEqual([]);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM github_day_cache").get()?.n).toBe(0);
	});
	it("keeps completed snapshots readable when decryption is unavailable, but does not query another day", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		const wrongKey = { ...env, AI_SETTINGS_KEY: "02".repeat(32) };
		expect((await readDaySources(wrongKey, query)).sources[0]?.message).toContain("PAT 不可用");
		expect((await readDaySources({ ...env, AI_SETTINGS_KEY: "" }, query)).sources[0]?.state).toBe(
			"error",
		);
		const good = await readDaySources(env, query);
		upstream.mockClear();
		expect(await readDaySources(wrongKey, query)).toEqual(good);
		expect(upstream).not.toHaveBeenCalled();
		sqlite.exec("UPDATE day_source_settings SET account_login = NULL WHERE provider='github'");
		expect((await readDaySources(env, query)).sources[0]?.message).toContain("重新保存");
	});
});

describe("bounded GitHub search", () => {
	it("keeps oversized daily snapshots out of D1 instead of failing with a database row-size error", async () => {
		const { env, sqlite, upstream } = setup();
		await enable(env);
		const commits = Array.from({ length: 250 }, (_, i) => {
			const commit = githubCommit(i + 1);
			return { ...commit, commit: { ...commit.commit, message: `Change\n${"x".repeat(4000)}` } };
		});
		upstream.mockImplementation(async (input) => {
			const url = new URL(input),
				page = Number(url.searchParams.get("page"));
			return Response.json(
				url.pathname === "/search/commits"
					? {
							total_count: commits.length,
							incomplete_results: false,
							items: commits.slice((page - 1) * 100, page * 100),
						}
					: { total_count: 0, incomplete_results: false, items: [] },
			);
		});
		const result = await readDaySources(env, query);
		expect(result.sources[0]?.message).toContain("超过保存上限");
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM github_day_cache").get()?.n).toBe(0);
	});
	it("loads all pages sequentially and does not request unrelated endpoints", async () => {
		const { upstream } = setup();
		const commits = Array.from({ length: 101 }, (_, i) => githubCommit(i + 1));
		upstream.mockImplementation(async (input) => {
			const url = new URL(input),
				page = Number(url.searchParams.get("page"));
			return Response.json(
				url.pathname === "/search/commits"
					? {
							total_count: commits.length,
							incomplete_results: false,
							items: commits.slice((page - 1) * 100, page * 100),
						}
					: { total_count: 0, incomplete_results: false, items: [] },
			);
		});
		expect(await fetchGitHubDay(account, query, key, AbortSignal.timeout(1000))).toHaveLength(101);
		expect(upstream).toHaveBeenCalledTimes(4);
	});
	it.each([
		{ total_count: 1, incomplete_results: true, items: [githubCommit()] },
		{ total_count: 1001, incomplete_results: false, items: [] },
		{ total_count: 2, incomplete_results: false, items: [githubCommit()] },
		{ total_count: 2, incomplete_results: false, items: [githubCommit(), githubCommit()] },
		{
			total_count: 1,
			incomplete_results: false,
			items: [{ ...githubCommit(), html_url: "https://elsewhere.test/" }],
		},
	])("rejects incomplete, duplicated, excessive and unsafe search results %#", async (body) => {
		const { upstream } = setup();
		upstream.mockResolvedValueOnce(Response.json(body));
		await expect(
			fetchGitHubDay(account, query, key, AbortSignal.timeout(1000)),
		).rejects.toMatchObject({ status: 502 });
		expect(upstream).toHaveBeenCalledOnce();
	});
	it("rejects pagination changing underneath a request", async () => {
		const { upstream } = setup();
		upstream
			.mockResolvedValueOnce(
				Response.json({
					total_count: 101,
					incomplete_results: false,
					items: Array.from({ length: 100 }, (_, i) => githubCommit(i + 1)),
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					total_count: 102,
					incomplete_results: false,
					items: [githubCommit(101), githubCommit(102)],
				}),
			);
		await expect(
			fetchGitHubDay(account, query, key, AbortSignal.timeout(1000)),
		).rejects.toMatchObject({ code: "source_incomplete" });
	});
	it.each([401, 403, 429, 302, 500])(
		"does not expose error bodies or follow redirects (%i)",
		async (status) => {
			const { upstream } = setup();
			upstream.mockResolvedValueOnce(
				new Response(key, { status, headers: { Location: "https://elsewhere.test/" } }),
			);
			await expect(fetchGitHubAccount(key, AbortSignal.timeout(1000))).rejects.toThrow(/GitHub/);
			expect(upstream).toHaveBeenCalledOnce();
		},
	);
	it("bounds reads and hides network errors containing credentials", async () => {
		const { upstream } = setup();
		upstream.mockRejectedValueOnce(new Error(key));
		await expect(fetchGitHubAccount(key, AbortSignal.timeout(1000))).rejects.not.toThrow(key);
		for (const response of [
			new Response("invalid-json"),
			new Response("", {
				headers: { "Content-Type": "application/json", "Content-Length": "9999999" },
			}),
		]) {
			upstream.mockResolvedValueOnce(response);
			await expect(fetchGitHubAccount(key, AbortSignal.timeout(1000))).rejects.toMatchObject({
				code: "source_invalid_response",
			});
		}
	});
});
