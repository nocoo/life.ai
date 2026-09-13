export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}

export function isApiError(value: unknown): value is ApiError {
	return value instanceof ApiError;
}

export function isAbortError(value: unknown): boolean {
	return value instanceof Error && value.name === "AbortError";
}

export const API_ERROR_FALLBACK = "请求失败，请重试。";

export type QueryValue = string | number | boolean | null | undefined;

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
	if (!query) {
		return path;
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") {
			continue;
		}
		params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}

type ErrorBody = {
	error?: {
		code?: unknown;
		message?: unknown;
	};
};

type SuccessBody<T> = {
	data?: T;
};

async function readBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function toApiError(status: number, body: unknown): ApiError {
	if (body && typeof body === "object") {
		const error = (body as ErrorBody).error;
		if (error && typeof error === "object") {
			const code = typeof error.code === "string" && error.code ? error.code : "unknown";
			const message =
				typeof error.message === "string" && error.message.trim()
					? error.message
					: API_ERROR_FALLBACK;
			return new ApiError(status, code, message);
		}
	}
	return new ApiError(status, "unknown", API_ERROR_FALLBACK);
}

export async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	query?: Record<string, QueryValue>,
): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	let response: Response;
	try {
		response = await fetch(buildUrl(path, query), {
			...init,
			headers,
			credentials: init.credentials ?? "same-origin",
			cache: init.cache ?? "no-store",
			redirect: "manual",
		});
	} catch (error) {
		if (isAbortError(error)) {
			throw error;
		}
		throw new ApiError(0, "network", "无法连接服务器，请重试。");
	}
	// Access redirects expired sessions before the request reaches the Worker.
	if (response.type === "opaqueredirect") {
		throw new ApiError(401, "session_expired", "会话已过期，请刷新页面重新登录。");
	}
	const body = await readBody(response);
	if (!response.ok) {
		throw toApiError(response.status, body);
	}
	if (!body || typeof body !== "object" || !("data" in body)) {
		throw new ApiError(response.status, "invalid_response", API_ERROR_FALLBACK);
	}
	const payload = (body as SuccessBody<T>).data;
	if (payload === undefined) {
		throw new ApiError(response.status, "invalid_response", API_ERROR_FALLBACK);
	}
	return payload;
}

export async function apiGet<T>(
	path: string,
	query?: Record<string, QueryValue>,
	signal?: AbortSignal,
): Promise<T> {
	return apiRequest<T>(path, { method: "GET", signal }, query);
}

export async function apiSend<T>(
	path: string,
	method: "POST" | "DELETE",
	body?: unknown,
	signal?: AbortSignal,
): Promise<T> {
	return apiRequest<T>(path, {
		method,
		signal,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}
