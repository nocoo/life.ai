import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FootprintImportReceipt } from "../../../../src/models/data-management";
import { PIXIU_COLUMNS, type PixiuPlan, parsePixiu } from "../../../../src/models/pixiu";
import {
	createPixiuClient,
	type PixiuClient,
	readPixiuFiles,
	uploadPixiuPlan,
} from "../../../../src/services/pixiu-client";
import { pixiuStore } from "../../../../src/viewmodels/pixiu-view-model";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/pixiu-client", () => ({
	createPixiuClient: vi.fn(),
	readPixiuFiles: vi.fn(),
	uploadPixiuPlan: vi.fn(),
}));

const file = new File(
	[`${PIXIU_COLUMNS.join(",")}\n2026-09-14,日常支出,合成早餐,0.00,0.29,人民币,合成现金,,`],
	"synthetic.csv",
	{ type: "text/csv" },
);
const receipt: FootprintImportReceipt = {
	sessionId: "synthetic-session",
	status: "complete",
	committedDays: 1,
	committedPoints: 1,
	insertedDays: 1,
	updatedDays: 0,
	unchangedDays: 0,
};
const runningReceipt: FootprintImportReceipt = { ...receipt, status: "running" };
const api = {
	target: vi.fn<PixiuClient["target"]>(),
	begin: vi.fn<PixiuClient["begin"]>(),
	batch: vi.fn<PixiuClient["batch"]>(),
	finish: vi.fn<PixiuClient["finish"]>(),
	days: vi.fn<PixiuClient["days"]>(),
};
const readMock = vi.mocked(readPixiuFiles);
const uploadMock = vi.mocked(uploadPixiuPlan);
let plan: PixiuPlan;

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (reason: unknown) => void = () => {};
	const promise = new Promise<T>((finish, fail) => {
		resolve = finish;
		reject = fail;
	});
	return { promise, resolve, reject };
}

beforeAll(async () => {
	plan = await parsePixiu([{ name: file.name, text: await file.text() }]);
});
beforeEach(() => {
	pixiuStore.getState().reset();
	vi.resetAllMocks();
	vi.mocked(createPixiuClient).mockReturnValue(api);
	api.target.mockResolvedValue({ target: "test" });
	readMock.mockResolvedValue(plan);
	uploadMock.mockResolvedValue(receipt);
});

describe("Pixiu environment selection", () => {
	it("clears old target claims while loading and recovers from a failed lookup", async () => {
		api.target.mockRejectedValueOnce(new Error("environment unavailable"));
		await pixiuStore.getState().loadTarget();
		expect(pixiuStore.getState()).toMatchObject({
			target: null,
			targetError: "environment unavailable",
		});
		const pending = pixiuStore.getState().loadTarget();
		expect(pixiuStore.getState()).toMatchObject({ target: null, targetError: null });
		await pending;
		expect(pixiuStore.getState()).toMatchObject({ target: "test", targetError: null });
		api.target.mockRejectedValueOnce(new TypeError("network"));
		await pixiuStore.getState().loadTarget();
		expect(pixiuStore.getState()).toMatchObject({
			target: null,
			targetError: "无法连接服务器，请重试。",
		});
	});

	it.each(["resolve", "reject"] as const)(
		"ignores a stale target request settled through %s",
		async (settle) => {
			const stale = deferred<Awaited<ReturnType<PixiuClient["target"]>>>();
			api.target.mockReturnValueOnce(stale.promise);
			const pending = pixiuStore.getState().loadTarget();
			await pixiuStore.getState().loadTarget();
			if (settle === "resolve") stale.resolve({ target: "local" });
			else stale.reject(new Error("old request"));
			await pending;
			expect(pixiuStore.getState()).toMatchObject({ target: "test", targetError: null });
		},
	);

	it.each(["resolve", "reject"] as const)(
		"discards target %s after the page is reset",
		async (settle) => {
			const stale = deferred<Awaited<ReturnType<PixiuClient["target"]>>>();
			api.target.mockReturnValueOnce(stale.promise);
			const pending = pixiuStore.getState().loadTarget();
			pixiuStore.getState().reset();
			if (settle === "resolve") stale.resolve({ target: "test" });
			else stale.reject(new Error("old request"));
			await pending;
			expect(pixiuStore.getState()).toMatchObject({ target: null, targetError: null });
		},
	);
});

