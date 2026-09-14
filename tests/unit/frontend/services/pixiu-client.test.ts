import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	FOOTPRINT_LIMITS,
	type FootprintBatchReceipt,
	type FootprintImportReceipt,
} from "../../../../src/models/data-management";
import { PIXIU_COLUMNS, type PixiuPlan, parsePixiu } from "../../../../src/models/pixiu";
import { ApiError } from "../../../../src/services/http";
import {
	createPixiuClient,
	type PixiuClient,
	readPixiuFiles,
	uploadPixiuPlan,
} from "../../../../src/services/pixiu-client";

const csv = (rows: readonly [string, string][] = [["2026-09-14", "0.29"]]) =>
	[
		PIXIU_COLUMNS.join(","),
		...rows.map(([date, amount]) => `${date},日常支出,合成早餐,0.00,${amount},人民币,合成现金,,`),
	].join("\n");
const receipt: FootprintImportReceipt = {
	sessionId: "pixiu/session",
	status: "complete",
	committedDays: 2,
	committedPoints: 2,
	insertedDays: 2,
	updatedDays: 0,
	unchangedDays: 0,
};
const batchReceipt: FootprintBatchReceipt = { ...receipt, status: "running", batchId: 1, days: [] };
const options = { target: "test" as const, channel: "web" as const };
let plan: PixiuPlan;
beforeAll(async () => {
	const parsed = await parsePixiu([
		{
			name: "fixture.csv",
			text: csv([
				["2026-09-14", "0.29"],
				["2026-09-13", "0.10"],
			]),
		},
	]);
	plan = { ...parsed, days: [...parsed.days].reverse() };
});
afterEach(() => vi.useRealTimers());

function client() {
	return {
		target: vi.fn<PixiuClient["target"]>().mockResolvedValue({ target: "test" }),
		begin: vi.fn<PixiuClient["begin"]>().mockResolvedValue({ id: receipt.sessionId }),
		batch: vi.fn<PixiuClient["batch"]>().mockResolvedValue(batchReceipt),
		finish: vi.fn<PixiuClient["finish"]>().mockResolvedValue(receipt),
		days: vi.fn<PixiuClient["days"]>().mockResolvedValue({ days: [] }),
	};
}

