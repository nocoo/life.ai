import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { useMonthStore, resetMonthStore } from "@/viewmodels/month-store";

describe("month-store", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetMonthStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Helper to create mock fetch that returns month data */
  const setupMockFetch = () => {
    const mockHealth = {
      month: "2025-01",
      daysInMonth: 31,
      daysWithData: 15,
      sleep: {
        avgDuration: 7.5,
        totalHours: 112,
        daysWithData: 15,
        avgDeepMinutes: 60,
        avgCoreMinutes: 180,
        avgRemMinutes: 90,
        avgAwakeMinutes: 15,
        dailyDuration: [],
      },
      heartRate: {
        avgHeartRate: 72,
        minHeartRate: 55,
        maxHeartRate: 150,
        avgRestingHeartRate: 58,
        daysWithData: 15,
        dailyAvg: [],
        dailyResting: [],
      },
      steps: {
        totalSteps: 150000,
        avgSteps: 10000,
        maxSteps: 15000,
        maxStepsDate: "2025-01-15",
        daysWithData: 15,
        dailySteps: [],
      },
      activity: null,
      distance: null,
      workouts: null,
      hrv: null,
      oxygen: null,
    };

    const mockFootprint = {
      month: "2025-01",
      daysInMonth: 31,
      daysWithData: 10,
      totalDistance: 50000,
      totalTrackPoints: 10000,
      avgSpeed: 1.5,
      byTransportMode: [],
      dailyDistance: [],
      dailyTrackPoints: [],
      bounds: null,
    };

    const mockPixiu = {
      month: "2025-01",
      daysInMonth: 31,
      daysWithData: 20,
      totalIncome: 10000,
      totalExpense: 5000,
      totalNet: 5000,
      transactionCount: 50,
      avgDailyExpense: 250,
      avgDailyIncome: 500,
      expenseByCategory: [],
      incomeByCategory: [],
      byAccount: [],
      dailyIncome: [],
      dailyExpense: [],
      dailyNet: [],
      topExpenses: [],
    };

    globalThis.fetch = mock((url: string) => {
      if (url.includes("applehealth")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockHealth }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
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
    it("should have default month as selected month", () => {
      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-12");
    });

    it("should not be loading initially", () => {
      const state = useMonthStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should have no error initially", () => {
      const state = useMonthStore.getState();
      expect(state.error).toBeNull();
    });

    it("should have no data initially", () => {
      const state = useMonthStore.getState();
      expect(state.data).toBeNull();
    });

    it("should have calendar closed initially", () => {
      const state = useMonthStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("setMonth", () => {
    it("should update selected month", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-01");
    });

    it("should close calendar when setting month", () => {
      setupMockFetch();
      useMonthStore.setState({ calendarOpen: true });
      useMonthStore.getState().setMonth("2025-01");

      const state = useMonthStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goCurrentMonth", () => {
    it("should set selected month to current month", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2024-01");
      useMonthStore.getState().goCurrentMonth();

      const state = useMonthStore.getState();
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(state.selectedMonth).toBe(currentMonth);
    });

    it("should close calendar", () => {
      setupMockFetch();
      useMonthStore.setState({ calendarOpen: true });
      useMonthStore.getState().goCurrentMonth();

      const state = useMonthStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goPrevMonth", () => {
    it("should go to previous month", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-03");
      useMonthStore.getState().goPrevMonth();

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-02");
    });

    it("should handle year boundary", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      useMonthStore.getState().goPrevMonth();

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2024-12");
    });
  });

  describe("goNextMonth", () => {
    it("should go to next month", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      useMonthStore.getState().goNextMonth();

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-02");
    });

    it("should handle year boundary", () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2024-12");
      useMonthStore.getState().goNextMonth();

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-01");
    });
  });

  describe("toggleCalendar", () => {
    it("should toggle calendar open state", () => {
      expect(useMonthStore.getState().calendarOpen).toBe(false);

      useMonthStore.getState().toggleCalendar();
      expect(useMonthStore.getState().calendarOpen).toBe(true);

      useMonthStore.getState().toggleCalendar();
      expect(useMonthStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("closeCalendar", () => {
    it("should close calendar", () => {
      useMonthStore.setState({ calendarOpen: true });
      useMonthStore.getState().closeCalendar();

      expect(useMonthStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("loadData", () => {
    it("should load data for selected month", async () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.data).not.toBeNull();
      expect(state.data!.month).toBe("2025-01");
    });

    it("should set loading to false after loading completes", async () => {
      setupMockFetch();
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should populate health data", async () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.data!.health).toBeDefined();
      expect(state.data!.health.steps?.totalSteps).toBe(150000);
    });

    it("should populate footprint data", async () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.data!.footprint).toBeDefined();
      expect(state.data!.footprint.totalDistance).toBe(50000);
    });

    it("should populate pixiu data", async () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.data!.pixiu).toBeDefined();
      expect(state.data!.pixiu.totalExpense).toBe(5000);
    });

    it("should build summary from data", async () => {
      setupMockFetch();
      useMonthStore.getState().setMonth("2025-01");
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.data!.summary).toBeDefined();
      expect(state.data!.summary.month).toBe("2025-01");
      expect(state.data!.summary.totalSteps).toBe(150000);
      expect(state.data!.summary.totalExpense).toBe(5000);
    });

    it("should clear error on successful load", async () => {
      setupMockFetch();
      useMonthStore.setState({ error: "Previous error" });
      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.error).toBeNull();
    });

    it("should set error on fetch failure", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Server Error", { status: 500, statusText: "Server Error" })
        )
      ) as unknown as typeof fetch;

      await useMonthStore.getState().loadData();

      const state = useMonthStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.loading).toBe(false);
    });
  });

  describe("resetMonthStore", () => {
    it("should reset to initial state", async () => {
      setupMockFetch();
      // Modify state
      useMonthStore.setState({
        selectedMonth: "2024-06",
        loading: true,
        error: "Some error",
        calendarOpen: true,
      });
      await useMonthStore.getState().loadData();

      // Reset
      resetMonthStore();

      const state = useMonthStore.getState();
      expect(state.selectedMonth).toBe("2025-12");
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.data).toBeNull();
      expect(state.calendarOpen).toBe(false);
    });
  });
});
