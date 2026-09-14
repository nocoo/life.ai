import { beforeEach, describe, expect, it, vi } from "vitest";
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

import type { DataOverview } from "../../../../src/models/data-management";
import { ApiError, apiGet } from "../../../../src/services/http";
import {
	coverageCellLabel,
	dataOverviewStore,
	dataTargetLabel,
	groupCoverageMonths,
	storageLabel,
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
	});
});
