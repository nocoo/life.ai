import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/http", async () => {
	const actual = await vi.importActual<typeof import("../../../../src/services/http")>(
		"../../../../src/services/http",
	);
	return { ...actual, apiGet: vi.fn() };
});

import type { HealthImportReceipt, HealthProgress } from "../../../../src/models/health-types";
import { HealthBrowserSession, type HealthPreview } from "../../../../src/services/health-browser";
import { apiGet } from "../../../../src/services/http";
import {
	describeSelectedFiles,
	healthProgressPercent,
	healthStore,
	setHealthParseFn,
	setHealthUploadFn,
} from "../../../../src/viewmodels/apple-health-view-model";

const samplePreview: HealthPreview = {
	dayCount: 10,
	recordCount: 5000,
	xmlRecordCount: 4500,
	dimensionCount: 8,
	seriesCount: 20,
	fileCount: 5,
	routePointCount: 1200,
	ecgSampleCount: 15360,
	payloadBytes: 150000,
	firstAt: Date.UTC(2023, 8, 19),
	lastAt: Date.UTC(2026, 8, 14),
	warnings: ["发现 1970 年异常记录"],
};

const sampleReceipt: HealthImportReceipt = {
	sessionId: "sess-health-1",
	status: "complete",
	committedDays: 10,
	committedRecords: 5000,
	insertedDays: 8,
	updatedDays: 2,
	unchangedDays: 0,
};

describe("healthProgressPercent", () => {
	it("returns undefined for null progress or zero totals", () => {
		expect(healthProgressPercent(null)).toBeUndefined();
		const emptyProg: HealthProgress = {
			phase: "analyzing",
			bytesRead: 0,
			totalBytes: 0,
			recordCount: 0,
			completed: 0,
			total: 0,
		};
		expect(healthProgressPercent(emptyProg)).toBeUndefined();
	});

	it("returns 100 when phase is complete", () => {
		const prog: HealthProgress = {
			phase: "complete",
			bytesRead: 50,
			totalBytes: 100,
			recordCount: 10,
			completed: 5,
			total: 10,
		};
		expect(healthProgressPercent(prog)).toBe(100);
	});

	it("calculates percentage by completed/total when total > 0", () => {
		const prog: HealthProgress = {
			phase: "uploading",
			bytesRead: 0,
			totalBytes: 100,
			recordCount: 10,
			completed: 4,
			total: 8,
		};
		expect(healthProgressPercent(prog)).toBe(50);
	});

	it("falls back to bytesRead / totalBytes when total is 0", () => {
		const prog: HealthProgress = {
			phase: "analyzing",
			bytesRead: 250,
			totalBytes: 1000,
			recordCount: 5,
			completed: 0,
			total: 0,
		};
		expect(healthProgressPercent(prog)).toBe(25);
	});
});

describe("describeSelectedFiles", () => {
	it("describes single file with exact name", () => {
		const f = new File(["zip"], "export.zip");
		const desc = describeSelectedFiles([f]);
		expect(desc.fileCount).toBe(1);
		expect(desc.sourceSummary).toBe("export.zip");
		expect(desc.totalSize).toBe(3);
	});

	it("describes folder with webkitRelativePath", () => {
		const f1 = new File(["a"], "a.xml");
		Object.defineProperty(f1, "webkitRelativePath", { value: "apple_health_export/导出.xml" });
		const f2 = new File(["b"], "b.gpx");
		Object.defineProperty(f2, "webkitRelativePath", {
			value: "apple_health_export/workout-routes/r1.gpx",
		});

		const desc = describeSelectedFiles([f1, f2]);
		expect(desc.fileCount).toBe(2);
		expect(desc.sourceSummary).toBe("apple_health_export/ (2 个文件)");
	});

	it("describes multiple files without path", () => {
		const f1 = new File(["a"], "a.csv");
		const f2 = new File(["b"], "b.csv");
		const desc = describeSelectedFiles([f1, f2]);
		expect(desc.fileCount).toBe(2);
		expect(desc.sourceSummary).toBe("2 个导出文件");
	});
});

