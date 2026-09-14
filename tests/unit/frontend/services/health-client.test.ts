import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { packHealthDay } from "../../../../src/models/apple-health";
import {
	HEALTH_LIMITS,
	type HealthFile,
	type HealthImportReceipt,
	type HealthPlan,
} from "../../../../src/models/health-types";
import {
	createHealthClient,
	type HealthClient,
	uploadHealthPlan,
} from "../../../../src/services/health-client";
import { ApiError } from "../../../../src/services/http";

const receipt: HealthImportReceipt = {
	sessionId: "health/session",
	status: "complete",
	committedDays: 2,
	committedRecords: 2,
	insertedDays: 2,
	updatedDays: 0,
	unchangedDays: 0,
};
const options = { fileName: "导出.zip", target: "local" as const, channel: "web" as const };
let plan: HealthPlan;
beforeAll(async () => {
	const days = await Promise.all(
		[14, 13].map((date) =>
			packHealthDay(Date.UTC(2026, 8, date), [
				{
					name: "Record",
					attributes: {
						type: "HKQuantityTypeIdentifierStepCount",
						sourceName: "Watch",
						startDate: `2026-09-${date}T01:00:00Z`,
						endDate: `2026-09-${date}T02:00:00Z`,
						value: "100",
						unit: "count",
					},
				},
			]),
		),
	);
	plan = {
		days,
		files: [],
		recordCount: 2,
		xmlRecordCount: 2,
		dimensionCount: 1,
		seriesCount: 2,
		routePointCount: 0,
		ecgSampleCount: 0,
		payloadBytes: days.reduce((sum, day) => sum + day.payloadBytes, 0),
		warnings: [],
	};
});
afterEach(() => vi.useRealTimers());

function client() {
	return {
		target: vi.fn<HealthClient["target"]>().mockResolvedValue({ target: "local" }),
		inventory: vi.fn<HealthClient["inventory"]>().mockResolvedValue({ files: [] }),
		begin: vi.fn<HealthClient["begin"]>().mockResolvedValue({ id: receipt.sessionId }),
		batch: vi.fn<HealthClient["batch"]>().mockResolvedValue(receipt),
		part: vi.fn<HealthClient["part"]>().mockResolvedValue({ contentHash: "a".repeat(64) }),
		finish: vi.fn<HealthClient["finish"]>().mockResolvedValue(receipt),
		series: vi.fn<HealthClient["series"]>().mockResolvedValue({ series: [] }),
		file: vi.fn<HealthClient["file"]>(),
		filePart: vi.fn<HealthClient["filePart"]>(),
	};
}

function attachment(path: string): HealthFile {
	return {
		path,
		kind: "ecg",
		firstAt: null,
		lastAt: null,
		recordCount: 2,
		rawBytes: 2,
		contentHash: "a".repeat(64),
		parts: [{ part: 0, rawBytes: 2, payloadBytes: 4, contentHash: "b".repeat(64), body: "AAAA" }],
	};
}