describe("Pixiu preview and submission", () => {
	it("previews the complete selection and clears prior feedback before reading", async () => {
		pixiuStore.setState({ receipt, error: "old failure" });
		const files = [file];
		const pending = pixiuStore.getState().selectFiles(files);
		expect(pixiuStore.getState()).toMatchObject({
			files,
			plan: null,
			status: "reading",
			receipt: null,
			error: null,
		});
		await pending;
		expect(pixiuStore.getState().plan).toBe(plan);
		expect(pixiuStore.getState().files).toBe(files);
		expect(pixiuStore.getState().status).toBe("preview");
		expect(readMock).toHaveBeenCalledWith(files, expect.any(AbortSignal));
		expect(uploadMock).not.toHaveBeenCalled();
	});

	it.each([
		{ error: abortError(), status: "cancelled", message: null },
		{ error: new Error("invalid CSV"), status: "error", message: "invalid CSV" },
		{ error: undefined, status: "error", message: "请求失败，请重试。" },
	])("handles a parse outcome: $status / $message", async ({ error, status, message }) => {
		readMock.mockRejectedValueOnce(error);
		await pixiuStore.getState().selectFiles([file]);
		expect(pixiuStore.getState()).toMatchObject({ status, error: message, plan: null });
		await pixiuStore.getState().selectFiles([file]);
		expect(pixiuStore.getState()).toMatchObject({ status: "preview", error: null, plan });
	});

	it.each(["missing plan", "missing target"])("requires %s before uploading", async (missing) => {
		if (missing === "missing plan") await pixiuStore.getState().loadTarget();
		else await pixiuStore.getState().selectFiles([file]);
		await pixiuStore.getState().upload();
		expect(pixiuStore.getState()).toMatchObject({
			status: "error",
			error: "请先预览文件并确认数据环境",
		});
		expect(uploadMock).not.toHaveBeenCalled();
	});

	it("uses the confirmed environment and displays only authoritative upload receipts", async () => {
		await pixiuStore.getState().loadTarget();
		await pixiuStore.getState().selectFiles([file]);
		const completion = deferred<FootprintImportReceipt>();
		uploadMock.mockReturnValueOnce(completion.promise);
		const pending = pixiuStore.getState().upload();
		expect(pixiuStore.getState()).toMatchObject({
			status: "uploading",
			receipt: null,
			error: null,
		});
		expect(uploadMock).toHaveBeenCalledWith(api, plan, {
			target: "test",
			channel: "web",
			signal: expect.any(AbortSignal),
			onProgress: expect.any(Function),
		});
		expect(readMock.mock.calls[0]?.[1]?.aborted).toBe(true);
		uploadMock.mock.calls[0]?.[2].onProgress?.(runningReceipt);
		expect(pixiuStore.getState()).toMatchObject({ status: "uploading", receipt: runningReceipt });
		completion.resolve(receipt);
		await pending;
		expect(pixiuStore.getState()).toMatchObject({ status: "success", receipt, plan, error: null });
	});

	it.each([
		{ error: abortError(), status: "cancelled", message: null },
		{ error: new Error("database busy"), status: "error", message: "database busy" },
		{ error: null, status: "error", message: "请求失败，请重试。" },
	])(
		"can retry an upload outcome without reparsing: $status / $message",
		async ({ error, status, message }) => {
			await pixiuStore.getState().loadTarget();
			await pixiuStore.getState().selectFiles([file]);
			uploadMock.mockRejectedValueOnce(error);
			await pixiuStore.getState().upload();
			expect(pixiuStore.getState()).toMatchObject({ status, error: message, plan });
			await pixiuStore.getState().upload();
			expect(readMock).toHaveBeenCalledTimes(1);
			expect(uploadMock).toHaveBeenCalledTimes(2);
			expect(uploadMock.mock.calls[0]?.[2].signal?.aborted).toBe(true);
			expect(pixiuStore.getState()).toMatchObject({ status: "success", receipt, error: null });
		},
	);

	it.each(["reading", "uploading"] as const)(
		"ignores competing actions while %s",
		async (status) => {
			await pixiuStore.getState().loadTarget();
			const parse = deferred<PixiuPlan>();
			const upload = deferred<FootprintImportReceipt>();
			let pending: Promise<void>;
			if (status === "reading") {
				readMock.mockReturnValueOnce(parse.promise);
				pending = pixiuStore.getState().selectFiles([file]);
			} else {
				await pixiuStore.getState().selectFiles([file]);
				uploadMock.mockReturnValueOnce(upload.promise);
				pending = pixiuStore.getState().upload();
			}
			const active = pixiuStore.getState();
			await active.selectFiles([new File(["replacement"], "other.csv")]);
			await active.upload();
			active.reject("rejected second file");
			expect(pixiuStore.getState()).toEqual(active);
			expect(readMock).toHaveBeenCalledTimes(1);
			expect(uploadMock).toHaveBeenCalledTimes(status === "reading" ? 0 : 1);
			parse.resolve(plan);
			upload.resolve(receipt);
			await pending;
		},
	);
});

