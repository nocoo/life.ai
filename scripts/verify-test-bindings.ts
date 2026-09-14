import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export function verifyLocalBindings(statePath: string): void {
	const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
	const local = config.env.local;
	const root = realpathSync(new URL("..", import.meta.url));
	const state = realpathSync(statePath);
	if (
		process.env.CLOUDFLARE_ENV !== "local" ||
		local.vars.RESOURCE_ENV !== "development" ||
		local.vars.DATA_TARGET !== "local"
	) {
		throw new Error("Tests require CLOUDFLARE_ENV=local");
	}
	if (!state.startsWith(resolve(root, ".wrangler/tests") + sep)) {
		throw new Error("Tests require a fresh .wrangler/tests/<run> directory");
	}
	if (local.routes.length || local.workers_dev || JSON.stringify(local).includes('"remote":true')) {
		throw new Error("Tests cannot bind remote resources or routes");
	}
	if (
		local.d1_databases.some((db: { database_id: string }) =>
			config.d1_databases.some(
				(prod: { database_id: string }) => db.database_id === prod.database_id,
			),
		)
	) {
		throw new Error("Local database IDs must differ from production");
	}
}
