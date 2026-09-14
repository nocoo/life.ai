import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayContextQuery } from "../../../../src/models/day-context";
import { fetchDaySun, fetchDayWeather } from "../../../../src/services/day-context-service";
import { apiGet } from "../../../../src/services/http";

vi.mock("../../../../src/services/http", () => ({
	apiGet: vi.fn(),
}));

function sampleQuery(overrides: Partial<DayContextQuery> = {}): DayContextQuery {
	return {
		date: "2026-09-13",
		timeZone: "Asia/Shanghai",
		start: "2026-09-12T16:00:00.000Z",
		end: "2026-09-13T16:00:00.000Z",
		latitude: 31.23,
		longitude: 121.47,
		...overrides,
	};
}

describe("day-context-service (client proxy)", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls /api/context/weather with query parameters and passes abort signal", async () => {
		const mockWeather = {
			temperatureMin: 18,
			temperatureMax: 26,
			temperatureMean: 22,
			precipitationMm: 0,
			windMaxKmh: 15,
			weatherCode: 1,
			sampleCount: 24,
			expectedSamples: 24,
			complete: true,
			kind: "forecast" as const,
		};
		vi.mocked(apiGet).mockResolvedValue(mockWeather);

		const controller = new AbortController();
		const query = sampleQuery();
		const result = await fetchDayWeather(query, controller.signal);

		expect(apiGet).toHaveBeenCalledWith(
			"/api/context/weather",
			{
				date: "2026-09-13",
				timeZone: "Asia/Shanghai",
				start: "2026-09-12T16:00:00.000Z",
				end: "2026-09-13T16:00:00.000Z",
				latitude: 31.23,
				longitude: 121.47,
			},
			controller.signal,
		);
		expect(result).toEqual(mockWeather);
	});

	it("calls /api/context/sun with query parameters and passes abort signal", async () => {
		const mockSun = {
			events: [
				{ kind: "sunrise" as const, occurredAt: "2026-09-12T21:40:00.000Z" },
				{ kind: "sunset" as const, occurredAt: "2026-09-13T10:05:00.000Z" },
			],
			daylightMinutes: 745,
			status: "normal" as const,
		};
		vi.mocked(apiGet).mockResolvedValue(mockSun);

		const controller = new AbortController();
		const query = sampleQuery();
		const result = await fetchDaySun(query, controller.signal);

		expect(apiGet).toHaveBeenCalledWith(
			"/api/context/sun",
			{
				date: "2026-09-13",
				timeZone: "Asia/Shanghai",
				start: "2026-09-12T16:00:00.000Z",
				end: "2026-09-13T16:00:00.000Z",
				latitude: 31.23,
				longitude: 121.47,
			},
			controller.signal,
		);
		expect(result).toEqual(mockSun);
	});
});