describe("Apple Health HTTP client", () => {
	it("uses protected provider endpoints, encoded IDs and explicit story/all reads", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => Response.json({ data: receipt }));
		const api = createHealthClient({ baseUrl: "https://life.invalid/", fetchFn });
		const day = plan.days[0];
		if (!day) throw new Error("Missing fixture");
		const file = attachment("electrocardiograms/心电图.csv");
		const part = file.parts[0];
		if (!part) throw new Error("Missing fixture");
		const signal = new AbortController().signal;
		await api.target(signal);
		await api.inventory();
		await api.begin({ ...options, totalDays: 2, totalRecords: 2, files: [] });
		await api.batch(receipt.sessionId, 1, day);
		await api.part(receipt.sessionId, 0, part);
		await api.finish(receipt.sessionId, "complete");
		await api.series("2026-09-13T00:00Z", "2026-09-14T00:00Z");
		await api.series("2026-09-13T00:00Z", "2026-09-14T00:00Z", true, signal);
		await api.file(file.path);
		await api.filePart(file.path, 0);
		const calls = fetchFn.mock.calls.map(([url, init]) => ({ url: new URL(String(url)), init }));
		expect(calls.map((call) => call.url.pathname)).toEqual([
			"/api/data/target",
			"/api/data/apple-health/files",
			"/api/data/apple-health/imports",
			"/api/data/apple-health/imports/health%2Fsession/batches/1",
			"/api/data/apple-health/imports/health%2Fsession/files/0/parts/0",
			"/api/data/apple-health/imports/health%2Fsession/finish",
			"/api/data/apple-health/series",
			"/api/data/apple-health/series",
			"/api/data/apple-health/file",
			"/api/data/apple-health/file",
		]);
		expect(calls[3]?.init).toMatchObject({
			method: "PUT",
			body: JSON.stringify({ days: [day] }),
			redirect: "manual",
			credentials: "same-origin",
			cache: "no-store",
		});
		expect(calls[6]?.url.searchParams.get("view")).toBe("all");
		expect(calls[7]?.url.searchParams.get("view")).toBe("story");
		expect(calls[8]?.url.searchParams.get("path")).toBe(file.path);
		expect(calls[9]?.url.searchParams.get("part")).toBe("0");
	});
	it("uses the default same-origin transport", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ data: { target: "production" } }));
		vi.stubGlobal("fetch", fetchFn);
		expect(await createHealthClient().target()).toEqual({ target: "production" });
		expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/data/target");
	});
});

