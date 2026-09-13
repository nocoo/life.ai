import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, sessionFixture } from "../helpers";

vi.mock("../../../../src/services/session-service", () => ({
	fetchSession: vi.fn(),
}));

import { ApiError } from "../../../../src/services/http";
import { fetchSession } from "../../../../src/services/session-service";
import {
	sessionDisplayName,
	sessionSecondaryText,
	sessionStore,
} from "../../../../src/viewmodels/session-view-model";

const fetchSessionMock = vi.mocked(fetchSession);

describe("sessionStore", () => {
	beforeEach(() => {
		sessionStore.getState().reset();
		fetchSessionMock.mockReset();
	});

	it("loads an access session", async () => {
		fetchSessionMock.mockResolvedValue(sessionFixture());
		await sessionStore.getState().load();
		expect(sessionStore.getState()).toMatchObject({
			status: "ready",
			error: null,
			session: sessionFixture(),
		});
	});

	it("keeps a recoverable error", async () => {
		fetchSessionMock.mockRejectedValue(new Error("down"));
		await sessionStore.getState().load();
		expect(sessionStore.getState()).toMatchObject({
			status: "error",
			error: "down",
			expired: false,
		});
	});

	it("marks Access expiry without retrying as a normal load", async () => {
		fetchSessionMock.mockRejectedValue(new ApiError(401, "unauthorized", "expired"));
		await sessionStore.getState().load();
		expect(sessionStore.getState()).toMatchObject({
			status: "error",
			expired: true,
			session: null,
		});
	});

	it("ignores aborted loads", async () => {
		fetchSessionMock.mockRejectedValue(abortError());
		await sessionStore.getState().load();
		expect(sessionStore.getState().status).toBe("loading");
		expect(sessionStore.getState().error).toBeNull();
	});

	it("ignores stale responses", async () => {
		let release: () => void = () => {};
		const first = new Promise<ReturnType<typeof sessionFixture>>((resolve) => {
			release = () => resolve(sessionFixture({ email: "old@hexly.ai" }));
		});
		fetchSessionMock
			.mockReturnValueOnce(first)
			.mockResolvedValueOnce(sessionFixture({ email: "new@hexly.ai" }));
		const pending = sessionStore.getState().load();
		await sessionStore.getState().load();
		release();
		await pending;
		expect(sessionStore.getState().session?.email).toBe("new@hexly.ai");
	});
});

describe("session labels", () => {
	it("describes missing, local and access sessions", () => {
		expect(sessionDisplayName(null)).toBe("未登录");
		expect(sessionSecondaryText(null)).toBe("");
		expect(sessionDisplayName(sessionFixture({ mode: "local", email: null }))).toBe("本地模式");
		expect(sessionSecondaryText(sessionFixture({ mode: "local" }))).toBe("本地开发");
		expect(sessionDisplayName(sessionFixture({ mode: "local", email: "dev@local" }))).toBe(
			"dev@local",
		);
		expect(sessionDisplayName(sessionFixture({ email: null }))).toBe("已认证");
		expect(sessionDisplayName(sessionFixture())).toBe("zheng@hexly.ai");
		expect(sessionSecondaryText(sessionFixture())).toBe("access-subject");
	});
});
