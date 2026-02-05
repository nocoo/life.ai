import { describe, expect, it } from "bun:test";
import {
  createEmptyMonthHealthData,
  createEmptyMonthFootprintData,
  createEmptyMonthPixiuData,
  buildMonthSummary,
  type MonthHealthData,
  type MonthFootprintData,
  type MonthPixiuData,
  type DailyDataPoint,
  type WorkoutTypeBreakdown,
  type TransportModeBreakdown,
  type AccountBreakdown,
  type MonthSleepStats,
  type MonthHeartRateStats,
  type MonthStepsStats,
  type MonthActivityStats,
  type MonthDistanceStats,
  type MonthWorkoutStats,
  type MonthHrvStats,
  type MonthOxygenStats,
  type MonthSummary,
  type MonthViewData,
} from "@/models/month-view";

describe("month-view model", () => {
  describe("createEmptyMonthHealthData", () => {
    it("should create empty health data with given month", () => {
      const month = "2025-06";
      const data = createEmptyMonthHealthData(month);

      expect(data.month).toBe(month);
      expect(data.daysInMonth).toBe(0);
      expect(data.daysWithData).toBe(0);
      expect(data.sleep).toBeNull();
      expect(data.heartRate).toBeNull();
      expect(data.steps).toBeNull();
      expect(data.activity).toBeNull();
      expect(data.distance).toBeNull();
      expect(data.workouts).toBeNull();
      expect(data.hrv).toBeNull();
      expect(data.oxygen).toBeNull();
    });
  });

  describe("createEmptyMonthFootprintData", () => {
    it("should create empty footprint data with given month", () => {
      const month = "2025-06";
      const data = createEmptyMonthFootprintData(month);

      expect(data.month).toBe(month);
      expect(data.daysInMonth).toBe(0);
      expect(data.daysWithData).toBe(0);
      expect(data.totalDistance).toBe(0);
      expect(data.totalTrackPoints).toBe(0);
      expect(data.avgSpeed).toBe(0);
      expect(data.byTransportMode).toEqual([]);
      expect(data.dailyDistance).toEqual([]);
      expect(data.dailyTrackPoints).toEqual([]);
      expect(data.bounds).toBeNull();
    });
  });

  describe("createEmptyMonthPixiuData", () => {
    it("should create empty pixiu data with given month", () => {
      const month = "2025-06";
      const data = createEmptyMonthPixiuData(month);

      expect(data.month).toBe(month);
      expect(data.daysInMonth).toBe(0);
      expect(data.daysWithData).toBe(0);
      expect(data.totalIncome).toBe(0);
      expect(data.totalExpense).toBe(0);
      expect(data.totalNet).toBe(0);
      expect(data.transactionCount).toBe(0);
      expect(data.avgDailyExpense).toBe(0);
      expect(data.avgDailyIncome).toBe(0);
      expect(data.expenseByCategory).toEqual([]);
      expect(data.incomeByCategory).toEqual([]);
      expect(data.byAccount).toEqual([]);
      expect(data.dailyIncome).toEqual([]);
      expect(data.dailyExpense).toEqual([]);
      expect(data.dailyNet).toEqual([]);
      expect(data.topExpenses).toEqual([]);
    });
  });

  describe("buildMonthSummary", () => {
    it("should build summary from empty data", () => {
      const month = "2025-06";
      const health = createEmptyMonthHealthData(month);
      const footprint = createEmptyMonthFootprintData(month);
      const pixiu = createEmptyMonthPixiuData(month);

      const summary = buildMonthSummary(month, health, footprint, pixiu);

      expect(summary.month).toBe(month);
      expect(summary.totalSteps).toBe(0);
      expect(summary.avgHeartRate).toBeNull();
      expect(summary.totalActiveEnergy).toBeNull();
      expect(summary.totalExerciseMinutes).toBeNull();
      expect(summary.avgSleepHours).toBeNull();
      expect(summary.totalWorkouts).toBe(0);
      expect(summary.totalDistance).toBeNull();
      expect(summary.daysWithTracking).toBe(0);
      expect(summary.totalIncome).toBe(0);
      expect(summary.totalExpense).toBe(0);
      expect(summary.totalNet).toBe(0);
      expect(summary.transactionCount).toBe(0);
    });

    it("should build summary from populated data", () => {
      const month = "2025-06";
      const health: MonthHealthData = {
        month,
        daysInMonth: 30,
        daysWithData: 25,
        sleep: {
          avgDuration: 7.5,
          totalHours: 187.5,
          daysWithData: 25,
          avgDeepMinutes: 60,
          avgCoreMinutes: 180,
          avgRemMinutes: 90,
          avgAwakeMinutes: 30,
          dailyDuration: [],
        },
        heartRate: {
          avgHeartRate: 72,
          minHeartRate: 55,
          maxHeartRate: 150,
          avgRestingHeartRate: 60,
          daysWithData: 25,
          dailyAvg: [],
          dailyResting: [],
        },
        steps: {
          totalSteps: 250000,
          avgSteps: 10000,
          maxSteps: 20000,
          maxStepsDate: "2025-06-15",
          daysWithData: 25,
          dailySteps: [],
        },
        activity: {
          totalActiveEnergy: 15000,
          avgActiveEnergy: 600,
          totalExerciseMinutes: 1500,
          avgExerciseMinutes: 60,
          totalStandHours: 300,
          avgStandHours: 12,
          daysWithData: 25,
          ringCloseCount: { move: 20, exercise: 18, stand: 22, all: 15 },
          dailyActiveEnergy: [],
          dailyExerciseMinutes: [],
        },
        distance: null,
        workouts: {
          totalWorkouts: 15,
          totalDuration: 600,
          totalDistance: 50000,
          totalCalories: 5000,
          daysWithWorkouts: 15,
          byType: [],
          dailyWorkouts: [],
        },
        hrv: null,
        oxygen: null,
      };

      const footprint: MonthFootprintData = {
        month,
        daysInMonth: 30,
        daysWithData: 20,
        totalDistance: 150000,
        totalTrackPoints: 50000,
        avgSpeed: 1.5,
        byTransportMode: [],
        dailyDistance: [],
        dailyTrackPoints: [],
        bounds: { minLat: 39, maxLat: 40, minLon: 116, maxLon: 117 },
      };

      const pixiu: MonthPixiuData = {
        month,
        daysInMonth: 30,
        daysWithData: 28,
        totalIncome: 20000,
        totalExpense: 15000,
        totalNet: 5000,
        transactionCount: 100,
        avgDailyExpense: 500,
        avgDailyIncome: 666.67,
        expenseByCategory: [],
        incomeByCategory: [],
        byAccount: [],
        dailyIncome: [],
        dailyExpense: [],
        dailyNet: [],
        topExpenses: [],
      };

      const summary = buildMonthSummary(month, health, footprint, pixiu);

      expect(summary.month).toBe(month);
      expect(summary.totalSteps).toBe(250000);
      expect(summary.avgHeartRate).toBe(72);
      expect(summary.totalActiveEnergy).toBe(15000);
      expect(summary.totalExerciseMinutes).toBe(1500);
      expect(summary.avgSleepHours).toBe(7.5);
      expect(summary.totalWorkouts).toBe(15);
      expect(summary.totalDistance).toBe(150000);
      expect(summary.daysWithTracking).toBe(20);
      expect(summary.totalIncome).toBe(20000);
      expect(summary.totalExpense).toBe(15000);
      expect(summary.totalNet).toBe(5000);
      expect(summary.transactionCount).toBe(100);
    });

    it("should handle zero footprint distance as null", () => {
      const month = "2025-06";
      const health = createEmptyMonthHealthData(month);
      const footprint: MonthFootprintData = {
        ...createEmptyMonthFootprintData(month),
        totalDistance: 0,
      };
      const pixiu = createEmptyMonthPixiuData(month);

      const summary = buildMonthSummary(month, health, footprint, pixiu);

      expect(summary.totalDistance).toBeNull();
    });
  });

  describe("type definitions", () => {
    it("should allow valid DailyDataPoint", () => {
      const point: DailyDataPoint = {
        date: "2025-06-15",
        value: 10000,
      };
      expect(point.date).toBe("2025-06-15");
      expect(point.value).toBe(10000);
    });

    it("should allow valid WorkoutTypeBreakdown", () => {
      const workout: WorkoutTypeBreakdown = {
        type: "Running",
        typeName: "跑步",
        count: 10,
        totalDuration: 600,
        totalDistance: 50000,
        totalCalories: 5000,
      };
      expect(workout.type).toBe("Running");
    });

    it("should allow valid TransportModeBreakdown", () => {
      const transport: TransportModeBreakdown = {
        mode: "walking",
        modeName: "步行",
        totalDistance: 10000,
        totalDuration: 120,
        percentage: 45.5,
      };
      expect(transport.mode).toBe("walking");
    });

    it("should allow valid AccountBreakdown", () => {
      const account: AccountBreakdown = {
        account: "招商银行",
        income: 10000,
        expense: 5000,
        net: 5000,
        transactionCount: 20,
        percentage: 33.3,
      };
      expect(account.account).toBe("招商银行");
    });

    it("should allow valid MonthViewData", () => {
      const month = "2025-06";
      const viewData: MonthViewData = {
        month,
        summary: {
          month,
          totalSteps: 0,
          avgHeartRate: null,
          totalActiveEnergy: null,
          totalExerciseMinutes: null,
          avgSleepHours: null,
          totalWorkouts: 0,
          totalDistance: null,
          daysWithTracking: 0,
          totalIncome: 0,
          totalExpense: 0,
          totalNet: 0,
          transactionCount: 0,
        },
        health: createEmptyMonthHealthData(month),
        footprint: createEmptyMonthFootprintData(month),
        pixiu: createEmptyMonthPixiuData(month),
      };
      expect(viewData.month).toBe(month);
    });
  });
});
