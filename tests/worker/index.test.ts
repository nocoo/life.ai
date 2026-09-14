import { describe, expect, it } from "vitest";
import workerEntry, {
	APP_VERSION,
	handleRequest,
	validateBrowserOrigin,
	validateHostAndRoute,
} from "../../worker/index.js";
import type { WorkerEnv } from "../../worker/types.js";

function createTestDb() {
	return {
		prepare(sql: string) {
			const prepared = {
				bind() {
					return {
						async first<T>(): Promise<T | null> {
							if (sql.includes("SELECT 1 as alive")) {
								return { alive: 1 } as unknown as T;
							}
							if (sql.includes("FROM _test_marker")) {
								return { value: "test" } as unknown as T;
							}
							if (sql.includes("FROM connects WHERE id = ?")) {
								return {
									id: "conn-123",
									name: "Device",
									prefix: "life_12345678",
									created_at: Date.now(),
									last_used_at: null,
									revoked_at: null,
								} as unknown as T;
							}
							if (sql.includes("SELECT COUNT(id) as count FROM life_events")) {
								return { count: 0 } as unknown as T;
							}
							return null;
						},
						async all<T>(): Promise<{ results: T[] }> {
							return { results: [] };
						},
						async run() {
							return { success: true };
						},
					};
				},
				async first<T>(): Promise<T | null> {
					if (sql.includes("SELECT 1 as alive")) {
						return { alive: 1 } as unknown as T;
					}
					if (sql.includes("FROM _test_marker")) {
						return { value: "test" } as unknown as T;
					}
					return null;
				},
				async all<T>(): Promise<{ results: T[] }> {
					return { results: [] };
				},
				async run() {
					return { success: true };
				},
			};
			return prepared;
		},
		async batch(statements: { run: () => Promise<unknown> }[]) {
			return Promise.all(statements.map((s) => s.run()));
		},
	} as unknown as D1Database;
}

