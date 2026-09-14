import { defaultRegistry } from "@nocoo/next-ai";
import { type AiConnectionResult, type AiSettings, DEFAULT_AI_MODEL } from "../src/models/ai.js";
import { verifyTestMarker } from "./auth.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody, validateString } from "./utils.js";

type AiConfig = Omit<AiSettings, "hasApiKey" | "configured"> & { apiKey: string };

const DEFAULT_CONFIG: AiConfig = {
	provider: "workers-ai",
	model: DEFAULT_AI_MODEL,
	baseURL: "",
	sdkType: "openai",
	authType: "apiKey",
	apiKey: "",
};
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_OUTPUT_CHARACTERS = 16_000;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
	if (!/^(?:[a-f\d]{2})+$/i.test(hex)) throw new Error("Invalid hex string");
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++)
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getCryptoKey(hexKey: string): Promise<CryptoKey> {
	if (hexKey.length !== 64)
		throw new Error("AI_SETTINGS_KEY must be exactly 32 hex bytes (64 hex characters)");
	return crypto.subtle.importKey("raw", hexToBytes(hexKey), "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

/** Random IV per value; the encryption key lives in a Worker secret, separately from D1. */
export async function encryptApiKey(plaintext: string, hexKey: string): Promise<string> {
	const key = await getCryptoKey(hexKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(plaintext),
	);
	return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptApiKey(encrypted: string, hexKey: string): Promise<string> {
	const key = await getCryptoKey(hexKey);
	const [iv, ciphertext, extra] = encrypted.split(":");
	if (iv?.length !== 24 || !ciphertext || extra !== undefined)
		throw new Error("Invalid encrypted payload format");
	const bytes = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: hexToBytes(iv) },
		key,
		hexToBytes(ciphertext),
	);
	return new TextDecoder().decode(bytes);
}

/** External endpoints need HTTPS DNS names. Loopback is only for marked, isolated tests. */
export async function validateBaseUrl(value: string, env: WorkerEnv): Promise<string> {
	const trimmed = validateString(value, "baseURL", 2048, false).trim();
	if (!trimmed) return "";
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new ApiError(400, "invalid_base_url", "baseURL 必须是合法的 URL");
	}
	if (url.username || url.password)
		throw new ApiError(400, "invalid_base_url", "baseURL 不能包含用户名或密码");
	if (url.search || url.hash)
		throw new ApiError(400, "invalid_base_url", "baseURL 不能包含查询参数或哈希锚点");
	const hostname = url.hostname.replace(/\.$/, "");
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
	if (loopback) {
		if (env.RESOURCE_ENV !== "test" || !(await verifyTestMarker(env.DB)))
			throw new ApiError(400, "invalid_base_url", "非隔离测试环境下不能使用本地回环地址");
		if (url.protocol !== "http:" && url.protocol !== "https:")
			throw new ApiError(400, "invalid_base_url", "测试回环地址必须使用 HTTP 或 HTTPS");
	} else {
		if (url.protocol !== "https:")
			throw new ApiError(400, "invalid_base_url", "外部模型 baseURL 必须使用 HTTPS 协议");
		if (
			/^[\d.]+$/.test(hostname) ||
			hostname.startsWith("[") ||
			!hostname.includes(".") ||
			/\.(?:local|internal|localhost)$/.test(hostname)
		)
			throw new ApiError(400, "invalid_base_url", "baseURL 不能使用 IP、局域网或内部私有地址");
	}
	url.hostname = hostname;
	return url.toString().replace(/\/+$/, "");
}

interface StoredAiRow {
	provider: string;
	model: string;
	base_url: string;
	sdk_type: AiSettings["sdkType"];
	auth_type: AiSettings["authType"];
	encrypted_api_key: string | null;
}

function readSettings(env: WorkerEnv) {
	return env.DB.prepare(
		"SELECT provider, model, base_url, sdk_type, auth_type, encrypted_api_key FROM ai_settings WHERE id = 'default'",
	).first<StoredAiRow>();
}

export async function getDecryptedAiConfig(env: WorkerEnv): Promise<AiConfig> {
	const row = await readSettings(env);
	if (!row) return { ...DEFAULT_CONFIG };
	let apiKey = "";
	if (row.encrypted_api_key && env.AI_SETTINGS_KEY) {
		try {
			apiKey = await decryptApiKey(row.encrypted_api_key, env.AI_SETTINGS_KEY);
		} catch {
			// A missing/rotated secret must never fall back to an environment API key.
			apiKey = "";
		}
	}
	return {
		provider: row.provider,
		model: row.model,
		baseURL: row.base_url,
		sdkType: row.sdk_type,
		authType: row.auth_type,
		apiKey,
	};
}

