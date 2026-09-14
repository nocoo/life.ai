import {
	type DataOverview,
	type DataTarget,
	FOOTPRINT_LIMITS,
	type FootprintBatchReceipt,
	type FootprintDaysResult,
	type FootprintImportReceipt,
	type FootprintImportRequest,
	type FootprintImportSession,
	type ImportChannel,
} from "../models/data-management";
import type { FootprintDay, FootprintPlan } from "../models/footprint";
import { ApiError, buildUrl, isAbortError } from "./http";

export interface FootprintClientOptions {
	baseUrl?: string;
	fetchFn?: typeof fetch;
	getHeaders?: () => Promise<HeadersInit>;
	requestTimeoutMs?: number;
}

export interface FootprintClient {
	target: (signal?: AbortSignal) => Promise<DataTarget>;
	overview: (signal?: AbortSignal) => Promise<DataOverview>;
	begin: (request: FootprintImportRequest, signal?: AbortSignal) => Promise<FootprintImportSession>;
	batch: (
		sessionId: string,
		batchId: number,
		days: FootprintDay[],
		signal?: AbortSignal,
	) => Promise<FootprintBatchReceipt>;
	finish: (
		sessionId: string,
		status: "complete" | "cancelled",
		signal?: AbortSignal,
	) => Promise<FootprintImportReceipt>;
	days: (start: string, end: string, signal?: AbortSignal) => Promise<FootprintDaysResult>;
}

export interface UploadFootprintPlanOptions {
	fileName: string;
	channel: ImportChannel;
	target: DataTarget;
	signal?: AbortSignal;
	onProgress?: (receipt: FootprintImportReceipt) => void;
	maxBatchDays?: number;
	maxBatchBytes?: number;
	transientRetries?: number;
	retryBackoffBaseMs?: number;
}

const DEFAULT_TRANSIENT_RETRIES = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_BACKOFF_BASE_MS = 100;
const encoder = new TextEncoder();

export function isTransientError(error: unknown): boolean {
	if (isAbortError(error)) {
		return false;
	}
	if (error instanceof ApiError) {
		return (
			error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
		);
	}
	return true;
}

export async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return;
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			const err = new Error("aborted");
			err.name = "AbortError";
			reject(err);
		};
		signal?.addEventListener("abort", onAbort);
	});
}

export function partitionFootprintDays(
	days: FootprintDay[],
	maxDays: number = FOOTPRINT_LIMITS.batchDays,
	maxBytes: number = FOOTPRINT_LIMITS.batchBytes,
): FootprintDay[][] {
	if (
		!Number.isSafeInteger(maxDays) ||
		!Number.isSafeInteger(maxBytes) ||
		maxDays <= 0 ||
		maxBytes <= 0
	) {
		throw new Error("批次上限必须大于 0 且为安全整数");
	}
	const effectiveMaxDays = Math.min(maxDays, FOOTPRINT_LIMITS.batchDays);
	const effectiveMaxBytes = Math.min(maxBytes, FOOTPRINT_LIMITS.batchBytes);

	const batches: FootprintDay[][] = [];
	let currentDays: FootprintDay[] = [];
	let bodyBytes = 11; // {"days":[]} plus each serialized day and separating commas.

	for (const day of days) {
		const dayJsonBytes = encoder.encode(JSON.stringify(day)).length;
		const singleDayBatchBytes = 11 + dayJsonBytes;

		if (singleDayBatchBytes > effectiveMaxBytes) {
			throw new Error(
				`${new Date(day.utcDay).toISOString().slice(0, 10)} 单日包序列化体积 (${singleDayBatchBytes} bytes) 超出批次上限 (${effectiveMaxBytes} bytes)`,
			);
		}

		if (
			currentDays.length > 0 &&
			(currentDays.length >= effectiveMaxDays || bodyBytes + 1 + dayJsonBytes > effectiveMaxBytes)
		) {
			batches.push(currentDays);
			currentDays = [];
			bodyBytes = 11;
		}

		bodyBytes += dayJsonBytes + (currentDays.length > 0 ? 1 : 0);
		currentDays.push(day);
	}

	if (currentDays.length > 0) {
		batches.push(currentDays);
	}
	return batches;
}