describe("Pixiu protected HTTP endpoints", () => {
	it("unwraps endpoint payloads, preserves request bodies and encodes session IDs and UTC windows", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ data: { target: "test" } }))
			.mockResolvedValueOnce(Response.json({ data: { id: receipt.sessionId } }))
			.mockResolvedValueOnce(Response.json({ data: batchReceipt }))
			.mockResolvedValueOnce(Response.json({ data: receipt }))
			.mockResolvedValueOnce(Response.json({ data: { days: plan.days } }));
		const api = createPixiuClient({
			baseUrl: "https://life.invalid///",
			fetchFn,
			getHeaders: async () => ({ "X-Synthetic-Auth": "fixture" }),
		});
		const controller = new AbortController();
		const body = { fileName: "合成.csv", totalDays: 2, totalRecords: 2, ...options };
		expect(await api.target(controller.signal)).toEqual({ target: "test" });
		expect(await api.begin(body, controller.signal)).toEqual({ id: receipt.sessionId });
		expect(await api.batch(receipt.sessionId, 3, plan.days, controller.signal)).toEqual(
			batchReceipt,
		);
		expect(await api.finish(receipt.sessionId, "complete", controller.signal)).toEqual(receipt);
		const start = "2026-09-13T16:00:00Z";
		const end = "2026-09-15T00:00:00+08:00";
		expect(await api.days(start, end, controller.signal)).toEqual({ days: plan.days });
		const calls = fetchFn.mock.calls.map(([url, init]) => ({ url: new URL(String(url)), init }));
		expect(calls.map((call) => call.url.pathname)).toEqual([
			"/api/data/target",
			"/api/data/pixiu/imports",
			"/api/data/pixiu/imports/pixiu%2Fsession/batches/3",
			"/api/data/pixiu/imports/pixiu%2Fsession/finish",
			"/api/data/pixiu/days",
		]);
		expect(calls[1]?.init).toMatchObject({ method: "POST", body: JSON.stringify(body) });
		expect(calls[2]?.init).toMatchObject({
			method: "PUT",
			body: JSON.stringify({ days: plan.days }),
		});
		expect(calls[3]?.init).toMatchObject({
			method: "POST",
			body: JSON.stringify({ status: "complete" }),
		});
		expect(calls[4]?.url.searchParams.get("start")).toBe(start);
		expect(calls[4]?.url.searchParams.get("end")).toBe(end);
		for (const call of calls) {
			expect(call.init).toMatchObject({
				redirect: "manual",
				credentials: "same-origin",
				cache: "no-store",
			});
			expect(new Headers(call.init?.headers).get("X-Synthetic-Auth")).toBe("fixture");
		}
		expect(new Headers(calls[1]?.init?.headers).get("Content-Type")).toBe("application/json");
		controller.abort();
		expect(calls.every((call) => call.init?.signal?.aborted)).toBe(true);
	});
	it("supports same-origin defaults and cancellation receipts without contacting an external server", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ data: { target: "test" } }))
			.mockResolvedValueOnce(Response.json({ data: { ...receipt, status: "cancelled" } }));
		vi.stubGlobal("fetch", fetchFn);
		const api = createPixiuClient();
		expect(await api.target()).toEqual({ target: "test" });
		expect((await api.finish("a?b#c", "cancelled")).status).toBe("cancelled");
		expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
			"/api/data/target",
			"/api/data/pixiu/imports/a%3Fb%23c/finish",
		]);
	});
	it("propagates a protected API rejection rather than treating it as an import receipt", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				Response.json(
					{ error: { code: "access_required", message: "Synthetic access rejection" } },
					{ status: 401 },
				),
			);
		await expect(
			createPixiuClient({ fetchFn }).begin({
				...options,
				fileName: "fixture.csv",
				totalDays: 1,
				totalRecords: 1,
			}),
		).rejects.toMatchObject({ status: 401, code: "access_required" });
	});
});

describe("local CSV file reading", () => {
	it("decodes UTF-8/BOM and case-insensitive CSV files regardless of MIME type", async () => {
		const result = await readPixiuFiles([
			new File([`\uFEFF${csv()}`], "第一份.CSV", { type: "application/octet-stream" }),
			new File([csv([["2026-09-15", "0.00"]])], "第二份.csv"),
		]);
		expect(result.fileNames).toEqual(["第一份.CSV", "第二份.csv"]);
		expect(result.recordCount).toBe(2);
		expect(result.days[0]?.data.rows[0]?.[4]).toBe("0.29");
		expect(result.days[1]?.data.rows[0]?.[4]).toBe("0.00");
	});
	it("rejects unsupported extensions before reading any selected file", async () => {
		const first = new File([csv()], "good.csv");
		const read = vi.spyOn(first, "arrayBuffer");
		await expect(readPixiuFiles([first, new File([csv()], "bad.txt")])).rejects.toThrow("CSV");
		expect(read).not.toHaveBeenCalled();
	});
	it("checks the combined size of the whole selection before reading", async () => {
		const files = [new File([csv()], "a.csv"), new File([csv()], "b.csv")];
		for (const file of files) vi.spyOn(file, "size", "get").mockReturnValue(16 * 1024 * 1024 + 1);
		const reads = files.map((file) => vi.spyOn(file, "arrayBuffer"));
		await expect(readPixiuFiles(files)).rejects.toThrow("32 MiB");
		expect(reads.every((read) => read.mock.calls.length === 0)).toBe(true);
	});
	it("rejects invalid UTF-8 and an empty selection", async () => {
		await expect(
			readPixiuFiles([new File([new Uint8Array([0xc3, 0x28])], "bad.csv")]),
		).rejects.toThrow();
		await expect(readPixiuFiles([])).rejects.toThrow("请选择");
	});
	it("keeps a later parse failure from yielding a partial successful selection", async () => {
		await expect(
			readPixiuFiles([new File([csv()], "good.csv"), new File(["bad,header"], "bad.csv")]),
		).rejects.toThrow();
	});
	it("preserves file I/O errors and leaves subsequent files unread", async () => {
		const first = new File([csv()], "first.csv");
		const second = new File([csv()], "second.csv");
		const failure = new Error("Synthetic disk read failed");
		vi.spyOn(first, "arrayBuffer").mockRejectedValue(failure);
		const secondRead = vi.spyOn(second, "arrayBuffer");
		await expect(readPixiuFiles([first, second])).rejects.toBe(failure);
		expect(secondRead).not.toHaveBeenCalled();
	});
	it("honors cancellation before reading a valid file", async () => {
		const file = new File([csv()], "fixture.csv");
		const read = vi.spyOn(file, "arrayBuffer");
		await expect(readPixiuFiles([file], AbortSignal.abort())).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(read).not.toHaveBeenCalled();
	});
	it.each([1, 2])(
		"honors cancellation during a file read with %i files selected",
		async (count) => {
			const controller = new AbortController();
			const failure = new Error("Cancelled during file read");
			const first = new File([csv()], "first.csv");
			const bytes = await first.arrayBuffer();
			vi.spyOn(first, "arrayBuffer").mockImplementation(async () => {
				controller.abort(failure);
				return bytes;
			});
			const second = new File([csv()], "second.csv");
			const later = vi.spyOn(second, "arrayBuffer");
			await expect(readPixiuFiles([first, second].slice(0, count), controller.signal)).rejects.toBe(
				failure,
			);
			expect(later).not.toHaveBeenCalled();
		},
	);
});

