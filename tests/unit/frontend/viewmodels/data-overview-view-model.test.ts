import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/http", async () => {
	const actual = await vi.importActual<typeof import("../../../../src/services/http")>(
		"../../../../src/services/http",
	);
	return {
		...actual,
		apiGet: vi.fn(),
	};
});

import type { DataOverview, ProviderOverview } from "../../../../src/models/data-management";
import { ApiError, apiGet } from "../../../../src/services/http";
import {
	compareProviders,
	coverageCellLabel,
	dataOverviewStore,
	dataTargetLabel,
	formatOverviewMetric,
	groupCoverageMonths,
	importChannelLabel,
	monthlyRecordCounts,
	storageLabel,
	summarizeProviders,
	timelineDayHref,
	utcDayKey,
} from "../../../../src/viewmodels/data-overview-view-model";

const apiGetMock = vi.mocked(apiGet);

const overview: DataOverview = {
	target: "local",
	computedAt: "2026-09-14T00:00:00Z",
	providers: [
		{
			id: "footprint",
			name: "Footprint",
			storage: "daily-json",
			coverageDays: 2,
			recordCount: 10,
			dataRows: 2,
			payloadBytes: 2048,
			firstAt: "2026-09-01T00:00:00Z",
			lastAt: "2026-09-13T12:00:00Z",
			lastImportedAt: "2026-09-14T01:00:00Z",
			lastChangedAt: "2026-09-13T12:00:00Z",
			lastImportChannel: "web",
			coverage: [
				{ utcDay: Date.UTC(2026, 8, 1), recordCount: 4 },
				{ utcDay: Date.UTC(2026, 8, 13), recordCount: 6 },
			],
		},
	],
};