describe("worker/index router & host isolation", () => {
	const defaultEnv: WorkerEnv = {
		RESOURCE_ENV: "production",
		DATA_TARGET: "production",
		APP_ORIGIN: "https://life.hexly.ai",
		INGEST_HOST: "life.worker.hexly.ai",
		ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
		ACCESS_AUD: "3d1df7c70e4cb094a5bd4a1c2ec7a81aad0d5265e93f8b89424a206859269503",
		TEST_ACCESS_JWKS: "",
		AI: {} as Ai,
		AI_SETTINGS_KEY: "",
		DB: createTestDb(),
		ASSETS: {
			async fetch() {
				return new Response("mock assets");
			},
		} as unknown as Fetcher,
	};

	it("routes private AI settings and daily summaries only after authentication", async () => {
		const env = {
			...defaultEnv,
			RESOURCE_ENV: "development",
			DATA_TARGET: "local",
			AI: { run: async () => ({ response: "收到" }) } as unknown as Ai,
		};
		const origin = "http://localhost";
		const query =
			"date=2026-09-13&timeZone=UTC&start=2026-09-13T00:00:00Z&end=2026-09-14T00:00:00Z";
		const cases = [
			["/api/settings/ai", "GET", 200],
			["/api/settings/ai", "PUT", 415],
			["/api/settings/ai", "PATCH", 405],
			["/api/settings/ai/test", "GET", 405],
			["/api/settings/ai/test", "POST", 200],
			[`/api/day-summary?${query}`, "GET", 200],
			["/api/day-summary", "POST", 415],
			["/api/day-summary", "DELETE", 405],
		] as const;
		for (const [path, method, status] of cases) {
			const response = await handleRequest(new Request(`${origin}${path}`, { method }), env);
			expect(response.status, `${method} ${path}`).toBe(status);
		}
	});

	describe("validateHostAndRoute", () => {
		it("rejects unauthorized host in dev/test environment", () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const url = new URL("https://unrecognized.external.com/api/live");
			expect(() => validateHostAndRoute(url, "GET", devEnv)).toThrow(
				"Host unrecognized.external.com is not allowed",
			);
		});

		it("rejects unauthorized host in production", () => {
			const url = new URL("https://evil.attacker.com/api/live");
			expect(() => validateHostAndRoute(url, "GET", defaultEnv)).toThrow(
				"Host evil.attacker.com is not allowed",
			);
		});

		it("allows app origin host and ingest host in production", () => {
			const appUrl = new URL("https://life.hexly.ai/api/live");
			const r1 = validateHostAndRoute(appUrl, "GET", defaultEnv);
			expect(r1.isAppHost).toBe(true);
			expect(r1.isIngestHost).toBe(false);

			const ingestUrl = new URL("https://life.worker.hexly.ai/api/ingest");
			const r2 = validateHostAndRoute(ingestUrl, "POST", defaultEnv);
			expect(r2.isAppHost).toBe(false);
			expect(r2.isIngestHost).toBe(true);
		});

		it("restricts ingest host to only POST /api/ingest and GET /api/live", () => {
			const allowedIngest = new URL("https://life.worker.hexly.ai/api/ingest");
			expect(validateHostAndRoute(allowedIngest, "POST", defaultEnv).isIngestHost).toBe(true);

			const allowedLive = new URL("https://life.worker.hexly.ai/api/live");
			expect(validateHostAndRoute(allowedLive, "GET", defaultEnv).isIngestHost).toBe(true);

			// Disallowed routes on ingest host
			const badRoute = new URL("https://life.worker.hexly.ai/api/events");
			expect(() => validateHostAndRoute(badRoute, "GET", defaultEnv)).toThrow(
				"Machine ingestion host exposes only POST /api/ingest and GET /api/live",
			);

			const badMethod = new URL("https://life.worker.hexly.ai/api/ingest");
			expect(() => validateHostAndRoute(badMethod, "GET", defaultEnv)).toThrow(
				"Machine ingestion host exposes only POST /api/ingest and GET /api/live",
			);
		});
	});

	describe("validateBrowserOrigin", () => {
		it("allows GET, HEAD, OPTIONS without Origin check", () => {
			const url = new URL("https://life.hexly.ai/api/events");
			const req = new Request(url.toString(), { method: "GET" });
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).not.toThrow();
		});

		it("allows same-origin writes matching request origin or APP_ORIGIN", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req = new Request(url.toString(), {
				method: "POST",
				headers: { Origin: "https://life.hexly.ai" },
			});
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).not.toThrow();
		});

		it("rejects scheme mismatch (http vs https)", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req = new Request(url.toString(), {
				method: "POST",
				headers: { Origin: "http://life.hexly.ai" },
			});
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).toThrow(
				"Cross-origin requests are forbidden",
			);
		});

		it("rejects cross-origin browser writes", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req = new Request(url.toString(), {
				method: "POST",
				headers: { Origin: "https://attacker.com" },
			});
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).toThrow(
				"Cross-origin requests are forbidden",
			);
		});

		it("rejects malformed Origin header", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req = new Request(url.toString(), {
				method: "POST",
				headers: { Origin: "http://[invalid-ipv6" },
			});
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).toThrow();
		});

		it("rejects Sec-Fetch-Site cross-site writes when Origin is absent", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req = new Request(url.toString(), {
				method: "POST",
				headers: { "Sec-Fetch-Site": "cross-site" },
			});
			expect(() => validateBrowserOrigin(req, defaultEnv, url)).toThrow(
				"Cross-origin requests are forbidden",
			);
		});

		it("allows missing Origin when Sec-Fetch-Site is same-origin or none", () => {
			const url = new URL("https://life.hexly.ai/api/connects");
			const req1 = new Request(url.toString(), {
				method: "POST",
				headers: { "Sec-Fetch-Site": "same-origin" },
			});
			expect(() => validateBrowserOrigin(req1, defaultEnv, url)).not.toThrow();

			const req2 = new Request(url.toString(), {
				method: "POST",
				headers: { "Sec-Fetch-Site": "none" },
			});
			expect(() => validateBrowserOrigin(req2, defaultEnv, url)).not.toThrow();
		});
	});

	describe("handleRequest dispatch", () => {
		it("serves GET /api/live on both app host and ingest host without auth", async () => {
			const reqApp = new Request("https://life.hexly.ai/api/live");
			const resApp = await handleRequest(reqApp, defaultEnv);
			expect(resApp.status).toBe(200);
			const dataApp = (await resApp.json()) as { status: string; version: string };
			expect(dataApp.status).toBe("ok");
			expect(dataApp.version).toBe(APP_VERSION);

			const reqIngest = new Request("https://life.worker.hexly.ai/api/live");
			const resIngest = await handleRequest(reqIngest, defaultEnv);
			expect(resIngest.status).toBe(200);
		});

		it("returns 405 for wrong method on /api/live", async () => {
			const req = new Request("https://life.hexly.ai/api/live", { method: "POST" });
			const res = await handleRequest(req, defaultEnv);
			expect(res.status).toBe(405);
		});

		it("handles /api/session GET and disallows POST", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const reqGet = new Request("https://life.dev.hexly.ai/api/session");
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(200);

			const reqPost = new Request("https://life.dev.hexly.ai/api/session", { method: "POST" });
			const resPost = await handleRequest(reqPost, devEnv);
			expect(resPost.status).toBe(405);
		});

		it("handles /api/sources GET and disallows POST", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const reqGet = new Request("https://life.dev.hexly.ai/api/sources");
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(200);

			const reqPost = new Request("https://life.dev.hexly.ai/api/sources", { method: "POST" });
			const resPost = await handleRequest(reqPost, devEnv);
			expect(resPost.status).toBe(405);
		});

		it("handles /api/events GET and disallows POST", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const reqGet = new Request(
				"https://life.dev.hexly.ai/api/events?start=2026-09-13T00:00:00Z&end=2026-09-13T23:59:59Z",
			);
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(200);

			const reqPost = new Request("https://life.dev.hexly.ai/api/events", { method: "POST" });
			const resPost = await handleRequest(reqPost, devEnv);
			expect(resPost.status).toBe(405);
		});

		it("handles /api/imports POST and disallows GET", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const reqPost = new Request("https://life.dev.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [{ key: "k", occurredAt: "2026-09-13T00:00:00Z", title: "t" }],
				}),
			});
			const resPost = await handleRequest(reqPost, devEnv);
			expect(resPost.status).toBe(200);

			const reqGet = new Request("https://life.dev.hexly.ai/api/imports", { method: "GET" });
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(405);
		});

		it("handles /api/connects GET, POST, and disallows PUT", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};
			const reqGet = new Request("https://life.dev.hexly.ai/api/connects");
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(200);

			const reqPost = new Request("https://life.dev.hexly.ai/api/connects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Device" }),
			});
			const resPost = await handleRequest(reqPost, devEnv);
			expect(resPost.status).toBe(201);

			const reqPut = new Request("https://life.dev.hexly.ai/api/connects", { method: "PUT" });
			const resPut = await handleRequest(reqPut, devEnv);
			expect(resPut.status).toBe(405);
		});

		it("handles /api/connects/:id DELETE and disallows other methods", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
			};

			const reqGet = new Request("https://life.dev.hexly.ai/api/connects/conn-123", {
				method: "GET",
			});
			const resGet = await handleRequest(reqGet, devEnv);
			expect(resGet.status).toBe(405);

			const reqDel = new Request("https://life.dev.hexly.ai/api/connects/conn-123", {
				method: "DELETE",
			});
			const resDel = await handleRequest(reqDel, devEnv);
			expect(resDel.status).toBe(200);

			const reqEmptyId = new Request("https://life.dev.hexly.ai/api/connects/", {
				method: "DELETE",
			});
			const resEmpty = await handleRequest(reqEmptyId, devEnv);
			expect(resEmpty.status).toBe(404);
		});

		it("returns JSON 404 for unknown /api/* routes without falling through to ASSETS", async () => {
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
				ASSETS: {
					async fetch() {
						return new Response("<html>SPA HTML</html>", {
							status: 200,
							headers: { "Content-Type": "text/html" },
						});
					},
				} as unknown as Fetcher,
			};

			const req = new Request("https://life.dev.hexly.ai/api/unknown-endpoint");
			const res = await handleRequest(req, devEnv);
			expect(res.status).toBe(404);
			const body = (await res.json()) as { error: { code: string; message: string } };
			expect(body.error.code).toBe("not_found");
		});

		it("delegates to env.ASSETS for static files when present after auth", async () => {
			let assetCalled = false;
			const devEnv: WorkerEnv = {
				...defaultEnv,
				RESOURCE_ENV: "development",
				DATA_TARGET: "local",
				ASSETS: {
					async fetch() {
						assetCalled = true;
						return new Response("<html>SPA</html>", {
							headers: { "Content-Type": "text/html" },
						});
					},
				} as unknown as Fetcher,
			};

			const req = new Request("https://life.dev.hexly.ai/index.html");
			const res = await handleRequest(req, devEnv);
			expect(assetCalled).toBe(true);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("<html>SPA</html>");
		});

		it("disallows non-POST on /api/ingest", async () => {
			const req = new Request("https://life.worker.hexly.ai/api/ingest", { method: "GET" });
			const res = await handleRequest(req, defaultEnv);
			// Ingest host rejects any non-POST /api/ingest with 404 per validateHostAndRoute
			expect(res.status).toBe(404);
		});

		it("rejects non-POST ingestion on the dashboard host before token authentication", async () => {
			for (const method of ["GET", "PUT"]) {
				const response = await handleRequest(
					new Request("https://life.hexly.ai/api/ingest", { method }),
					defaultEnv,
				);
				expect(response.status).toBe(405);
				expect(await response.json()).toMatchObject({ error: { code: "method_not_allowed" } });
			}
		});

		it("exports default object with fetch handler", () => {
			expect(typeof workerEntry.fetch).toBe("function");
		});
	});
});