describe("Pixiu cancellation and page lifecycle", () => {
	for (const action of ["cancel", "clear", "reset"] as const) {
		it.each(["resolve", "reject"] as const)(
			`ignores a parse %s after ${action}`,
			async (settle) => {
				const stale = deferred<PixiuPlan>();
				readMock.mockReturnValueOnce(stale.promise);
				const pending = pixiuStore.getState().selectFiles([file]);
				pixiuStore.getState()[action]();
				const inactive = pixiuStore.getState();
				expect(readMock.mock.calls[0]?.[1]?.aborted).toBe(true);
				if (settle === "resolve") stale.resolve(plan);
				else stale.reject(new Error("late parse failure"));
				await pending;
				expect(pixiuStore.getState()).toEqual(inactive);
				expect(inactive.status).toBe(action === "cancel" ? "cancelled" : "idle");
			},
		);

		it.each(["resolve", "reject"] as const)(
			`ignores upload progress and %s after ${action}`,
			async (settle) => {
				await pixiuStore.getState().loadTarget();
				await pixiuStore.getState().selectFiles([file]);
				const stale = deferred<FootprintImportReceipt>();
				uploadMock.mockReturnValueOnce(stale.promise);
				const pending = pixiuStore.getState().upload();
				pixiuStore.getState()[action]();
				const inactive = pixiuStore.getState();
				expect(uploadMock.mock.calls[0]?.[2].signal?.aborted).toBe(true);
				uploadMock.mock.calls[0]?.[2].onProgress?.(runningReceipt);
				if (settle === "resolve") stale.resolve(receipt);
				else stale.reject(new Error("late upload failure"));
				await pending;
				expect(pixiuStore.getState()).toEqual(inactive);
				expect(inactive.status).toBe(action === "cancel" ? "cancelled" : "idle");
			},
		);
	}

	it("keeps file rejection visible and makes cancellation a no-op outside active work", async () => {
		pixiuStore.getState().reject("CSV required");
		pixiuStore.getState().cancel();
		expect(pixiuStore.getState()).toMatchObject({ status: "idle", error: "CSV required" });
		await pixiuStore.getState().selectFiles([file]);
		pixiuStore.getState().cancel();
		expect(pixiuStore.getState()).toMatchObject({ status: "preview", plan, error: null });
	});

	it.each(["ready", "failed"] as const)(
		"clears data while retaining a %s target lookup",
		async (outcome) => {
			if (outcome === "failed") api.target.mockRejectedValueOnce(new Error("offline"));
			await pixiuStore.getState().loadTarget();
			await pixiuStore.getState().selectFiles([file]);
			pixiuStore.getState().clear();
			expect(pixiuStore.getState()).toMatchObject({
				files: [],
				plan: null,
				status: "idle",
				receipt: null,
				error: null,
				target: outcome === "ready" ? "test" : null,
				targetError: outcome === "failed" ? "offline" : null,
			});
			pixiuStore.getState().reset();
			expect(pixiuStore.getState()).toMatchObject({ target: null, targetError: null });
		},
	);
});
