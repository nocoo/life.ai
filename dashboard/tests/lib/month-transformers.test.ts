/**
 * Tests for month view data transformers
 */

import { describe, expect, test } from "bun:test";
import {
  getDaysInMonth,
  transformMonthHealthData,
  transformMonthFootprintData,
  transformMonthPixiuData,
} from "@/lib/month-transformers";
import type { AppleHealthMonthRawData } from "@/services/applehealth-service";
import type { FootprintMonthRawData } from "@/services/footprint-service";
import type { PixiuMonthRawData } from "@/services/pixiu-service";

describe("getDaysInMonth", () => {
  test("returns correct days for January", () => {
    expect(getDaysInMonth("2024-01")).toBe(31);
  });

  test("returns correct days for February in leap year", () => {
    expect(getDaysInMonth("2024-02")).toBe(29);
  });

  test("returns correct days for February in non-leap year", () => {
    expect(getDaysInMonth("2023-02")).toBe(28);
  });

  test("returns correct days for April", () => {
    expect(getDaysInMonth("2024-04")).toBe(30);
  });
});

describe("transformMonthHealthData", () => {
  test("transforms empty data", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.month).toBe("2024-01");
    expect(result.daysInMonth).toBe(31);
    expect(result.daysWithData).toBe(0);
    expect(result.sleep).toBeNull();
    expect(result.heartRate).toBeNull();
    expect(result.steps).toBeNull();
    expect(result.activity).toBeNull();
    expect(result.distance).toBeNull();
    expect(result.workouts).toBeNull();
    expect(result.hrv).toBeNull();
    expect(result.oxygen).toBeNull();
  });

  test("transforms sleep records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [
        {
          id: 1,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAsleepDeep",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15 00:00:00 +0800",
          end_date: "2024-01-15 01:00:00 +0800",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAsleepCore",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15 01:00:00 +0800",
          end_date: "2024-01-15 03:00:00 +0800",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAsleepREM",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15 03:00:00 +0800",
          end_date: "2024-01-15 04:30:00 +0800",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 4,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAwake",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15 04:30:00 +0800",
          end_date: "2024-01-15 04:45:00 +0800",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.sleep).not.toBeNull();
    expect(result.sleep!.daysWithData).toBe(1);
    expect(result.sleep!.avgDeepMinutes).toBe(60);
    expect(result.sleep!.avgCoreMinutes).toBe(120);
    expect(result.sleep!.avgRemMinutes).toBe(90);
    expect(result.sleep!.avgAwakeMinutes).toBe(15);
    expect(result.sleep!.totalHours).toBeCloseTo(4.75, 2); // 285 minutes / 60
    expect(result.sleep!.dailyDuration).toHaveLength(1);
    expect(result.sleep!.dailyDuration[0].date).toBe("2024-01-15");
  });

  test("transforms heart rate records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
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
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierHeartRate",
          unit: "count/min",
          value: "85",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T11:00:00+08:00",
          end_date: "2024-01-15T11:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierHeartRate",
          unit: "count/min",
          value: "65",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T12:00:00+08:00",
          end_date: "2024-01-16T12:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
        {
          id: 4,
          type: "HKQuantityTypeIdentifierRestingHeartRate",
          unit: "count/min",
          value: "55",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T00:00:00+08:00",
          end_date: "2024-01-15T00:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.heartRate).not.toBeNull();
    expect(result.heartRate!.avgHeartRate).toBe(74); // (72 + 85 + 65) / 3
    expect(result.heartRate!.minHeartRate).toBe(65);
    expect(result.heartRate!.maxHeartRate).toBe(85);
    expect(result.heartRate!.avgRestingHeartRate).toBe(55);
    expect(result.heartRate!.daysWithData).toBe(2);
    expect(result.heartRate!.dailyAvg).toHaveLength(2);
    expect(result.heartRate!.dailyResting).toHaveLength(1);
  });

  test("transforms step records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "5000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T11:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "3000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T14:00:00+08:00",
          end_date: "2024-01-15T15:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "10000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T10:00:00+08:00",
          end_date: "2024-01-16T18:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.steps).not.toBeNull();
    expect(result.steps!.totalSteps).toBe(18000);
    expect(result.steps!.avgSteps).toBe(9000); // 18000 / 2 days
    expect(result.steps!.maxSteps).toBe(10000);
    expect(result.steps!.maxStepsDate).toBe("2024-01-16");
    expect(result.steps!.daysWithData).toBe(2);
    expect(result.steps!.dailySteps).toHaveLength(2);
  });

  test("transforms activity summaries", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [],
      workouts: [],
      activitySummaries: [
        {
          id: 1,
          date_components: "2024-01-15",
          active_energy: 500,
          exercise_time: 35,
          stand_hours: 12,
          movement_energy: null,
          day: "2024-01-15",
        },
        {
          id: 2,
          date_components: "2024-01-16",
          active_energy: 400,
          exercise_time: 25,
          stand_hours: 10,
          movement_energy: null,
          day: "2024-01-16",
        },
      ],
    };

    const result = transformMonthHealthData(raw);

    expect(result.activity).not.toBeNull();
    expect(result.activity!.totalActiveEnergy).toBe(900);
    expect(result.activity!.avgActiveEnergy).toBe(450);
    expect(result.activity!.totalExerciseMinutes).toBe(60);
    expect(result.activity!.avgExerciseMinutes).toBe(30);
    expect(result.activity!.totalStandHours).toBe(22);
    expect(result.activity!.daysWithData).toBe(2);
    expect(result.activity!.ringCloseCount.move).toBe(1); // Only day 1 >= 500
    expect(result.activity!.ringCloseCount.exercise).toBe(1); // Only day 1 >= 30
    expect(result.activity!.ringCloseCount.stand).toBe(1); // Only day 1 >= 12
    expect(result.activity!.ringCloseCount.all).toBe(1);
  });

  test("transforms distance records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "5.5",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T11:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "3.2",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T10:00:00+08:00",
          end_date: "2024-01-16T11:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierFlightsClimbed",
          unit: "count",
          value: "10",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:15:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.distance).not.toBeNull();
    expect(result.distance!.totalDistance).toBeCloseTo(8.7, 1);
    expect(result.distance!.maxDistance).toBeCloseTo(5.5, 1);
    expect(result.distance!.maxDistanceDate).toBe("2024-01-15");
    expect(result.distance!.totalFlightsClimbed).toBe(10);
    expect(result.distance!.daysWithData).toBe(2);
  });

  test("transforms workout records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [],
      workouts: [
        {
          id: 1,
          workout_type: "HKWorkoutActivityTypeRunning",
          duration: 1800, // 30 minutes in seconds
          total_distance: 5000,
          total_energy: 300,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2024-01-15T18:00:00+08:00",
          end_date: "2024-01-15T18:30:00+08:00",
          day: "2024-01-15",
        },
        {
          id: 2,
          workout_type: "HKWorkoutActivityTypeRunning",
          duration: 2400, // 40 minutes
          total_distance: 7000,
          total_energy: 400,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2024-01-16T18:00:00+08:00",
          end_date: "2024-01-16T18:40:00+08:00",
          day: "2024-01-16",
        },
        {
          id: 3,
          workout_type: "HKWorkoutActivityTypeSwimming",
          duration: 3600, // 60 minutes
          total_distance: 1500,
          total_energy: 500,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2024-01-17T10:00:00+08:00",
          end_date: "2024-01-17T11:00:00+08:00",
          day: "2024-01-17",
        },
      ],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.workouts).not.toBeNull();
    expect(result.workouts!.totalWorkouts).toBe(3);
    expect(result.workouts!.totalDuration).toBe(130); // 30 + 40 + 60 minutes
    expect(result.workouts!.totalDistance).toBe(13500);
    expect(result.workouts!.totalCalories).toBe(1200);
    expect(result.workouts!.daysWithWorkouts).toBe(3);
    expect(result.workouts!.byType).toHaveLength(2);
    expect(result.workouts!.byType[0].typeName).toBe("Running");
    expect(result.workouts!.byType[0].count).toBe(2);
  });

  test("transforms HRV records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          unit: "ms",
          value: "45",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T02:00:00+08:00",
          end_date: "2024-01-15T02:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          unit: "ms",
          value: "55",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T02:00:00+08:00",
          end_date: "2024-01-16T02:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.hrv).not.toBeNull();
    expect(result.hrv!.avgHrv).toBe(50);
    expect(result.hrv!.minHrv).toBe(45);
    expect(result.hrv!.maxHrv).toBe(55);
    expect(result.hrv!.daysWithData).toBe(2);
  });

  test("transforms oxygen saturation records", () => {
    const raw: AppleHealthMonthRawData = {
      month: "2024-01",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierOxygenSaturation",
          unit: "%",
          value: "0.98",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T02:00:00+08:00",
          end_date: "2024-01-15T02:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierOxygenSaturation",
          unit: "%",
          value: "0.96",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T02:00:00+08:00",
          end_date: "2024-01-16T02:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformMonthHealthData(raw);

    expect(result.oxygen).not.toBeNull();
    expect(result.oxygen!.avgOxygen).toBe(97); // (98 + 96) / 2
    expect(result.oxygen!.minOxygen).toBe(96);
    expect(result.oxygen!.maxOxygen).toBe(98);
    expect(result.oxygen!.daysWithData).toBe(2);
  });
});

