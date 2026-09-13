import { rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { verifyLocalBindings } from "./verify-test-bindings";

export async function executeLocalSql(state: string, sql: string): Promise<unknown> {
	verifyLocalBindings(state);
	const filename = resolve(state, `query-${crypto.randomUUID()}.sql`);
	writeFileSync(filename, sql);
	try {
		const child = Bun.spawn(
			[
				"node",
				"node_modules/wrangler/bin/wrangler.js",
				"d1",
				"execute",
				"life-local",
				"--local",
				"--config",
				"wrangler.jsonc",
				"--env",
				"local",
				"--persist-to",
				state,
				"--file",
				filename,
				"--json",
			],
			{ env: testEnvironment(state), stdout: "pipe", stderr: "pipe" },
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code) throw new Error(`Local SQLite command failed: ${stderr || stdout}`);
		return JSON.parse(stdout);
	} finally {
		rmSync(filename);
	}
}

export function testEnvironment(state?: string): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {
		...process.env,
		CLOUDFLARE_ENV: "local",
		RESOURCE_ENV: "test",
	};
	for (const key of Object.keys(env)) {
		if (/^(CLOUDFLARE_|CF_)/.test(key) && key !== "CLOUDFLARE_ENV") delete env[key];
	}
	delete env.AI_SETTINGS_KEY;
	delete env.OPENAI_API_KEY;
	delete env.ANTHROPIC_API_KEY;
	delete env.NO_COLOR;
	delete env.FORCE_COLOR;
	env.WRANGLER_SEND_METRICS = "false";
	if (state) {
		// Linux Playwright also uses XDG_CACHE_HOME; retain its installed browser binaries.
		if (process.platform === "linux" && !env.PLAYWRIGHT_BROWSERS_PATH) {
			env.PLAYWRIGHT_BROWSERS_PATH = resolve(
				process.env.XDG_CACHE_HOME || resolve(homedir(), ".cache"),
				"ms-playwright",
			);
		}
		// Wrangler's XDG paths keep this run away from the user's OAuth configuration.
		env.XDG_CONFIG_HOME = resolve(state, "config");
		env.XDG_CACHE_HOME = resolve(state, "cache");
		env.WRANGLER_LOG_PATH = resolve(state, "wrangler.log");
	}
	return env;
}

export async function assertMarker(state: string): Promise<void> {
	const result = await executeLocalSql(state, "SELECT value FROM _test_marker WHERE key = 'env';");
	if (!Array.isArray(result) || result[0]?.results?.[0]?.value !== "test") {
		throw new Error("Refusing to touch a database without _test_marker(env=test)");
	}
}
