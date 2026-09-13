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
	importProgressPercent,
	importSourceMeta,
	importStore,
} from "../../../../src/viewmodels/import-view-model";

const importFileMock = vi.mocked(importFile);
const postImportBatchMock = vi.mocked(postImportBatch);

function xmlFile(): File {
	return new File(["<HealthData />"], "export.xml", { type: "text/xml" });
}

describe("importStore", () => {
	beforeEach(() => {
		importStore.getState().reset();
		importFileMock.mockReset();
		postImportBatchMock.mockReset();
	});

	it("previews a selected file", () => {
		const file = xmlFile();
		importStore.getState().selectFile(file);
		expect(importStore.getState()).toMatchObject({
			fileName: "export.xml",
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
		const file = xmlFile();
		importStore.getState().selectFile(file);
		postImportBatchMock.mockResolvedValue({ accepted: 1 });
		importFileMock.mockImplementation(async (_file, source, onBatch, onProgress) => {
			onProgress({ bytesRead: 4, totalBytes: file.size, processed: 1, accepted: 0 });
			await onBatch([importRecordFixture()]);
			onProgress({ bytesRead: file.size, totalBytes: file.size, processed: 1, accepted: 1 });
			expect(source).toBe("apple-health");
			return { processed: 1, accepted: 1 };
		});
		await importStore.getState().start();
		expect(postImportBatchMock).toHaveBeenCalledWith(
			"apple-health",
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
		importStore.getState().selectFile(xmlFile());
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
		importStore.getState().selectFile(xmlFile());
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
		importStore.getState().selectFile(xmlFile());
		importFileMock.mockRejectedValue(abortError());
		await importStore.getState().start();
		expect(importStore.getState().status).toBe("cancelled");
	});

	it("maps import failures", async () => {
		importStore.getState().selectFile(xmlFile());
		importFileMock.mockRejectedValue(new Error("parse failed"));
		await importStore.getState().start();
		expect(importStore.getState()).toMatchObject({ status: "error", error: "parse failed" });
		importFileMock.mockResolvedValue({ processed: 2, accepted: 2 });
		await importStore.getState().retry();
		expect(importStore.getState().status).toBe("success");
	});

	it("ignores file changes while running", async () => {
		importStore.getState().selectFile(xmlFile());
		importFileMock.mockImplementation(() => new Promise(() => {}));
		void importStore.getState().start();
		importStore.getState().selectFile(xmlFile());
		importStore.getState().setSource("pixiu");
		importStore.getState().rejectFile("nope");
		expect(importStore.getState().source).toBe("apple-health");
		expect(importStore.getState().rejection).toBeNull();
		importStore.getState().clear();
		expect(importStore.getState().status).toBe("idle");
		expect(importStore.getState().fileName).toBeNull();
	});

	it("switches source and clears the file when idle", () => {
		importStore.getState().selectFile(xmlFile());
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