describe("transformMonthFootprintData", () => {
  test("transforms empty data", () => {
    const raw: FootprintMonthRawData = {
      month: "2024-01",
      dayAggs: [],
      monthAgg: null,
    };

    const result = transformMonthFootprintData(raw);

    expect(result.month).toBe("2024-01");
    expect(result.daysInMonth).toBe(31);
    expect(result.daysWithData).toBe(0);
    expect(result.totalDistance).toBe(0);
    expect(result.totalTrackPoints).toBe(0);
    expect(result.bounds).toBeNull();
  });

  test("transforms with day aggregations", () => {
    const raw: FootprintMonthRawData = {
      month: "2024-01",
      dayAggs: [
        {
          source: "footprint",
          day: "2024-01-15",
          point_count: 100,
          min_ts: "2024-01-15T08:00:00+08:00",
          max_ts: "2024-01-15T18:00:00+08:00",
          avg_speed: 1.5,
          min_lat: 39.9,
          max_lat: 39.95,
          min_lon: 116.4,
          max_lon: 116.45,
        },
        {
          source: "footprint",
          day: "2024-01-16",
          point_count: 80,
          min_ts: "2024-01-16T09:00:00+08:00",
          max_ts: "2024-01-16T17:00:00+08:00",
          avg_speed: 1.2,
          min_lat: 39.85,
          max_lat: 39.9,
          min_lon: 116.35,
          max_lon: 116.4,
        },
      ],
      monthAgg: null,
    };

    const result = transformMonthFootprintData(raw);

    expect(result.daysWithData).toBe(2);
    expect(result.dailyDistance).toHaveLength(2);
    expect(result.dailyTrackPoints).toHaveLength(2);
    expect(result.dailyTrackPoints[0].value).toBe(100);
    expect(result.dailyTrackPoints[1].value).toBe(80);
  });

  test("transforms with month aggregation", () => {
    const raw: FootprintMonthRawData = {
      month: "2024-01",
      dayAggs: [
        {
          source: "footprint",
          day: "2024-01-15",
          point_count: 500,
          min_ts: "2024-01-15T08:00:00+08:00",
          max_ts: "2024-01-15T18:00:00+08:00",
          avg_speed: 1.5,
          min_lat: 39.8,
          max_lat: 39.9,
          min_lon: 116.3,
          max_lon: 116.4,
        },
        {
          source: "footprint",
          day: "2024-01-16",
          point_count: 500,
          min_ts: "2024-01-16T08:00:00+08:00",
          max_ts: "2024-01-16T18:00:00+08:00",
          avg_speed: 1.5,
          min_lat: 39.9,
          max_lat: 40.0,
          min_lon: 116.4,
          max_lon: 116.5,
        },
      ],
      monthAgg: {
        source: "footprint",
        month: "2024-01",
        point_count: 1000,
      },
    };

    const result = transformMonthFootprintData(raw);

    expect(result.totalTrackPoints).toBe(1000);
    expect(result.avgSpeed).toBe(1.5);
    expect(result.bounds).not.toBeNull();
    expect(result.bounds!.minLat).toBe(39.8);
    expect(result.bounds!.maxLat).toBe(40.0);
    expect(result.bounds!.minLon).toBe(116.3);
    expect(result.bounds!.maxLon).toBe(116.5);
  });
});

