import { afterEach, describe, expect, it, vi } from "vitest";
import { postImportBatch } from "../../../../src/services/imports-service";
import { importRecordFixture, jsonResponse, stubFetch } from "../helpers";

describe("postImportBatch", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("posts a source batch", async () => {
		const records = [importRecordFixture()];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(_input)).toBe("/api/imports");
			expect(init?.body).toBe(JSON.stringify({ source: "apple-health", records }));
			return jsonResponse(200, { data: { accepted: 1 } });
		});
		stubFetch(fetchMock);
		await expect(postImportBatch("apple-health", records)).resolves.toEqual({ accepted: 1 });
	});
});
