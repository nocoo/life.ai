import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSession } from "../../../../src/services/session-service";
import { jsonResponse, sessionFixture, stubFetch } from "../helpers";

describe("fetchSession", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads the session payload", async () => {
		const session = sessionFixture({ mode: "local", email: null });
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/session");
				return jsonResponse(200, { data: session });
			}),
		);
		await expect(fetchSession()).resolves.toEqual(session);
	});
});
