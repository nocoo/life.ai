import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fetchAiSettings,
	fetchDaySummary,
	generateDaySummary,
	saveAiSettings,
	testSavedAiConnection,
} from "../../../../src/services/ai-service";
import { jsonResponse, stubFetch } from "../helpers";

describe("ai service", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads AI settings", async () => {
		const settings = {
			provider: "workers-ai",
			model: "@cf/qwen/qwen3-30b-a3b-fp8",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
			hasApiKey: false,
			configured: true,
		};
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/settings/ai");
				return jsonResponse(200, { data: settings });
			}),
		);
		await expect(fetchAiSettings()).resolves.toEqual(settings);
	});

	it("puts the full settings body and omits an empty key", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.method).toBe("PUT");
			expect(init?.body).toBe(
				JSON.stringify({
					provider: "workers-ai",
					model: "m",
					baseURL: "",
					sdkType: "openai",
					authType: "apiKey",
				}),
			);
			return jsonResponse(200, {
				data: {
					provider: "workers-ai",
					model: "m",
					baseURL: "",
					sdkType: "openai",
					authType: "apiKey",
					hasApiKey: false,
					configured: true,
				},
			});
		});
		stubFetch(fetchMock);
		await saveAiSettings({
			provider: "workers-ai",
			model: "m",
			baseURL: "",
			sdkType: "openai",
			authType: "apiKey",
		});
	});

	it("tests the saved configuration without a body", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/settings/ai/test");
			expect(init?.method).toBe("POST");
			expect(init?.body).toBeUndefined();
			return jsonResponse(200, {
				data: { success: true, response: "ok", provider: "workers-ai", model: "m" },
			});
		});
		stubFetch(fetchMock);
		await expect(testSavedAiConnection()).resolves.toMatchObject({ success: true });
	});

	it("gets and posts a day summary", async () => {
		const query = {
			date: "2026-09-13",
			timeZone: "UTC",
			start: "2026-09-13T00:00:00.000Z",
			end: "2026-09-14T00:00:00.000Z",
		};
		const result = { summary: null, stale: false, eventCount: 2 };
		stubFetch(
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "POST") {
					expect(init.body).toBe(JSON.stringify(query));
					return jsonResponse(200, { data: result });
				}
				expect(String(input)).toContain("/api/day-summary?");
				expect(String(input)).toContain("date=2026-09-13");
				return jsonResponse(200, { data: result });
			}),
		);
		await expect(fetchDaySummary(query)).resolves.toEqual(result);
		await expect(generateDaySummary(query)).resolves.toEqual(result);
	});
});