export async function handleGetAiSettings(env: WorkerEnv): Promise<Response> {
	const row = await readSettings(env);
	const { apiKey: _, ...defaults } = DEFAULT_CONFIG;
	const config = row
		? {
				provider: row.provider,
				model: row.model,
				baseURL: row.base_url,
				sdkType: row.sdk_type,
				authType: row.auth_type,
			}
		: defaults;
	const hasApiKey = Boolean(row?.encrypted_api_key);
	const settings: AiSettings = {
		...config,
		hasApiKey,
		configured:
			config.provider === "workers-ai"
				? Boolean(env.AI)
				: hasApiKey && Boolean(env.AI_SETTINGS_KEY),
	};
	return jsonResponse({ data: settings });
}

export async function handlePutAiSettings(request: Request, env: WorkerEnv): Promise<Response> {
	const body = await readJsonBody<unknown>(request, 16 * 1024);
	if (!body || typeof body !== "object" || Array.isArray(body))
		throw new ApiError(400, "invalid_payload", "Expected JSON object body");
	const input = body as Record<string, unknown>;
	const provider = validateString(input.provider, "provider", 80).trim();
	const model = validateString(input.model, "model", 200, provider !== "workers-ai").trim();
	const apiKey = validateString(input.apiKey, "apiKey", 4096, false).trim();
	validateString(input.baseURL, "baseURL", 2048, false);
	if (/[\r\n\0]/.test(model + apiKey))
		throw new ApiError(400, "invalid_payload", "模型名称与 API Key 不能包含控制字符");
	if (input.sdkType !== undefined && input.sdkType !== "openai" && input.sdkType !== "anthropic")
		throw new ApiError(400, "invalid_sdk_type", "sdkType 必须是 openai 或 anthropic");
	if (input.authType !== undefined && input.authType !== "apiKey" && input.authType !== "bearer")
		throw new ApiError(400, "invalid_auth_type", "authType 必须是 apiKey 或 bearer");
	const config = { ...DEFAULT_CONFIG, provider, model: model || DEFAULT_AI_MODEL };
	if (provider !== "workers-ai") {
		if (provider === "custom") {
			config.baseURL = await validateBaseUrl(validateString(input.baseURL, "baseURL", 2048), env);
			config.sdkType = input.sdkType === "anthropic" ? "anthropic" : "openai";
			config.authType = input.authType === "bearer" ? "bearer" : "apiKey";
		} else {
			const info = defaultRegistry.get(provider);
			if (!info) throw new ApiError(400, "invalid_provider", "不支持的 AI 提供方");
			config.baseURL = info.baseURL;
			config.sdkType = info.sdkType;
		}
	}
	const existing = await readSettings(env);
	let encryptedApiKey: string | null = null;
	if (provider !== "workers-ai") {
		if (apiKey) {
			if (!env.AI_SETTINGS_KEY)
				throw new ApiError(503, "ai_unavailable", "AI_SETTINGS_KEY 未配置，无法安全存储 API Key");
			encryptedApiKey = await encryptApiKey(apiKey, env.AI_SETTINGS_KEY);
		} else if (
			existing?.provider === provider &&
			existing.base_url === config.baseURL &&
			existing.sdk_type === config.sdkType &&
			existing.auth_type === config.authType
		) {
			encryptedApiKey = existing.encrypted_api_key;
		}
	}
	await env.DB.prepare(`
		INSERT INTO ai_settings (id, provider, model, base_url, sdk_type, auth_type, encrypted_api_key, updated_at)
		VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			provider = excluded.provider, model = excluded.model, base_url = excluded.base_url,
			sdk_type = excluded.sdk_type, auth_type = excluded.auth_type,
			encrypted_api_key = excluded.encrypted_api_key, updated_at = excluded.updated_at
	`)
		.bind(
			provider,
			config.model,
			config.baseURL,
			config.sdkType,
			config.authType,
			encryptedApiKey,
			Date.now(),
		)
		.run();
	return handleGetAiSettings(env);
}

/** Workers forward auth headers across redirects by default. Disable them and bound SDK JSON reads. */
const boundedAiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
	const response = await fetch(input, { ...init, redirect: "manual" });
	if (response.status >= 300 && response.status < 400) {
		await response.body?.cancel();
		throw new Error("AI redirects are not allowed");
	}
	if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw new Error("AI response too large");
	}
	let bytes = 0;
	const stream = response.body?.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				bytes += chunk.byteLength;
				if (bytes > MAX_RESPONSE_BYTES) throw new Error("AI response too large");
				controller.enqueue(chunk);
			},
		}),
	);
	return new Response(stream, { status: response.status, headers: response.headers });
};

