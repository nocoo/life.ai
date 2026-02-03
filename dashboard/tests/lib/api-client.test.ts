/**
 * Tests for API client
 */

import { describe, expect, test, mock, afterEach } from "bun:test";
import {
  fetchAppleHealthData,
  fetchFootprintData,
  fetchPixiuData,
  fetchAllDayData,
} from "@/lib/api-client";

describe("API Client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchAppleHealthData", () => {
    test("fetches apple health data successfully", async () => {
      const mockData = {
        date: "2024-01-15",
        records: [],
        workouts: [],
        activitySummary: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      ) as unknown as typeof fetch;

      const result = await fetchAppleHealthData(new Date("2024-01-15"));

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/day/applehealth?date=2024-01-15"
      );
    });

    test("throws on HTTP error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Not Found", { status: 404, statusText: "Not Found" })
        )
      ) as unknown as typeof fetch;

      await expect(
        fetchAppleHealthData(new Date("2024-01-15"))
      ).rejects.toThrow("Failed to fetch Apple Health data: Not Found");
    });

    test("throws on API error response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: false, error: "Database error" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      ) as unknown as typeof fetch;

      await expect(
        fetchAppleHealthData(new Date("2024-01-15"))
      ).rejects.toThrow("Database error");
    });
  });

  describe("fetchFootprintData", () => {
    test("fetches footprint data successfully", async () => {
      const mockData = {
        date: "2024-01-15",
        trackPoints: [],
        dayAgg: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      ) as unknown as typeof fetch;

      const result = await fetchFootprintData(new Date("2024-01-15"));

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/day/footprint?date=2024-01-15"
      );
    });

    test("throws on HTTP error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          })
        )
      ) as unknown as typeof fetch;

      await expect(fetchFootprintData(new Date("2024-01-15"))).rejects.toThrow(
        "Failed to fetch Footprint data: Internal Server Error"
      );
    });
  });

  describe("fetchPixiuData", () => {
    test("fetches pixiu data successfully", async () => {
      const mockData = {
        date: "2024-01-15",
        transactions: [],
        dayAgg: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      ) as unknown as typeof fetch;

      const result = await fetchPixiuData(new Date("2024-01-15"));

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/day/pixiu?date=2024-01-15"
      );
    });

    test("throws on missing data", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      ) as unknown as typeof fetch;

      await expect(fetchPixiuData(new Date("2024-01-15"))).rejects.toThrow(
        "Failed to fetch Pixiu data"
      );
    });
  });

  describe("fetchAllDayData", () => {
    test("fetches all data in parallel", async () => {
      const mockAppleHealth = {
        date: "2024-01-15",
        records: [],
        workouts: [],
        activitySummary: null,
      };
      const mockFootprint = {
        date: "2024-01-15",
        trackPoints: [],
        dayAgg: null,
      };
      const mockPixiu = {
        date: "2024-01-15",
        transactions: [],
        dayAgg: null,
      };

      globalThis.fetch = mock((url: string) => {
        if (url.includes("applehealth")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, data: mockAppleHealth }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (url.includes("footprint")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, data: mockFootprint }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (url.includes("pixiu")) {
          return Promise.resolve(
            new Response(JSON.stringify({ success: true, data: mockPixiu }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      }) as unknown as typeof fetch;

      const result = await fetchAllDayData(new Date("2024-01-15"));

      expect(result.appleHealth).toEqual(mockAppleHealth);
      expect(result.footprint).toEqual(mockFootprint);
      expect(result.pixiu).toEqual(mockPixiu);
    });

    test("throws if any fetch fails", async () => {
      globalThis.fetch = mock((url: string) => {
        if (url.includes("applehealth")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { date: "2024-01-15", records: [], workouts: [], activitySummary: null },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (url.includes("footprint")) {
          return Promise.resolve(
            new Response("Error", { status: 500, statusText: "Server Error" })
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { date: "2024-01-15", transactions: [], dayAgg: null },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }) as unknown as typeof fetch;

      await expect(fetchAllDayData(new Date("2024-01-15"))).rejects.toThrow();
    });
  });
});
