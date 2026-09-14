import {
	beginFootprintImport,
	dataTarget,
	finishFootprintImport,
	putFootprintBatch,
} from "./footprint-imports.js";
import { readFootprintDays } from "./footprint-read.js";
import { healthFileInventory, putHealthFilePart, readHealthFile } from "./health-files.js";
import { readHealthSeries } from "./health-read.js";
import { readPixiuDays } from "./pixiu-read.js";
import { beginProviderImport, finishProviderImport, putProviderBatch } from "./provider-imports.js";
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
	if (url.pathname.startsWith("/api/data/pixiu/")) {
		if (url.pathname === "/api/data/pixiu/imports") {
			if (method === "POST") return beginProviderImport(request, env, "pixiu");
		} else if (url.pathname === "/api/data/pixiu/days") {
			if (method === "GET") {
				const { start, end } = dataWindow(url);
				return jsonResponse({ data: { days: await readPixiuDays(env.DB, start, end) } });
			}
		} else {
			const batch = /^\/api\/data\/pixiu\/imports\/([^/]+)\/batches\/(\d+)$/.exec(url.pathname);
			const finish = /^\/api\/data\/pixiu\/imports\/([^/]+)\/finish$/.exec(url.pathname);
			if (batch) {
				if (method === "PUT")
					return putProviderBatch(request, env, batch[1] as string, Number(batch[2]), "pixiu");
			} else if (finish) {
				if (method === "POST")
					return finishProviderImport(request, env, finish[1] as string, "pixiu");
			} else throw new ApiError(404, "not_found", "Pixiu data endpoint not found");
		}
		throw new ApiError(405, "method_not_allowed", "Method not allowed");
	}
	if (url.pathname.startsWith("/api/data/apple-health/")) {
		const prefix = "/api/data/apple-health";
		if (url.pathname === `${prefix}/imports`) {
			if (method === "POST") return beginProviderImport(request, env, "apple-health");
		} else if (url.pathname === `${prefix}/files`) {
			if (method === "GET") return healthFileInventory(env);
		} else if (url.pathname === `${prefix}/file`) {
			if (method === "GET") return readHealthFile(env, url);
		} else if (url.pathname === `${prefix}/series`) {
			if (method === "GET") {
				const { start, end } = dataWindow(url);
				const view = url.searchParams.get("view") ?? "all";
				if (view !== "all" && view !== "story")
					throw new ApiError(400, "invalid_view", "Use story or all");
				return jsonResponse({
					data: { series: await readHealthSeries(env.DB, start, end, view === "story") },
				});
			}
		} else {
			const batch = /^\/api\/data\/apple-health\/imports\/([^/]+)\/batches\/(\d+)$/.exec(
				url.pathname,
			);
			const finish = /^\/api\/data\/apple-health\/imports\/([^/]+)\/finish$/.exec(url.pathname);
			const part = /^\/api\/data\/apple-health\/imports\/([^/]+)\/files\/(\d+)\/parts\/(\d+)$/.exec(
				url.pathname,
			);
			if (batch) {
				if (method === "PUT")
					return putProviderBatch(
						request,
						env,
						batch[1] as string,
						Number(batch[2]),
						"apple-health",
					);
			} else if (finish) {
				if (method === "POST")
					return finishProviderImport(request, env, finish[1] as string, "apple-health");
			} else if (part) {
				if (method === "PUT")
					return putHealthFilePart(
						request,
						env,
						part[1] as string,
						Number(part[2]),
						Number(part[3]),
					);
			} else throw new ApiError(404, "not_found", "Health data endpoint not found");
		}
		throw new ApiError(405, "method_not_allowed", "Method not allowed");
	}
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

function dataWindow(url: URL): { start: number; end: number } {
	const startParam = url.searchParams.get("start");
	const endParam = url.searchParams.get("end");
	if (!startParam || !endParam)
		throw new ApiError(400, "missing_parameter", "start and end are required");
	let start: number;
	let end: number;
	try {
		start = Date.parse(normalizeTimestamp(startParam));
		end = Date.parse(normalizeTimestamp(endParam));
	} catch {
		throw new ApiError(400, "invalid_timestamp", "Use valid ISO timestamps");
	}
	if (start >= end || end - start > LIMITS.maxWindowDays * 86_400_000)
		throw new ApiError(400, "invalid_range", "Choose a positive window of at most 32 days");
	return { start, end };
}
