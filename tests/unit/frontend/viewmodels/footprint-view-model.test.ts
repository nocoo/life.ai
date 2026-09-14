import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/http", async () => {
	const actual = await vi.importActual<typeof import("../../../../src/services/http")>(
		"../../../../src/services/http",
	);
	return { ...actual, apiGet: vi.fn() };
});

import type { FootprintPreview } from "../../../../src/services/footprint-browser";
import { apiGet } from "../../../../src/services/http";
import {
	footprintParsePercent,
	footprintStore,
	setFootprintParseFn,
	setFootprintUploadFn,
} from "../../../../src/viewmodels/footprint-view-model";

const preview: FootprintPreview = {
	days: [
		{
			utcDay: Date.UTC(2026, 8, 13),
			recordCount: 12,
			firstAt: Date.UTC(2026, 8, 13, 1),
			lastAt: Date.UTC(2026, 8, 13, 8),
			payloadBytes: 400,
		},
	],
	pointCount: 12,
	firstAt: Date.UTC(2026, 8, 13, 1),
	lastAt: Date.UTC(2026, 8, 13, 8),
	bytesRead: 80,
	payloadBytes: 400,
};

describe("footprintParsePercent", () => {
	it("returns a bounded percent", () => {
		expect(footprintParsePercent(null)).toBeUndefined();
		expect(footprintParsePercent({ bytesRead: 0, totalBytes: 0, pointCount: 0 })).toBeUndefined();
		expect(footprintParsePercent({ bytesRead: 50, totalBytes: 100, pointCount: 3 })).toBe(50);
	});
});

