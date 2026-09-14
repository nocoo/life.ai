import {
	emptyGeneralSettings,
	type GeneralSettings,
	validateGeneralSettings,
} from "../src/models/general-settings.js";
import { withD1Retry } from "./database.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody } from "./utils.js";

export async function readGeneralSettings(env: WorkerEnv): Promise<GeneralSettings> {
	const row = await withD1Retry(() =>
		env.DB.prepare("SELECT data_json FROM general_settings WHERE id = 'default'").first<{
			data_json: string;
		}>(),
	);
	return row ? validateGeneralSettings(JSON.parse(row.data_json)) : emptyGeneralSettings();
}

export async function handleGetGeneralSettings(env: WorkerEnv): Promise<Response> {
	return jsonResponse({ data: await readGeneralSettings(env) });
}

export async function handlePutGeneralSettings(
	request: Request,
	env: WorkerEnv,
): Promise<Response> {
	const body = await readJsonBody<unknown>(request, 64 * 1024);
	let settings: GeneralSettings;
	try {
		settings = validateGeneralSettings(body);
	} catch (error) {
		throw new ApiError(
			400,
			"invalid_settings",
			error instanceof Error ? error.message : "通用设置无效",
		);
	}
	await env.DB.prepare(
		"INSERT INTO general_settings (id, data_json, updated_at) VALUES ('default', ?, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at WHERE general_settings.data_json <> excluded.data_json",
	)
		.bind(JSON.stringify(settings), Date.now())
		.run();
	return jsonResponse({ data: settings });
}
