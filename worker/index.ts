import pkg from "../package.json" with { type: "json" };
import { authenticateAccess, isLocalHost } from "./auth.js";
import {
	handleDeleteConnect,
	handleGetConnects,
	handleGetEvents,
	handleGetLive,
	handleGetSession,
	handleGetSources,
	handlePostConnects,
	handlePostImports,
	handlePostIngest,
} from "./routes.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { errorResponse, jsonResponse } from "./utils.js";

// Root version from package.json
export const APP_VERSION = pkg.version;

/**
 * Validates request Host against configured hostnames.
 * Machine hostname exposes ONLY POST /api/ingest and GET /api/live.
 * In production, all hosts except APP_ORIGIN hostname and INGEST_HOST are denied.
 */
export function validateHostAndRoute(
	url: URL,
	method: string,
	env: WorkerEnv,
): { isIngestHost: boolean; isAppHost: boolean } {
	const host = url.hostname;
	const isProd = env.RESOURCE_ENV === "production";

	const ingestHost = env.INGEST_HOST
		? new URL(`https://${env.INGEST_HOST}`).hostname
		: "life.worker.hexly.ai";
	const appHost = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).hostname : "life.hexly.ai";

	const isIngestHost = host === ingestHost;
	const isAppHost = host === appHost;
	const isLocal = isLocalHost(host);

	if (isProd) {
		if (!isIngestHost && !isAppHost) {
			throw new ApiError(403, "forbidden_host", `Host ${host} is not allowed`);
		}
	} else if (!isIngestHost && !isAppHost && !isLocal) {
		// In dev/test, allow local host as well
		throw new ApiError(403, "forbidden_host", `Host ${host} is not allowed`);
	}

	// Machine hostname exposes ONLY POST /api/ingest and GET /api/live
	if (isIngestHost) {
		const isAllowed =
			(url.pathname === "/api/ingest" && method === "POST") ||
			(url.pathname === "/api/live" && method === "GET");
		if (!isAllowed) {
			throw new ApiError(
				404,
				"not_found",
				"Machine ingestion host exposes only POST /api/ingest and GET /api/live",
			);
		}
	}

	return { isIngestHost, isAppHost };
}

/**
 * Validates Same-Origin for browser state-modifying requests (POST/PUT/PATCH/DELETE).
 * - Compares both scheme and host (full origin) against request origin and APP_ORIGIN.
 * - For requests missing Origin, checks Sec-Fetch-Site: rejects anything except "same-origin" or "none".
 */
export function validateBrowserOrigin(request: Request, env: WorkerEnv, url: URL): void {
	const method = request.method.toUpperCase();
	if (["GET", "HEAD", "OPTIONS"].includes(method)) {
		return;
	}

	const origin = request.headers.get("Origin");
	if (!origin) {
		const fetchSite = request.headers.get("Sec-Fetch-Site");
		if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
			throw new ApiError(403, "cross_origin_denied", "Cross-origin requests are forbidden");
		}
		return;
	}

	try {
		const originParsed = new URL(origin);
		const expectedAppOrigin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : null;
		const requestOrigin = url.origin;

		if (originParsed.origin !== requestOrigin && originParsed.origin !== expectedAppOrigin) {
			throw new ApiError(403, "cross_origin_denied", "Cross-origin requests are forbidden");
		}
	} catch (err: unknown) {
		if (err instanceof ApiError) {
			throw err;
		}
		throw new ApiError(403, "cross_origin_denied", "Invalid Origin header");
	}
}

/**
 * Main fetch handler for the Cloudflare Worker.
 */
export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
	try {
		const url = new URL(request.url);
		const method = request.method.toUpperCase();

		// 1. Validate Host restrictions
		validateHostAndRoute(url, method, env);

		// 2. Public health check
		if (url.pathname === "/api/live") {
			if (method !== "GET") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handleGetLive(env, APP_VERSION);
		}

		// 3. Machine ingestion route (Bearer token authentication, independent of browser origin)
		if (url.pathname === "/api/ingest") {
			if (method !== "POST") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handlePostIngest(request, env);
		}

		// 4. Validate Same-Origin for browser writes
		validateBrowserOrigin(request, env, url);

		// 5. Authenticate dashboard / API requests via Cloudflare Access
		const auth = await authenticateAccess(request, env, url);

		// 6. Route API endpoints
		if (url.pathname === "/api/session") {
			if (method !== "GET") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handleGetSession(auth);
		}

		if (url.pathname === "/api/sources") {
			if (method !== "GET") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handleGetSources(env);
		}

		if (url.pathname === "/api/events") {
			if (method !== "GET") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handleGetEvents(env, url);
		}

		if (url.pathname === "/api/imports") {
			if (method !== "POST") {
				return jsonResponse(
					{ error: { code: "method_not_allowed", message: "Method not allowed" } },
					405,
				);
			}
			return await handlePostImports(request, env);
		}

		if (url.pathname === "/api/connects") {
			if (method === "GET") {
				return await handleGetConnects(env);
			}
			if (method === "POST") {
				return await handlePostConnects(request, env);
			}
			return jsonResponse(
				{ error: { code: "method_not_allowed", message: "Method not allowed" } },
				405,
			);
		}

		if (url.pathname.startsWith("/api/connects/")) {
			const connectId = url.pathname.slice("/api/connects/".length).trim();
			if (!connectId) {
				return jsonResponse({ error: { code: "not_found", message: "Connect ID required" } }, 404);
			}
			if (method === "DELETE") {
				return await handleDeleteConnect(connectId, env);
			}
			return jsonResponse(
				{ error: { code: "method_not_allowed", message: "Method not allowed" } },
				405,
			);
		}

		// Unknown /api/* route: return JSON 404 instead of falling through to ASSETS SPA HTML
		if (url.pathname.startsWith("/api/")) {
			return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
		}

		// Non-API routes:
		// Cloudflare Workers with ASSETS binding serve static SPA assets.
		// Cloudflare Access dashboard auth gates static assets as well.
		return await env.ASSETS.fetch(request);
	} catch (err: unknown) {
		return errorResponse(err);
	}
}

export default {
	fetch: handleRequest,
};