describe("whole-day upload and recovery", () => {
	it("checks the target then leases and uploads sorted complete days, returning authoritative receipts", async () => {
		const api = client();
		const onProgress = vi.fn();
		const original = [...plan.days];
		expect(await uploadPixiuPlan(api, plan, { ...options, onProgress })).toBe(receipt);
		expect(api.begin).toHaveBeenCalledExactlyOnceWith(
			{ ...options, fileName: "fixture.csv", totalDays: 2, totalRecords: 2 },
			undefined,
		);
		expect(api.target.mock.invocationCallOrder[0]).toBeLessThan(
			api.begin.mock.invocationCallOrder[0] as number,
		);
		expect(api.begin.mock.invocationCallOrder[0]).toBeLessThan(
			api.batch.mock.invocationCallOrder[0] as number,
		);
		expect(api.batch).toHaveBeenCalledExactlyOnceWith(
			receipt.sessionId,
			1,
			[...plan.days].reverse(),
			undefined,
		);
		expect(plan.days).toEqual(original);
		expect(onProgress.mock.calls).toEqual([[batchReceipt], [receipt]]);
		expect(api.finish).toHaveBeenCalledExactlyOnceWith(receipt.sessionId, "complete", undefined);
	});
	it("describes multi-file imports and bounds the displayed filename", async () => {
		const api = client();
		await uploadPixiuPlan(
			api,
			{ ...plan, fileNames: ["first.csv", "second.csv"] },
			{ ...options, channel: "cli" },
		);
		expect(api.begin.mock.calls[0]?.[0]).toMatchObject({
			fileName: "first.csv 等 2 个文件",
			channel: "cli",
		});
		await uploadPixiuPlan(api, { ...plan, fileNames: [`${"x".repeat(300)}.csv`] }, options);
		expect(api.begin.mock.calls[1]?.[0].fileName).toBe("x".repeat(255));
	});
	it("splits selections at the shared batch limit while keeping a source day intact", async () => {
		const dates = Array.from({ length: 33 }, (_, index): [string, string] => [
			new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
			"0.00",
		]);
		const many = await parsePixiu([{ name: "many.csv", text: csv(dates.reverse()) }]);
		const api = client();
		await uploadPixiuPlan(api, many, options);
		expect(api.batch.mock.calls.map((call) => [call[1], call[2].length])).toEqual([
			[1, 32],
			[2, 1],
		]);
		expect(api.batch.mock.calls.flatMap((call) => call[2])).toEqual(many.days);
	});
	it("rejects empty, inconsistent, duplicate and oversized plans before making any request", async () => {
		const day = plan.days[0];
		const row = day?.data.rows[0];
		if (!day || !row) throw new Error("Missing synthetic day");
		const invalid: PixiuPlan[] = [
			{ ...plan, days: [] },
			{ ...plan, recordCount: 99 },
			{ ...plan, days: [day, day] },
			{
				...plan,
				recordCount: 1,
				days: [
					{
						...day,
						data: {
							...day.data,
							rows: [
								[
									...row.slice(0, 8),
									"x".repeat(FOOTPRINT_LIMITS.batchBytes),
								] as (typeof day.data.rows)[number],
							],
						},
					},
				],
			},
		];
		for (const input of invalid) {
			const api = client();
			await expect(uploadPixiuPlan(api, input, options)).rejects.toThrow();
			expect(api.target).not.toHaveBeenCalled();
			expect(api.begin).not.toHaveBeenCalled();
		}
	});
	it("rejects a production target when an isolated target was requested, before any lease or write", async () => {
		const api = client();
		api.target.mockResolvedValue({ target: "production" });
		await expect(uploadPixiuPlan(api, plan, options)).rejects.toThrow("目标环境不匹配");
		expect(api.begin).not.toHaveBeenCalled();
		expect(api.batch).not.toHaveBeenCalled();
		expect(api.finish).not.toHaveBeenCalled();
	});
	it("preserves failures before a session exists and does not retry lease creation", async () => {
		const api = client();
		const failure = new ApiError(409, "import_running", "Synthetic conflict");
		api.begin.mockRejectedValue(failure);
		await expect(uploadPixiuPlan(api, plan, options)).rejects.toBe(failure);
		expect(api.begin).toHaveBeenCalledOnce();
		expect(api.finish).not.toHaveBeenCalled();
		api.target.mockRejectedValue(failure);
		await expect(uploadPixiuPlan(api, plan, options)).rejects.toBe(failure);
		expect(api.begin).toHaveBeenCalledOnce();
	});
	it("always sends A → B → A and preserves duplicate rows; earlier uploads do not suppress a later restoration", async () => {
		const a = await parsePixiu([
			{
				name: "a.csv",
				text: csv([
					["2026-09-14", "0.29"],
					["2026-09-14", "0.29"],
				]),
			},
		]);
		const b = await parsePixiu([{ name: "b.csv", text: csv([["2026-09-14", "1.00"]]) }]);
		const api = client();
		const counters = [
			{ insertedDays: 1, updatedDays: 0, unchangedDays: 0 },
			{ insertedDays: 0, updatedDays: 1, unchangedDays: 0 },
			{ insertedDays: 0, updatedDays: 1, unchangedDays: 0 },
			{ insertedDays: 0, updatedDays: 0, unchangedDays: 1 },
		];
		const results: FootprintImportReceipt[] = [];
		for (const [index, input] of [a, b, a, a].entries()) {
			const final = {
				...receipt,
				...counters[index],
				committedDays: 1,
				committedPoints: input.recordCount,
			};
			api.finish.mockResolvedValueOnce(final);
			results.push(await uploadPixiuPlan(api, input, options));
		}
		expect(api.batch.mock.calls.map((call) => call[2].map((day) => day.contentHash))).toEqual(
			[a, b, a, a].map((input) => input.days.map((day) => day.contentHash)),
		);
		expect(api.batch.mock.calls.map((call) => call[2][0]?.data.rows.length)).toEqual([2, 1, 2, 2]);
		expect(
			results.map(({ insertedDays, updatedDays, unchangedDays }) => ({
				insertedDays,
				updatedDays,
				unchangedDays,
			})),
		).toEqual(counters);
	});
	it("retries transient batches and completion without changing identity, body, or counting progress twice", async () => {
		vi.useFakeTimers();
		const api = client();
		api.batch
			.mockRejectedValueOnce(new ApiError(503, "busy", "busy"))
			.mockRejectedValueOnce(new ApiError(429, "rate_limited", "retry"));
		api.finish.mockRejectedValueOnce(new TypeError("Synthetic lost response"));
		const onProgress = vi.fn();
		const work = uploadPixiuPlan(api, plan, { ...options, onProgress });
		await vi.runAllTimersAsync();
		expect(await work).toBe(receipt);
		expect(api.batch).toHaveBeenCalledTimes(3);
		expect(api.batch.mock.calls[0]).toEqual(api.batch.mock.calls[1]);
		expect(api.batch.mock.calls[1]).toEqual(api.batch.mock.calls[2]);
		expect(api.finish.mock.calls.map((call) => call[1])).toEqual(["complete", "complete"]);
		expect(onProgress.mock.calls).toEqual([[batchReceipt], [receipt]]);
	});
	it("limits transient attempts and preserves the first failure even when cleanup also fails", async () => {
		vi.useFakeTimers();
		const api = client();
		const failure = new ApiError(408, "timeout", "Synthetic timeout");
		api.batch.mockRejectedValue(failure);
		api.finish.mockRejectedValue(new Error("Synthetic cleanup failure"));
		const assertion = expect(uploadPixiuPlan(api, plan, options)).rejects.toBe(failure);
		await vi.runAllTimersAsync();
		await assertion;
		expect(api.batch).toHaveBeenCalledTimes(3);
		expect(api.finish).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls[0]?.[1]).toBe("cancelled");
	});
	it.each([
		new ApiError(400, "invalid", "invalid"),
		new ApiError(409, "conflict", "conflict"),
		new DOMException("cancelled", "AbortError"),
	])("does not retry terminal rejection: %s", async (failure) => {
		const api = client();
		api.batch.mockRejectedValue(failure);
		await expect(uploadPixiuPlan(api, plan, options)).rejects.toBe(failure);
		expect(api.batch).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls.map((call) => call[1])).toEqual(["cancelled"]);
	});
	it("does not lease an already cancelled plan", async () => {
		const api = client();
		await expect(
			uploadPixiuPlan(api, plan, { ...options, signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(api.target).not.toHaveBeenCalled();
	});
	it("stops a newly leased but cancelled upload and cleans up with a separate five-second signal", async () => {
		const api = client();
		const controller = new AbortController();
		const timeout = vi.spyOn(AbortSignal, "timeout");
		api.begin.mockImplementationOnce(async () => {
			controller.abort();
			return { id: receipt.sessionId };
		});
		await expect(
			uploadPixiuPlan(api, plan, { ...options, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(api.batch).not.toHaveBeenCalled();
		expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
		const cleanup = api.finish.mock.calls[0];
		expect(cleanup?.[1]).toBe("cancelled");
		expect(cleanup?.[2]).toBeInstanceOf(AbortSignal);
		expect(cleanup?.[2]).not.toBe(controller.signal);
		expect(cleanup?.[2]?.aborted).toBe(false);
	});
	it("cancels retry backoff immediately without sending the failed batch again", async () => {
		vi.useFakeTimers();
		const api = client();
		const controller = new AbortController();
		api.batch.mockRejectedValue(new ApiError(503, "busy", "busy"));
		const assertion = expect(
			uploadPixiuPlan(api, plan, { ...options, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		await assertion;
		expect(api.batch).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls.map((call) => call[1])).toEqual(["cancelled"]);
	});
	it("does not replay a committed batch if the progress listener fails", async () => {
		const api = client();
		const failure = new Error("Synthetic display failure");
		await expect(
			uploadPixiuPlan(api, plan, {
				...options,
				onProgress: () => {
					throw failure;
				},
			}),
		).rejects.toBe(failure);
		expect(api.batch).toHaveBeenCalledOnce();
		expect(api.finish.mock.calls.map((call) => call[1])).toEqual(["cancelled"]);
	});
});