describe("footprintStore", () => {
	beforeEach(() => {
		footprintStore.getState().reset();
		setFootprintParseFn(null);
		setFootprintUploadFn(null);
		vi.mocked(apiGet).mockReset();
	});

	it("loads the current data environment", async () => {
		vi.mocked(apiGet).mockResolvedValue({ target: "test" });
		await footprintStore.getState().loadTarget();
		expect(footprintStore.getState().target).toBe("test");
		vi.mocked(apiGet).mockRejectedValue(new Error("down"));
		await footprintStore.getState().loadTarget();
		expect(footprintStore.getState().target).toBe("test");
	});

	it("parses a file to preview without copying plan days into later state", async () => {
		const parse = vi.fn(async (_file, onProgress) => {
			onProgress({ bytesRead: 40, totalBytes: 80, pointCount: 4 });
			return preview;
		});
		setFootprintParseFn(parse);
		const file = new File(["gpx"], "track.gpx", { type: "application/gpx+xml" });
		await footprintStore.getState().selectFile(file);
		expect(parse).toHaveBeenCalled();
		expect(footprintStore.getState()).toMatchObject({
			status: "preview",
			fileName: "track.gpx",
			preview: { pointCount: 12, days: [{ recordCount: 12 }] },
		});
	});

	it("clears an in-flight parse", async () => {
		setFootprintParseFn((_file, _onProgress, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});
		const pending = footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().clear();
		await pending;
		expect(footprintStore.getState().fileName).toBeNull();
	});

	it("ignores a late parse error after cancel", async () => {
		let fail: (error: Error) => void = () => {};
		setFootprintParseFn(
			() =>
				new Promise((_, reject) => {
					fail = reject;
				}),
		);
		const pending = footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		footprintStore.getState().cancel();
		fail(new Error("late"));
		await pending;
		expect(footprintStore.getState().status).toBe("cancelled");
		expect(footprintStore.getState().error).toBeNull();
	});

	it("ignores late upload progress after cancel", async () => {
		let report: (receipt: {
			sessionId: string;
			status: "running";
			committedDays: number;
			committedPoints: number;
			insertedDays: number;
			updatedDays: number;
			unchangedDays: number;
		}) => void = () => {};
		let finish: () => void = () => {};
		setFootprintParseFn(async () => preview);
		setFootprintUploadFn(
			(_fileName, _target, onProgress) =>
				new Promise((resolve) => {
					report = onProgress;
					finish = () =>
						resolve({
							sessionId: "s1",
							status: "complete",
							committedDays: 1,
							committedPoints: 12,
							insertedDays: 1,
							updatedDays: 0,
							unchangedDays: 0,
						});
				}),
		);
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		const pending = footprintStore.getState().startUpload();
		footprintStore.getState().cancel();
		report({
			sessionId: "s1",
			status: "running",
			committedDays: 0,
			committedPoints: 0,
			insertedDays: 0,
			updatedDays: 0,
			unchangedDays: 0,
		});
		finish();
		await pending;
		expect(footprintStore.getState().status).toBe("cancelled");
	});

	it("drops stale parse progress after cancel", async () => {
		let finish: (preview: FootprintPreview) => void = () => {};
		let report:
			| ((progress: { bytesRead: number; totalBytes: number; pointCount: number }) => void)
			| undefined;
		setFootprintParseFn((_file, onProgress) => {
			report = onProgress;
			return new Promise((resolve) => {
				finish = resolve;
			});
		});
		const pending = footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		footprintStore.getState().cancel();
		report?.({ bytesRead: 9, totalBytes: 10, pointCount: 9 });
		finish(preview);
		await pending;
		expect(footprintStore.getState().status).toBe("cancelled");
	});

	it("cancels an in-flight parse", async () => {
		setFootprintParseFn((_file, _onProgress, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});
		const pending = footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		footprintStore.getState().cancel();
		await pending;
		expect(footprintStore.getState().status).toBe("cancelled");
	});

	it("maps parse failures and retries", async () => {
		const parse = vi
			.fn()
			.mockRejectedValueOnce(new Error("bad gpx"))
			.mockResolvedValueOnce(preview);
		setFootprintParseFn(parse);
		const file = new File(["gpx"], "track.gpx");
		await footprintStore.getState().selectFile(file);
		expect(footprintStore.getState()).toMatchObject({ status: "error", error: "bad gpx" });
		await footprintStore.getState().retry();
		expect(footprintStore.getState().status).toBe("preview");
	});

	it("rejects files while idle and ignores select while reading", async () => {
		footprintStore.getState().rejectFile("太大");
		expect(footprintStore.getState().rejection).toBe("太大");
		let finish: () => void = () => {};
		setFootprintParseFn(
			() =>
				new Promise((resolve) => {
					finish = () => resolve(preview);
				}),
		);
		const first = footprintStore.getState().selectFile(new File(["a"], "a.gpx"));
		await footprintStore.getState().selectFile(new File(["b"], "b.gpx"));
		finish();
		await first;
		expect(footprintStore.getState().fileName).toBe("a.gpx");
	});

	it("uploads from the worker session without requiring the plan on the page", async () => {
		setFootprintParseFn(async () => preview);
		setFootprintUploadFn(async (_fileName, target, onProgress) => {
			expect(target).toBe("local");
			const receipt = {
				sessionId: "s1",
				status: "complete" as const,
				committedDays: 1,
				committedPoints: 12,
				insertedDays: 1,
				updatedDays: 0,
				unchangedDays: 0,
			};
			onProgress({ ...receipt, status: "running" });
			return receipt;
		});
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState()).toMatchObject({
			status: "success",
			receipt: { committedDays: 1, committedPoints: 12 },
		});
	});

	it("uses the default upload path when no session exists", async () => {
		setFootprintParseFn(async () => preview);
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState().error).toBe("没有可提交的解析结果。");
	});

	it("ignores extra work while busy", async () => {
		let finish: () => void = () => {};
		setFootprintParseFn(
			() =>
				new Promise((resolve) => {
					finish = () => resolve(preview);
				}),
		);
		const pending = footprintStore.getState().selectFile(new File(["a"], "a.gpx"));
		footprintStore.getState().rejectFile("nope");
		expect(footprintStore.getState().rejection).toBeNull();
		finish();
		await pending;
		footprintStore.setState({ target: "local" });
		setFootprintUploadFn(
			() =>
				new Promise((resolve) => {
					finish = () =>
						resolve({
							sessionId: "s",
							status: "complete",
							committedDays: 1,
							committedPoints: 1,
							insertedDays: 1,
							updatedDays: 0,
							unchangedDays: 0,
						});
				}),
		);
		const uploading = footprintStore.getState().startUpload();
		await footprintStore.getState().startUpload();
		finish();
		await uploading;
	});

	it("requires preview and target before upload", async () => {
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState().error).toBe("请先完成解析预览。");
		setFootprintParseFn(async () => preview);
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState().error).toBe("无法确认当前数据环境。");
	});

	it("retries a failed upload without re-parsing", async () => {
		const upload = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce({
			sessionId: "s1",
			status: "complete",
			committedDays: 1,
			committedPoints: 12,
			insertedDays: 1,
			updatedDays: 0,
			unchangedDays: 0,
		});
		setFootprintParseFn(async () => preview);
		setFootprintUploadFn(upload);
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState().status).toBe("error");
		await footprintStore.getState().retry();
		expect(upload).toHaveBeenCalledTimes(2);
		expect(footprintStore.getState().status).toBe("success");
		await footprintStore.getState().clear();
		expect(footprintStore.getState().preview).toBeNull();
	});

	it("treats upload abort as cancellation", async () => {
		setFootprintParseFn(async () => preview);
		setFootprintUploadFn(async () => {
			throw abortError();
		});
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		await footprintStore.getState().startUpload();
		expect(footprintStore.getState().status).toBe("cancelled");
	});

	it("cancels an in-flight upload", async () => {
		setFootprintParseFn(async () => preview);
		setFootprintUploadFn((_fileName, _target, _onProgress, signal) => {
			return new Promise((_, reject) => {
				signal?.addEventListener("abort", () => reject(abortError()));
			});
		});
		footprintStore.setState({ target: "local" });
		await footprintStore.getState().selectFile(new File(["gpx"], "track.gpx"));
		const pending = footprintStore.getState().startUpload();
		footprintStore.getState().cancel();
		await pending;
		expect(footprintStore.getState().status).toBe("cancelled");
		footprintStore.getState().cancel();
		await footprintStore.getState().reset();
		await footprintStore.getState().retry();
		expect(footprintStore.getState().error).toBe("请选择 GPX 文件。");
	});
});
