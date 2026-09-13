import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, sessionFixture } from "../helpers";

vi.mock("../../../../src/services/session-service", () => ({
	fetchSession: vi.fn(),
}));

import type { Session } from "../../../../src/models/types";
import { ApiError } from "../../../../src/services/http";
import { fetchSession } from "../../../../src/services/session-service";
import {
	sessionAvatarUrl,
	sessionDisplayName,
	sessionInitials,
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

function profile(overrides: Partial<Session> = {}): Session {
	return { ...sessionFixture(), ...overrides };
}

describe("session labels", () => {
	it("prefers profile name, then email, and never shows the subject", () => {
		expect(sessionDisplayName(null)).toBe("未登录");
		expect(sessionSecondaryText(null)).toBe("");
		expect(sessionAvatarUrl(null)).toBeNull();
		expect(sessionDisplayName(profile({ name: "  Li Zheng  " }))).toBe("Li Zheng");
		expect(sessionSecondaryText(profile({ name: "Li Zheng" }))).toBe("zheng@hexly.ai");
		expect(sessionDisplayName(profile({ name: "   ", email: "dev@local" }))).toBe("dev@local");
		expect(sessionDisplayName(profile({ mode: "local", email: null, name: null }))).toBe(
			"本地模式",
		);
		expect(sessionSecondaryText(profile({ mode: "local", email: null }))).toBe("");
		expect(sessionDisplayName(profile({ email: null, name: null }))).toBe("已认证");
		expect(sessionSecondaryText(profile())).toBe("zheng@hexly.ai");
		expect(sessionSecondaryText(profile())).not.toBe("access-subject");
		expect(sessionAvatarUrl(profile({ avatar: " https://hexly.ai/me.png " }))).toBe(
			"https://hexly.ai/me.png",
		);
		expect(sessionAvatarUrl(profile({ avatar: "  " }))).toBeNull();
		expect(sessionInitials("Li Zheng")).toBe("LZ");
		expect(sessionInitials("  ")).toBe("?");
	});
});