export function createDataRequest(options: FootprintClientOptions = {}) {
	const baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, "") : "";
	const fetchImpl = options.fetchFn ?? fetch;
	const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	if (
		!Number.isSafeInteger(requestTimeoutMs) ||
		requestTimeoutMs <= 0 ||
		requestTimeoutMs > 2_147_483_647
	) {
		throw new Error("请求超时必须是有效的正整数毫秒数");
	}

	async function request<T>(
		path: string,
		init: RequestInit = {},
		query?: Record<string, string | number | boolean | null | undefined>,
	): Promise<T> {
		init.signal?.throwIfAborted();
		const fullUrl = buildUrl(`${baseUrl}${path}`, query);
		const headers = new Headers(init.headers);

		if (options.getHeaders) {
			const dynamicHeaders = await options.getHeaders();
			const extra = new Headers(dynamicHeaders);
			extra.forEach((value, key) => {
				if (!headers.has(key)) {
					headers.set(key, value);
				}
			});
		}

		if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		init.signal?.throwIfAborted();
		const timeout = new AbortController();
		const timeoutId = setTimeout(() => timeout.abort(), requestTimeoutMs);
		const signal = init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;

		let response: Response;
		let text: string;
		try {
			response = await fetchImpl(fullUrl, {
				...init,
				headers,
				credentials: init.credentials ?? "same-origin",
				cache: init.cache ?? "no-store",
				redirect: "manual",
				signal,
			});
			if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
				throw new ApiError(401, "session_expired", "会话已过期，请刷新页面重新登录。");
			}
			text = await response.text();
		} catch (error) {
			init.signal?.throwIfAborted();
			if (timeout.signal.aborted) {
				throw new ApiError(408, "request_timeout", "网络请求超时，请重试。");
			}
			if (error instanceof ApiError || isAbortError(error)) throw error;
			throw new ApiError(0, "network", "无法连接服务器，请重试。");
		} finally {
			clearTimeout(timeoutId);
		}

		let body: unknown = null;
		if (text) {
			try {
				body = JSON.parse(text) as unknown;
			} catch {
				body = text;
			}
		}

		if (!response.ok) {
			if (body && typeof body === "object") {
				const errorObj = (body as { error?: { code?: unknown; message?: unknown } }).error;
				if (errorObj && typeof errorObj === "object") {
					const code =
						typeof errorObj.code === "string" && errorObj.code ? errorObj.code : "unknown";
					const message =
						typeof errorObj.message === "string" && errorObj.message.trim()
							? errorObj.message
							: "请求失败，请重试。";
					throw new ApiError(response.status, code, message);
				}
			}
			throw new ApiError(response.status, "unknown", "请求失败，请重试。");
		}

		if (!body || typeof body !== "object" || !("data" in body)) {
			throw new ApiError(response.status, "invalid_response", "请求失败，请重试。");
		}

		const payload = (body as { data?: T }).data;
		if (payload === undefined) {
			throw new ApiError(response.status, "invalid_response", "请求失败，请重试。");
		}
		return payload;
	}

	return request;
}

export function createFootprintClient(options: FootprintClientOptions = {}): FootprintClient {
	const request = createDataRequest(options);
	return {
		async target(signal?: AbortSignal): Promise<DataTarget> {
			const res = await request<{ target: DataTarget }>("/api/data/target", {
				method: "GET",
				signal,
			});
			return res.target;
		},

		async overview(signal?: AbortSignal): Promise<DataOverview> {
			return request<DataOverview>("/api/data/overview", { method: "GET", signal });
		},

		async begin(
			req: FootprintImportRequest,
			signal?: AbortSignal,
		): Promise<FootprintImportSession> {
			return request<FootprintImportSession>("/api/data/footprint/imports", {
				method: "POST",
				signal,
				body: JSON.stringify(req),
			});
		},

		async batch(
			sessionId: string,
			batchId: number,
			days: FootprintDay[],
			signal?: AbortSignal,
		): Promise<FootprintBatchReceipt> {
			return request<FootprintBatchReceipt>(
				`/api/data/footprint/imports/${encodeURIComponent(sessionId)}/batches/${batchId}`,
				{
					method: "PUT",
					signal,
					body: JSON.stringify({ days }),
				},
			);
		},

		async finish(
			sessionId: string,
			status: "complete" | "cancelled",
			signal?: AbortSignal,
		): Promise<FootprintImportReceipt> {
			return request<FootprintImportReceipt>(
				`/api/data/footprint/imports/${encodeURIComponent(sessionId)}/finish`,
				{
					method: "POST",
					signal,
					body: JSON.stringify({ status }),
				},
			);
		},

		async days(start: string, end: string, signal?: AbortSignal): Promise<FootprintDaysResult> {
			return request<FootprintDaysResult>(
				"/api/data/footprint/days",
				{ method: "GET", signal },
				{ start, end },
			);
		},
	};
}

