import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	DataOverview,
	DataTarget,
	FootprintBatchReceipt,
	FootprintImportReceipt,
	FootprintImportSession,
} from "../../../../src/models/data-management";
import type { FootprintDay, FootprintPlan } from "../../../../src/models/footprint";
import {
	createFootprintClient,
	type FootprintClient,
	isTransientError,
	partitionFootprintDays,
	uploadFootprintPlan,
} from "../../../../src/services/footprint-client";
import { ApiError } from "../../../../src/services/http";
import { abortError, jsonResponse } from "../helpers";

function makeDay(utcDay: number, pointsCount = 2, payloadBytes = 100): FootprintDay {
	return {
		utcDay,
		data: {
			v: 1,
			fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
			points: Array.from({ length: pointsCount }, (_, i) => [i, 30, 120, 10, null, null]),
		},
		recordCount: pointsCount,
		firstAt: utcDay,
		lastAt: utcDay + pointsCount * 1000,
		payloadBytes,
		contentHash: `hash-${utcDay}`,
		summary: { hourCounts: [pointsCount, ...Array(23).fill(0)] },
	};
}

describe("isTransientError", () => {
	it("returns false for abort errors", () => {
		expect(isTransientError(abortError())).toBe(false);
	});

	it("identifies transient HTTP statuses", () => {
		expect(isTransientError(new ApiError(0, "network", "fail"))).toBe(true);
		expect(isTransientError(new ApiError(408, "request_timeout", "timeout"))).toBe(true);
		expect(isTransientError(new ApiError(429, "rate_limited", "slow down"))).toBe(true);
		expect(isTransientError(new ApiError(500, "server_error", "err"))).toBe(true);
		expect(isTransientError(new ApiError(502, "bad_gateway", "err"))).toBe(true);
	});

	it("returns false for permanent HTTP statuses", () => {
		expect(isTransientError(new ApiError(400, "bad_request", "invalid"))).toBe(false);
		expect(isTransientError(new ApiError(401, "unauthorized", "login"))).toBe(false);
		expect(isTransientError(new ApiError(403, "forbidden", "denied"))).toBe(false);
		expect(isTransientError(new ApiError(409, "conflict", "conflict"))).toBe(false);
	});
	it("treats connection exceptions as transient", () => {
		expect(isTransientError(new TypeError("connection reset"))).toBe(true);
	});
});

describe("partitionFootprintDays", () => {
	it("returns empty array when days are empty", () => {
		expect(partitionFootprintDays([])).toEqual([]);
	});

	it("calculates exact UTF-8 JSON batch length regardless of misleading payloadBytes claim", () => {
		// Day has payloadBytes claimed as 10, but full serialized day object is much larger
		const day1 = makeDay(100, 5, 10);
		const day2 = makeDay(200, 5, 10);
		const singleDayBodyBytes = new TextEncoder().encode(JSON.stringify({ days: [day1] })).length;

		// Bound below single day body size must throw
		expect(() => partitionFootprintDays([day1], 32, singleDayBodyBytes - 1)).toThrow(
			"超出批次上限",
		);

		// Bound exactly accommodating two days produces 1 batch
		const twoDaysBodyBytes = new TextEncoder().encode(
			JSON.stringify({ days: [day1, day2] }),
		).length;
		const batches = partitionFootprintDays([day1, day2], 32, twoDaysBodyBytes);
		expect(batches).toHaveLength(1);

		// Bound accommodating only 1 day splits into 2 batches
		const splitBatches = partitionFootprintDays([day1, day2], 32, twoDaysBodyBytes - 1);
		expect(splitBatches).toHaveLength(2);
	});

	it("rejects limits <= 0 or invalid arguments", () => {
		expect(() => partitionFootprintDays([makeDay(100)], 0, 1000)).toThrow("批次上限必须大于 0");
		expect(() => partitionFootprintDays([makeDay(100)], 10, 0)).toThrow("批次上限必须大于 0");
	});
	it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid batch limits %s",
		(limit) => {
			expect(() => partitionFootprintDays([], limit)).toThrow("批次上限");
			expect(() => partitionFootprintDays([], 1, limit)).toThrow("批次上限");
		},
	);
	it("enforces the server day limit even when a caller requests more", () => {
		const batches = partitionFootprintDays(
			Array.from({ length: 33 }, (_, index) => makeDay(index)),
			100,
		);
		expect(batches.map((batch) => batch.length)).toEqual([32, 1]);
	});
});

