import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_KINDS, type CacheClearResult, type CacheOverview } from "../../src/models/cache";
import { handleCacheRequest } from "../../worker/cache";
import { sqliteD1 } from "../helpers/sqlite-d1";

const databases: ReturnType<typeof sqliteD1>[] = [];
function setup() {
	const db = sqliteD1();
	databases.push(db);
	for (const date of ["2026-09-10", "2026-09-11"]) {
		for (const timeZone of ["Asia/Shanghai", "UTC"]) {
			for (const provider of ["gecko", "firefly"])
				db.sqlite
					.prepare("INSERT INTO day_source_cache VALUES (?, ?, ?, 'start', 'end', 1, '[]', 1234)")
					.run(provider, date, timeZone);
			for (const account of [7, 8])
				db.sqlite
					.prepare(
						"INSERT INTO github_day_cache VALUES (?, ?, ?, 'start', 'end', '[]', 1234, NULL, 0)",
					)
					.run(account, date, timeZone);
			for (const kind of ["sun", "weather"])
				db.sqlite
					.prepare("INSERT INTO public_context_cache VALUES (?, ?, '{}', 1234, 0)")
					.run(kind, `${date}:${timeZone}:31:121:start:end`);
		}
	}
	db.sqlite.exec(`
		INSERT INTO public_context_cache VALUES ('place', '31:121', '"private place label"', 5678, NULL);
		INSERT INTO github_day_cache VALUES (9, '2026-09-10', 'UTC', 'start', 'end', NULL, NULL, 'active-lease', 9999999999999);
		INSERT INTO public_context_leases VALUES ('sun', '2026-09-10:UTC:31:121:start:end', 'active-lease', 9999999999999);
		INSERT INTO public_context_ratelimit VALUES ('nominatim', 9999999999999);
		INSERT INTO day_source_settings VALUES ('github', 1, 'encrypted-fixture', 12, 7, 'fixture');
		INSERT INTO general_settings VALUES ('default', '{"places":[],"routine":null}', 12);
		INSERT INTO day_summaries VALUES ('2026-09-10', 'UTC', 'start', 'end', 'saved diary', 'binding', 'test-model', 'hash', 1, 12);
		INSERT INTO sources VALUES ('journal', 'Journal', 'import', 'journal', 12);
		INSERT INTO life_events VALUES ('record', 'journal', 'external', 1, NULL, 'second', 'Imported record', '', '{}', 12);
		INSERT INTO provider_days VALUES ('journal', 0, 1, 1, 1, 2, '{}', '{}', 'hash', 12);
	`);
	return db;
}
afterEach(() => {
	for (const db of databases.splice(0)) db.sqlite.close();
});
function request(
	env: ReturnType<typeof sqliteD1>["env"],
	path = "?scope=day&date=2026-09-10",
	method = "GET",
) {
	const url = new URL(`http://localhost/api/cache${path}`);
	return handleCacheRequest(new Request(url, { method }), env, url);
}
const overview = async (
	env: ReturnType<typeof sqliteD1>["env"],
	search = "?scope=day&date=2026-09-10",
) => ((await (await request(env, search)).json()) as { data: CacheOverview }).data;

describe("disposable D1 cache management", () => {
	it("lists six cache kinds with metadata only, including empty/expired snapshots and shared places, without upstream calls or writes", async () => {
		const { env, queries } = setup();
		const upstream = vi.fn();
		vi.stubGlobal("fetch", upstream);
		const response = await request(env);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const text = await response.text();
		for (const privateValue of [
			"encrypted-fixture",
			"private place label",
			"31:121",
			"saved diary",
			"active-lease",
		])
			expect(text).not.toContain(privateValue);
		expect(JSON.parse(text).data.entries).toEqual(
			CACHE_KINDS.map((kind) => ({
				kind,
				count: kind === "github" ? 4 : kind === "place" ? 1 : 2,
				updatedAt: kind === "place" ? 5678 : 1234,
			})),
		);
		expect((await overview(env, "?scope=all")).entries.map((entry) => entry.count)).toEqual([
			8, 4, 4, 4, 4, 1,
		]);
		expect(
			(await overview(env, "?scope=day&date=2026-09-12")).entries.map((entry) => entry.count),
		).toEqual([0, 0, 0, 0, 0, 1]);
		expect(queries.every((sql) => sql.startsWith("SELECT"))).toBe(true);
		expect(upstream).not.toHaveBeenCalled();
	});
	it("clears only the selected kind/date across accounts and timezones, preserves other dates and durable data, and leaves live coordination intact", async () => {
		const { env, sqlite } = setup();
		const protectedTables = [
			"day_source_settings",
			"general_settings",
			"day_summaries",
			"life_events",
			"provider_days",
			"provider_state",
			"public_context_leases",
			"public_context_ratelimit",
		];
		const protectedRows = () =>
			protectedTables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
		const before = protectedRows();
		for (const kind of CACHE_KINDS) {
			const otherKinds = (await overview(env)).entries.filter((entry) => entry.kind !== kind);
			const response = await request(env, `/${kind}?scope=day&date=2026-09-10`, "DELETE");
			const { data } = (await response.json()) as { data: CacheClearResult };
			expect(data.cleared).toBe(kind === "github" ? 4 : kind === "place" ? 1 : 2);
			expect(data.overview.entries.find((entry) => entry.kind === kind)).toMatchObject({
				count: 0,
				updatedAt: null,
			});
			expect(data.overview.entries.filter((entry) => entry.kind !== kind)).toEqual(otherKinds);
			expect(
				await (await request(env, `/${kind}?scope=day&date=2026-09-10`, "DELETE")).json(),
			).toMatchObject({ data: { cleared: 0 } });
		}
		expect((await overview(env, "?scope=all")).entries.map((entry) => entry.count)).toEqual([
			4, 2, 2, 2, 2, 0,
		]);
		for (const kind of CACHE_KINDS) await request(env, `/${kind}?scope=all`, "DELETE");
		expect((await overview(env, "?scope=all")).entries.every((entry) => entry.count === 0)).toBe(
			true,
		);
		expect(sqlite.prepare("SELECT lease_token FROM github_day_cache").all()).toEqual([
			{ lease_token: "active-lease" },
		]);
		expect(protectedRows()).toEqual(before);
	});
	it.each([
		["", "GET", 400],
		["?scope=day&date=2026-02-30", "GET", 400],
		["?scope=all&date=2026-09-10", "GET", 400],
		["/github?scope=day&date=2026-09-10%27%20OR%201=1", "DELETE", 400],
		["/github?scope=all&table=day_summaries", "DELETE", 400],
		["/day_summaries?scope=all", "DELETE", 404],
		["/github/extra?scope=all", "DELETE", 404],
		["?scope=all", "DELETE", 405],
		["/github?scope=all", "GET", 405],
	])(
		"rejects invalid scope, date, type and method before any database access: %s %s",
		async (path, method, status) => {
			const { env, queries } = setup();
			await expect(request(env, path, method)).rejects.toMatchObject({ status });
			expect(queries).toEqual([]);
		},
	);
});
