import { describe, expect, it } from "bun:test";
import {
  createEmptyYearHealthData,
  createEmptyYearFootprintData,
  createEmptyYearPixiuData,
  buildYearSummary,
  type YearHealthData,
  type YearFootprintData,
  type YearPixiuData,
  type MonthlyDataPoint,
  type YearSleepStats,
  type YearHeartRateStats,
  type YearStepsStats,
  type YearActivityStats,
  type YearDistanceStats,
  type YearWorkoutStats,
  type YearHrvStats,
  type YearOxygenStats,
  type YearSummary,
  type YearViewData,
} from "@/models/year-view";

describe("year-view model", () => {
  describe("createEmptyYearHealthData", () => {
    it("should create empty health data with given year", () => {
      const year = 2025;
      const data = createEmptyYearHealthData(year);

      expect(data.year).toBe(year);
      expect(data.daysInYear).toBe(0);
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

  describe("createEmptyYearFootprintData", () => {
    it("should create empty footprint data with given year", () => {
      const year = 2025;
      const data = createEmptyYearFootprintData(year);

      expect(data.year).toBe(year);
      expect(data.daysInYear).toBe(0);
      expect(data.daysWithData).toBe(0);
      expect(data.totalDistance).toBe(0);
      expect(data.totalTrackPoints).toBe(0);
      expect(data.avgSpeed).toBe(0);
      expect(data.byTransportMode).toEqual([]);
      expect(data.monthlyDistance).toEqual([]);
      expect(data.monthlyTrackPoints).toEqual([]);
      expect(data.dailyDistance).toEqual([]);
      expect(data.bounds).toBeNull();
    });
  });

  describe("createEmptyYearPixiuData", () => {
    it("should create empty pixiu data with given year", () => {
      const year = 2025;
      const data = createEmptyYearPixiuData(year);

      expect(data.year).toBe(year);
      expect(data.daysInYear).toBe(0);
      expect(data.daysWithData).toBe(0);
      expect(data.totalIncome).toBe(0);
      expect(data.totalExpense).toBe(0);
      expect(data.totalNet).toBe(0);
      expect(data.transactionCount).toBe(0);
      expect(data.avgMonthlyExpense).toBe(0);
      expect(data.avgMonthlyIncome).toBe(0);
      expect(data.expenseByCategory).toEqual([]);
      expect(data.incomeByCategory).toEqual([]);
      expect(data.byAccount).toEqual([]);
      expect(data.monthlyIncome).toEqual([]);
      expect(data.monthlyExpense).toEqual([]);
      expect(data.monthlyNet).toEqual([]);
      expect(data.dailyExpense).toEqual([]);
      expect(data.topExpenseMonths).toEqual([]);
    });
  });

  describe("buildYearSummary", () => {
    it("should build summary from empty data", () => {
      const year = 2025;
      const health = createEmptyYearHealthData(year);
      const footprint = createEmptyYearFootprintData(year);
      const pixiu = createEmptyYearPixiuData(year);

      const summary = buildYearSummary(year, health, footprint, pixiu);

      expect(summary.year).toBe(year);
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
      const year = 2025;
      const health: YearHealthData = {
        year,
        daysInYear: 365,
        daysWithData: 300,
        sleep: {
          avgDuration: 7.5,
          totalHours: 2250,
          daysWithData: 300,
          avgDeepMinutes: 60,
          avgCoreMinutes: 180,
          avgRemMinutes: 90,
          avgAwakeMinutes: 30,
          monthlyDuration: [],
          dailyDuration: [],
        },
        heartRate: {
          avgHeartRate: 72,
          minHeartRate: 50,
          maxHeartRate: 180,
          avgRestingHeartRate: 60,
          daysWithData: 300,
          monthlyAvg: [],
          monthlyResting: [],
        },
        steps: {
          totalSteps: 3000000,
          avgSteps: 10000,
          maxSteps: 25000,
          maxStepsDate: "2025-06-15",
          daysWithData: 300,
          monthlySteps: [],
          dailySteps: [],
        },
        activity: {
          totalActiveEnergy: 180000,
          avgActiveEnergy: 600,
          totalExerciseMinutes: 18000,
          avgExerciseMinutes: 60,
          totalStandHours: 3600,
          avgStandHours: 12,
          daysWithData: 300,
          ringCloseCount: { move: 250, exercise: 200, stand: 280, all: 180 },
          monthlyActiveEnergy: [],
          monthlyExerciseMinutes: [],
          dailyActiveEnergy: [],
        },
        distance: null,
        workouts: {
          totalWorkouts: 150,
          totalDuration: 6000,
          totalDistance: 600000,
          totalCalories: 60000,
          daysWithWorkouts: 150,
          byType: [],
          monthlyWorkouts: [],
          monthlyDuration: [],
        },
        hrv: null,
        oxygen: null,
      };

      const footprint: YearFootprintData = {
        year,
        daysInYear: 365,
        daysWithData: 250,
        totalDistance: 1800000,
        totalTrackPoints: 600000,
        avgSpeed: 1.5,
        byTransportMode: [],
        monthlyDistance: [],
        monthlyTrackPoints: [],
        dailyDistance: [],
        bounds: { minLat: 39, maxLat: 40, minLon: 116, maxLon: 117 },
      };

      const pixiu: YearPixiuData = {
        year,
        daysInYear: 365,
        daysWithData: 330,
        totalIncome: 240000,
        totalExpense: 180000,
        totalNet: 60000,
        transactionCount: 1200,
        avgMonthlyExpense: 15000,
        avgMonthlyIncome: 20000,
        expenseByCategory: [],
        incomeByCategory: [],
        byAccount: [],
        monthlyIncome: [],
        monthlyExpense: [],
        monthlyNet: [],
        dailyExpense: [],
        topExpenseMonths: [],
      };

      const summary = buildYearSummary(year, health, footprint, pixiu);

      expect(summary.year).toBe(year);
      expect(summary.totalSteps).toBe(3000000);
      expect(summary.avgHeartRate).toBe(72);
      expect(summary.totalActiveEnergy).toBe(180000);
      expect(summary.totalExerciseMinutes).toBe(18000);
      expect(summary.avgSleepHours).toBe(7.5);
      expect(summary.totalWorkouts).toBe(150);
      expect(summary.totalDistance).toBe(1800000);
      expect(summary.daysWithTracking).toBe(250);
      expect(summary.totalIncome).toBe(240000);
      expect(summary.totalExpense).toBe(180000);
      expect(summary.totalNet).toBe(60000);
      expect(summary.transactionCount).toBe(1200);
    });

    it("should handle zero footprint distance as null", () => {
      const year = 2025;
      const health = createEmptyYearHealthData(year);
      const footprint: YearFootprintData = {
        ...createEmptyYearFootprintData(year),
        totalDistance: 0,
      };
      const pixiu = createEmptyYearPixiuData(year);

      const summary = buildYearSummary(year, health, footprint, pixiu);

      expect(summary.totalDistance).toBeNull();
    });
  });

  describe("type definitions", () => {
    it("should allow valid MonthlyDataPoint", () => {
      const point: MonthlyDataPoint = {
        month: "2025-06",
        value: 100000,
      };
      expect(point.month).toBe("2025-06");
      expect(point.value).toBe(100000);
    });

    it("should allow valid YearViewData", () => {
      const year = 2025;
      const viewData: YearViewData = {
        year,
        summary: {
          year,
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
        health: createEmptyYearHealthData(year),
        footprint: createEmptyYearFootprintData(year),
        pixiu: createEmptyYearPixiuData(year),
      };
      expect(viewData.year).toBe(year);
    });
  });
});