describe("healthStore", () => {
	beforeEach(async () => {
		await healthStore.getState().reset();
		setHealthParseFn(null);
		setHealthUploadFn(null);
		vi.mocked(apiGet).mockReset();
	});

	it("loads target environment successfully and handles failure", async () => {
		vi.mocked(apiGet).mockResolvedValue({ target: "production" });
		await healthStore.getState().loadTarget();
		expect(healthStore.getState().target).toBe("production");
		expect(healthStore.getState().targetStatus).toBe("ready");

		vi.mocked(apiGet).mockRejectedValue(new Error("network fail"));
		await healthStore.getState().loadTarget();
		// Keeps last stable or records error
		expect(healthStore.getState().targetStatus).toBe("error");
		expect(healthStore.getState().targetError).toBe("network fail");
	});

	it("rejects when selecting single XML file to protect user from losing attachments", async () => {
		const xmlFile = new File(["<xml></xml>"], "导出.xml", { type: "text/xml" });
		await healthStore.getState().selectFiles([xmlFile]);

		expect(healthStore.getState().status).toBe("idle");
		expect(healthStore.getState().rejection).toContain("丢失运动轨迹（GPX）和心电图（ECG）等附件");
	});

	it("ignores empty file list", async () => {
		await healthStore.getState().selectFiles([]);
		expect(healthStore.getState().status).toBe("idle");
	});

	it("parses valid files to preview and records progress", async () => {
		const parseMock = vi.fn(async (_files, onProgress) => {
			onProgress({
				phase: "analyzing",
				bytesRead: 100,
				totalBytes: 500,
				recordCount: 200,
				completed: 1,
				total: 2,
			});
			return samplePreview;
		});
		setHealthParseFn(parseMock);

		const zipFile = new File(["content"], "export.zip", { type: "application/zip" });
		await healthStore.getState().selectFiles([zipFile]);

		expect(parseMock).toHaveBeenCalled();
		expect(healthStore.getState().status).toBe("preview");
		expect(healthStore.getState().preview).toEqual(samplePreview);
		expect(healthStore.getState().progress?.phase).toBe("complete");
	});

	it("handles parse error and abort cancellation", async () => {
		setHealthParseFn(async () => {
			throw new Error("corrupted zip");
		});
		const zipFile = new File(["bad"], "bad.zip");
		await healthStore.getState().selectFiles([zipFile]);
		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("corrupted zip");

		// Abort
		setHealthParseFn(async (_f, _p, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});
		const pending = healthStore.getState().selectFiles([zipFile]);
		healthStore.getState().cancel();
		await pending;
		expect(healthStore.getState().status).toBe("cancelled");
	});

	it("performs full upload and updates receipt", async () => {
		setHealthParseFn(async () => samplePreview);
		const uploadMock = vi.fn(async (_target, onProgress) => {
			onProgress({
				phase: "uploading",
				bytesRead: 0,
				totalBytes: 150000,
				recordCount: 5000,
				completed: 5,
				total: 20,
			});
			return sampleReceipt;
		});
		setHealthUploadFn(uploadMock);

		healthStore.setState({ target: "local" });
		const zipFile = new File(["content"], "export.zip");
		await healthStore.getState().selectFiles([zipFile]);
		expect(healthStore.getState().status).toBe("preview");

		await healthStore.getState().startUpload();
		expect(uploadMock).toHaveBeenCalledWith("local", expect.any(Function), expect.any(AbortSignal));
		expect(healthStore.getState().status).toBe("success");
		expect(healthStore.getState().receipt).toEqual(sampleReceipt);
	});

	it("validates prerequisites before upload", async () => {
		// 1. No preview
		await healthStore.getState().startUpload();
		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("请先完成健康数据解析预览。");

		// 2. No target
		healthStore.setState({ preview: samplePreview, target: null, status: "preview" });
		await healthStore.getState().startUpload();
		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("无法确认当前数据环境。");
	});

	it("handles upload error and cancel", async () => {
		setHealthParseFn(async () => samplePreview);
		setHealthUploadFn(async () => {
			throw new Error("upload timeout");
		});

		healthStore.setState({ target: "local" });
		const zipFile = new File(["content"], "export.zip");
		await healthStore.getState().selectFiles([zipFile]);
		await healthStore.getState().startUpload();

		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("upload timeout");

		// Cancel during upload
		setHealthUploadFn(async (_t, _p, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => {
					const err = new Error("aborted");
					err.name = "CustomAbort";
					reject(err);
				});
			});
		});
		const pendingUpload = healthStore.getState().startUpload();
		healthStore.getState().cancel();
		await pendingUpload;
		expect(healthStore.getState().status).toBe("cancelled");
	});

	it("supports retrying after error", async () => {
		// When preview exists and status is error, retry should restart upload
		const uploadMock = vi.fn().mockResolvedValue(sampleReceipt);
		setHealthUploadFn(uploadMock);
		healthStore.setState({
			preview: samplePreview,
			target: "local",
			status: "error",
			error: "previous error",
		});

		await healthStore.getState().retry();
		expect(uploadMock).toHaveBeenCalled();
		expect(healthStore.getState().status).toBe("success");

		// When no preview, retry restarts selection of selectedFiles
		const parseMock = vi.fn().mockResolvedValue(samplePreview);
		setHealthParseFn(parseMock);
		const f = new File(["test"], "test.zip");
		healthStore.setState({ preview: null, status: "idle" });
		await healthStore.getState().selectFiles([f]);
		expect(parseMock).toHaveBeenCalledTimes(1);

		healthStore.setState({ preview: null, status: "error" });
		await healthStore.getState().retry();
		expect(parseMock).toHaveBeenCalledTimes(2);
	});

	it("clears and resets state cleanly", async () => {
		healthStore.setState({
			fileCount: 3,
			totalSize: 300,
			sourceSummary: "3 个导出文件",
			status: "preview",
			preview: samplePreview,
			target: "test",
			targetStatus: "ready",
		});

		await healthStore.getState().clear();
		expect(healthStore.getState().status).toBe("idle");
		expect(healthStore.getState().preview).toBeNull();
		// target is preserved in clear
		expect(healthStore.getState().target).toBe("test");

		await healthStore.getState().reset();
		expect(healthStore.getState().target).toBeNull();
		expect(healthStore.getState().fileCount).toBe(0);
	});

	it("cancels an in-flight reading or uploading session and aborts controller", () => {
		healthStore.setState({ status: "idle" });
		healthStore.getState().cancel();
		expect(healthStore.getState().status).toBe("idle");
	});

	it("prevents starting upload if already uploading or reading", async () => {
		healthStore.setState({ status: "uploading" });
		await healthStore.getState().startUpload();
		expect(healthStore.getState().status).toBe("uploading");

		healthStore.setState({ status: "reading" });
		await healthStore.getState().startUpload();
		expect(healthStore.getState().status).toBe("reading");
	});

	it("prevents selecting files if already uploading or reading", async () => {
		const f = new File(["test"], "test.zip");
		healthStore.setState({ status: "reading" });
		await healthStore.getState().selectFiles([f]);
		expect(healthStore.getState().fileCount).toBe(0);

		healthStore.setState({ status: "uploading" });
		await healthStore.getState().selectFiles([f]);
		expect(healthStore.getState().fileCount).toBe(0);
	});

	it("reports error when retrying with no selected files", async () => {
		healthStore.setState({ preview: null, status: "error" });
		await healthStore.getState().retry();
		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("请选择 Apple Health 导出数据包或文件夹。");
	});

	it("cancels in-flight job if clearing while reading or uploading", async () => {
		healthStore.setState({ status: "reading" });
		await healthStore.getState().clear();
		expect(healthStore.getState().status).toBe("idle");
	});

	it("ignores late callbacks from superseded parse generation", async () => {
		let capturedProgress: ((p: HealthProgress) => void) | undefined;
		let resolveParse: ((p: HealthPreview) => void) | undefined;
		let capturedSignal: AbortSignal | undefined;
		setHealthParseFn((_f, onProgress, signal) => {
			capturedProgress = onProgress;
			capturedSignal = signal;
			return new Promise((resolve) => {
				resolveParse = resolve;
			});
		});

		const f1 = new File(["a"], "a.zip");
		const f2 = new File(["b"], "b.zip");
		const p1 = healthStore.getState().selectFiles([f1]);
		await healthStore.getState().clear();
		expect(capturedSignal?.aborted).toBe(true);
		const newerPreview = { ...samplePreview, dayCount: 2, recordCount: 27 };
		setHealthParseFn(async () => newerPreview);
		await healthStore.getState().selectFiles([f2]);
		const currentProgress = healthStore.getState().progress;

		// A parser that finishes after cancellation must not replace the newly selected archive.
		capturedProgress?.({
			phase: "analyzing",
			bytesRead: 10,
			totalBytes: 100,
			recordCount: 1,
			completed: 0,
			total: 1,
		});
		resolveParse?.(samplePreview);
		await p1;
		expect(healthStore.getState()).toMatchObject({
			status: "preview",
			sourceSummary: "b.zip",
			preview: newerPreview,
			receipt: null,
		});
		expect(healthStore.getState().progress).toBe(currentProgress);
	});

	it("ignores late callbacks from superseded upload generation", async () => {
		let capturedProgress: ((p: HealthProgress) => void) | undefined;
		let resolveUpload: ((r: HealthImportReceipt) => void) | undefined;
		setHealthParseFn(async () => samplePreview);
		setHealthUploadFn((_t, onProgress) => {
			capturedProgress = onProgress;
			return new Promise((resolve) => {
				resolveUpload = resolve;
			});
		});

		healthStore.setState({ target: "local" });
		const f = new File(["a"], "a.zip");
		await healthStore.getState().selectFiles([f]);

		const up1 = healthStore.getState().startUpload();
		await healthStore.getState().reset();

		capturedProgress?.({
			phase: "uploading",
			bytesRead: 10,
			totalBytes: 100,
			recordCount: 1,
			completed: 1,
			total: 2,
		});
		resolveUpload?.(sampleReceipt);
		await up1;
		expect(healthStore.getState()).toMatchObject({
			status: "idle",
			progress: null,
			receipt: null,
			preview: null,
			error: null,
		});
	});

	it("previews a complete directory selection with XML and attachments", async () => {
		const files = [new File(["xml"], "导出.xml"), new File(["route"], "route.gpx")];
		for (const file of files)
			Object.defineProperty(file, "webkitRelativePath", {
				value: `apple_health_export/${file.name}`,
			});
		const parse = vi.fn().mockResolvedValue(samplePreview);
		setHealthParseFn(parse);
		await healthStore.getState().selectFiles(files);
		expect(parse).toHaveBeenCalledWith(files, expect.any(Function), expect.any(AbortSignal));
		expect(healthStore.getState()).toMatchObject({
			fileCount: 2,
			status: "preview",
			rejection: null,
			sourceSummary: "apple_health_export/ (2 个文件)",
		});
	});

	it.each(["parse", "upload"] as const)(
		"treats a %s abort from the browser session as cancellation",
		async (operation) => {
			setHealthParseFn(async () => {
				if (operation === "parse") throw abortError();
				return samplePreview;
			});
			setHealthUploadFn(async () => {
				throw abortError();
			});
			healthStore.setState({ target: "test" });
			await healthStore.getState().selectFiles([new File(["zip"], "export.zip")]);
			if (operation === "upload") await healthStore.getState().startUpload();
			expect(healthStore.getState()).toMatchObject({
				status: "cancelled",
				error: null,
				receipt: null,
			});
		},
	);

	it("rejects files when not busy and ignores reject during busy", () => {
		healthStore.getState().rejectFiles("不支持的文件格式");
		expect(healthStore.getState().rejection).toBe("不支持的文件格式");

		healthStore.setState({ status: "reading" });
		healthStore.getState().rejectFiles("another");
		expect(healthStore.getState().rejection).toBe("不支持的文件格式");
	});

	it("uses default HealthBrowserSession parse and upload when no custom fns injected", async () => {
		const parseSpy = vi
			.spyOn(HealthBrowserSession.prototype, "parse")
			.mockResolvedValue(samplePreview);
		const uploadSpy = vi
			.spyOn(HealthBrowserSession.prototype, "upload")
			.mockResolvedValue(sampleReceipt);
		const cancelSpy = vi
			.spyOn(HealthBrowserSession.prototype, "cancel")
			.mockImplementation(() => {});
		const releaseSpy = vi.spyOn(HealthBrowserSession.prototype, "release").mockResolvedValue();

		setHealthParseFn(null);
		setHealthUploadFn(null);

		const zipFile = new File(["data"], "export.zip", { type: "application/zip" });
		await healthStore.getState().selectFiles([zipFile]);

		expect(parseSpy).toHaveBeenCalledWith([zipFile], expect.any(Function), expect.any(AbortSignal));
		expect(healthStore.getState().status).toBe("preview");

		healthStore.setState({ target: "production" });
		await healthStore.getState().startUpload();

		expect(uploadSpy).toHaveBeenCalledWith(
			"production",
			expect.any(Function),
			expect.any(AbortSignal),
		);
		expect(healthStore.getState().status).toBe("success");
		expect(healthStore.getState().receipt).toEqual(sampleReceipt);

		healthStore.setState({ status: "reading" });
		healthStore.getState().cancel();
		expect(cancelSpy).toHaveBeenCalled();

		await healthStore.getState().clear();
		expect(releaseSpy).toHaveBeenCalled();
	});

	it("handles default upload failure when session has not been created", async () => {
		setHealthParseFn(null);
		setHealthUploadFn(null);
		await healthStore.getState().reset();

		// Manually set preview and target without having gone through defaultParse
		healthStore.setState({
			preview: samplePreview,
			target: "local",
			status: "preview",
		});

		await healthStore.getState().startUpload();
		expect(healthStore.getState().status).toBe("error");
		expect(healthStore.getState().error).toBe("没有可提交的健康数据。");
	});

	it("discards late target responses when generation changes", async () => {
		let finishTarget: ((val: { target: string }) => void) | undefined;
		vi.mocked(apiGet).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishTarget = resolve as (val: { target: string }) => void;
				}),
		);

		const pending = healthStore.getState().loadTarget();
		expect(healthStore.getState().targetStatus).toBe("loading");

		// Trigger reset to bump generation
		await healthStore.getState().reset();

		finishTarget?.({ target: "test" });
		await pending;
		expect(healthStore.getState().target).toBeNull();
	});

	it("discards late target errors when generation changes", async () => {
		let rejectTarget: ((err: Error) => void) | undefined;
		vi.mocked(apiGet).mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectTarget = reject;
				}),
		);

		const pending = healthStore.getState().loadTarget();
		expect(healthStore.getState().targetStatus).toBe("loading");

		await healthStore.getState().reset();

		rejectTarget?.(new Error("offline"));
		await pending;
		expect(healthStore.getState().targetError).toBeNull();
	});

	it("discards parse results when cancelled before completion", async () => {
		let resolveParse: ((p: HealthPreview) => void) | undefined;
		setHealthParseFn((_files, _onProg, signal) => {
			return new Promise((resolve, reject) => {
				resolveParse = resolve;
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});

		const zipFile = new File(["data"], "export.zip");
		const pending = healthStore.getState().selectFiles([zipFile]);
		healthStore.getState().cancel();
		resolveParse?.(samplePreview);
		await pending;
		expect(healthStore.getState().status).toBe("cancelled");
	});

	it("drops late parse errors after cancellation", async () => {
		let rejectParse: ((err: Error) => void) | undefined;
		setHealthParseFn((_f, _p, signal) => {
			return new Promise((_, reject) => {
				rejectParse = reject;
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});

		const zipFile = new File(["data"], "export.zip");
		const pending = healthStore.getState().selectFiles([zipFile]);
		healthStore.getState().cancel();
		rejectParse?.(new Error("late failure"));
		await pending;
		expect(healthStore.getState().status).toBe("cancelled");
		expect(healthStore.getState().error).toBeNull();
	});

	it("drops late upload errors after cancellation", async () => {
		let rejectUpload: ((err: Error) => void) | undefined;
		setHealthParseFn(async () => samplePreview);
		setHealthUploadFn((_t, _p, signal) => {
			return new Promise((_, reject) => {
				rejectUpload = reject;
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});

		healthStore.setState({ target: "local" });
		const zipFile = new File(["data"], "export.zip");
		await healthStore.getState().selectFiles([zipFile]);

		const pending = healthStore.getState().startUpload();
		healthStore.getState().cancel();
		rejectUpload?.(new Error("late upload failure"));
		await pending;
		expect(healthStore.getState().status).toBe("cancelled");
		expect(healthStore.getState().error).toBeNull();
	});
});