function emptyProvider(overrides: Partial<ProviderOverview> = {}): ProviderOverview {
	return {
		id: "journal",
		name: "日记",
		storage: "events",
		coverageDays: 0,
		recordCount: 0,
		dataRows: 0,
		payloadBytes: 0,
		firstAt: null,
		lastAt: null,
		lastImportedAt: null,
		lastChangedAt: null,
		lastImportChannel: null,
		coverage: [],
		...overrides,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("data overview helpers", () => {
	it("labels target and storage without implementation terms", () => {
		expect(dataTargetLabel("production")).toContain("生产");
		expect(dataTargetLabel("test")).toContain("测试");
		expect(dataTargetLabel("local")).toContain("本机");
		expect(storageLabel("daily-json")).toBe("按 UTC 日保存");
		expect(storageLabel("events")).toBe("按条保存");
		expect(utcDayKey(Date.UTC(2026, 8, 13))).toBe("2026-09-13");
		expect(timelineDayHref(Date.UTC(2026, 8, 13))).toBe("/?day=2026-09-13");
		expect(coverageCellLabel(Date.UTC(2026, 8, 13), 6)).toBe("2026-09-13 UTC，6 点");
		expect(coverageCellLabel(Date.UTC(2026, 8, 13), 6, "apple-health")).toBe(
			"2026-09-13 UTC，6 条记录",
		);
		expect(importChannelLabel("web")).toBe("网页");
		expect(importChannelLabel("cli")).toBe("本机");
		expect(importChannelLabel(null)).toBe("尚未导入");
	});

	it("builds compact UTC month grids with missing days unfilled", () => {
		const months = groupCoverageMonths(overview.providers[0]?.coverage ?? []);
		expect(months).toHaveLength(1);
		expect(months[0]?.label).toBe("2026年9月");
		const filled = months[0]?.cells.filter((cell) => cell.filled) ?? [];
		expect(filled).toHaveLength(2);
		expect(filled[1]?.recordCount).toBe(6);
		expect(months[0]?.label).toContain("2026");
		expect(months[0]?.cells.length).toBeGreaterThan(30);
	});

	it("orders UTC months across years and keeps the leap day navigable", () => {
		const months = groupCoverageMonths([
			{ utcDay: Date.UTC(2025, 0, 1), recordCount: 2 },
			{ utcDay: Date.UTC(2024, 1, 29), recordCount: 7 },
			{ utcDay: Date.UTC(2024, 11, 31), recordCount: 3 },
		]);
		expect(months.map((month) => month.key)).toEqual(["2024-02", "2024-12", "2025-01"]);
		const february = months[0];
		expect(february?.cells.filter((cell) => cell.utcDay === null)).toHaveLength(3);
		expect(february?.cells.filter((cell) => cell.utcDay !== null)).toHaveLength(29);
		const leapDay = february?.cells.at(-1);
		expect(leapDay).toMatchObject({ utcDay: Date.UTC(2024, 1, 29), filled: true, recordCount: 7 });
		expect(timelineDayHref(leapDay?.utcDay ?? 0)).toBe("/?day=2024-02-29");
		expect(groupCoverageMonths([])).toEqual([]);
	});
});

describe("data overview projections", () => {
	it("unions actual UTC coverage without adding overlap or filling calendar gaps", () => {
		const providers = [
			...overview.providers,
			emptyProvider({
				id: "apple-health",
				name: "Apple Health",
				coverageDays: 2,
				recordCount: 14,
				dataRows: 14,
				payloadBytes: 512,
				coverage: [
					{ utcDay: Date.UTC(2026, 8, 1), recordCount: 8 },
					{ utcDay: Date.UTC(2026, 8, 2), recordCount: 6 },
				],
			}),
			emptyProvider(),
		];
		const before = structuredClone(providers);
		const result = summarizeProviders(providers);
		expect(result).toMatchObject({
			coverageDays: 3,
			recordCount: 24,
			dataRows: 16,
			payloadBytes: 2560,
		});
		expect(result.importedProviders.map((provider) => provider.id)).toEqual([
			"footprint",
			"apple-health",
		]);
		expect(providers).toEqual(before);
	});

	it("recognizes fixed, all-zero provider lists as empty rather than imported", () => {
		const providers = [
			emptyProvider({ id: "footprint", name: "Footprint", storage: "daily-json" }),
			emptyProvider({ id: "apple-health" }),
			emptyProvider({ id: "pixiu" }),
			emptyProvider(),
		];
		const empty = {
			coverageDays: 0,
			recordCount: 0,
			dataRows: 0,
			payloadBytes: 0,
			importedProviders: [],
		};
		expect(summarizeProviders(providers)).toEqual(empty);
		expect(summarizeProviders([])).toEqual(empty);
		expect(compareProviders(providers, "dataRows").data.map((provider) => provider.value)).toEqual([
			0, 0, 0, 0,
		]);
		expect(compareProviders([], "coverageDays")).toEqual({ data: [], summary: "" });
	});

	it("keeps a saved data row visible even when its record counter is zero", () => {
		const provider = emptyProvider({ dataRows: 1 });
		expect(summarizeProviders([provider]).importedProviders).toEqual([provider]);
	});

	it.each([
		["coverageDays", 2, "2 天"],
		["recordCount", 10, "10 条"],
		["dataRows", 2, "2 行"],
		["payloadBytes", 2048, "2.0 KB"],
	] as const)(
		"compares raw %s values with an accurate textual alternative",
		(metric, value, label) => {
			const result = compareProviders(overview.providers, metric);
			expect(result.data).toEqual([{ id: "footprint", name: "Footprint", value }]);
			expect(result.summary).toBe(`Footprint：${label}`);
			expect(formatOverviewMetric(value, metric)).toBe(label);
		},
	);

	it("formats large counts without rounding or converting the underlying chart value", () => {
		const providers = [emptyProvider({ recordCount: 670191, payloadBytes: 27719570 })];
		expect(formatOverviewMetric(670191, "recordCount")).toBe("670,191 条");
		expect(compareProviders(providers, "payloadBytes").data[0]?.value).toBe(27719570);
		expect(formatOverviewMetric(27719570, "payloadBytes")).toBe("26.4 MB");
	});
});

describe("monthly record history", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("keeps year, month and leap-day boundaries in UTC despite the local timezone", () => {
		vi.stubEnv("TZ", "America/Los_Angeles");
		const result = monthlyRecordCounts([
			emptyProvider({
				coverage: [
					{ utcDay: Date.UTC(2023, 11, 31), recordCount: 1 },
					{ utcDay: Date.UTC(2024, 0, 1), recordCount: 2 },
					{ utcDay: Date.UTC(2024, 1, 29), recordCount: 3 },
					{ utcDay: Date.UTC(2024, 2, 1), recordCount: 4 },
				],
			}),
		]);
		expect(result.data).toEqual([
			{ month: "2023-12", recordCount: 1 },
			{ month: "2024-01", recordCount: 2 },
			{ month: "2024-02", recordCount: 3 },
			{ month: "2024-03", recordCount: 4 },
		]);
	});

	it("sorts coverage and fills only missing months between the first and last month", () => {
		const result = monthlyRecordCounts([
			emptyProvider({
				coverage: [
					{ utcDay: Date.UTC(2025, 2, 1), recordCount: 7 },
					{ utcDay: Date.UTC(2024, 10, 30), recordCount: 3 },
					{ utcDay: Date.UTC(2024, 10, 1), recordCount: 2 },
				],
			}),
		]);
		expect(result.data).toEqual([
			{ month: "2024-11", recordCount: 5 },
			{ month: "2024-12", recordCount: 0 },
			{ month: "2025-01", recordCount: 0 },
			{ month: "2025-02", recordCount: 0 },
			{ month: "2025-03", recordCount: 7 },
		]);
		expect(result.summary).toBe(
			"2024-11：5 条；2024-12：0 条；2025-01：0 条；2025-02：0 条；2025-03：7 条",
		);
	});

	it("adds overlapping providers' records while coverage still counts each UTC day once", () => {
		const providers = [
			emptyProvider({
				id: "footprint",
				recordCount: 10,
				dataRows: 2,
				coverage: [
					{ utcDay: Date.UTC(2024, 0, 31), recordCount: 3 },
					{ utcDay: Date.UTC(2024, 1, 29), recordCount: 7 },
				],
			}),
			emptyProvider({
				id: "apple-health",
				recordCount: 7,
				dataRows: 7,
				coverage: [
					{ utcDay: Date.UTC(2024, 0, 31), recordCount: 5 },
					{ utcDay: Date.UTC(2024, 2, 1), recordCount: 2 },
				],
			}),
		];
		const before = structuredClone(providers);
		expect(monthlyRecordCounts(providers).data).toEqual([
			{ month: "2024-01", recordCount: 8 },
			{ month: "2024-02", recordCount: 7 },
			{ month: "2024-03", recordCount: 2 },
		]);
		expect(summarizeProviders(providers)).toMatchObject({ coverageDays: 3, recordCount: 17 });
		expect(providers).toEqual(before);
	});

	it("uses actual daily coverage counts for interval records spanning different months", () => {
		const providers = [
			emptyProvider({
				recordCount: 1,
				dataRows: 1,
				coverage: [
					{ utcDay: Date.UTC(2026, 3, 30), recordCount: 1 },
					{ utcDay: Date.UTC(2026, 4, 1), recordCount: 1 },
				],
			}),
		];
		expect(monthlyRecordCounts(providers).data).toEqual([
			{ month: "2026-04", recordCount: 1 },
			{ month: "2026-05", recordCount: 1 },
		]);
		expect(summarizeProviders(providers).recordCount).toBe(1);
	});

	it("returns an empty history when coverage is absent rather than inventing a range", () => {
		expect(monthlyRecordCounts([])).toEqual({ data: [], summary: "" });
		expect(
			monthlyRecordCounts([
				emptyProvider({ firstAt: "2021-01-01T00:00:00Z", lastAt: "2026-09-14T00:00:00Z" }),
				emptyProvider({ id: "footprint" }),
			]),
		).toEqual({ data: [], summary: "" });
	});
});

describe("dataOverviewStore", () => {
	beforeEach(() => {
		dataOverviewStore.getState().reset();
		apiGetMock.mockReset();
	});

	it("loads overview and target together", async () => {
		apiGetMock.mockImplementation(async (path: string) => {
			if (path === "/api/data/overview") {
				return overview;
			}
			return { target: "local" };
		});
		await dataOverviewStore.getState().load();
		expect(dataOverviewStore.getState()).toMatchObject({
			status: "ready",
			target: "local",
			overview,
		});
		expect(apiGetMock).toHaveBeenCalledTimes(2);
	});

	it("changes the comparison without requesting data and resets its selection", () => {
		dataOverviewStore.getState().setMetric("payloadBytes");
		expect(dataOverviewStore.getState().metric).toBe("payloadBytes");
		expect(apiGetMock).not.toHaveBeenCalled();
		dataOverviewStore.getState().reset();
		expect(dataOverviewStore.getState().metric).toBe("coverageDays");
	});

	it("marks expiry", async () => {
		apiGetMock.mockRejectedValue(new ApiError(401, "unauthorized", "expired"));
		await dataOverviewStore.getState().load();
		expect(dataOverviewStore.getState()).toMatchObject({ status: "error", expired: true });
	});

	it("ignores aborted loads", async () => {
		apiGetMock.mockRejectedValue(abortError());
		await dataOverviewStore.getState().load();
		expect(dataOverviewStore.getState().status).toBe("loading");
	});

	it("retries", async () => {
		dataOverviewStore.getState().setMetric("recordCount");
		apiGetMock.mockRejectedValue(new Error("down"));
		await dataOverviewStore.getState().load();
		apiGetMock.mockResolvedValue(overview);
		apiGetMock.mockImplementation(async (path: string) => {
			if (path === "/api/data/overview") {
				return overview;
			}
			return { target: "production" };
		});
		await dataOverviewStore.getState().retry();
		expect(dataOverviewStore.getState().target).toBe("production");
		expect(dataOverviewStore.getState().metric).toBe("recordCount");
	});

	it("preserves the last snapshot and target when a refresh fails", async () => {
		dataOverviewStore.setState({ overview, target: "local", status: "ready" });
		apiGetMock.mockRejectedValue(new Error("offline"));
		await dataOverviewStore.getState().load();
		expect(dataOverviewStore.getState()).toMatchObject({
			overview,
			target: "local",
			status: "error",
			error: "offline",
			expired: false,
		});
	});

	it.each(["resolve", "reject"] as const)(
		"ignores a superseded request that later %ss",
		async (outcome) => {
			const pending = deferred<DataOverview>();
			apiGetMock.mockImplementationOnce(() => pending.promise);
			apiGetMock.mockResolvedValueOnce({ target: "local" });
			const first = dataOverviewStore.getState().load();
			const signal = apiGetMock.mock.calls[0]?.[2];
			const latest: DataOverview = {
				...overview,
				target: "production",
				computedAt: "2026-09-15T00:00:00Z",
			};
			apiGetMock.mockImplementation(async (path: string) =>
				path === "/api/data/overview" ? latest : { target: "production" },
			);
			await dataOverviewStore.getState().load();
			expect(signal?.aborted).toBe(true);
			if (outcome === "resolve") {
				pending.resolve(overview);
			} else {
				pending.reject(new Error("old failure"));
			}
			await first;
			expect(dataOverviewStore.getState()).toMatchObject({
				overview: latest,
				target: "production",
				status: "ready",
				error: null,
			});
		},
	);

	it("reset cancels loading and prevents a late response from repopulating the page", async () => {
		const pending = deferred<DataOverview>();
		apiGetMock.mockImplementationOnce(() => pending.promise);
		apiGetMock.mockResolvedValueOnce({ target: "local" });
		const loading = dataOverviewStore.getState().load();
		const signal = apiGetMock.mock.calls[0]?.[2];
		dataOverviewStore.getState().reset();
		expect(signal?.aborted).toBe(true);
		pending.resolve(overview);
		await loading;
		expect(dataOverviewStore.getState()).toMatchObject({
			overview: null,
			target: null,
			status: "idle",
		});
	});
});
