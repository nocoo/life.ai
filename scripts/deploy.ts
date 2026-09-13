import { readFileSync } from "node:fs";
import { version } from "../package.json";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (
	process.env.CLOUDFLARE_ENV ||
	process.env.LIFE_TEST_STATE ||
	process.env.RESOURCE_ENV === "test"
) {
	throw new Error(
		"Deploy requires production configuration; never deploy the local/test environment",
	);
}
if (
	config.name !== "life" ||
	config.vars.RESOURCE_ENV !== "production" ||
	!config.vars.ACCESS_AUD ||
	config.vars.TEST_ACCESS_JWKS ||
	config.workers_dev ||
	config.preview_urls ||
	!/^[a-f0-9-]{36}$/.test(config.d1_databases[0]?.database_id)
) {
	throw new Error(
		"Complete and verify production Worker, Access and D1 configuration before deploying",
	);
}
for (const command of [
	["bun", "run", "build"],
	["bun", "x", "wrangler", "deploy", "--dry-run"],
	[
		"bun",
		"x",
		"wrangler",
		"d1",
		"migrations",
		"list",
		"life",
		"--remote",
		"--config",
		"wrangler.jsonc",
	],
	[
		"bun",
		"x",
		"wrangler",
		"d1",
		"migrations",
		"apply",
		"life",
		"--remote",
		"--config",
		"wrangler.jsonc",
	],
	["bun", "x", "wrangler", "deploy", "--tag", `v${version}`],
]) {
	const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
	if (await child.exited) throw new Error(`Deployment stopped: ${command.join(" ")}`);
}