describe("transformMonthPixiuData", () => {
  test("transforms empty data", () => {
    const raw: PixiuMonthRawData = {
      month: "2024-01",
      transactions: [],
      dayAggs: [],
      monthAgg: null,
    };

    const result = transformMonthPixiuData(raw);

    expect(result.month).toBe("2024-01");
    expect(result.daysInMonth).toBe(31);
    expect(result.daysWithData).toBe(0);
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpense).toBe(0);
    expect(result.totalNet).toBe(0);
    expect(result.expenseByCategory).toEqual([]);
    expect(result.incomeByCategory).toEqual([]);
    expect(result.byAccount).toEqual([]);
    expect(result.topExpenses).toEqual([]);
  });

  test("transforms transactions and builds category breakdown", () => {
    const raw: PixiuMonthRawData = {
      month: "2024-01",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 12:30",
          category_l1: "Food",
          category_l2: "Lunch",
          inflow: 0,
          outflow: 35,
          currency: "CNY",
          account: "WeChat",
          tags: null,
          note: "Work lunch",
          year: 2024,
        },
        {
          id: 2,
          source: "pixiu",
          tx_date: "2024-01-15 18:00",
          category_l1: "Food",
          category_l2: "Lunch",
          inflow: 0,
          outflow: 25,
          currency: "CNY",
          account: "Alipay",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 3,
          source: "pixiu",
          tx_date: "2024-01-16 08:00",
          category_l1: "Transport",
          category_l2: "Taxi",
          inflow: 0,
          outflow: 40,
          currency: "CNY",
          account: "WeChat",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAggs: [
        {
          source: "pixiu",
          day: "2024-01-15",
          income: 0,
          expense: 60,
          net: -60,
          tx_count: 2,
        },
        {
          source: "pixiu",
          day: "2024-01-16",
          income: 0,
          expense: 40,
          net: -40,
          tx_count: 1,
        },
      ],
      monthAgg: {
        source: "pixiu",
        month: "2024-01",
        income: 0,
        expense: 100,
        net: -100,
        tx_count: 3,
      },
    };

    const result = transformMonthPixiuData(raw);

    expect(result.daysWithData).toBe(2);
    expect(result.totalExpense).toBe(100);
    expect(result.totalNet).toBe(-100);
    expect(result.transactionCount).toBe(3);

    // Category breakdown
    expect(result.expenseByCategory).toHaveLength(2);
    expect(result.expenseByCategory[0].category).toBe("Lunch");
    expect(result.expenseByCategory[0].amount).toBe(60);
    expect(result.expenseByCategory[0].count).toBe(2);
    expect(result.expenseByCategory[1].category).toBe("Taxi");
    expect(result.expenseByCategory[1].amount).toBe(40);

    // Account breakdown
    expect(result.byAccount).toHaveLength(2);
    expect(result.byAccount[0].account).toBe("WeChat");
    expect(result.byAccount[0].expense).toBe(75); // 35 + 40
    expect(result.byAccount[1].account).toBe("Alipay");
    expect(result.byAccount[1].expense).toBe(25);

    // Daily data
    expect(result.dailyExpense).toHaveLength(2);
    expect(result.dailyNet).toHaveLength(2);
  });

  test("transforms income transactions", () => {
    const raw: PixiuMonthRawData = {
      month: "2024-01",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 10:00",
          category_l1: "Income",
          category_l2: "Salary",
          inflow: 10000,
          outflow: 0,
          currency: "CNY",
          account: "Bank",
          tags: null,
          note: "Monthly salary",
          year: 2024,
        },
      ],
      dayAggs: [
        {
          source: "pixiu",
          day: "2024-01-15",
          income: 10000,
          expense: 0,
          net: 10000,
          tx_count: 1,
        },
      ],
      monthAgg: {
        source: "pixiu",
        month: "2024-01",
        income: 10000,
        expense: 0,
        net: 10000,
        tx_count: 1,
      },
    };

    const result = transformMonthPixiuData(raw);

    expect(result.totalIncome).toBe(10000);
    expect(result.totalNet).toBe(10000);
    expect(result.incomeByCategory).toHaveLength(1);
    expect(result.incomeByCategory[0].category).toBe("Salary");
    expect(result.incomeByCategory[0].amount).toBe(10000);
    expect(result.incomeByCategory[0].percentage).toBe(100);
  });

  test("extracts top expenses", () => {
    const raw: PixiuMonthRawData = {
      month: "2024-01",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 12:00",
          category_l1: "Shopping",
          category_l2: "Electronics",
          inflow: 0,
          outflow: 5000,
          currency: "CNY",
          account: "Credit Card",
          tags: null,
          note: "New laptop",
          year: 2024,
        },
        {
          id: 2,
          source: "pixiu",
          tx_date: "2024-01-16 14:00",
          category_l1: "Shopping",
          category_l2: "Clothing",
          inflow: 0,
          outflow: 800,
          currency: "CNY",
          account: "Credit Card",
          tags: null,
          note: "Winter coat",
          year: 2024,
        },
        {
          id: 3,
          source: "pixiu",
          tx_date: "2024-01-17 10:00",
          category_l1: "Food",
          category_l2: "Lunch",
          inflow: 0,
          outflow: 30,
          currency: "CNY",
          account: "WeChat",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAggs: [],
      monthAgg: null,
    };

    const result = transformMonthPixiuData(raw);

    expect(result.topExpenses).toHaveLength(3);
    expect(result.topExpenses[0].amount).toBe(5000);
    expect(result.topExpenses[0].category).toBe("Electronics");
    expect(result.topExpenses[0].note).toBe("New laptop");
    expect(result.topExpenses[1].amount).toBe(800);
    expect(result.topExpenses[2].amount).toBe(30);
  });

  test("calculates daily averages", () => {
    const raw: PixiuMonthRawData = {
      month: "2024-01",
      transactions: [],
      dayAggs: [
        {
          source: "pixiu",
          day: "2024-01-15",
          income: 100,
          expense: 50,
          net: 50,
          tx_count: 2,
        },
        {
          source: "pixiu",
          day: "2024-01-16",
          income: 200,
          expense: 150,
          net: 50,
          tx_count: 3,
        },
      ],
      monthAgg: {
        source: "pixiu",
        month: "2024-01",
        income: 300,
        expense: 200,
        net: 100,
        tx_count: 5,
      },
    };

    const result = transformMonthPixiuData(raw);

    expect(result.avgDailyExpense).toBe(100); // 200 / 2 days
    expect(result.avgDailyIncome).toBe(150); // 300 / 2 days
  });
});