describe("health upload lifecycle", () => {
	it("uploads missing attachments before sorted whole days and excludes bodies from the lease", async () => {
		const api = client();
		const onProgress = vi.fn();
		const saved = attachment("electrocardiograms/saved.csv");
		const fresh = attachment("electrocardiograms/fresh.csv");
		api.inventory.mockResolvedValue({
			files: [{ path: saved.path, contentHash: saved.contentHash }],
		});
		const withFiles = { ...plan, files: [saved, fresh] };
		expect(await uploadHealthPlan(api, withFiles, { ...options, onProgress })).toEqual(receipt);
		expect(api.part).toHaveBeenCalledExactlyOnceWith(
			receipt.sessionId,
			1,
			fresh.parts[0],
			undefined,
		);
		expect(api.part.mock.invocationCallOrder[0]).toBeLessThan(
			api.batch.mock.invocationCallOrder[0] as number,
		);
		expect(api.batch.mock.calls.map((call) => [call[1], call[2].utcDay])).toEqual([
			[1, Date.UTC(2026, 8, 13)],
			[2, Date.UTC(2026, 8, 14)],
		]);
		expect(api.begin.mock.calls[0]?.[0].files[0]?.parts[0]).not.toHaveProperty("body");
		expect(onProgress.mock.calls.map(([progress]) => progress.completed)).toEqual([
			0, 1, 2, 3, 4, 4,
		]);
		expect(onProgress).toHaveBeenLastCalledWith(
			expect.objectContaining({ phase: "complete", completed: 4, total: 4, recordCount: 2 }),
		);
		expect(withFiles.days[0]?.utcDay).toBe(Date.UTC(2026, 8, 14));
	});
	it("checks the server target before leasing or uploading", async () => {
		const api = client();
		api.target.mockResolvedValue({ target: "production" });
		await expect(uploadHealthPlan(api, plan, options)).rejects.toThrow("目标环境不匹配");
		expect(api.begin).not.toHaveBeenCalled();
		expect(api.inventory).not.toHaveBeenCalled();
		expect(api.finish).not.toHaveBeenCalled();
	});
	it("rejects empty, inconsistent, duplicate and oversized plans before any request", async () => {
		const day = plan.days[0];
		if (!day) throw new Error("Missing fixture");
		const cases: HealthPlan[] = [
			{ ...plan, days: [] },
			{ ...plan, recordCount: 7 },
			{ ...plan, days: [day, day] },
			{
				...plan,
				days: [
					{ ...day, summary: { ...day.summary, sources: ["x".repeat(HEALTH_LIMITS.dayBytes)] } },
				],
				recordCount: 1,
			},
		];
		for (const invalid of cases) {
			const api = client();
			await expect(uploadHealthPlan(api, invalid, options)).rejects.toThrow();
			expect(api.target).not.toHaveBeenCalled();
		}
	});
	it("retries transient part, day and completion failures with unchanged identities", async () => {
		vi.useFakeTimers();
		const api = client();
		api.part.mockRejectedValueOnce(new ApiError(503, "busy", "busy"));
		api.batch.mockRejectedValueOnce(new ApiError(429, "busy", "busy"));
		api.finish.mockRejectedValueOnce(new TypeError("connection lost"));
		const work = uploadHealthPlan(api, { ...plan, files: [attachment("ecg.csv")] }, options);
		await vi.runAllTimersAsync();
		await work;
		expect(api.part.mock.calls[0]).toEqual(api.part.mock.calls[1]);
		expect(api.batch.mock.calls[0]).toEqual(api.batch.mock.calls[1]);
		expect(api.finish.mock.calls.map((call) => call[1])).toEqual(["complete", "complete"]);
	});
	it("limits transient retries and retains the original error if lease cleanup also fails", async () => {
		vi.useFakeTimers();
		const api = client();
		const failure = new Error("offline");
		api.batch.mockRejectedValue(failure);
		api.finish.mockRejectedValue(new Error("cleanup failed"));
		const assertion = expect(uploadHealthPlan(api, plan, options)).rejects.toBe(failure);
		await vi.runAllTimersAsync();
		await assertion;
		expect(api.batch).toHaveBeenCalledTimes(3);
		expect(api.finish).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls[0]?.[1]).toBe("cancelled");
	});
	it.each([new ApiError(400, "invalid", "invalid"), new DOMException("cancelled", "AbortError")])(
		"does not retry terminal failures: %s",
		async (failure) => {
			const api = client();
			api.batch.mockRejectedValue(failure);
			await expect(uploadHealthPlan(api, plan, options)).rejects.toBe(failure);
			expect(api.batch).toHaveBeenCalledOnce();
			expect(api.finish.mock.calls[0]?.[1]).toBe("cancelled");
		},
	);
	it("uses a fresh bounded signal to cancel an interrupted upload", async () => {
		vi.useFakeTimers();
		const api = client();
		const controller = new AbortController();
		api.batch.mockRejectedValue(new ApiError(503, "busy", "busy"));
		const assertion = expect(
			uploadHealthPlan(api, plan, { ...options, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		await assertion;
		expect(api.batch).toHaveBeenCalledOnce();
		const cleanupSignal = api.finish.mock.calls[0]?.[2];
		expect(cleanupSignal).toBeInstanceOf(AbortSignal);
		expect(cleanupSignal).not.toBe(controller.signal);
		expect(cleanupSignal?.aborted).toBe(false);
	});
	it("prevents pre-aborted plans and preserves errors before a session exists", async () => {
		const api = client();
		const signal = AbortSignal.abort();
		await expect(uploadHealthPlan(api, plan, { ...options, signal })).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(api.target).not.toHaveBeenCalled();
		api.begin.mockRejectedValue(new Error("already importing"));
		await expect(uploadHealthPlan(api, plan, options)).rejects.toThrow("already importing");
		expect(api.finish).not.toHaveBeenCalled();
	});
	it("does not retry writes when a progress listener fails", async () => {
		const api = client();
		const onProgress = vi
			.fn()
			.mockImplementationOnce(() => {})
			.mockImplementationOnce(() => {
				throw new Error("render failed");
			});
		await expect(uploadHealthPlan(api, plan, { ...options, onProgress })).rejects.toThrow(
			"render failed",
		);
		expect(api.batch).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls[0]?.[1]).toBe("cancelled");
	});
});
