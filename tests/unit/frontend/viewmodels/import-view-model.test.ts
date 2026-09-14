import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, importRecordFixture } from "../helpers";

vi.mock("../../../../src/models/import", () => ({
	importFile: vi.fn(),
}));
vi.mock("../../../../src/services/imports-service", () => ({
	postImportBatch: vi.fn(),
}));

import { importFile } from "../../../../src/models/import";
import { postImportBatch } from "../../../../src/services/imports-service";
import {
	IMPORT_SOURCES,
	importProgressPercent,
	importSourceMeta,
	importStore,
} from "../../../../src/viewmodels/import-view-model";

const importFileMock = vi.mocked(importFile);
const postImportBatchMock = vi.mocked(postImportBatch);

function journalFile(): File {
	return new File([JSON.stringify({ date: "2026-09-13", title: "咖啡" })], "export.json", {
		type: "application/json",
	});
}

describe("importStore", () => {
	beforeEach(() => {
		importStore.getState().reset();
		importFileMock.mockReset();
		postImportBatchMock.mockReset();
	});

	it("previews a selected file", () => {
		expect(importStore.getState().source).toBe("journal");
		const file = journalFile();
		importStore.getState().selectFile(file);
		expect(importStore.getState()).toMatchObject({
			fileName: "export.json",
			fileSize: file.size,
			status: "preview",
		});
	});

	it("rejects files while idle", () => {
		importStore.getState().rejectFile("太大");
		expect(importStore.getState().rejection).toBe("太大");
	});

	it("errors when starting without a file", async () => {
		await importStore.getState().start();
		expect(importStore.getState()).toMatchObject({
			status: "error",
			error: "请选择要导入的文件。",
		});
		await importStore.getState().retry();
		expect(importStore.getState().error).toBe("请选择要导入的文件。");
	});

	it("imports in batches and records progress", async () => {
		const file = journalFile();
		importStore.getState().selectFile(file);
		postImportBatchMock.mockResolvedValue({ accepted: 1 });
		importFileMock.mockImplementation(async (_file, source, onBatch, onProgress) => {
			onProgress({ bytesRead: 4, totalBytes: file.size, processed: 1, accepted: 0 });
			expect(importStore.getState()).toMatchObject({
				status: "running",
				processed: 1,
				accepted: 0,
			});
			await onBatch([importRecordFixture()]);
			onProgress({ bytesRead: file.size, totalBytes: file.size, processed: 1, accepted: 1 });
			expect(source).toBe("journal");
			return { processed: 1, accepted: 1 };
		});
		await importStore.getState().start();
		expect(postImportBatchMock).toHaveBeenCalledWith(
			"journal",
			[importRecordFixture()],
			expect.any(AbortSignal),
		);
		expect(importStore.getState()).toMatchObject({
			status: "success",
			processed: 1,
			accepted: 1,
		});
	});

	it("does not start twice while running", async () => {
		importStore.getState().selectFile(journalFile());
		let finish: () => void = () => {};
		importFileMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = () => resolve({ processed: 0, accepted: 0 });
				}),
		);
		const first = importStore.getState().start();
		await importStore.getState().start();
		expect(importFileMock).toHaveBeenCalledTimes(1);
		finish();
		await first;
	});

	it("cancels an in-flight import", async () => {
		importStore.getState().selectFile(journalFile());
		importFileMock.mockImplementation((_file, _source, _onBatch, _onProgress, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});
		const pending = importStore.getState().start();
		importStore.getState().cancel();
		await pending;
		expect(importStore.getState().status).toBe("cancelled");
		importStore.getState().cancel();
		expect(importStore.getState().status).toBe("cancelled");
	});

	it("treats import abort as cancellation", async () => {
		importStore.getState().selectFile(journalFile());
		importFileMock.mockRejectedValue(abortError());
		await importStore.getState().start();
		expect(importStore.getState().status).toBe("cancelled");
	});

	it.each([
		{ error: new Error("parse failed"), message: "parse failed" },
		{ error: new TypeError("offline"), message: "无法连接服务器，请重试。" },
		{ error: undefined, message: "请求失败，请重试。" },
	])("maps import failures and allows replay: $message", async ({ error, message }) => {
		importStore.getState().selectFile(journalFile());
		importFileMock.mockRejectedValue(error);
		await importStore.getState().start();
		expect(importStore.getState()).toMatchObject({ status: "error", error: message });
		importFileMock.mockResolvedValue({ processed: 2, accepted: 2 });
		await importStore.getState().retry();
		expect(importStore.getState().status).toBe("success");
	});

	it("ignores competing actions while running and stale callbacks after clearing", async () => {
		importStore.getState().selectFile(journalFile());
		let finish: () => void = () => {};
		importFileMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = () => resolve({ processed: 5, accepted: 5 });
				}),
		);
		const pending = importStore.getState().start();
		const active = importStore.getState();
		importStore.getState().selectFile(new File(["{}"], "different.json"));
		importStore.getState().setSource("journal");
		importStore.getState().setSource("pixiu");
		importStore.getState().rejectFile("nope");
		expect(importStore.getState()).toEqual(active);
		importStore.getState().clear();
		expect(importFileMock.mock.calls[0]?.[4]?.aborted).toBe(true);
		importFileMock.mock.calls[0]?.[3]({ bytesRead: 10, totalBytes: 10, processed: 5, accepted: 5 });
		finish();
		await pending;
		expect(importStore.getState().status).toBe("idle");
		expect(importStore.getState().fileName).toBeNull();
		expect(importStore.getState()).toMatchObject({ processed: 0, accepted: 0, progress: null });
	});

	it.each(["apple-health", "footprint", "pixiu"] as const)(
		"keeps journal selection when dedicated provider %s is requested",
		(source) => {
			importStore.getState().selectFile(journalFile());
			const selected = importStore.getState();
			importStore.getState().setSource(source);
			expect(importStore.getState()).toEqual(selected);
		},
	);

	it.each(["cancel", "reset"] as const)(
		"protects a later import from a rejected request after %s",
		async (action) => {
			let fail: (error: unknown) => void = () => {};
			importFileMock.mockImplementationOnce(
				() =>
					new Promise((_resolve, reject) => {
						fail = reject;
					}),
			);
			importStore.getState().selectFile(journalFile());
			const stale = importStore.getState().start();
			importStore.getState()[action]();
			importStore.getState().selectFile(new File(["{}"], "next.json"));
			importFileMock.mockResolvedValue({ processed: 1, accepted: 1 });
			await importStore.getState().start();
			const complete = importStore.getState();
			importFileMock.mock.calls[0]?.[3]({
				bytesRead: 10,
				totalBytes: 10,
				processed: 5,
				accepted: 5,
			});
			fail(new Error("late failure"));
			await stale;
			expect(importStore.getState()).toEqual(complete);
			expect(complete).toMatchObject({
				status: "success",
				fileName: "next.json",
				processed: 1,
				accepted: 1,
			});
		},
	);

	it("clears an idle selection and its rejection before another import", async () => {
		importStore.getState().selectFile(journalFile());
		importStore.getState().rejectFile("another file was too large");
		importStore.getState().clear();
		expect(importStore.getState()).toMatchObject({
			source: "journal",
			fileName: null,
			fileSize: null,
			status: "idle",
			error: null,
			rejection: null,
		});
		await importStore.getState().start();
		expect(importStore.getState().error).toBe("请选择要导入的文件。");
		expect(importFileMock).not.toHaveBeenCalled();
	});

	it("switches source and clears the file when idle", () => {
		importStore.getState().selectFile(journalFile());
		importStore.getState().setSource("journal");
		expect(importStore.getState()).toMatchObject({
			source: "journal",
			fileName: null,
			status: "idle",
		});
	});
});

describe("import helpers", () => {
	it("resolves source metadata and progress", () => {
		expect(importSourceMeta("pixiu").label).toBe("貔貅");
		expect(importSourceMeta("apple-health").id).toBe("apple-health");
		expect(importSourceMeta("footprint").hint).toContain("GPX");
		expect(importSourceMeta("journal").accept).toContain(".ndjson");
		expect(IMPORT_SOURCES.map((item) => item.id)).toEqual(["journal"]);
		expect(importProgressPercent(null)).toBeUndefined();
		expect(
			importProgressPercent({ bytesRead: 0, totalBytes: 0, processed: 0, accepted: 0 }),
		).toBeUndefined();
		expect(
			importProgressPercent({ bytesRead: 50, totalBytes: 100, processed: 1, accepted: 1 }),
		).toBe(50);
		expect(
			importProgressPercent({ bytesRead: 200, totalBytes: 100, processed: 1, accepted: 1 }),
		).toBe(100);
		expect(
			importProgressPercent({ bytesRead: -10, totalBytes: 100, processed: 0, accepted: 0 }),
		).toBe(0);
	});
});
