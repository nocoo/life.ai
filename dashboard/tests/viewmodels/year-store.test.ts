import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { useYearStore, resetYearStore } from "@/viewmodels/year-store";

describe("year-store", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetYearStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Helper to create mock fetch that returns year data */
  const setupMockFetch = () => {
    const mockHealth = {
      year: 2025,
      daysInYear: 365,
      daysWithData: 180,
      sleep: {
        avgDuration: 7.5,
        totalHours: 1350,
        daysWithData: 180,
        avgDeepMinutes: 60,
        avgCoreMinutes: 180,
        avgRemMinutes: 90,
        avgAwakeMinutes: 15,
        monthlyDuration: [],
        dailyDuration: [],
      },
      heartRate: {
        avgHeartRate: 72,
        minHeartRate: 50,
        maxHeartRate: 180,
        avgRestingHeartRate: 58,
        daysWithData: 180,
        monthlyAvg: [],
        monthlyResting: [],
      },
      steps: {
        totalSteps: 1800000,
        avgSteps: 10000,
        maxSteps: 25000,
        maxStepsDate: "2025-06-15",
        daysWithData: 180,
        monthlySteps: [],
        dailySteps: [],
      },
      activity: null,
      distance: null,
      workouts: null,
      hrv: null,
      oxygen: null,
    };

    const mockFootprint = {
      year: 2025,
      daysInYear: 365,
      daysWithData: 120,
      totalDistance: 600000,
      totalTrackPoints: 120000,
      avgSpeed: 1.5,
      byTransportMode: [],
      monthlyDistance: [],
      monthlyTrackPoints: [],
      dailyDistance: [],
      bounds: null,
    };

    const mockPixiu = {
      year: 2025,
      daysInYear: 365,
      daysWithData: 240,
      totalIncome: 120000,
      totalExpense: 60000,
      totalNet: 60000,
      transactionCount: 600,
      avgMonthlyExpense: 5000,
      avgMonthlyIncome: 10000,
      expenseByCategory: [],
      incomeByCategory: [],
      byAccount: [],
      monthlyIncome: [],
      monthlyExpense: [],
      monthlyNet: [],
      dailyExpense: [],
      topExpenseMonths: [],
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
    it("should have default year as selected year", () => {
      const state = useYearStore.getState();
      expect(state.selectedYear).toBe(2025);
    });

    it("should not be loading initially", () => {
      const state = useYearStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should have no error initially", () => {
      const state = useYearStore.getState();
      expect(state.error).toBeNull();
    });

    it("should have no data initially", () => {
      const state = useYearStore.getState();
      expect(state.data).toBeNull();
    });

    it("should have calendar closed initially", () => {
      const state = useYearStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("setYear", () => {
    it("should update selected year", () => {
      setupMockFetch();
      useYearStore.getState().setYear(2024);

      const state = useYearStore.getState();
      expect(state.selectedYear).toBe(2024);
    });

    it("should close calendar when setting year", () => {
      setupMockFetch();
      useYearStore.setState({ calendarOpen: true });
      useYearStore.getState().setYear(2024);

      const state = useYearStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goCurrentYear", () => {
    it("should set selected year to current year", () => {
      setupMockFetch();
      useYearStore.getState().setYear(2020);
      useYearStore.getState().goCurrentYear();

      const state = useYearStore.getState();
      const currentYear = new Date().getFullYear();
      expect(state.selectedYear).toBe(currentYear);
    });

    it("should close calendar", () => {
      setupMockFetch();
      useYearStore.setState({ calendarOpen: true });
      useYearStore.getState().goCurrentYear();

      const state = useYearStore.getState();
      expect(state.calendarOpen).toBe(false);
    });
  });

  describe("goPrevYear", () => {
    it("should go to previous year", () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      useYearStore.getState().goPrevYear();

      const state = useYearStore.getState();
      expect(state.selectedYear).toBe(2024);
    });
  });

  describe("goNextYear", () => {
    it("should go to next year", () => {
      setupMockFetch();
      useYearStore.getState().setYear(2024);
      useYearStore.getState().goNextYear();

      const state = useYearStore.getState();
      expect(state.selectedYear).toBe(2025);
    });
  });

  describe("toggleCalendar", () => {
    it("should toggle calendar open state", () => {
      expect(useYearStore.getState().calendarOpen).toBe(false);

      useYearStore.getState().toggleCalendar();
      expect(useYearStore.getState().calendarOpen).toBe(true);

      useYearStore.getState().toggleCalendar();
      expect(useYearStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("closeCalendar", () => {
    it("should close calendar", () => {
      useYearStore.setState({ calendarOpen: true });
      useYearStore.getState().closeCalendar();

      expect(useYearStore.getState().calendarOpen).toBe(false);
    });
  });

  describe("loadData", () => {
    it("should load data for selected year", async () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.data).not.toBeNull();
      expect(state.data!.year).toBe(2025);
    });

    it("should set loading to false after loading completes", async () => {
      setupMockFetch();
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.loading).toBe(false);
    });

    it("should populate health data", async () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.data!.health).toBeDefined();
      expect(state.data!.health.steps?.totalSteps).toBe(1800000);
    });

    it("should populate footprint data", async () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.data!.footprint).toBeDefined();
      expect(state.data!.footprint.totalDistance).toBe(600000);
    });

    it("should populate pixiu data", async () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.data!.pixiu).toBeDefined();
      expect(state.data!.pixiu.totalExpense).toBe(60000);
    });

    it("should build summary from data", async () => {
      setupMockFetch();
      useYearStore.getState().setYear(2025);
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.data!.summary).toBeDefined();
      expect(state.data!.summary.year).toBe(2025);
      expect(state.data!.summary.totalSteps).toBe(1800000);
      expect(state.data!.summary.totalExpense).toBe(60000);
    });

    it("should clear error on successful load", async () => {
      setupMockFetch();
      useYearStore.setState({ error: "Previous error" });
      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.error).toBeNull();
    });

    it("should set error on fetch failure", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Server Error", { status: 500, statusText: "Server Error" })
        )
      ) as unknown as typeof fetch;

      await useYearStore.getState().loadData();

      const state = useYearStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.loading).toBe(false);
    });
  });

  describe("resetYearStore", () => {
    it("should reset to initial state", async () => {
      setupMockFetch();
      // Modify state
      useYearStore.setState({
        selectedYear: 2020,
        loading: true,
        error: "Some error",
        calendarOpen: true,
      });
      await useYearStore.getState().loadData();

      // Reset
      resetYearStore();

      const state = useYearStore.getState();
      expect(state.selectedYear).toBe(2025);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.data).toBeNull();
      expect(state.calendarOpen).toBe(false);
    });
  });
});
