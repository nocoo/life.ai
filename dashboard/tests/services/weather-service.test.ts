import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { fetchHistoricalWeather } from "@/services/weather-service";

describe("weather-service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchHistoricalWeather", () => {
    test("fetches weather data and transforms response correctly", async () => {
      const mockResponse = {
        daily: {
          time: ["2025-12-02"],
          temperature_2m_max: [5.2],
          temperature_2m_min: [-3.1],
          temperature_2m_mean: [1.0],
          weather_code: [3],
          precipitation_sum: [0.0],
          sunrise: ["2025-12-02T07:13:00"],
          sunset: ["2025-12-02T16:52:00"],
          wind_speed_10m_max: [15.5],
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const date = new Date(2025, 11, 2); // 2025-12-02
      const result = await fetchHistoricalWeather(date);

      expect(result).toEqual({
        date: "2025-12-02",
        tempMax: 5.2,
        tempMin: -3.1,
        tempAvg: 1.0,
        weatherCode: 3,
        precipitation: 0.0,
        sunrise: "07:13",
        sunset: "16:52",
        windSpeedMax: 15.5,
      });
    });

    test("uses custom coordinates when provided", async () => {
      const mockResponse = {
        daily: {
          time: ["2025-12-02"],
          temperature_2m_max: [10.0],
          temperature_2m_min: [5.0],
          temperature_2m_mean: [7.5],
          weather_code: [0],
          precipitation_sum: [0.0],
          sunrise: ["2025-12-02T06:30:00"],
          sunset: ["2025-12-02T17:00:00"],
          wind_speed_10m_max: [10.0],
        },
      };

      let capturedUrl = "";
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);
      });

      const date = new Date(2025, 11, 2);
      await fetchHistoricalWeather(date, 31.2304, 121.4737); // Shanghai

      expect(capturedUrl).toContain("latitude=31.2304");
      expect(capturedUrl).toContain("longitude=121.4737");
    });

    test("throws error when API returns non-ok status", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      );

      const date = new Date(2025, 11, 2);
      await expect(fetchHistoricalWeather(date)).rejects.toThrow(
        "Weather API error: 500"
      );
    });

    test("throws error when no data available", async () => {
      const mockResponse = {
        daily: {
          time: [],
          temperature_2m_max: [],
          temperature_2m_min: [],
          temperature_2m_mean: [],
          weather_code: [],
          precipitation_sum: [],
          sunrise: [],
          sunset: [],
          wind_speed_10m_max: [],
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const date = new Date(2025, 11, 2);
      await expect(fetchHistoricalWeather(date)).rejects.toThrow(
        "No weather data available for this date"
      );
    });

    test("uses default Beijing coordinates when not specified", async () => {
      const mockResponse = {
        daily: {
          time: ["2025-12-02"],
          temperature_2m_max: [5.0],
          temperature_2m_min: [0.0],
          temperature_2m_mean: [2.5],
          weather_code: [2],
          precipitation_sum: [0.0],
          sunrise: ["2025-12-02T07:15:00"],
          sunset: ["2025-12-02T16:50:00"],
          wind_speed_10m_max: [12.0],
        },
      };

      let capturedUrl = "";
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);
      });

      const date = new Date(2025, 11, 2);
      await fetchHistoricalWeather(date);

      // Beijing coordinates
      expect(capturedUrl).toContain("latitude=39.9042");
      expect(capturedUrl).toContain("longitude=116.4074");
    });

    test("handles missing sunrise/sunset time format gracefully", async () => {
      const mockResponse = {
        daily: {
          time: ["2025-12-02"],
          temperature_2m_max: [5.0],
          temperature_2m_min: [0.0],
          temperature_2m_mean: [2.5],
          weather_code: [2],
          precipitation_sum: [0.0],
          sunrise: ["invalid-format"],
          sunset: ["another-invalid"],
          wind_speed_10m_max: [12.0],
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const date = new Date(2025, 11, 2);
      const result = await fetchHistoricalWeather(date);

      expect(result.sunrise).toBe("--:--");
      expect(result.sunset).toBe("--:--");
    });
  });
});
