import { describe, it, expect } from "bun:test";
import {
  createInitialHealthState,
  isValidHealthResponse,
  type HealthResponse,
  type HealthState,
} from "@/models/health";

describe("health model", () => {
  describe("createInitialHealthState", () => {
    it("should return correct initial state", () => {
      const state: HealthState = createInitialHealthState();

      expect(state.status).toBe("unknown");
      expect(state.lastChecked).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("should return a new object each time", () => {
      const state1 = createInitialHealthState();
      const state2 = createInitialHealthState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe("isValidHealthResponse", () => {
    it("should return true for valid ok response", () => {
      const response: HealthResponse = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      expect(isValidHealthResponse(response)).toBe(true);
    });

    it("should return true for valid error response", () => {
      const response: HealthResponse = {
        status: "error",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      expect(isValidHealthResponse(response)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isValidHealthResponse(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidHealthResponse(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isValidHealthResponse("string")).toBe(false);
      expect(isValidHealthResponse(123)).toBe(false);
      expect(isValidHealthResponse(true)).toBe(false);
    });

    it("should return false for invalid status", () => {
      const response = {
        status: "invalid",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      expect(isValidHealthResponse(response)).toBe(false);
    });

    it("should return false for missing timestamp", () => {
      const response = {
        status: "ok",
        version: "1.0.0",
      };

      expect(isValidHealthResponse(response)).toBe(false);
    });

    it("should return false for missing version", () => {
      const response = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
      };

      expect(isValidHealthResponse(response)).toBe(false);
    });

    it("should return false for non-string timestamp", () => {
      const response = {
        status: "ok",
        timestamp: 12345,
        version: "1.0.0",
      };

      expect(isValidHealthResponse(response)).toBe(false);
    });

    it("should return false for non-string version", () => {
      const response = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: 1,
      };

      expect(isValidHealthResponse(response)).toBe(false);
    });
  });
});
