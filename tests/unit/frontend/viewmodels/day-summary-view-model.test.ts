import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/ai-service", () => ({
	fetchAiSettings: vi.fn(),
	fetchDaySummary: vi.fn(),
	generateDaySummary: vi.fn(),
}));

import type { DayTimeline } from "../../../../src/models/types";
import {
	fetchAiSettings,
	fetchDaySummary,
	generateDaySummary,
} from "../../../../src/services/ai-service";
import { ApiError } from "../../../../src/services/http";
import {
	daySummaryStore,
	sameSummaryQuery,
	splitSummaryParagraphs,
	summaryQueryFromTimeline,
} from "../../../../src/viewmodels/day-summary-view-model";

const fetchSettings = vi.mocked(fetchAiSettings);
const fetchSummary = vi.mocked(fetchDaySummary);
const generateSummary = vi.mocked(generateDaySummary);

const query = {
	date: "2026-09-13",
	timeZone: "UTC",
	start: "2026-09-13T00:00:00.000Z",
	end: "2026-09-14T00:00:00.000Z",
};

const timeline = {
	date: query.date,
	timezone: query.timeZone,
	start: query.start,
	end: query.end,
} as DayTimeline;

describe("day summary helpers", () => {
	it("builds a query from the timeline window and splits plain paragraphs", () => {
		expect(summaryQueryFromTimeline(timeline)).toEqual(query);
		expect(splitSummaryParagraphs("第一段\n\n第二段\n\n  ")).toEqual(["第一段", "第二段"]);
		expect(splitSummaryParagraphs("")).toEqual([]);
		expect(sameSummaryQuery(null, query)).toBe(false);
		expect(sameSummaryQuery(query, query)).toBe(true);
		expect(sameSummaryQuery(query, { ...query, date: "2026-09-14" })).toBe(false);
	});
});

