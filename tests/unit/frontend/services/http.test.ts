import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ApiError,
	apiGet,
	apiRequest,
	apiSend,
	buildUrl,
	isAbortError,
	isApiError,
} from "../../../../src/services/http";
import { abortError, jsonResponse, stubFetch, textResponse } from "../helpers";

describe("buildUrl", () => {
	it("returns the path when query is omitted", () => {
		expect(buildUrl("/api/session")).toBe("/api/session");
	});

	it("skips empty query values", () => {
		expect(
			buildUrl("/api/events", { start: "a", end: "b", source: "", cursor: undefined, extra: null }),
		).toBe("/api/events?start=a&end=b");
	});

	it("stringifies remaining values", () => {
		expect(buildUrl("/api/events", { limit: 200, ok: true })).toBe("/api/events?limit=200&ok=true");
	});
});

describe("apiRequest", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns data from a success envelope", async () => {
		stubFetch(vi.fn(async () => jsonResponse(200, { data: { ok: true } })));
		await expect(apiGet<{ ok: boolean }>("/api/ping")).resolves.toEqual({ ok: true });
	});

	it("sends JSON and credentials", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.method).toBe("POST");
			expect(init?.body).toBe(JSON.stringify({ name: "Mac" }));
			expect(init?.credentials).toBe("same-origin");
			expect(init?.cache).toBe("no-store");
			expect(init?.redirect).toBe("manual");
			const headers = new Headers(init?.headers);
			expect(headers.get("Content-Type")).toBe("application/json");
			return jsonResponse(201, { data: { id: "1" } });
		});
		stubFetch(fetchMock);
		await expect(
			apiSend<{ id: string }>("/api/connects", "POST", { name: "Mac" }),
		).resolves.toEqual({ id: "1" });
	});

	it("recognizes an Access login redirect as an expired session", async () => {
		const response = new Response(null);
		Object.defineProperty(response, "type", { value: "opaqueredirect" });
		stubFetch(vi.fn(async () => response));
		await expect(apiGet("/api/session")).rejects.toMatchObject({
			status: 401,
			code: "session_expired",
		});
	});

	it("omits content type when there is no body", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(headers.has("Content-Type")).toBe(false);
			return jsonResponse(200, { data: { id: "1" } });
		});
		stubFetch(fetchMock);
		await apiSend("/api/connects/1", "DELETE");
	});

	it("maps API error envelopes", async () => {
		stubFetch(
			vi.fn(async () => jsonResponse(403, { error: { code: "forbidden", message: "无权访问" } })),
		);
		await expect(apiGet("/api/session")).rejects.toMatchObject({
			name: "ApiError",
			status: 403,
			code: "forbidden",
			message: "无权访问",
		});
	});

	it("falls back when error fields are missing", async () => {
		stubFetch(vi.fn(async () => jsonResponse(500, { error: {} })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({
			code: "unknown",
			message: "请求失败，请重试。",
		});
	});

	it("falls back when the error body is not an object", async () => {
		stubFetch(vi.fn(async () => jsonResponse(500, { error: "boom" })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({ code: "unknown" });
	});

	it("falls back when the body is not JSON", async () => {
		stubFetch(vi.fn(async () => textResponse(502, "<html>")));
		await expect(apiGet("/api/session")).rejects.toBeInstanceOf(ApiError);
	});

	it("falls back when the error body is empty", async () => {
		stubFetch(vi.fn(async () => new Response("", { status: 503 })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({
			status: 503,
			code: "unknown",
			message: "请求失败，请重试。",
		});
	});

	it("rejects success bodies without data", async () => {
		stubFetch(vi.fn(async () => jsonResponse(200, { ok: true })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({ code: "invalid_response" });
	});

	it("rejects success bodies with undefined data", async () => {
		stubFetch(vi.fn(async () => jsonResponse(200, { data: undefined })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({ code: "invalid_response" });
	});

	it("rejects empty success bodies", async () => {
		stubFetch(vi.fn(async () => new Response("", { status: 200 })));
		await expect(apiGet("/api/session")).rejects.toMatchObject({ code: "invalid_response" });
	});

	it("wraps network failures", async () => {
		stubFetch(
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		await expect(apiGet("/api/session")).rejects.toMatchObject({
			code: "network",
			message: "无法连接服务器，请重试。",
		});
	});

	it("propagates abort errors", async () => {
		stubFetch(
			vi.fn(async () => {
				throw abortError();
			}),
		);
		await expect(apiGet("/api/session")).rejects.toMatchObject({ name: "AbortError" });
	});

	it("keeps caller headers", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(headers.get("X-Test")).toBe("1");
			expect(headers.get("Content-Type")).toBe("text/plain");
			return jsonResponse(200, { data: true });
		});
		stubFetch(fetchMock);
		await apiRequest("/api/session", {
			method: "POST",
			body: "raw",
			headers: { "Content-Type": "text/plain", "X-Test": "1" },
		});
	});
});

describe("error guards", () => {
	it("detects ApiError and abort errors", () => {
		expect(isApiError(new ApiError(400, "bad", "no"))).toBe(true);
		expect(isApiError(new Error("no"))).toBe(false);
		const aborted = abortError();
		expect(isAbortError(aborted)).toBe(true);
		expect(isAbortError(new Error("other"))).toBe(false);
	});
});
