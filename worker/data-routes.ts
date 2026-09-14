import {
	beginFootprintImport,
	dataTarget,
	finishFootprintImport,
	putFootprintBatch,
} from "./footprint-imports.js";
import { readFootprintDays } from "./footprint-read.js";
import { getDataOverview } from "./provider-overview.js";
import { normalizeTimestamp } from "./time.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, LIMITS } from "./utils.js";

/** Called only after app-host, browser-origin and Access checks. */
export async function handleDataRequest(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<Response> {
	const method = request.method;
	if (url.pathname === "/api/data/target") {
		if (method === "GET") return jsonResponse({ data: { target: dataTarget(env) } });
	} else if (url.pathname === "/api/data/overview") {
		if (method === "GET") return getDataOverview(env);
	} else if (url.pathname === "/api/data/footprint/imports") {
		if (method === "POST") return beginFootprintImport(request, env);
	} else if (url.pathname === "/api/data/footprint/days") {
		if (method === "GET") {
			const start = url.searchParams.get("start");
			const end = url.searchParams.get("end");
			if (!start || !end)
				throw new ApiError(400, "missing_parameter", "start and end are required");
			let startMs: number;
			let endMs: number;
			try {
				startMs = Date.parse(normalizeTimestamp(start));
				endMs = Date.parse(normalizeTimestamp(end));
			} catch {
				throw new ApiError(400, "invalid_timestamp", "Use valid ISO timestamps");
			}
			if (startMs >= endMs || endMs - startMs > LIMITS.maxWindowDays * 86_400_000) {
				throw new ApiError(
					400,
					"invalid_range",
					`Choose a positive window of at most ${LIMITS.maxWindowDays} days`,
				);
			}
			return jsonResponse({ data: { days: await readFootprintDays(env.DB, startMs, endMs) } });
		}
	} else {
		const batch = /^\/api\/data\/footprint\/imports\/([^/]+)\/batches\/(\d+)$/.exec(url.pathname);
		const finish = /^\/api\/data\/footprint\/imports\/([^/]+)\/finish$/.exec(url.pathname);
		if (batch) {
			if (method === "PUT")
				return putFootprintBatch(request, env, batch[1] as string, Number(batch[2]));
		} else if (finish) {
			if (method === "POST") return finishFootprintImport(request, env, finish[1] as string);
		} else {
			throw new ApiError(404, "not_found", "Data endpoint not found");
		}
	}
	throw new ApiError(405, "method_not_allowed", "Method not allowed");
}
