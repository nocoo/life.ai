import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL } from "../../src/models/ai.js";
import {
	decryptApiKey,
	encryptApiKey,
	extractAiOutput,
	generateAiText,
	getDecryptedAiConfig,
	handleGetAiSettings,
	handlePostAiTest,
	handlePutAiSettings,
	validateBaseUrl,
} from "../../worker/ai.js";
import type { WorkerEnv } from "../../worker/types.js";

const VALID_HEX_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

function createMockAiDb(initialRow?: Record<string, unknown>, testMarker = true) {
	let row = initialRow ? { ...initialRow } : null;

	return {
		_row: row,
		prepare(sql: string) {
			const prepared = {
				bind(...args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							if (sql.includes("FROM ai_settings WHERE id = 'default'")) {
								return row as unknown as T;
							}
							if (sql.includes("FROM _test_marker WHERE key = 'env'")) {
								return (testMarker ? { value: "test" } : null) as unknown as T;
							}
							return null;
						},
						async run() {
							if (sql.includes("INSERT INTO ai_settings")) {
								row = {
									provider: args[0],
									model: args[1],
									base_url: args[2],
									sdk_type: args[3],
									auth_type: args[4],
									encrypted_api_key: args[5],
									updated_at: args[6],
								};
							}
							return { success: true };
						},
					};
				},
				async first<T>(): Promise<T | null> {
					if (sql.includes("FROM ai_settings WHERE id = 'default'")) {
						return row as unknown as T;
					}
					if (sql.includes("FROM _test_marker WHERE key = 'env'")) {
						return (testMarker ? { value: "test" } : null) as unknown as T;
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

function createWorkerEnv(db: D1Database, opts: Partial<WorkerEnv> = {}): WorkerEnv {
	return {
		RESOURCE_ENV: "test",
		DATA_TARGET: "local",
		APP_ORIGIN: "https://life.hexly.ai",
		INGEST_HOST: "life.worker.hexly.ai",
		ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
		ACCESS_AUD: "test-aud",
		TEST_ACCESS_JWKS: "",
		AI_SETTINGS_KEY: VALID_HEX_KEY,
		DB: db,
		ASSETS: {} as Fetcher,
		AI: {
			run: async () => ({ response: "收到。" }),
		} as unknown as WorkerEnv["AI"],
		...opts,
	};
}

describe("worker/ai", () => {
	describe("AES-GCM encryptApiKey and decryptApiKey", () => {
		it("encrypts and decrypts string correctly", async () => {
			const plaintext = "sk-test-secret-key-12345";
			const encrypted = await encryptApiKey(plaintext, VALID_HEX_KEY);
			expect(encrypted).toContain(":");
			const decrypted = await decryptApiKey(encrypted, VALID_HEX_KEY);
			expect(decrypted).toBe(plaintext);
		});

		it("rejects keys that are not exactly 64 hex characters", async () => {
			await expect(encryptApiKey("text", "1234")).rejects.toThrow("exactly 32 hex bytes");
			await expect(encryptApiKey("text", "a".repeat(63))).rejects.toThrow("exactly 32 hex bytes");
			await expect(encryptApiKey("text", "a".repeat(65))).rejects.toThrow("exactly 32 hex bytes");
		});

		it("rejects a 64-character key that is not hex", async () => {
			await expect(encryptApiKey("text", "z".repeat(64))).rejects.toThrow("Invalid hex string");
		});

		it("throws on invalid encrypted format during decrypt", async () => {
			await expect(decryptApiKey("invalid-payload", VALID_HEX_KEY)).rejects.toThrow("format");
			await expect(decryptApiKey("abcd:efgh:extra", VALID_HEX_KEY)).rejects.toThrow("format");
			await expect(decryptApiKey("aa:bb", VALID_HEX_KEY)).rejects.toThrow("format");
		});
	});

	describe("validateBaseUrl", () => {
		it("accepts valid https URL", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);
			expect(await validateBaseUrl("https://api.openai.com/v1", env)).toBe(
				"https://api.openai.com/v1",
			);
			expect(await validateBaseUrl("https://api.anthropic.com/", env)).toBe(
				"https://api.anthropic.com",
			);
		});

		it("returns empty string for empty input", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);
			expect(await validateBaseUrl("", env)).toBe("");
			expect(await validateBaseUrl("   ", env)).toBe("");
		});

		it("rejects non-https in production", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db, { RESOURCE_ENV: "production" });
			await expect(validateBaseUrl("http://api.openai.com/v1", env)).rejects.toThrow("HTTPS");
		});

		it("rejects loopback when not in verified test environment", async () => {
			const dbNoMarker = createMockAiDb(undefined, false); // no marker
			const env = createWorkerEnv(dbNoMarker);
			await expect(validateBaseUrl("http://localhost:11434/v1", env)).rejects.toThrow(
				"不能使用本地回环地址",
			);
		});

		it("allows loopback in verified test mode", async () => {
			const db = createMockAiDb(undefined, true);
			const env = createWorkerEnv(db, { RESOURCE_ENV: "test" });
			expect(await validateBaseUrl("http://127.0.0.1:11434/v1", env)).toBe(
				"http://127.0.0.1:11434/v1",
			);
		});

		it("rejects credentials, query, fragments and private IPs", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);
			await expect(validateBaseUrl("https://user:pass@api.openai.com", env)).rejects.toThrow(
				"用户名或密码",
			);
			await expect(validateBaseUrl("https://api.openai.com?k=v", env)).rejects.toThrow("查询参数");
			await expect(validateBaseUrl("https://api.openai.com#frag", env)).rejects.toThrow("哈希锚点");
			await expect(validateBaseUrl("https://192.168.1.100/v1", env)).rejects.toThrow("私有地址");
			await expect(validateBaseUrl("https://10.0.0.1/v1", env)).rejects.toThrow("私有地址");
		});
	});

	describe("handleGetAiSettings", () => {
		it("returns default workers-ai settings when not configured in DB", async () => {
			const db = createMockAiDb(undefined);
			const env = createWorkerEnv(db);

			const res = await handleGetAiSettings(env);
			const json = (await res.json()) as {
				data: { provider: string; model: string; configured: boolean };
			};
			expect(json.data.provider).toBe("workers-ai");
			expect(json.data.model).toBe(DEFAULT_AI_MODEL);
			expect(json.data.configured).toBe(true);
		});

		it("returns configured settings with masked apiKey flag", async () => {
			const db = createMockAiDb({
				provider: "openai",
				model: "gpt-4o",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai",
				auth_type: "apiKey",
				encrypted_api_key: "iv:cipher",
				updated_at: Date.now(),
			});
			const env = createWorkerEnv(db);

			const res = await handleGetAiSettings(env);
			const json = (await res.json()) as {
				data: { provider: string; hasApiKey: boolean; configured: boolean };
			};
			expect(json.data.provider).toBe("openai");
			expect(json.data.hasApiKey).toBe(true);
			expect(json.data.configured).toBe(true);
		});
	});

	describe("handlePutAiSettings", () => {
		it("saves workers-ai settings without key", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);

			const req = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "workers-ai",
					model: DEFAULT_AI_MODEL,
				}),
			});

			const res = await handlePutAiSettings(req, env);
			const json = (await res.json()) as {
				data: { provider: string; model: string; configured: boolean };
			};
			expect(json.data.provider).toBe("workers-ai");
			expect(json.data.model).toBe(DEFAULT_AI_MODEL);
			expect(json.data.configured).toBe(true);
		});

		it("encrypts and saves external provider settings with apiKey", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);

			const req = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "custom",
					model: "gpt-4o-mini",
					baseURL: "https://api.openai.com/v1",
					sdkType: "openai",
					authType: "apiKey",
					apiKey: "sk-plain-secret",
				}),
			});

			const res = await handlePutAiSettings(req, env);
			const json = (await res.json()) as {
				data: { provider: string; hasApiKey: boolean; configured: boolean };
			};
			expect(json.data.provider).toBe("custom");
			expect(json.data.hasApiKey).toBe(true);
			expect(json.data.configured).toBe(true);

			// Verify decryption
			const config = await getDecryptedAiConfig(env);
			expect(config.apiKey).toBe("sk-plain-secret");
		});

		it("retains existing key if apiKey is omitted for same endpoint", async () => {
			const initialEncrypted = await encryptApiKey("sk-initial-secret", VALID_HEX_KEY);
			const db = createMockAiDb({
				provider: "custom",
				model: "gpt-4o",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai",
				auth_type: "apiKey",
				encrypted_api_key: initialEncrypted,
				updated_at: Date.now(),
			});
			const env = createWorkerEnv(db);

			// Update only model, omit apiKey
			const req = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "custom",
					model: "gpt-4o-2024-08-06",
					baseURL: "https://api.openai.com/v1",
					sdkType: "openai",
					authType: "apiKey",
				}),
			});

			const res = await handlePutAiSettings(req, env);
			const json = (await res.json()) as { data: { hasApiKey: boolean } };
			expect(json.data.hasApiKey).toBe(true);

			const config = await getDecryptedAiConfig(env);
			expect(config.apiKey).toBe("sk-initial-secret");
		});

		it("clears key if provider or endpoint changed and apiKey was omitted", async () => {
			const initialEncrypted = await encryptApiKey("sk-initial-secret", VALID_HEX_KEY);
			const db = createMockAiDb({
				provider: "custom",
				model: "gpt-4o",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai",
				auth_type: "apiKey",
				encrypted_api_key: initialEncrypted,
				updated_at: Date.now(),
			});
			const env = createWorkerEnv(db);

			// Switch provider to anthropic without providing new key
			const req = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "anthropic",
					model: "claude-sonnet-4-20250514",
				}),
			});

			const res = await handlePutAiSettings(req, env);
			const json = (await res.json()) as { data: { hasApiKey: boolean; configured: boolean } };
			expect(json.data.hasApiKey).toBe(false);
			expect(json.data.configured).toBe(false);
		});

		it("rejects non-object body or missing model for external provider", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);

			const badReq1 = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([]),
			});
			await expect(handlePutAiSettings(badReq1, env)).rejects.toThrow("Expected JSON object body");

			const badReq2 = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "anthropic", model: "" }),
			});
			await expect(handlePutAiSettings(badReq2, env)).rejects.toThrow("model cannot be empty");
		});
	});

	describe("extractAiOutput", () => {
		it("extracts from response string", () => {
			expect(extractAiOutput({ response: "Hello AI" })).toBe("Hello AI");
		});

		it("extracts from choices array (message or text)", () => {
			expect(extractAiOutput({ choices: [{ message: { content: "Choice msg" } }] })).toBe(
				"Choice msg",
			);
			expect(extractAiOutput({ choices: [{ text: "Choice text" }] })).toBe("Choice text");
		});

		it("handles non-object or empty fallback", () => {
			expect(extractAiOutput(null)).toBe("");
			expect(extractAiOutput({})).toBe("");
		});
	});

	describe("handlePostAiTest", () => {
		it("throws 400 if external provider is selected without API key", async () => {
			const db = createMockAiDb({
				provider: "openai",
				model: "gpt-4o",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai",
				auth_type: "apiKey",
				encrypted_api_key: null,
			});
			const env = createWorkerEnv(db);
			await expect(handlePostAiTest(env)).rejects.toThrow("未配置 API Key");
		});

		it("calls env.AI.run for workers-ai provider", async () => {
			const db = createMockAiDb(undefined); // default workers-ai
			const mockAi = {
				run: async () => ({ response: "收到。" }),
			};
			const env = createWorkerEnv(db, { AI: mockAi as unknown as WorkerEnv["AI"] });

			const res = await handlePostAiTest(env);
			const json = (await res.json()) as { data: { success: boolean; response: string } };
			expect(json.data.success).toBe(true);
			expect(json.data.response).toBe("收到。");
		});

		it("throws 503 if env.AI is missing for workers-ai", async () => {
			const db = createMockAiDb(undefined);
			const env = createWorkerEnv(db, { AI: undefined });
			await expect(handlePostAiTest(env)).rejects.toThrow("Workers AI 绑定未配置");
		});

		it("maps native AI runtime failures to 502 without echoing secrets", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db, {
				AI: {
					run: async () => {
						throw new Error("upstream sk-secret-should-not-leak");
					},
				} as unknown as WorkerEnv["AI"],
			});
			await expect(handlePostAiTest(env)).rejects.toMatchObject({
				status: 502,
				code: "ai_error",
				message: "AI 服务调用失败或超时，请稍后重试",
			});
		});

		it("rejects empty or oversized native output", async () => {
			const db = createMockAiDb();
			const emptyEnv = createWorkerEnv(db, {
				AI: { run: async () => ({ response: "   " }) } as unknown as WorkerEnv["AI"],
			});
			await expect(handlePostAiTest(emptyEnv)).rejects.toMatchObject({
				status: 502,
				code: "ai_invalid_response",
			});
			const hugeEnv = createWorkerEnv(db, {
				AI: { run: async () => "x".repeat(16_001) } as unknown as WorkerEnv["AI"],
			});
			await expect(handlePostAiTest(hugeEnv)).rejects.toMatchObject({
				status: 502,
				code: "ai_invalid_response",
			});
		});
	});

	describe("settings validation and key lifecycle", () => {
		it("rejects invalid sdkType, authType, control characters and unknown providers", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db);
			const put = (body: unknown) =>
				handlePutAiSettings(
					new Request("https://life.hexly.ai/api/settings/ai", {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
					}),
					env,
				);
			await expect(put({ provider: "custom", model: "m", sdkType: "gemini" })).rejects.toThrow(
				"sdkType",
			);
			await expect(put({ provider: "custom", model: "m", authType: "basic" })).rejects.toThrow(
				"authType",
			);
			await expect(put({ provider: "custom", model: "bad\nmodel" })).rejects.toThrow("控制字符");
			await expect(put({ provider: "custom", model: "m", apiKey: "sk-\0secret" })).rejects.toThrow(
				"控制字符",
			);
			await expect(put({ provider: "not-a-vendor", model: "m" })).rejects.toThrow(
				"不支持的 AI 提供方",
			);
		});

		it("requires AI_SETTINGS_KEY to store a new external key", async () => {
			const db = createMockAiDb();
			const env = createWorkerEnv(db, { AI_SETTINGS_KEY: "" });
			const req = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "custom",
					model: "m",
					baseURL: "https://api.openai.com/v1",
					apiKey: "sk-new",
				}),
			});
			await expect(handlePutAiSettings(req, env)).rejects.toMatchObject({
				status: 503,
				code: "ai_unavailable",
			});
		});

		it("clears the stored key when the custom endpoint or auth mode changes", async () => {
			const initialEncrypted = await encryptApiKey("sk-keep", VALID_HEX_KEY);
			const existing = {
				provider: "custom",
				model: "gpt-4o",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai" as const,
				auth_type: "apiKey" as const,
				encrypted_api_key: initialEncrypted,
				updated_at: Date.now(),
			};
			const env = createWorkerEnv(createMockAiDb(existing));
			const switchEndpoint = new Request("https://life.hexly.ai/api/settings/ai", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "custom",
					model: "gpt-4o",
					baseURL: "https://gateway.example.com/v1",
					sdkType: "openai",
					authType: "apiKey",
				}),
			});
			const switched = await handlePutAiSettings(switchEndpoint, env);
			const switchedJson = (await switched.json()) as { data: { hasApiKey: boolean } };
			expect(switchedJson.data.hasApiKey).toBe(false);
			expect((await getDecryptedAiConfig(env)).apiKey).toBe("");
		});

		it("does not fall back to an environment secret when ciphertext is corrupt or the key is missing", async () => {
			const row = {
				provider: "custom",
				model: "m",
				base_url: "https://api.openai.com/v1",
				sdk_type: "openai" as const,
				auth_type: "apiKey" as const,
				encrypted_api_key: "deadbeefdeadbeefdeadbeef:ffff",
				updated_at: Date.now(),
			};
			const env = createWorkerEnv(createMockAiDb(row));
			expect((await getDecryptedAiConfig(env)).apiKey).toBe("");
			const envNoSecret = createWorkerEnv(createMockAiDb(row), { AI_SETTINGS_KEY: "" });
			expect((await getDecryptedAiConfig(envNoSecret)).apiKey).toBe("");
		});
	});

	describe("validateBaseUrl extra hosts", () => {
		it("rejects malformed URLs, internal names and non-http loopback schemes", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await expect(validateBaseUrl("not a url", env)).rejects.toThrow("合法的 URL");
			await expect(validateBaseUrl("https://intranet/v1", env)).rejects.toThrow("私有地址");
			await expect(validateBaseUrl("https://svc.internal/v1", env)).rejects.toThrow("私有地址");
			await expect(validateBaseUrl("https://box.local/v1", env)).rejects.toThrow("私有地址");
			await expect(validateBaseUrl("ftp://localhost/v1", env)).rejects.toThrow(
				"测试回环地址必须使用 HTTP 或 HTTPS",
			);
		});
	});

	describe("extractAiOutput extra shapes", () => {
		it("accepts a raw string and empty choices", () => {
			expect(extractAiOutput("  hi  ")).toBe("hi");
			expect(extractAiOutput(12)).toBe("");
			expect(extractAiOutput({ choices: [] })).toBe("");
		});
	});

	describe("external SDK transport", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
		});

		async function saveCustom(env: WorkerEnv, body: Record<string, unknown>): Promise<void> {
			await handlePutAiSettings(
				new Request("https://life.hexly.ai/api/settings/ai", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				env,
			);
		}

		function openaiJson(text: string): Response {
			return new Response(
				JSON.stringify({
					id: "resp_test",
					object: "response",
					created_at: 1,
					status: "completed",
					model: "gpt-4o-mini",
					output: [
						{
							id: "msg_test",
							type: "message",
							status: "completed",
							role: "assistant",
							content: [{ type: "output_text", text, annotations: [] }],
						},
					],
					usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		function anthropicJson(text: string): Response {
			return new Response(
				JSON.stringify({
					id: "msg_test",
					type: "message",
					role: "assistant",
					content: [{ type: "text", text }],
					model: "claude-sonnet-4-20250514",
					stop_reason: "end_turn",
					usage: { input_tokens: 1, output_tokens: 1 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		it("calls OpenAI with redirect disabled", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "gpt-4o-mini",
				baseURL: "https://api.openai.com/v1",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "sk-openai",
			});
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.redirect).toBe("manual");
				return openaiJson("收到。");
			});
			vi.stubGlobal("fetch", fetchMock);
			const result = await generateAiText(env, "请只回复两个字：收到。", 15_000, 150);
			expect(result.content).toBe("收到。");
			expect(fetchMock).toHaveBeenCalled();
			const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
			expect(headers.get("Authorization")).toBe("Bearer sk-openai");
		});

		it("sends Anthropic apiKey as x-api-key", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "claude-sonnet-4-20250514",
				baseURL: "https://api.anthropic.com/v1",
				sdkType: "anthropic",
				authType: "apiKey",
				apiKey: "sk-ant",
			});
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.redirect).toBe("manual");
				const headers = new Headers(init?.headers);
				expect(headers.get("x-api-key")).toBe("sk-ant");
				expect(headers.get("Authorization")).toBeNull();
				return anthropicJson("收到。");
			});
			vi.stubGlobal("fetch", fetchMock);
			const result = await generateAiText(env, "请只回复两个字：收到。", 15_000, 150);
			expect(result.content).toBe("收到。");
		});

		it("sends Anthropic bearer as Authorization only", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "claude-sonnet-4-20250514",
				baseURL: "https://gateway.example.com/v1",
				sdkType: "anthropic",
				authType: "bearer",
				apiKey: "gateway-token",
			});
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.redirect).toBe("manual");
				const headers = new Headers(init?.headers);
				expect(headers.get("Authorization")).toBe("Bearer gateway-token");
				expect(headers.get("x-api-key")).toBeNull();
				return anthropicJson("收到。");
			});
			vi.stubGlobal("fetch", fetchMock);
			const result = await generateAiText(env, "请只回复两个字：收到。", 15_000, 150);
			expect(result.content).toBe("收到。");
		});

		it("does not follow 3xx or send the API key to the Location hop", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "gpt-4o-mini",
				baseURL: "https://api.openai.com/v1",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "sk-openai",
			});
			const urls: string[] = [];
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					urls.push(String(input));
					expect(init?.redirect).toBe("manual");
					expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-openai");
					return new Response("stolen-body", {
						status: 302,
						headers: { Location: "https://evil.example/steal?key=sk-openai" },
					});
				}),
			);
			await expect(generateAiText(env, "hi", 15_000, 150)).rejects.toMatchObject({
				status: 502,
				code: "ai_error",
			});
			expect(urls).toHaveLength(1);
			expect(urls[0]).toContain("https://api.openai.com/v1");
			expect(urls[0]).not.toContain("evil.example");
		});

		it("rejects responses advertised over 512 KiB", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "gpt-4o-mini",
				baseURL: "https://api.openai.com/v1",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "sk-openai",
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					const body = new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode("nope"));
							controller.close();
						},
					});
					return new Response(body, {
						status: 200,
						headers: { "Content-Length": String(512 * 1024 + 1) },
					});
				}),
			);
			await expect(generateAiText(env, "hi", 15_000, 150)).rejects.toMatchObject({
				status: 502,
				code: "ai_error",
			});
		});

		it("rejects streamed responses that exceed 512 KiB", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "gpt-4o-mini",
				baseURL: "https://api.openai.com/v1",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "sk-openai",
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					const chunk = new Uint8Array(64 * 1024);
					const body = new ReadableStream({
						start(controller) {
							for (let i = 0; i < 9; i += 1) controller.enqueue(chunk);
							controller.close();
						},
					});
					return new Response(body, {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}),
			);
			await expect(generateAiText(env, "hi", 15_000, 150)).rejects.toMatchObject({
				status: 502,
				code: "ai_error",
			});
		});

		it("maps a cancelled timeout to 502", async () => {
			const env = createWorkerEnv(createMockAiDb());
			await saveCustom(env, {
				provider: "custom",
				model: "gpt-4o-mini",
				baseURL: "https://api.openai.com/v1",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "sk-openai",
			});
			vi.stubGlobal(
				"fetch",
				vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							const error = new Error("aborted");
							error.name = "AbortError";
							reject(error);
						});
					});
				}),
			);
			await expect(generateAiText(env, "hi", 30, 150)).rejects.toMatchObject({
				status: 502,
				code: "ai_error",
			});
		});
	});
});
