import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import {
  useHealthStore,
  getInitialHealthStoreState,
} from "@/viewmodels/health-store";
import type { HealthResponse } from "@/models/health";

describe("health-store", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useHealthStore.getState().reset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useHealthStore.getState();

      expect(state.status).toBe("unknown");
      expect(state.lastChecked).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("getInitialHealthStoreState", () => {
    it("should return correct initial state", () => {
      const state = getInitialHealthStoreState();

      expect(state.status).toBe("unknown");
      expect(state.lastChecked).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("reset", () => {
    it("should reset state to initial values", () => {
      // 首先修改状态
      useHealthStore.setState({
        status: "ok",
        lastChecked: "2025-01-01T00:00:00.000Z",
        isLoading: true,
        error: "some error",
      });

      // 验证状态已修改
      expect(useHealthStore.getState().status).toBe("ok");

      // 重置
      useHealthStore.getState().reset();

      // 验证已重置
      const state = useHealthStore.getState();
      expect(state.status).toBe("unknown");
      expect(state.lastChecked).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("checkHealth", () => {
    it("should set loading state when checking health", async () => {
      const mockResponse: HealthResponse = {
        status: "ok",
        timestamp: "2025-01-01T00:00:00.000Z",
        version: "1.0.0",
      };

      let resolvePromise: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      const mockFn = mock(() => fetchPromise);
      global.fetch = mockFn as unknown as typeof fetch;

      const checkPromise = useHealthStore.getState().checkHealth();

      // 验证 loading 状态
      expect(useHealthStore.getState().isLoading).toBe(true);

      // 解析 fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      await checkPromise;

      expect(useHealthStore.getState().isLoading).toBe(false);
    });

    it("should update state on successful health check", async () => {
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

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.status).toBe("ok");
      expect(state.lastChecked).toBe("2025-01-01T00:00:00.000Z");
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("should handle error status from API", async () => {
      const mockResponse: HealthResponse = {
        status: "error",
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

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.status).toBe("error");
      expect(state.lastChecked).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should handle fetch error", async () => {
      const mockFn = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      );
      global.fetch = mockFn as unknown as typeof fetch;

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toContain("500");
      expect(state.isLoading).toBe(false);
    });

    it("should handle network error", async () => {
      const mockFn = mock(() => Promise.reject(new Error("Network error")));
      global.fetch = mockFn as unknown as typeof fetch;

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Network error");
      expect(state.isLoading).toBe(false);
    });

    it("should handle unknown error type", async () => {
      const mockFn = mock(() => Promise.reject("string error"));
      global.fetch = mockFn as unknown as typeof fetch;

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Unknown error");
      expect(state.isLoading).toBe(false);
    });

    it("should clear previous error on new check", async () => {
      // 首先设置一个错误状态
      useHealthStore.setState({
        status: "error",
        error: "previous error",
        isLoading: false,
        lastChecked: null,
      });

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

      await useHealthStore.getState().checkHealth();

      const state = useHealthStore.getState();
      expect(state.error).toBeNull();
      expect(state.status).toBe("ok");
    });
  });
});
