import { describe, expect, test, afterEach, vi } from "vitest";
import {
  fetchAppleHealthData,
  fetchFootprintData,
  fetchPixiuData,
  fetchMonthAppleHealthData,
  fetchMonthFootprintData,
  fetchMonthPixiuData,
  fetchYearAppleHealthData,
  fetchYearFootprintData,
  fetchYearPixiuData,
  fetchAllMonthData,
  fetchAllYearData,
} from "@/lib/api-client";

const ok = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

const apiError = (error?: string) =>
  Promise.resolve(
    new Response(JSON.stringify({ success: false, ...(error ? { error } : {}) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

const httpError = () =>
  Promise.resolve(new Response("Server Error", { status: 500, statusText: "Server Error" }));

describe("API Client extras", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("day fetchers throw with default message when api error has no error string", async () => {
    globalThis.fetch = vi.fn(() => apiError()) as unknown as typeof fetch;
    await expect(fetchAppleHealthData(new Date("2024-01-15"))).rejects.toThrow(
      "Failed to fetch Apple Health data"
    );
    await expect(fetchFootprintData(new Date("2024-01-15"))).rejects.toThrow(
      "Failed to fetch Footprint data"
    );
    await expect(fetchPixiuData(new Date("2024-01-15"))).rejects.toThrow(
      "Failed to fetch Pixiu data"
    );
  });

  test("month fetchers: success, http error, api error (with and without message)", async () => {
    const data = { month: "2024-01", days: [] };
    globalThis.fetch = vi.fn(() => ok(data)) as unknown as typeof fetch;
    await expect(fetchMonthAppleHealthData("2024-01")).resolves.toBeDefined();
    await expect(fetchMonthFootprintData("2024-01")).resolves.toBeDefined();
    await expect(fetchMonthPixiuData("2024-01")).resolves.toBeDefined();

    globalThis.fetch = vi.fn(() => httpError()) as unknown as typeof fetch;
    await expect(fetchMonthAppleHealthData("2024-01")).rejects.toThrow(
      "Failed to fetch Apple Health month data"
    );
    await expect(fetchMonthFootprintData("2024-01")).rejects.toThrow(
      "Failed to fetch Footprint month data"
    );
    await expect(fetchMonthPixiuData("2024-01")).rejects.toThrow(
      "Failed to fetch Pixiu month data"
    );

    globalThis.fetch = vi.fn(() => apiError("DB down")) as unknown as typeof fetch;
    await expect(fetchMonthAppleHealthData("2024-01")).rejects.toThrow("DB down");
    await expect(fetchMonthFootprintData("2024-01")).rejects.toThrow("DB down");
    await expect(fetchMonthPixiuData("2024-01")).rejects.toThrow("DB down");

    globalThis.fetch = vi.fn(() => apiError()) as unknown as typeof fetch;
    await expect(fetchMonthAppleHealthData("2024-01")).rejects.toThrow(
      "Failed to fetch Apple Health month data"
    );
    await expect(fetchMonthFootprintData("2024-01")).rejects.toThrow(
      "Failed to fetch Footprint month data"
    );
    await expect(fetchMonthPixiuData("2024-01")).rejects.toThrow(
      "Failed to fetch Pixiu month data"
    );
  });

  test("year fetchers: success, http error, api error", async () => {
    const data = { year: 2024, months: [] };
    globalThis.fetch = vi.fn(() => ok(data)) as unknown as typeof fetch;
    await expect(fetchYearAppleHealthData(2024)).resolves.toBeDefined();
    await expect(fetchYearFootprintData(2024)).resolves.toBeDefined();
    await expect(fetchYearPixiuData(2024)).resolves.toBeDefined();

    globalThis.fetch = vi.fn(() => httpError()) as unknown as typeof fetch;
    await expect(fetchYearAppleHealthData(2024)).rejects.toThrow();
    await expect(fetchYearFootprintData(2024)).rejects.toThrow();
    await expect(fetchYearPixiuData(2024)).rejects.toThrow();

    globalThis.fetch = vi.fn(() => apiError("nope")) as unknown as typeof fetch;
    await expect(fetchYearAppleHealthData(2024)).rejects.toThrow("nope");
    await expect(fetchYearFootprintData(2024)).rejects.toThrow("nope");
    await expect(fetchYearPixiuData(2024)).rejects.toThrow("nope");

    globalThis.fetch = vi.fn(() => apiError()) as unknown as typeof fetch;
    await expect(fetchYearAppleHealthData(2024)).rejects.toThrow();
    await expect(fetchYearFootprintData(2024)).rejects.toThrow();
    await expect(fetchYearPixiuData(2024)).rejects.toThrow();
  });

  test("fetchAllMonthData / fetchAllYearData parallel happy path", async () => {
    const payload = { ok: true };
    globalThis.fetch = vi.fn(() => ok(payload)) as unknown as typeof fetch;
    await expect(fetchAllMonthData("2024-01")).resolves.toBeDefined();
    await expect(fetchAllYearData(2024)).resolves.toBeDefined();
  });
});
