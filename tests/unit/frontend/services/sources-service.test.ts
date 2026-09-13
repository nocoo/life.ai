import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSources } from "../../../../src/services/sources-service";
import { jsonResponse, sourceFixture, stubFetch } from "../helpers";

describe("fetchSources", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads sources", async () => {
		const sources = [sourceFixture()];
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/sources");
				return jsonResponse(200, { data: sources });
			}),
		);
		await expect(fetchSources()).resolves.toEqual(sources);
	});
});
