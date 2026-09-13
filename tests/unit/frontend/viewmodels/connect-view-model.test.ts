import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, connectFixture, createdConnectFixture } from "../helpers";

vi.mock("../../../../src/services/connects-service", () => ({
	fetchConnects: vi.fn(),
	createConnect: vi.fn(),
	revokeConnect: vi.fn(),
}));

import {
	createConnect,
	fetchConnects,
	revokeConnect,
} from "../../../../src/services/connects-service";
import {
	CONNECT_NAME_MAX,
	connectStore,
	INGEST_URL,
	validateConnectName,
} from "../../../../src/viewmodels/connect-view-model";

const fetchConnectsMock = vi.mocked(fetchConnects);
const createConnectMock = vi.mocked(createConnect);
const revokeConnectMock = vi.mocked(revokeConnect);

describe("validateConnectName", () => {
	it("requires a trimmed name within the limit", () => {
		expect(validateConnectName("  ")).toBe("请输入令牌名称。");
		expect(validateConnectName("x".repeat(CONNECT_NAME_MAX + 1))).toContain("最多");
		expect(validateConnectName("Mac mini")).toBeNull();
	});
});

describe("connectStore", () => {
	beforeEach(() => {
		connectStore.getState().reset();
		fetchConnectsMock.mockReset();
		createConnectMock.mockReset();
		revokeConnectMock.mockReset();
	});

	it("loads connects", async () => {
		fetchConnectsMock.mockResolvedValue([connectFixture()]);
		await connectStore.getState().load();
		expect(connectStore.getState()).toMatchObject({
			status: "ready",
			connects: [connectFixture()],
		});
	});

	it("surfaces list errors and retries", async () => {
		fetchConnectsMock.mockRejectedValue(new Error("nope"));
		await connectStore.getState().load();
		expect(connectStore.getState()).toMatchObject({ status: "error", error: "nope" });
		fetchConnectsMock.mockResolvedValue([]);
		await connectStore.getState().retry();
		expect(connectStore.getState().status).toBe("ready");
	});

	it("ignores aborted list loads", async () => {
		fetchConnectsMock.mockRejectedValue(abortError());
		await connectStore.getState().load();
		expect(connectStore.getState().status).toBe("loading");
	});

	it("validates before create", async () => {
		await connectStore.getState().create();
		expect(createConnectMock).not.toHaveBeenCalled();
		expect(connectStore.getState().nameError).toBe("请输入令牌名称。");
	});

	it("keeps the created secret only in memory", async () => {
		createConnectMock.mockResolvedValue(createdConnectFixture());
		connectStore.getState().setNameDraft("  Mac mini  ");
		await connectStore.getState().create();
		expect(connectStore.getState().createdSecret?.token).toBe("life_secret_token");
		expect(connectStore.getState().createdSecret?.curl).toContain(INGEST_URL);
		expect(connectStore.getState().nameDraft).toBe("");
		expect(connectStore.getState().connects[0]?.name).toBe("Mac mini");
		connectStore.getState().dismissSecret();
		expect(connectStore.getState().createdSecret).toBeNull();
	});

	it("does not create while a request is in flight", async () => {
		connectStore.getState().setNameDraft("Mac mini");
		let finish: () => void = () => {};
		createConnectMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = () => resolve(createdConnectFixture());
				}),
		);
		const first = connectStore.getState().create();
		await connectStore.getState().create();
		expect(createConnectMock).toHaveBeenCalledTimes(1);
		finish();
		await first;
	});

	it("maps create failures", async () => {
		connectStore.getState().setNameDraft("Mac mini");
		createConnectMock.mockRejectedValue(new Error("quota"));
		await connectStore.getState().create();
		expect(connectStore.getState()).toMatchObject({ creating: false, error: "quota" });
		createConnectMock.mockRejectedValue(abortError());
		await connectStore.getState().create();
		expect(connectStore.getState().creating).toBe(false);
	});

	it("revokes a connect in place", async () => {
		const active = connectFixture();
		fetchConnectsMock.mockResolvedValue([active]);
		await connectStore.getState().load();
		revokeConnectMock.mockResolvedValue(connectFixture({ revokedAt: "2026-09-13T04:00:00Z" }));
		await connectStore.getState().revoke(active.id);
		expect(connectStore.getState().connects[0]?.revokedAt).toBe("2026-09-13T04:00:00Z");
		expect(connectStore.getState().revokingId).toBeNull();
	});

	it("ignores empty or overlapping revoke", async () => {
		await connectStore.getState().revoke("");
		expect(revokeConnectMock).not.toHaveBeenCalled();
		connectStore.setState({ revokingId: "busy" });
		await connectStore.getState().revoke("c-1");
		expect(revokeConnectMock).not.toHaveBeenCalled();
	});

	it("maps revoke failures", async () => {
		revokeConnectMock.mockRejectedValue(new Error("conflict"));
		await connectStore.getState().revoke("c-1");
		expect(connectStore.getState()).toMatchObject({ revokingId: null, error: "conflict" });
		revokeConnectMock.mockRejectedValue(abortError());
		await connectStore.getState().revoke("c-1");
		expect(connectStore.getState().revokingId).toBeNull();
	});
});
