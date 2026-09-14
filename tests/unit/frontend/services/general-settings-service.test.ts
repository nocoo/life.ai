import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneralSettings } from "../../../../src/models/general-settings";
import {
	fetchGeneralSettings,
	saveGeneralSettings,
} from "../../../../src/services/general-settings-service";
import { jsonResponse, stubFetch } from "../helpers";

describe("general-settings service", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches general settings via GET /api/settings/general", async () => {
		const settings: GeneralSettings = {
			places: [
				{
					id: "place-1",
					label: "家",
					latitude: 31.23,
					longitude: 121.47,
					radiusMeters: 300,
				},
			],
			routine: {
				bedtime: "23:30",
				wakeTime: "07:30",
				timeZone: "Asia/Shanghai",
			},
		};

		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/settings/general");
				return jsonResponse(200, { data: settings });
			}),
		);

		await expect(fetchGeneralSettings()).resolves.toEqual(settings);
	});

	it("saves general settings via PUT /api/settings/general", async () => {
		const settings: GeneralSettings = {
			places: [],
			routine: null,
		};

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/settings/general");
			expect(init?.method).toBe("PUT");
			expect(init?.body).toBe(JSON.stringify(settings));
			return jsonResponse(200, { data: settings });
		});

		stubFetch(fetchMock);

		await expect(saveGeneralSettings(settings)).resolves.toEqual(settings);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
