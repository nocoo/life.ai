import { describe, it, expect, mock, afterEach } from "bun:test";
import { fetchHealth } from "@/services/health-service";
import type { HealthResponse } from "@/models/health";

describe("health-service", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("fetchHealth", () => {
    it("should return health response on success", async () => {
      const mockResponse: HealthResponse = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      const mockFn = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      const result = await fetchHealth();

      expect(result).toEqual(mockResponse);
      expect(mockFn).toHaveBeenCalledWith("/api/health");
    });

    it("should use custom baseUrl when provided", async () => {
      const mockResponse: HealthResponse = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      const mockFn = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await fetchHealth("http://localhost:7013");

      expect(mockFn).toHaveBeenCalledWith("http://localhost:7013/api/health");
    });

    it("should throw error on non-ok response", async () => {
      const mockFn = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await expect(fetchHealth()).rejects.toThrow("Health check failed: 500");
    });

    it("should throw error on invalid response format", async () => {
      const mockFn = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invalid: "data" }),
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await expect(fetchHealth()).rejects.toThrow(
        "Invalid health response format"
      );
    });

    it("should throw error on 404 response", async () => {
      const mockFn = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await expect(fetchHealth()).rejects.toThrow("Health check failed: 404");
    });

    it("should throw error on 503 response", async () => {
      const mockFn = mock(() =>
        Promise.resolve({
          ok: false,
          status: 503,
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await expect(fetchHealth()).rejects.toThrow("Health check failed: 503");
    });
  });
});
