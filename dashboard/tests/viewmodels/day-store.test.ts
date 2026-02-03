import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { useDayStore, resetDayStore } from "@/viewmodels/day-store";
import { startOfDay, format } from "date-fns";

describe("day-store", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetDayStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Helper to create mock fetch that returns empty data */
  const setupMockFetch = () => {
    const mockAppleHealth = {
      date: "2025-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierHeartRate",
          unit: "count/min",
          value: "72",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2025-01-15T10:00:00+08:00",
          end_date: "2025-01-15T10:00:00+08:00",
          day: "2025-01-15",
          timezone: null,
        },
      ],
      workouts: [
        {
          id: 1,
          workout_type: "HKWorkoutActivityTypeRunning",
          duration: 1800,
          total_distance: 5000,
          total_energy: 300,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2025-01-15T18:00:00+08:00",
          end_date: "2025-01-15T18:30:00+08:00",
          day: "2025-01-15",
        },
      ],
      activitySummary: null,
    };
    const mockFootprint = {
      date: "2025-01-15",
      trackPoints: [],
      dayAgg: null,
    };
    const mockPixiu = {
      date: "2025-01-15",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2025-01-15 12:30",
          category_l1: "日常支出",
          category_l2: "餐饮",
          inflow: 0,
          outflow: 35,
          currency: "CNY",
          account: "微信",
          tags: null,
          note: "午餐",
          year: 2025,
        },
      ],
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
          new Response(JSON.stringify({ success: true, data: mockFootprint }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
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
  };

  describe("initial state", () => {
    it("should have today as selected date", () => {
      const state = useDayStore.getState();
      const today = startOfDay(new Date());
      expect(format(state.selectedDate, "yyyy-MM-dd")).toBe(
        format(today, "yyyy-MM-dd")
      );
    });

    it("should not be loading initially", () => {
      const state = useDayStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should have no error initially", () => {
      const state = useDayStore.getState();
      expect(state.error).toBeNull();
    });

    it("should have no data initially", () => {
      const state = useDayStore.getState();
      expect(state.data).toBeNull();
    });

    it("should have empty timeline events initially", () => {
      const state = useDayStore.getState();
      expect(state.timelineEvents).toEqual([]);
    });

    it("should have calendar closed initially", () => {
      const state = useDayStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("setDate", () => {
    it("should update selected date", () => {
      setupMockFetch();
      const newDate = new Date("2025-01-15");
      useDayStore.getState().setDate(newDate);

      const state = useDayStore.getState();
      expect(format(state.selectedDate, "yyyy-MM-dd")).toBe("2025-01-15");
    });

    it("should close calendar when setting date", () => {
      setupMockFetch();
      useDayStore.setState({ calendarOpen: true });
      useDayStore.getState().setDate(new Date("2025-01-15"));

      const state = useDayStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goToday", () => {
    it("should set selected date to today", () => {
      setupMockFetch();
      useDayStore.getState().setDate(new Date("2025-01-01"));
      useDayStore.getState().goToday();

      const state = useDayStore.getState();
      const today = startOfDay(new Date());
      expect(format(state.selectedDate, "yyyy-MM-dd")).toBe(
        format(today, "yyyy-MM-dd")
      );
    });

    it("should close calendar", () => {
      setupMockFetch();
      useDayStore.setState({ calendarOpen: true });
      useDayStore.getState().goToday();

      const state = useDayStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goPrevDay", () => {
    it("should go to previous day", () => {
      setupMockFetch();
      const testDate = new Date("2025-01-15");
      useDayStore.getState().setDate(testDate);
      useDayStore.getState().goPrevDay();

      const state = useDayStore.getState();
      expect(format(state.selectedDate, "yyyy-MM-dd")).toBe("2025-01-14");
    });
  });

  describe("goNextDay", () => {
    it("should go to next day", () => {
      setupMockFetch();
      const testDate = new Date("2025-01-15");
      useDayStore.getState().setDate(testDate);
      useDayStore.getState().goNextDay();

      const state = useDayStore.getState();
      expect(format(state.selectedDate, "yyyy-MM-dd")).toBe("2025-01-16");
    });
  });

  describe("toggleCalendar", () => {
    it("should toggle calendar open state", () => {
      expect(useDayStore.getState().calendarOpen).toBe(false);

      useDayStore.getState().toggleCalendar();
      expect(useDayStore.getState().calendarOpen).toBe(true);

      useDayStore.getState().toggleCalendar();
      expect(useDayStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("closeCalendar", () => {
    it("should close calendar", () => {
      useDayStore.setState({ calendarOpen: true });
      useDayStore.getState().closeCalendar();

      expect(useDayStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("loadData", () => {
    it("should load data for selected date", async () => {
      setupMockFetch();
      useDayStore.getState().setDate(new Date("2025-01-15"));
      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      expect(state.data).not.toBeNull();
      expect(state.data!.date).toBe("2025-01-15");
    });

    it("should set loading to false after loading completes", async () => {
      setupMockFetch();
      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should populate timeline events", async () => {
      setupMockFetch();
      useDayStore.getState().setDate(new Date("2025-01-15"));
      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      // Should have workout and transaction events
      expect(state.timelineEvents.length).toBeGreaterThan(0);
    });

    it("should clear error on successful load", async () => {
      setupMockFetch();
      useDayStore.setState({ error: "Previous error" });
      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      expect(state.error).toBeNull();
    });

    it("should set error on fetch failure", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Server Error", { status: 500, statusText: "Server Error" })
        )
      ) as unknown as typeof fetch;

      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.loading).toBe(false);
    });

    it("should build summary from data", async () => {
      setupMockFetch();
      useDayStore.getState().setDate(new Date("2025-01-15"));
      await useDayStore.getState().loadData();

      const state = useDayStore.getState();
      expect(state.data).not.toBeNull();
      expect(state.data!.summary).toBeDefined();
      expect(state.data!.summary.date).toBe("2025-01-15");
    });
  });

  describe("resetDayStore", () => {
    it("should reset to initial state", async () => {
      setupMockFetch();
      // Modify state
      useDayStore.setState({
        loading: true,
        error: "Some error",
        calendarOpen: true,
      });
      await useDayStore.getState().loadData();

      // Reset
      resetDayStore();

      const state = useDayStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.data).toBeNull();
      expect(state.calendarOpen).toBe(false);
    });
  });
});