/** Some compatible/Qwen endpoints put reasoning markup in the text channel. Save only the answer. */
function answerText(value: string): string {
	const text = value.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "");
	return text.includes("<think>") ? "" : text.trim();
}

export function extractAiOutput(raw: unknown): string {
	if (typeof raw === "string") return answerText(raw);
	if (!raw || typeof raw !== "object") return "";
	const record = raw as Record<string, unknown>;
	if (typeof record.response === "string") return answerText(record.response);
	if (!Array.isArray(record.choices)) return "";
	const first = record.choices[0] as
		| { message?: { content?: unknown }; text?: unknown; finish_reason?: string }
		| undefined;
	if (first?.finish_reason === "length") return "";
	if (typeof first?.message?.content === "string") return answerText(first.message.content);
	return typeof first?.text === "string" ? answerText(first.text) : "";
}

export interface AiTextResult {
	content: string;
	provider: string;
	model: string;
	/** Inference metadata for reproducible manual evals; never contains a key or prompt. */
	resolvedModel?: string;
	usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number };
}

/** Shared generation path for connection checks and summaries; errors never echo upstream secrets. */
export async function generateAiText(
	env: WorkerEnv,
	prompt: string,
	timeoutMs = 45_000,
	maxOutputTokens = 1200,
	options: { system?: string; reasoning?: boolean } = {},
): Promise<AiTextResult> {
	const config = await getDecryptedAiConfig(env);
	const native = config.provider === "workers-ai";
	if (native && !env.AI)
		throw new ApiError(503, "ai_unavailable", "Cloudflare Workers AI 绑定未配置");
	if (!native && !config.apiKey)
		throw new ApiError(400, "not_configured", "未配置 API Key，请先配置并保存");
	try {
		let content: string;
		let resolvedModel: string | undefined;
		let usage: AiTextResult["usage"];
		const signal = AbortSignal.timeout(timeoutMs);
		if (native && env.AI) {
			content = extractAiOutput(
				await env.AI.run(
					config.model as Parameters<typeof env.AI.run>[0],
					{
						messages: [
							...(options.system ? [{ role: "system", content: options.system }] : []),
							{ role: "user", content: options.reasoning ? prompt : `${prompt}\n/no_think` },
						],
						max_tokens: maxOutputTokens,
					},
					{ signal },
				),
			);
		} else {
			// next-ai supplies the shared provider registry; direct SDK clients let us constrain transport.
			const { generateText } = await import("ai");
			const baseURL = await validateBaseUrl(config.baseURL, env);
			const model =
				config.sdkType === "anthropic"
					? (await import("@ai-sdk/anthropic")).createAnthropic({
							baseURL,
							...(config.authType === "bearer"
								? { authToken: config.apiKey }
								: { apiKey: config.apiKey }),
							fetch: boundedAiFetch,
						})(config.model)
					: (await import("@ai-sdk/openai")).createOpenAI({
							baseURL,
							apiKey: config.apiKey,
							fetch: boundedAiFetch,
						})(config.model);
			const result = await generateText({
				model,
				system: options.system,
				prompt,
				maxOutputTokens,
				// Request deeper reasoning only on known reasoning models and the configured auto router.
				// Other compatible models retain their native defaults instead of receiving invalid options.
				providerOptions:
					options.reasoning &&
					config.sdkType === "openai" &&
					/^(?:auto$|gpt-[56](?:[.-]|$)|o[134](?:-|$))/.test(config.model)
						? { openai: { reasoningEffort: "high", forceReasoning: true } }
						: undefined,
				abortSignal: signal,
				maxRetries: 0,
			});
			if (result.finishReason === "length")
				throw new ApiError(502, "ai_invalid_response", "AI 未完成正文，请重新生成");
			content = answerText(result.text);
			resolvedModel = result.response.modelId;
			usage = {
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				reasoningTokens: result.usage.outputTokenDetails.reasoningTokens,
			};
		}
		if (!content || content.length > MAX_OUTPUT_CHARACTERS)
			throw new ApiError(502, "ai_invalid_response", "AI 服务未返回有效内容");
		return {
			content,
			provider: config.provider,
			model: config.model,
			...(resolvedModel ? { resolvedModel } : {}),
			...(usage ? { usage } : {}),
		};
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(502, "ai_error", "AI 服务调用失败或超时，请稍后重试");
	}
}

export async function handlePostAiTest(env: WorkerEnv): Promise<Response> {
	const { content, provider, model } = await generateAiText(
		env,
		"请只回复两个字：收到。",
		15_000,
		150,
	);
	const result: AiConnectionResult = { success: true, response: content, provider, model };
	return jsonResponse({ data: result });
}
