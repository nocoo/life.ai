import { describe, expect, it } from "vitest";
import { ApiError } from "../../../../src/services/http";
import {
	GENERIC_ERROR_MESSAGE,
	isAuthFailure,
	toErrorMessage,
} from "../../../../src/viewmodels/errors";
import { abortError } from "../helpers";

describe("toErrorMessage", () => {
	it("maps known error types", () => {
		expect(toErrorMessage(abortError())).toBe("已取消");
		expect(toErrorMessage(new ApiError(400, "bad", "服务拒绝"))).toBe("服务拒绝");
		expect(toErrorMessage(new TypeError("Failed to fetch"))).toBe("无法连接服务器，请重试。");
		expect(toErrorMessage(new Error("boom"))).toBe("boom");
		expect(toErrorMessage(new Error("   "))).toBe(GENERIC_ERROR_MESSAGE);
		expect(toErrorMessage("nope")).toBe(GENERIC_ERROR_MESSAGE);
	});
});

describe("isAuthFailure", () => {
	it("detects expired Access responses", () => {
		expect(isAuthFailure(new ApiError(401, "unauthorized", "expired"))).toBe(true);
		expect(isAuthFailure(new ApiError(403, "forbidden", "denied"))).toBe(true);
		expect(isAuthFailure(new ApiError(500, "bad", "down"))).toBe(false);
		expect(isAuthFailure(new Error("down"))).toBe(false);
	});
});
