import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { WorkerEnv } from "../../worker/types.js";

/** Executes real migrations and SQL; the adapter only supplies D1's async shape. */
export function sqliteD1() {
	const sqlite = new DatabaseSync(":memory:");
	const migrationDir = new URL("../../worker/migrations/", import.meta.url);
	for (const name of readdirSync(migrationDir)
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(new URL(name, migrationDir), "utf8"));
	}
	const queries: string[] = [];
	const prepare = (sql: string, values: SQLInputValue[] = []) => {
		const execute = () => {
			queries.push(sql);
			const stmt = sqlite.prepare(sql);
			if (stmt.columns().length)
				return { success: true, results: stmt.all(...values), meta: { changes: 0 } };
			return { success: true, results: [], meta: { changes: Number(stmt.run(...values).changes) } };
		};
		return {
			bind: (...args: SQLInputValue[]) => prepare(sql, args),
			execute,
			async all() {
				return execute();
			},
			async run() {
				return execute();
			},
			async first(column?: string) {
				const row = execute().results[0];
				return column ? (row?.[column] ?? null) : (row ?? null);
			},
		};
	};
	const db = {
		prepare,
		async batch(statements: ReturnType<typeof prepare>[]) {
			sqlite.exec("BEGIN");
			try {
				const results = statements.map((statement) => statement.execute());
				sqlite.exec("COMMIT");
				return results;
			} catch (error) {
				sqlite.exec("ROLLBACK");
				throw error;
			}
		},
	};
	const env: WorkerEnv = {
		RESOURCE_ENV: "test",
		DATA_TARGET: "local",
		APP_ORIGIN: "http://localhost:17011",
		INGEST_HOST: "life.worker.hexly.ai",
		ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
		ACCESS_AUD: "isolated",
		TEST_ACCESS_JWKS: "",
		AI_SETTINGS_KEY: "01".repeat(32),
		DB: db as unknown as D1Database,
		ASSETS: { fetch: async () => new Response("Life") } as unknown as Fetcher,
	};
	return { sqlite, db, env, queries };
}
