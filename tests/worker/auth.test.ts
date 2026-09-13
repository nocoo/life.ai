import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
	authenticateAccess,
	authenticateConnect,
	CONNECT_TOKEN_REGEX,
	generateConnectToken,
	isLocalHost,
	sha256,
	verifyTestMarker,
} from "../../worker/auth.js";
import type { WorkerEnv } from "../../worker/types.js";

function createMockDb(testMarkerValue: string | null = "test") {
	return {
		prepare(sql: string) {
			const prepared = {
				bind(..._args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							if (sql.includes("FROM _test_marker")) {
								if (testMarkerValue) {
									return { value: testMarkerValue } as unknown as T;
								}
								return null;
							}
							return null;
						},
						async run() {
							return { success: true };
						},
					};
				},
				async first<T>(): Promise<T | null> {
					if (sql.includes("FROM _test_marker")) {
						if (testMarkerValue) {
							return { value: testMarkerValue } as unknown as T;
						}
						return null;
					}
					return null;
				},
				async run() {
					return { success: true };
				},
			};
			return prepared;
		},
	} as unknown as D1Database;
}

describe("worker/auth", () => {
	describe("isLocalHost", () => {
		it("detects localhost variations", () => {
			expect(isLocalHost("localhost")).toBe(true);
			expect(isLocalHost("127.0.0.1")).toBe(true);
			expect(isLocalHost("::1")).toBe(true);
			expect(isLocalHost("life.dev.hexly.ai")).toBe(true);
			expect(isLocalHost("life.hexly.ai")).toBe(false);
			expect(isLocalHost("life.worker.hexly.ai")).toBe(false);
		});
	});

	describe("sha256 & generateConnectToken", () => {
		it("hashes string correctly", async () => {
			const hash = await sha256("hello");
			expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
		});

		it("generates connect token with life_ prefix and 12-char prefix matching regex", () => {
			const { token, prefix } = generateConnectToken();
			expect(CONNECT_TOKEN_REGEX.test(token)).toBe(true);
			expect(token.startsWith("life_")).toBe(true);
			expect(token.length).toBe(5 + 64);
			expect(prefix).toBe(token.slice(0, 12));
		});
	});

	describe("verifyTestMarker", () => {
		it("returns true when table has key=env and value=test", async () => {
			const db = createMockDb("test");
			expect(await verifyTestMarker(db)).toBe(true);
		});

		it("returns false when table returns null or throws", async () => {
			const db1 = createMockDb(null);
			expect(await verifyTestMarker(db1)).toBe(false);

			const dbThrow = {
				prepare() {
					throw new Error("Table _test_marker does not exist");
				},
			} as unknown as D1Database;
			expect(await verifyTestMarker(dbThrow)).toBe(false);
		});
	});

	describe("authenticateAccess", () => {
		it("allows local dev bypass only for development env on local host", async () => {
			const env: WorkerEnv = {
				RESOURCE_ENV: "development",
				ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
				ACCESS_AUD: "test-aud",
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: "",
				AI: {} as Ai,
				AI_SETTINGS_KEY: "",
				DB: createMockDb(),
				ASSETS: {} as Fetcher,
			};
			const req = new Request("https://life.dev.hexly.ai/api/session");
			const auth = await authenticateAccess(req, env, new URL(req.url));
			expect(auth.mode).toBe("local");
			expect(auth.email).toBe("dev@local.hexly.ai");
		});

		it("never allows local bypass in production even on local host or spoofed host", async () => {
			const env: WorkerEnv = {
				RESOURCE_ENV: "production",
				ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
				ACCESS_AUD: "test-aud",
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: "",
				AI: {} as Ai,
				AI_SETTINGS_KEY: "",
				DB: createMockDb(),
				ASSETS: {} as Fetcher,
			};
			const req = new Request("https://localhost/api/session");
			await expect(authenticateAccess(req, env, new URL(req.url))).rejects.toThrow(
				"Missing Access JWT",
			);
		});

		it("allows isolated test bypass with RESOURCE_ENV=test, loopback and DB test marker verification", async () => {
			const env: WorkerEnv = {
				RESOURCE_ENV: "test",
				ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
				ACCESS_AUD: "test-aud",
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: "",
				AI: {} as Ai,
				AI_SETTINGS_KEY: "",
				DB: createMockDb("test"),
				ASSETS: {} as Fetcher,
			};
			const req = new Request("http://127.0.0.1:17011/api/session");
			const auth = await authenticateAccess(req, env, new URL(req.url));
			expect(auth.mode).toBe("local");
			expect(auth.email).toBe("test@local.hexly.ai");
		});

		it("rejects isolated test bypass if DB marker table fails verification", async () => {
			const env: WorkerEnv = {
				RESOURCE_ENV: "test",
				ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
				ACCESS_AUD: "test-aud",
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: "",
				AI: {} as Ai,
				AI_SETTINGS_KEY: "",
				DB: createMockDb(null), // no test marker in DB
				ASSETS: {} as Fetcher,
			};
			const req = new Request("http://127.0.0.1:17011/api/session");
			await expect(authenticateAccess(req, env, new URL(req.url))).rejects.toThrow(
				"Missing Access JWT",
			);
		});

		it("validates real RS256 JWT with TEST_ACCESS_JWKS requiring exp, sub and DB test marker", async () => {
			const { publicKey, privateKey } = await generateKeyPair("RS256");
			const publicJwk = await exportJWK(publicKey);
			publicJwk.kid = "test-key-id";
			publicJwk.alg = "RS256";

			const jwks = {
				keys: [publicJwk],
			};

			const teamDomain = "nocoo.cloudflareaccess.com";
			const aud = "3d1df7c70e4cb094a5bd4a1c2ec7a81aad0d5265e93f8b89424a206859269503";

			const env: WorkerEnv = {
				RESOURCE_ENV: "test",
				ACCESS_TEAM_DOMAIN: teamDomain,
				ACCESS_AUD: aud,
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: JSON.stringify(jwks),
				AI_SETTINGS_KEY: "",
				DB: createMockDb("test"),
				ASSETS: {} as Fetcher,
			};

			// Valid signed RS256 JWT with exp and sub
			const signedJwt = await new SignJWT({
				email: "user@example.com",
				sub: "user-subject-123",
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
				.setIssuer(`https://${teamDomain}`)
				.setAudience(aud)
				.setExpirationTime("2h")
				.sign(privateKey);

			const req = new Request("http://127.0.0.1:17011/api/session", {
				headers: {
					"Cf-Access-Jwt-Assertion": signedJwt,
				},
			});

			const auth = await authenticateAccess(req, env, new URL(req.url));
			expect(auth.mode).toBe("access");
			expect(auth.email).toBe("user@example.com");
			expect(auth.subject).toBe("user-subject-123");

			// JWT with missing sub claim
			const missingSubJwt = await new SignJWT({
				email: "user@example.com",
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
				.setIssuer(`https://${teamDomain}`)
				.setAudience(aud)
				.setExpirationTime("2h")
				.sign(privateKey);

			const missingSubReq = new Request("http://127.0.0.1:17011/api/session", {
				headers: {
					"Cf-Access-Jwt-Assertion": missingSubJwt,
				},
			});
			await expect(
				authenticateAccess(missingSubReq, env, new URL(missingSubReq.url)),
			).rejects.toThrow("Invalid Access JWT");

			// Invalid JWT signature / expired / wrong audience returns sanitized 403 error
			const badReq = new Request("http://127.0.0.1:17011/api/session", {
				headers: {
					"Cf-Access-Jwt-Assertion": "invalid.jwt.token",
				},
			});
			await expect(authenticateAccess(badReq, env, new URL(badReq.url))).rejects.toThrow(
				"Invalid Access JWT",
			);
		});

		it("uses remote JWKS cache in non-test mode", async () => {
			const { publicKey, privateKey } = await generateKeyPair("RS256");
			const publicJwk = await exportJWK(publicKey);
			publicJwk.kid = "test-key-id";
			publicJwk.alg = "RS256";

			const teamDomain = "mock.access.team";
			const aud = "mock-aud";

			// Mock global fetch for remote JWKS endpoint
			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (input: RequestInfo | URL) => {
				const urlStr = input.toString();
				if (urlStr.includes("/cdn-cgi/access/certs")) {
					return new Response(JSON.stringify({ keys: [publicJwk] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				return originalFetch(input);
			};

			try {
				const env: WorkerEnv = {
					RESOURCE_ENV: "production",
					ACCESS_TEAM_DOMAIN: teamDomain,
					ACCESS_AUD: aud,
					APP_ORIGIN: "https://life.hexly.ai",
					INGEST_HOST: "life.worker.hexly.ai",
					TEST_ACCESS_JWKS: "",
					AI: {} as Ai,
					AI_SETTINGS_KEY: "",
					DB: createMockDb(),
					ASSETS: {} as Fetcher,
				};

				const signedJwt = await new SignJWT({
					email: "remote@example.com",
					sub: "remote-sub-123",
				})
					.setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
					.setIssuer(`https://${teamDomain}`)
					.setAudience(aud)
					.setExpirationTime("2h")
					.sign(privateKey);

				const req = new Request("https://life.hexly.ai/api/session", {
					headers: {
						"Cf-Access-Jwt-Assertion": signedJwt,
					},
				});

				const auth = await authenticateAccess(req, env, new URL(req.url));
				expect(auth.mode).toBe("access");
				expect(auth.email).toBe("remote@example.com");

				// Second call reuses cached remote JWKS
				const auth2 = await authenticateAccess(req, env, new URL(req.url));
				expect(auth2.mode).toBe("access");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("throws 500 when access team domain or aud is missing for JWT check", async () => {
			const env: WorkerEnv = {
				RESOURCE_ENV: "production",
				ACCESS_TEAM_DOMAIN: "",
				ACCESS_AUD: "",
				APP_ORIGIN: "https://life.hexly.ai",
				INGEST_HOST: "life.worker.hexly.ai",
				TEST_ACCESS_JWKS: "",
				AI: {} as Ai,
				AI_SETTINGS_KEY: "",
				DB: createMockDb(),
				ASSETS: {} as Fetcher,
			};
			const req = new Request("https://life.hexly.ai/api/session", {
				headers: {
					"Cf-Access-Jwt-Assertion": "some.token.here",
				},
			});
			await expect(authenticateAccess(req, env, new URL(req.url))).rejects.toThrow(
				"Access authentication not configured",
			);
		});
	});

	describe("authenticateConnect", () => {
		it("authenticates valid Connect token", async () => {
			const token = `life_${"a".repeat(64)}`;
			const tokenHash = await sha256(token);

			const mockDb = {
				prepare(sql: string) {
					return {
						bind(...args: unknown[]) {
							return {
								async first() {
									if (sql.includes("FROM connects WHERE token_hash = ?")) {
										if (args[0] === tokenHash) {
											return {
												id: "conn-123",
												name: "Test Publisher",
												prefix: "life_aaaaaaa",
												revoked_at: null,
											};
										}
									}
									return null;
								},
							};
						},
					};
				},
			} as unknown as D1Database;

			const req = new Request("https://life.worker.hexly.ai/api/ingest", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			const auth = await authenticateConnect(req, mockDb);
			expect(auth.connectId).toBe("conn-123");
			expect(auth.name).toBe("Test Publisher");
		});

		it("throws 401 on missing or invalid Authorization header", async () => {
			const mockDb = {} as D1Database;
			const req1 = new Request("https://life.worker.hexly.ai/api/ingest");
			await expect(authenticateConnect(req1, mockDb)).rejects.toThrow(
				"Missing or invalid Authorization header",
			);

			const req2 = new Request("https://life.worker.hexly.ai/api/ingest", {
				headers: { Authorization: "Basic 12345" },
			});
			await expect(authenticateConnect(req2, mockDb)).rejects.toThrow(
				"Missing or invalid Authorization header",
			);

			const req3 = new Request("https://life.worker.hexly.ai/api/ingest", {
				headers: { Authorization: "Bearer badtoken" },
			});
			await expect(authenticateConnect(req3, mockDb)).rejects.toThrow("Invalid token format");
		});

		it("throws 401 when token not found in database", async () => {
			const mockDb = {
				prepare() {
					return {
						bind() {
							return {
								async first() {
									return null;
								},
							};
						},
					};
				},
			} as unknown as D1Database;

			const req = new Request("https://life.worker.hexly.ai/api/ingest", {
				headers: { Authorization: `Bearer life_${"b".repeat(64)}` },
			});
			await expect(authenticateConnect(req, mockDb)).rejects.toThrow(
				"Connect token not found or invalid",
			);
		});

		it("throws 403 when token is revoked", async () => {
			const token = `life_${"c".repeat(64)}`;
			const tokenHash = await sha256(token);

			const mockDb = {
				prepare() {
					return {
						bind(...args: unknown[]) {
							return {
								async first() {
									if (args[0] === tokenHash) {
										return {
											id: "conn-revoked",
											name: "Revoked",
											prefix: "life_ccccccc",
											revoked_at: 1700000000000,
										};
									}
									return null;
								},
							};
						},
					};
				},
			} as unknown as D1Database;

			const req = new Request("https://life.worker.hexly.ai/api/ingest", {
				headers: { Authorization: `Bearer ${token}` },
			});
			await expect(authenticateConnect(req, mockDb)).rejects.toThrow(
				"Connect token has been revoked",
			);
		});
	});
});