describe("createFootprintClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("fetches target and unwraps", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe("https://life.test/api/data/target");
			return jsonResponse(200, { data: { target: "production" } });
		});
		const client = createFootprintClient({ baseUrl: "https://life.test", fetchFn: fetchMock });
		const target = await client.target();
		expect(target).toBe("production");
	});
	it("uses the platform fetch by default", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { data: { target: "test" } }));
		vi.stubGlobal("fetch", fetchMock);
		expect(await createFootprintClient().target()).toBe("test");
	});
	it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])(
		"rejects an invalid request timeout %s",
		(requestTimeoutMs) => {
			expect(() => createFootprintClient({ requestTimeoutMs })).toThrow("请求超时");
		},
	);
	it("does not acquire credentials or issue a request when already cancelled", async () => {
		const fetchMock = vi.fn();
		const getHeaders = vi.fn();
		const client = createFootprintClient({ fetchFn: fetchMock, getHeaders });
		await expect(client.target(AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(getHeaders).not.toHaveBeenCalled();
	});
	it("honors cancellation while credentials are being obtained", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn();
		const client = createFootprintClient({
			fetchFn: fetchMock,
			getHeaders: async () => {
				controller.abort();
				return {};
			},
		});
		await expect(client.target(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fetches overview", async () => {
		const overviewMock: DataOverview = {
			target: "local",
			providers: [],
			computedAt: "2026-09-14T00:00:00Z",
		};
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe("/api/data/overview");
			return jsonResponse(200, { data: overviewMock });
		});
		const client = createFootprintClient({ fetchFn: fetchMock });
		const res = await client.overview();
		expect(res).toEqual(overviewMock);
	});

	it("begins session and attaches custom headers", async () => {
		const sessionMock: FootprintImportSession = {
			id: "sess-1",
			expiresAt: "2026-09-14T01:00:00Z",
			target: "local",
			totalDays: 1,
			totalPoints: 10,
		};
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/data/footprint/imports");
			expect(init?.method).toBe("POST");
			const headers = new Headers(init?.headers);
			expect(headers.get("cf-access-token")).toBe("secret-cf-token");
			expect(headers.get("Content-Type")).toBe("application/json");
			return jsonResponse(201, { data: sessionMock });
		});
		const client = createFootprintClient({
			fetchFn: fetchMock,
			getHeaders: async () => ({ "cf-access-token": "secret-cf-token" }),
		});
		const session = await client.begin({
			fileName: "test.gpx",
			totalDays: 1,
			totalPoints: 10,
			channel: "cli",
			target: "local",
		});
		expect(session).toEqual(sessionMock);
	});

	it("submits batches with sequential batchId and body", async () => {
		const batchReceipt: FootprintBatchReceipt = {
			sessionId: "sess-1",
			batchId: 1,
			status: "running",
			committedDays: 1,
			committedPoints: 2,
			insertedDays: 1,
			updatedDays: 0,
			unchangedDays: 0,
			days: [{ utcDay: 100, recordCount: 2, contentHash: "hash-100", status: "inserted" }],
		};
		const days = [makeDay(100)];
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/data/footprint/imports/sess-1/batches/1");
			expect(init?.method).toBe("PUT");
			expect(init?.body).toBe(JSON.stringify({ days }));
			return jsonResponse(200, { data: batchReceipt });
		});
		const client = createFootprintClient({ fetchFn: fetchMock });
		const receipt = await client.batch("sess-1", 1, days);
		expect(receipt).toEqual(batchReceipt);
	});

	it("finishes session with complete or cancelled status", async () => {
		const finishReceipt: FootprintImportReceipt = {
			sessionId: "sess-1",
			status: "complete",
			committedDays: 1,
			committedPoints: 2,
			insertedDays: 1,
			updatedDays: 0,
			unchangedDays: 0,
		};
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/data/footprint/imports/sess-1/finish");
			expect(init?.method).toBe("POST");
			expect(init?.body).toBe(JSON.stringify({ status: "complete" }));
			return jsonResponse(200, { data: finishReceipt });
		});
		const client = createFootprintClient({ fetchFn: fetchMock });
		const receipt = await client.finish("sess-1", "complete");
		expect(receipt).toEqual(finishReceipt);
	});

	it("fetches days by date range", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe("/api/data/footprint/days?start=2026-09-01&end=2026-09-10");
			return jsonResponse(200, { data: { days: [] } });
		});
		const client = createFootprintClient({ fetchFn: fetchMock });
		const result = await client.days("2026-09-01", "2026-09-10");
		expect(result).toEqual({ days: [] });
	});

	it("handles opaqueredirect as session_expired", async () => {
		const resp = new Response(null);
		Object.defineProperty(resp, "type", { value: "opaqueredirect" });
		const fetchMock = vi.fn(async () => resp);
		const client = createFootprintClient({ fetchFn: fetchMock });
		await expect(client.target()).rejects.toMatchObject({
			status: 401,
			code: "session_expired",
		});
	});
	it("does not follow a CLI Access redirect or disclose credentials to it", async () => {
		const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.redirect).toBe("manual");
			return new Response(null, {
				status: 302,
				headers: { Location: "https://access.example.test" },
			});
		});
		await expect(createFootprintClient({ fetchFn }).target()).rejects.toMatchObject({
			status: 401,
			code: "session_expired",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
	it.each(["", "not json", "null", "[]", '{"other":1}'])(
		"rejects a malformed success body: %s",
		async (body) => {
			const fetchFn = vi.fn(async () => new Response(body));
			await expect(createFootprintClient({ fetchFn }).target()).rejects.toMatchObject({
				code: "invalid_response",
			});
		},
	);
	it.each([{ error: {} }, { error: { code: 1, message: " " } }, { error: "bad" }, null])(
		"uses a safe fallback for malformed errors: %j",
		async (body) => {
			const fetchFn = vi.fn(async () => jsonResponse(400, body));
			await expect(createFootprintClient({ fetchFn }).target()).rejects.toMatchObject({
				code: "unknown",
				message: "请求失败，请重试。",
			});
		},
	);
	it.each(["connection", "body"] as const)(
		"cancels an in-flight %s and preserves the cancellation reason",
		async (stage) => {
			const controller = new AbortController();
			const reason = new Error("user cancelled import");
			const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
				const abort = (reject: (reason: unknown) => void) => {
					init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
						once: true,
					});
					queueMicrotask(() => controller.abort(reason));
				};
				return stage === "connection"
					? new Promise<Response>((_resolve, reject) => abort(reject))
					: Promise.resolve(
							new Response(
								new ReadableStream({
									start(stream) {
										abort((error) => stream.error(error));
									},
								}),
							),
						);
			});
			await expect(createFootprintClient({ fetchFn }).target(controller.signal)).rejects.toBe(
				reason,
			);
		},
	);
	it("times out a stalled response body as a retryable failure", async () => {
		const fetchFn = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) =>
				new Response(
					new ReadableStream({
						start(stream) {
							init?.signal?.addEventListener("abort", () => stream.error(init.signal?.reason), {
								once: true,
							});
						},
					}),
				),
		);
		await expect(
			createFootprintClient({ fetchFn, requestTimeoutMs: 10 }).target(),
		).rejects.toMatchObject({ status: 408, code: "request_timeout" });
	});

	it("handles network failure and non-json errors", async () => {
		const fetchFail = vi.fn(async () => {
			throw new Error("fail");
		});
		const clientFail = createFootprintClient({ fetchFn: fetchFail });
		await expect(clientFail.target()).rejects.toMatchObject({
			status: 0,
			code: "network",
		});

		const fetchHttpErr = vi.fn(async () =>
			jsonResponse(500, { error: { code: "crash", message: "boom" } }),
		);
		const clientHttp = createFootprintClient({ fetchFn: fetchHttpErr });
		await expect(clientHttp.target()).rejects.toMatchObject({
			status: 500,
			code: "crash",
			message: "boom",
		});

		const fetchUnknownErr = vi.fn(async () => jsonResponse(500, "internal error"));
		const clientUnknown = createFootprintClient({ fetchFn: fetchUnknownErr });
		await expect(clientUnknown.target()).rejects.toMatchObject({
			status: 500,
			code: "unknown",
		});

		const fetchInvalidResp = vi.fn(async () => jsonResponse(200, {}));
		const clientInvalid = createFootprintClient({ fetchFn: fetchInvalidResp });
		await expect(clientInvalid.target()).rejects.toMatchObject({
			status: 200,
			code: "invalid_response",
		});
	});

	it("propagates abort error without wrapping as network error", async () => {
		const fetchAbort = vi.fn(async () => {
			throw abortError();
		});
		const client = createFootprintClient({ fetchFn: fetchAbort });
		await expect(client.target()).rejects.toMatchObject({ name: "AbortError" });
	});

	it("treats body read network failure as transient network error, not invalid_response", async () => {
		const streamErrResponse = new Response(
			new ReadableStream({
				start(controller) {
					controller.error(new Error("socket hangup during body read"));
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
		const fetchMock = vi.fn(async () => streamErrResponse);
		const client = createFootprintClient({ fetchFn: fetchMock });
		await expect(client.target()).rejects.toMatchObject({
			status: 0,
			code: "network",
		});
	});

	it("times out hung connection and throws 408 request_timeout", async () => {
		const fetchHung = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener("abort", () => {
						const err = new Error("aborted");
						err.name = "AbortError";
						reject(err);
					});
				}),
		);
		const client = createFootprintClient({ fetchFn: fetchHung, requestTimeoutMs: 50 });
		await expect(client.target()).rejects.toMatchObject({
			status: 408,
			code: "request_timeout",
		});
	});
});