export async function uploadFootprintPlan(
	client: FootprintClient,
	plan: FootprintPlan,
	options: UploadFootprintPlanOptions,
): Promise<FootprintImportReceipt> {
	options.signal?.throwIfAborted();
	const retries = options.transientRetries ?? DEFAULT_TRANSIENT_RETRIES;
	const backoffBaseMs = options.retryBackoffBaseMs ?? DEFAULT_RETRY_BACKOFF_BASE_MS;
	if (
		!Number.isSafeInteger(retries) ||
		retries < 0 ||
		!Number.isSafeInteger(backoffBaseMs) ||
		backoffBaseMs < 0
	) {
		throw new Error("重试次数和间隔必须是非负整数");
	}

	if (!plan.days || plan.days.length === 0) {
		throw new Error("导入计划中没有日包数据");
	}

	// Reject duplicate utcDay in the plan
	const seenDays = new Set<number>();
	for (const day of plan.days) {
		if (seenDays.has(day.utcDay)) {
			throw new Error(`导入计划包含重复的 UTC 日: ${day.utcDay}`);
		}
		seenDays.add(day.utcDay);
	}

	// 1. Sort complete days strictly ascending by utcDay
	const sortedDays = [...plan.days].sort((a, b) => a.utcDay - b.utcDay);

	// 2. Partition and validate batches BEFORE leasing session
	const batches = partitionFootprintDays(
		sortedDays,
		options.maxBatchDays ?? FOOTPRINT_LIMITS.batchDays,
		options.maxBatchBytes ?? FOOTPRINT_LIMITS.batchBytes,
	);

	// 3. Verify target matches expectations
	const remoteTarget = await client.target(options.signal);
	if (remoteTarget !== options.target) {
		throw new Error(
			`目标环境不匹配：客户端请求目标为 "${options.target}"，但服务端当前配置为 "${remoteTarget}"。`,
		);
	}

	// 4. Begin session
	const session = await client.begin(
		{
			fileName: options.fileName,
			totalDays: sortedDays.length,
			totalPoints: plan.pointCount,
			channel: options.channel,
			target: options.target,
		},
		options.signal,
	);

	try {
		for (let index = 0; index < batches.length; index++) {
			options.signal?.throwIfAborted();
			const batchId = index + 1;
			const batchDays = batches[index] as FootprintDay[];

			let receipt: FootprintBatchReceipt;
			let attempt = 0;
			while (true) {
				options.signal?.throwIfAborted();
				try {
					receipt = await client.batch(session.id, batchId, batchDays, options.signal);
					break;
				} catch (error) {
					if (isAbortError(error) || attempt >= retries || !isTransientError(error)) {
						throw error;
					}
					attempt++;
					const delayMs = backoffBaseMs * 2 ** (attempt - 1);
					await abortableDelay(delayMs, options.signal);
				}
			}

			// Call onProgress outside of batch retry catch so listener exceptions do not trigger retry
			options.onProgress?.(receipt);
		}

		options.signal?.throwIfAborted();
		const finalReceipt = await client.finish(session.id, "complete", options.signal);
		options.onProgress?.(finalReceipt);
		return finalReceipt;
	} catch (originalError) {
		// Attempt bounded cleanup with a fresh signal; preserve original error
		try {
			const cleanupController = new AbortController();
			const timeout = setTimeout(() => cleanupController.abort(), DEFAULT_CLEANUP_TIMEOUT_MS);
			try {
				await client.finish(session.id, "cancelled", cleanupController.signal);
			} finally {
				clearTimeout(timeout);
			}
		} catch {
			// Deliberately ignore cleanup failure; original error is preserved
		}
		throw originalError;
	}
}