describe("daySummaryStore", () => {
	beforeEach(() => {
		daySummaryStore.getState().reset();
		fetchSettings.mockReset();
		fetchSummary.mockReset();
		generateSummary.mockReset();
	});

	it("loads summary and configuration together", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 3 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		expect(daySummaryStore.getState()).toMatchObject({
			status: "ready",
			configured: true,
			result: { eventCount: 3, stale: false },
		});
	});

	it("keeps the previous summary when generate fails", async () => {
		const summary = {
			...query,
			content: "旧摘要",
			provider: "workers-ai",
			model: "m",
			generatedAt: "2026-09-13T01:00:00Z",
			eventCount: 3,
			inputHash: "abc",
		};
		fetchSummary.mockResolvedValue({ summary, stale: true, eventCount: 4 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		generateSummary.mockRejectedValue(new Error("quota"));
		await daySummaryStore.getState().generate();
		expect(daySummaryStore.getState().result?.summary?.content).toBe("旧摘要");
		expect(daySummaryStore.getState().error).toBe("quota");
		expect(daySummaryStore.getState().generating).toBe(false);
	});

	it("drops a stale generate after the day changes", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 1 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		let finish: (value: { summary: null; stale: boolean; eventCount: number }) => void = () => {};
		generateSummary.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const pending = daySummaryStore.getState().generate();
		daySummaryStore.getState().abort();
		finish({ summary: null, stale: false, eventCount: 9 });
		await pending;
		expect(daySummaryStore.getState().result?.eventCount).toBe(1);
	});

	it("marks expired session errors", async () => {
		fetchSummary.mockRejectedValue(new ApiError(401, "unauthorized", "expired"));
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		expect(daySummaryStore.getState().expired).toBe(true);
	});

	it("ignores aborted loads", async () => {
		fetchSummary.mockRejectedValue(abortError());
		fetchSettings.mockRejectedValue(abortError());
		await daySummaryStore.getState().load(query);
		expect(daySummaryStore.getState().status).toBe("loading");
	});

	it("opens a revision dialog only when a diary already exists", async () => {
		fetchSummary.mockResolvedValue({
			summary: {
				...query,
				content: "旧日记",
				provider: "workers-ai",
				model: "m",
				generatedAt: "2026-09-13T01:00:00Z",
				eventCount: 2,
				inputHash: "h",
			},
			stale: false,
			eventCount: 2,
		});
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		daySummaryStore.getState().openRevision();
		expect(daySummaryStore.getState().revisionOpen).toBe(true);
		daySummaryStore.getState().setRevisionText("少写步数");
		generateSummary.mockResolvedValue({
			summary: {
				...query,
				content: "新日记",
				provider: "workers-ai",
				model: "m",
				generatedAt: "2026-09-13T02:00:00Z",
				eventCount: 2,
				inputHash: "h",
			},
			stale: false,
			eventCount: 2,
		});
		await daySummaryStore.getState().confirmRevision();
		expect(generateSummary).toHaveBeenCalledWith(query, expect.anything(), "少写步数");
		expect(daySummaryStore.getState().revisionOpen).toBe(false);
		expect(daySummaryStore.getState().result?.summary?.content).toBe("新日记");
		daySummaryStore.getState().openRevision();
		daySummaryStore.getState().closeRevision();
		expect(daySummaryStore.getState().revisionOpen).toBe(false);
		daySummaryStore.getState().reset();
		daySummaryStore.getState().openRevision();
		expect(daySummaryStore.getState().revisionOpen).toBe(false);
	});

	it("generates a summary and retries a stored query", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 2 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		generateSummary.mockResolvedValue({
			summary: {
				...query,
				content: "新摘要",
				provider: "workers-ai",
				model: "m",
				generatedAt: "2026-09-13T02:00:00Z",
				eventCount: 2,
				inputHash: "x",
			},
			stale: false,
			eventCount: 2,
		});
		await daySummaryStore.getState().generate();
		expect(daySummaryStore.getState().result?.summary?.content).toBe("新摘要");
		await daySummaryStore.getState().retry();
		expect(fetchSummary).toHaveBeenCalled();
	});

	it("does nothing without a query and ignores overlapping generate", async () => {
		await daySummaryStore.getState().generate();
		await daySummaryStore.getState().retry();
		expect(generateSummary).not.toHaveBeenCalled();
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 1 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		let finish: () => void = () => {};
		generateSummary.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = () => resolve({ summary: null, stale: false, eventCount: 1 });
				}),
		);
		const first = daySummaryStore.getState().generate();
		await daySummaryStore.getState().generate();
		expect(generateSummary).toHaveBeenCalledTimes(1);
		finish();
		await first;
	});

	it("clears the previous day and ignores its late response", async () => {
		const configured = {
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai" as const,
			authType: "apiKey" as const,
			hasApiKey: false,
			configured: true,
		};
		fetchSettings.mockResolvedValue(configured);
		const next = {
			...query,
			date: "2026-09-14",
			start: "2026-09-14T00:00:00.000Z",
			end: "2026-09-15T00:00:00.000Z",
		};
		let finishFirst: (value: {
			summary: {
				date: string;
				timeZone: string;
				start: string;
				end: string;
				content: string;
				provider: string;
				model: string;
				generatedAt: string;
				eventCount: number;
				inputHash: string;
			};
			stale: boolean;
			eventCount: number;
		}) => void = () => {};
		fetchSummary
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishFirst = resolve;
					}),
			)
			.mockResolvedValueOnce({ summary: null, stale: false, eventCount: 2 });
		const pendingFirst = daySummaryStore.getState().load(query);
		const pendingNext = daySummaryStore.getState().load(next);
		expect(daySummaryStore.getState().result).toBeNull();
		expect(daySummaryStore.getState().query?.date).toBe("2026-09-14");
		finishFirst({
			summary: {
				...query,
				content: "13日",
				provider: "workers-ai",
				model: "m",
				generatedAt: "2026-09-13T01:00:00Z",
				eventCount: 99,
				inputHash: "a",
			},
			stale: false,
			eventCount: 99,
		});
		await pendingFirst;
		await pendingNext;
		expect(daySummaryStore.getState().result?.eventCount).toBe(2);
		expect(daySummaryStore.getState().result?.summary?.content).not.toBe("13日");
	});

	it("reloads the same day after returning from imports or settings", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 1 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		fetchSummary.mockClear();
		daySummaryStore.getState().abort();
		fetchSummary.mockResolvedValueOnce({ summary: null, stale: false, eventCount: 4 });
		await daySummaryStore.getState().load(query);
		expect(fetchSummary).toHaveBeenCalledOnce();
		expect(daySummaryStore.getState().result?.eventCount).toBe(4);
	});

	it("treats generate abort as cancellation", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 1 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		generateSummary.mockRejectedValue(abortError());
		await daySummaryStore.getState().generate();
		expect(daySummaryStore.getState().generating).toBe(false);
		expect(daySummaryStore.getState().error).toBeNull();
	});

	it("does not let an old cancelled request change the new day's generation state", async () => {
		fetchSummary.mockResolvedValue({ summary: null, stale: false, eventCount: 1 });
		fetchSettings.mockResolvedValue({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		});
		await daySummaryStore.getState().load(query);
		let rejectOld: (reason: unknown) => void = () => {};
		let finishNew: (result: { summary: null; stale: boolean; eventCount: number }) => void =
			() => {};
		generateSummary.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectOld = reject;
				}),
		);
		const old = daySummaryStore.getState().generate();
		await daySummaryStore
			.getState()
			.load({ ...query, date: "2026-09-14", start: query.end, end: "2026-09-15T00:00:00Z" });
		generateSummary.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishNew = resolve;
				}),
		);
		const current = daySummaryStore.getState().generate();
		rejectOld(abortError());
		await old;
		expect(daySummaryStore.getState().generating).toBe(true);
		finishNew({ summary: null, stale: false, eventCount: 1 });
		await current;
		expect(daySummaryStore.getState().generating).toBe(false);
	});
});