describe("uploadFootprintPlan", () => {
	const day1 = makeDay(100, 5, 200);
	const day2 = makeDay(200, 5, 200);
	const plan: FootprintPlan = {
		days: [day2, day1], // intentionally reversed to test ascending order
		pointCount: 10,
		firstAt: 100,
		lastAt: 205000,
		bytesRead: 1000,
		payloadBytes: 400,
	};
	function stubClient(): FootprintClient {
		return {
			target: vi.fn<FootprintClient["target"]>(async () => "local"),
			overview: vi.fn(),
			begin: vi.fn<FootprintClient["begin"]>(async () => ({
				id: "session",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "local",
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn<FootprintClient["batch"]>(async (_id, batchId, days) => ({
				sessionId: "session",
				batchId,
				status: "running",
				committedDays: days.length,
				committedPoints: 5,
				insertedDays: days.length,
				updatedDays: 0,
				unchangedDays: 0,
				days: [],
			})),
			finish: vi.fn<FootprintClient["finish"]>(async (_id, status) => ({
				sessionId: "session",
				status,
				committedDays: 2,
				committedPoints: 10,
				insertedDays: 2,
				updatedDays: 0,
				unchangedDays: 0,
			})),
			days: vi.fn(),
		};
	}
	const uploadOptions = { fileName: "track.gpx", channel: "cli", target: "local" } as const;

	it("does not open a session for an already cancelled import", async () => {
		const client = stubClient();
		await expect(
			uploadFootprintPlan(client, plan, { ...uploadOptions, signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(client.target).not.toHaveBeenCalled();
		expect(client.begin).not.toHaveBeenCalled();
	});
	it.each([NaN, Infinity, -1, 0.5])(
		"rejects invalid retry settings before leasing: %s",
		async (value) => {
			const client = stubClient();
			await expect(
				uploadFootprintPlan(client, plan, { ...uploadOptions, transientRetries: value }),
			).rejects.toThrow("非负整数");
			await expect(
				uploadFootprintPlan(client, plan, { ...uploadOptions, retryBackoffBaseMs: value }),
			).rejects.toThrow("非负整数");
			expect(client.begin).not.toHaveBeenCalled();
		},
	);
	it.each([0, 2])(
		"stops after the configured %s retries and releases the session",
		async (retries) => {
			const client = stubClient();
			const failure = new ApiError(503, "unavailable", "temporarily unavailable");
			vi.mocked(client.batch).mockRejectedValue(failure);
			await expect(
				uploadFootprintPlan(client, plan, {
					...uploadOptions,
					transientRetries: retries,
					retryBackoffBaseMs: 0,
				}),
			).rejects.toBe(failure);
			expect(client.batch).toHaveBeenCalledTimes(retries + 1);
			expect(client.finish).toHaveBeenCalledWith("session", "cancelled", expect.any(AbortSignal));
		},
	);
	it("cancels during retry backoff without sending another batch", async () => {
		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			const client = stubClient();
			vi.mocked(client.batch).mockRejectedValue(new ApiError(429, "rate_limit", "slow down"));
			const pending = uploadFootprintPlan(client, plan, {
				...uploadOptions,
				signal: controller.signal,
			});
			const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
			await vi.advanceTimersByTimeAsync(1);
			controller.abort();
			await rejected;
			expect(client.batch).toHaveBeenCalledTimes(1);
			expect(vi.mocked(client.finish).mock.calls[0]?.[2]?.aborted).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
	it("stops after a committed batch when the user cancels", async () => {
		const controller = new AbortController();
		const client = stubClient();
		await expect(
			uploadFootprintPlan(client, plan, {
				...uploadOptions,
				signal: controller.signal,
				maxBatchDays: 1,
				onProgress: () => controller.abort(),
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(client.batch).toHaveBeenCalledTimes(1);
		expect(client.finish).toHaveBeenCalledWith("session", "cancelled", expect.any(AbortSignal));
	});
	it("bounds cleanup of a broken connection and preserves the import failure", async () => {
		vi.useFakeTimers();
		try {
			const client = stubClient();
			const failure = new ApiError(400, "invalid_day", "bad day");
			vi.mocked(client.batch).mockRejectedValue(failure);
			vi.mocked(client.finish).mockImplementation(
				(_id, _status, signal) =>
					new Promise((_resolve, reject) =>
						signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
					),
			);
			const rejected = expect(uploadFootprintPlan(client, plan, uploadOptions)).rejects.toBe(
				failure,
			);
			await vi.advanceTimersByTimeAsync(5_001);
			await rejected;
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects empty plan before leasing session", async () => {
		const client = {
			target: vi.fn(),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		await expect(
			uploadFootprintPlan(
				client,
				{ days: [], pointCount: 0, firstAt: 0, lastAt: 0, bytesRead: 0, payloadBytes: 0 },
				{ fileName: "track.gpx", channel: "cli", target: "production" },
			),
		).rejects.toThrow("没有日包数据");
		expect(client.target).not.toHaveBeenCalled();
		expect(client.begin).not.toHaveBeenCalled();
	});

	it("rejects duplicate utcDay plan before leasing session", async () => {
		const client = {
			target: vi.fn(),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		const duplicatePlan: FootprintPlan = {
			days: [day1, day1],
			pointCount: 10,
			firstAt: 100,
			lastAt: 205000,
			bytesRead: 1000,
			payloadBytes: 400,
		};
		await expect(
			uploadFootprintPlan(client, duplicatePlan, {
				fileName: "track.gpx",
				channel: "cli",
				target: "production",
			}),
		).rejects.toThrow("重复的 UTC 日");
		expect(client.target).not.toHaveBeenCalled();
		expect(client.begin).not.toHaveBeenCalled();
	});

	it("throws if target does not match", async () => {
		const client = {
			target: vi.fn(async () => "local" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(),
			batch: vi.fn(),
			finish: vi.fn(),
			days: vi.fn(),
		};
		await expect(
			uploadFootprintPlan(client, plan, {
				fileName: "track.gpx",
				channel: "cli",
				target: "production",
			}),
		).rejects.toThrow("目标环境不匹配");
		expect(client.begin).not.toHaveBeenCalled();
	});

	it("uploads complete days sequentially with transient retries and finishes", async () => {
		const batchesSent: { batchId: number; bodyLength: number }[] = [];
		let batch1Attempts = 0;

		const client = {
			target: vi.fn(async () => "production" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(async () => ({
				id: "s-123",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "production" as DataTarget,
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn(async (_sid: string, batchId: number, days: FootprintDay[]) => {
				batchesSent.push({
					batchId,
					bodyLength: new TextEncoder().encode(JSON.stringify({ days })).length,
				});
				if (batchId === 1 && ++batch1Attempts === 1) {
					// Transient failure on first attempt of batch 1
					throw new ApiError(500, "server_error", "temporary glitch");
				}
				return {
					sessionId: "s-123",
					batchId,
					status: "running" as const,
					committedDays: days.length,
					committedPoints: days.reduce((a, b) => a + b.recordCount, 0),
					insertedDays: days.length,
					updatedDays: 0,
					unchangedDays: 0,
					days: days.map((d) => ({
						utcDay: d.utcDay,
						recordCount: d.recordCount,
						contentHash: d.contentHash,
						status: "inserted" as const,
					})),
				};
			}),
			finish: vi.fn(async (_sid: string, status: "complete" | "cancelled") => ({
				sessionId: "s-123",
				status,
				committedDays: 2,
				committedPoints: 10,
				insertedDays: 2,
				updatedDays: 0,
				unchangedDays: 0,
			})),
			days: vi.fn(),
		};

		const progressSnapshots: FootprintImportReceipt[] = [];
		const result = await uploadFootprintPlan(client, plan, {
			fileName: "track.gpx",
			channel: "cli",
			target: "production",
			maxBatchDays: 1, // force 2 batches
			retryBackoffBaseMs: 5,
			onProgress: (r) => progressSnapshots.push(r),
		});

		expect(client.begin).toHaveBeenCalledWith(
			{
				fileName: "track.gpx",
				totalDays: 2,
				totalPoints: 10,
				channel: "cli",
				target: "production",
			},
			undefined,
		);
		// batch 1 was retried once with exact same ID and body -> [1, 1, 2]
		expect(batchesSent.map((b) => b.batchId)).toEqual([1, 1, 2]);
		expect(batchesSent[0]?.bodyLength).toBe(batchesSent[1]?.bodyLength);
		expect(client.finish).toHaveBeenCalledWith("s-123", "complete", undefined);
		expect(result.status).toBe("complete");
		expect(progressSnapshots.length).toBeGreaterThan(0);
	});

	it("does not retry on permanent errors (409 conflict, auth) and attempts cleanup", async () => {
		let attempts = 0;
		const client = {
			target: vi.fn(async () => "local" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(async () => ({
				id: "s-conflict",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "local" as DataTarget,
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn(async () => {
				attempts++;
				throw new ApiError(409, "session_conflict", "Concurrent lease conflict");
			}),
			finish: vi.fn(async (_sid: string, status: "complete" | "cancelled") => ({
				sessionId: "s-conflict",
				status,
				committedDays: 0,
				committedPoints: 0,
				insertedDays: 0,
				updatedDays: 0,
				unchangedDays: 0,
			})),
			days: vi.fn(),
		};

		await expect(
			uploadFootprintPlan(client, plan, {
				fileName: "track.gpx",
				channel: "cli",
				target: "local",
				transientRetries: 3,
			}),
		).rejects.toMatchObject({
			status: 409,
			code: "session_conflict",
		});

		// Permanent error was never retried
		expect(attempts).toBe(1);
		expect(client.finish).toHaveBeenCalledWith("s-conflict", "cancelled", expect.anything());
	});

	it("does not retry when onProgress throws, and propagates error", async () => {
		let batchAttempts = 0;
		const client = {
			target: vi.fn(async () => "local" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(async () => ({
				id: "s-listener-fail",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "local" as DataTarget,
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn(async () => {
				batchAttempts++;
				return {
					sessionId: "s-listener-fail",
					batchId: 1,
					status: "running" as const,
					committedDays: 1,
					committedPoints: 5,
					insertedDays: 1,
					updatedDays: 0,
					unchangedDays: 0,
					days: [],
				};
			}),
			finish: vi.fn(async (_sid: string, status: "complete" | "cancelled") => ({
				sessionId: "s-listener-fail",
				status,
				committedDays: 0,
				committedPoints: 0,
				insertedDays: 0,
				updatedDays: 0,
				unchangedDays: 0,
			})),
			days: vi.fn(),
		};

		await expect(
			uploadFootprintPlan(client, plan, {
				fileName: "track.gpx",
				channel: "cli",
				target: "local",
				transientRetries: 3,
				onProgress: () => {
					throw new Error("UI subscriber crashed");
				},
			}),
		).rejects.toThrow("UI subscriber crashed");

		// Batch itself succeeded once; listener error was not swallowed or retried
		expect(batchAttempts).toBe(1);
		expect(client.finish).toHaveBeenCalledWith("s-listener-fail", "cancelled", expect.anything());
	});

	it("performs bounded cleanup with fresh signal on failure and preserves original error", async () => {
		const cleanupStatus: string[] = [];
		let cleanupSignalAborted: boolean | undefined;

		const client = {
			target: vi.fn(async () => "local" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(async () => ({
				id: "s-abort",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "local" as DataTarget,
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn(async () => {
				throw new ApiError(400, "bad_request", "Fatal error");
			}),
			finish: vi.fn(
				async (_sid: string, status: "complete" | "cancelled", signal?: AbortSignal) => {
					cleanupStatus.push(status);
					cleanupSignalAborted = signal?.aborted;
					return {
						sessionId: "s-abort",
						status,
						committedDays: 0,
						committedPoints: 0,
						insertedDays: 0,
						updatedDays: 0,
						unchangedDays: 0,
					};
				},
			),
			days: vi.fn(),
		};

		await expect(
			uploadFootprintPlan(client, plan, {
				fileName: "track.gpx",
				channel: "web",
				target: "local",
			}),
		).rejects.toMatchObject({
			status: 400,
			code: "bad_request",
			message: "Fatal error",
		});

		expect(cleanupStatus).toEqual(["cancelled"]);
		expect(cleanupSignalAborted).toBe(false);
	});

	it("ignores cleanup finish rejection and preserves original error", async () => {
		const client = {
			target: vi.fn(async () => "local" as DataTarget),
			overview: vi.fn(),
			begin: vi.fn(async () => ({
				id: "s-fail",
				expiresAt: "2026-09-14T01:00:00Z",
				target: "local" as DataTarget,
				totalDays: 2,
				totalPoints: 10,
			})),
			batch: vi.fn(async () => {
				throw new ApiError(400, "invalid_batch", "Batch broken");
			}),
			finish: vi.fn(async () => {
				throw new Error("cleanup network fail");
			}),
			days: vi.fn(),
		};

		await expect(
			uploadFootprintPlan(client, plan, {
				fileName: "track.gpx",
				channel: "cli",
				target: "local",
			}),
		).rejects.toMatchObject({
			status: 400,
			code: "invalid_batch",
		});
	});
});
