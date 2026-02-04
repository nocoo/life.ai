/**
 * Tests for year view data transformers
 */

import { describe, expect, test } from "bun:test";
import {
  getDaysInYear,
  transformYearHealthData,
  transformYearFootprintData,
  transformYearPixiuData,
} from "@/lib/year-transformers";
import type { AppleHealthYearRawData } from "@/services/applehealth-service";
import type { FootprintYearRawData } from "@/services/footprint-service";
import type { PixiuYearRawData } from "@/services/pixiu-service";

describe("getDaysInYear", () => {
  test("returns 365 for non-leap year", () => {
    expect(getDaysInYear(2023)).toBe(365);
  });

  test("returns 366 for leap year", () => {
    expect(getDaysInYear(2024)).toBe(366);
  });

  test("returns 365 for century year not divisible by 400", () => {
    expect(getDaysInYear(1900)).toBe(365);
  });

  test("returns 366 for century year divisible by 400", () => {
    expect(getDaysInYear(2000)).toBe(366);
  });
});

describe("transformYearHealthData", () => {
  test("transforms empty data", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.year).toBe(2024);
    expect(result.daysInYear).toBe(366);
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

  test("transforms sleep records with monthly breakdown", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
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
          end_date: "2024-01-15 02:00:00 +0800",
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
          start_date: "2024-01-15 02:00:00 +0800",
          end_date: "2024-01-15 06:00:00 +0800",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAsleepDeep",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15 00:00:00 +0800",
          end_date: "2024-02-15 02:00:00 +0800",
          day: "2024-02-15",
          timezone: null,
        },
        {
          id: 4,
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          unit: null,
          value: "HKCategoryValueSleepAnalysisAsleepCore",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15 02:00:00 +0800",
          end_date: "2024-02-15 08:00:00 +0800",
          day: "2024-02-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.sleep).not.toBeNull();
    expect(result.sleep!.daysWithData).toBe(2);
    expect(result.sleep!.totalHours).toBe(14); // 6 + 8 hours
    expect(result.sleep!.avgDuration).toBe(7); // 14 / 2 days
    expect(result.sleep!.monthlyDuration).toHaveLength(2);
    expect(result.sleep!.monthlyDuration[0].month).toBe("2024-01");
    expect(result.sleep!.monthlyDuration[0].value).toBe(6);
    expect(result.sleep!.monthlyDuration[1].month).toBe("2024-02");
    expect(result.sleep!.monthlyDuration[1].value).toBe(8);
    expect(result.sleep!.dailyDuration).toHaveLength(2);
  });

  test("transforms heart rate records with monthly averages", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierHeartRate",
          unit: "count/min",
          value: "70",
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
          value: "80",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T10:00:00+08:00",
          end_date: "2024-01-16T10:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierHeartRate",
          unit: "count/min",
          value: "75",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15T10:00:00+08:00",
          end_date: "2024-02-15T10:00:00+08:00",
          day: "2024-02-15",
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

    const result = transformYearHealthData(raw);

    expect(result.heartRate).not.toBeNull();
    expect(result.heartRate!.avgHeartRate).toBe(75); // (70 + 80 + 75) / 3
    expect(result.heartRate!.minHeartRate).toBe(70);
    expect(result.heartRate!.maxHeartRate).toBe(80);
    expect(result.heartRate!.avgRestingHeartRate).toBe(55);
    expect(result.heartRate!.daysWithData).toBe(3);
    expect(result.heartRate!.monthlyAvg).toHaveLength(2);
    expect(result.heartRate!.monthlyAvg[0].month).toBe("2024-01");
    expect(result.heartRate!.monthlyResting).toHaveLength(1);
  });

  test("transforms step records with monthly totals", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "10000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T18:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "8000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-16T10:00:00+08:00",
          end_date: "2024-01-16T18:00:00+08:00",
          day: "2024-01-16",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "12000",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15T10:00:00+08:00",
          end_date: "2024-02-15T18:00:00+08:00",
          day: "2024-02-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.steps).not.toBeNull();
    expect(result.steps!.totalSteps).toBe(30000);
    expect(result.steps!.avgSteps).toBe(10000);
    expect(result.steps!.maxSteps).toBe(12000);
    expect(result.steps!.maxStepsDate).toBe("2024-02-15");
    expect(result.steps!.daysWithData).toBe(3);
    expect(result.steps!.monthlySteps).toHaveLength(2);
    expect(result.steps!.monthlySteps[0].month).toBe("2024-01");
    expect(result.steps!.monthlySteps[0].value).toBe(18000);
    expect(result.steps!.dailySteps).toHaveLength(3);
  });

  test("transforms activity summaries with ring counts", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [],
      workouts: [],
      activitySummaries: [
        {
          id: 1,
          date_components: "2024-01-15",
          active_energy: 600,
          exercise_time: 40,
          stand_hours: 14,
          movement_energy: null,
          day: "2024-01-15",
        },
        {
          id: 2,
          date_components: "2024-01-16",
          active_energy: 400,
          exercise_time: 20,
          stand_hours: 10,
          movement_energy: null,
          day: "2024-01-16",
        },
        {
          id: 3,
          date_components: "2024-02-15",
          active_energy: 550,
          exercise_time: 35,
          stand_hours: 12,
          movement_energy: null,
          day: "2024-02-15",
        },
      ],
    };

    const result = transformYearHealthData(raw);

    expect(result.activity).not.toBeNull();
    expect(result.activity!.totalActiveEnergy).toBe(1550);
    expect(result.activity!.totalExerciseMinutes).toBe(95);
    expect(result.activity!.totalStandHours).toBe(36);
    expect(result.activity!.daysWithData).toBe(3);
    expect(result.activity!.ringCloseCount.move).toBe(2); // 600, 550 >= 500
    expect(result.activity!.ringCloseCount.exercise).toBe(2); // 40, 35 >= 30
    expect(result.activity!.ringCloseCount.stand).toBe(2); // 14, 12 >= 12
    expect(result.activity!.ringCloseCount.all).toBe(2);
    expect(result.activity!.monthlyActiveEnergy).toHaveLength(2);
  });

  test("transforms workout records with type breakdown", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [],
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
          start_date: "2024-01-15T18:00:00+08:00",
          end_date: "2024-01-15T18:30:00+08:00",
          day: "2024-01-15",
        },
        {
          id: 2,
          workout_type: "HKWorkoutActivityTypeRunning",
          duration: 2400,
          total_distance: 7000,
          total_energy: 400,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2024-02-15T18:00:00+08:00",
          end_date: "2024-02-15T18:40:00+08:00",
          day: "2024-02-15",
        },
        {
          id: 3,
          workout_type: "HKWorkoutActivityTypeSwimming",
          duration: 3600,
          total_distance: 1500,
          total_energy: 500,
          source_name: "Apple Watch",
          device: null,
          creation_date: null,
          start_date: "2024-03-15T10:00:00+08:00",
          end_date: "2024-03-15T11:00:00+08:00",
          day: "2024-03-15",
        },
      ],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.workouts).not.toBeNull();
    expect(result.workouts!.totalWorkouts).toBe(3);
    expect(result.workouts!.totalDuration).toBe(130);
    expect(result.workouts!.totalDistance).toBe(13500);
    expect(result.workouts!.totalCalories).toBe(1200);
    expect(result.workouts!.daysWithWorkouts).toBe(3);
    expect(result.workouts!.byType).toHaveLength(2);
    expect(result.workouts!.byType[0].typeName).toBe("Running");
    expect(result.workouts!.byType[0].count).toBe(2);
    expect(result.workouts!.monthlyWorkouts).toHaveLength(3);
    expect(result.workouts!.monthlyDuration).toHaveLength(3);
  });

  test("transforms HRV records with monthly averages", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          unit: "ms",
          value: "40",
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
          value: "50",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15T02:00:00+08:00",
          end_date: "2024-02-15T02:00:00+08:00",
          day: "2024-02-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          unit: "ms",
          value: "60",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-16T02:00:00+08:00",
          end_date: "2024-02-16T02:00:00+08:00",
          day: "2024-02-16",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.hrv).not.toBeNull();
    expect(result.hrv!.avgHrv).toBe(50);
    expect(result.hrv!.minHrv).toBe(40);
    expect(result.hrv!.maxHrv).toBe(60);
    expect(result.hrv!.daysWithData).toBe(3);
    expect(result.hrv!.monthlyHrv).toHaveLength(2);
  });

  test("transforms oxygen saturation records", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierOxygenSaturation",
          unit: "%",
          value: "0.97",
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
          value: "0.98",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15T02:00:00+08:00",
          end_date: "2024-02-15T02:00:00+08:00",
          day: "2024-02-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummaries: [],
    };

    const result = transformYearHealthData(raw);

    expect(result.oxygen).not.toBeNull();
    expect(result.oxygen!.avgOxygen).toBe(98); // (97 + 98) / 2 ≈ 97.5 -> 98
    expect(result.oxygen!.minOxygen).toBe(97);
    expect(result.oxygen!.maxOxygen).toBe(98);
    expect(result.oxygen!.daysWithData).toBe(2);
    expect(result.oxygen!.monthlyOxygen).toHaveLength(2);
  });

  test("transforms distance records with monthly totals", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
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
          value: "6.2",
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
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "8.0",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-02-15T10:00:00+08:00",
          end_date: "2024-02-15T11:00:00+08:00",
          day: "2024-02-15",
          timezone: null,
        },
        {
          id: 4,
          type: "HKQuantityTypeIdentifierFlightsClimbed",
          unit: "count",
          value: "15",
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

    const result = transformYearHealthData(raw);

    expect(result.distance).not.toBeNull();
    expect(result.distance!.totalDistance).toBeCloseTo(19.7, 1);
    expect(result.distance!.maxDistance).toBeCloseTo(8.0, 1);
    expect(result.distance!.maxDistanceDate).toBe("2024-02-15");
    expect(result.distance!.totalFlightsClimbed).toBe(15);
    expect(result.distance!.daysWithData).toBe(3);
    expect(result.distance!.monthlyDistance).toHaveLength(2);
    expect(result.distance!.monthlyDistance[0].month).toBe("2024-01");
    expect(result.distance!.monthlyDistance[0].value).toBeCloseTo(11.7, 1);
  });
});

describe("transformYearFootprintData", () => {
  test("transforms empty data", () => {
    const raw: FootprintYearRawData = {
      year: 2024,
      dayAggs: [],
      monthAggs: [],
      yearAgg: null,
    };

    const result = transformYearFootprintData(raw);

    expect(result.year).toBe(2024);
    expect(result.daysInYear).toBe(366);
    expect(result.daysWithData).toBe(0);
    expect(result.totalDistance).toBe(0);
    expect(result.totalTrackPoints).toBe(0);
    expect(result.bounds).toBeNull();
  });

  test("transforms with month aggregations", () => {
    const raw: FootprintYearRawData = {
      year: 2024,
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
      ],
      monthAggs: [
        {
          source: "footprint",
          month: "2024-01",
          point_count: 500,
        },
        {
          source: "footprint",
          month: "2024-02",
          point_count: 400,
        },
      ],
      yearAgg: null,
    };

    const result = transformYearFootprintData(raw);

    expect(result.daysWithData).toBe(1);
    expect(result.monthlyDistance).toHaveLength(2);
    expect(result.monthlyTrackPoints).toHaveLength(2);
    expect(result.monthlyTrackPoints[0].value).toBe(500);
    expect(result.monthlyTrackPoints[1].value).toBe(400);
  });

  test("transforms with year aggregation", () => {
    const raw: FootprintYearRawData = {
      year: 2024,
      dayAggs: [
        {
          source: "footprint",
          day: "2024-01-15",
          point_count: 5000,
          min_ts: "2024-01-15T08:00:00+08:00",
          max_ts: "2024-01-15T18:00:00+08:00",
          avg_speed: 1.5,
          min_lat: 39.5,
          max_lat: 39.8,
          min_lon: 116.0,
          max_lon: 116.5,
        },
        {
          source: "footprint",
          day: "2024-06-15",
          point_count: 5000,
          min_ts: "2024-06-15T08:00:00+08:00",
          max_ts: "2024-06-15T18:00:00+08:00",
          avg_speed: 1.5,
          min_lat: 40.0,
          max_lat: 40.5,
          min_lon: 116.5,
          max_lon: 117.0,
        },
      ],
      monthAggs: [],
      yearAgg: {
        source: "footprint",
        year: 2024,
        point_count: 10000,
      },
    };

    const result = transformYearFootprintData(raw);

    expect(result.totalTrackPoints).toBe(10000);
    expect(result.avgSpeed).toBe(1.5);
    expect(result.bounds).not.toBeNull();
    expect(result.bounds!.minLat).toBe(39.5);
    expect(result.bounds!.maxLat).toBe(40.5);
  });
});

describe("transformYearPixiuData", () => {
  test("transforms empty data", () => {
    const raw: PixiuYearRawData = {
      year: 2024,
      transactions: [],
      dayAggs: [],
      monthAggs: [],
      yearAgg: null,
    };

    const result = transformYearPixiuData(raw);

    expect(result.year).toBe(2024);
    expect(result.daysInYear).toBe(366);
    expect(result.daysWithData).toBe(0);
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpense).toBe(0);
    expect(result.totalNet).toBe(0);
    expect(result.expenseByCategory).toEqual([]);
    expect(result.incomeByCategory).toEqual([]);
    expect(result.byAccount).toEqual([]);
    expect(result.topExpenseMonths).toEqual([]);
  });

  test("transforms with month aggregations and builds monthly trends", () => {
    const raw: PixiuYearRawData = {
      year: 2024,
      transactions: [],
      dayAggs: [
        {
          source: "pixiu",
          day: "2024-01-15",
          income: 0,
          expense: 100,
          net: -100,
          tx_count: 3,
        },
        {
          source: "pixiu",
          day: "2024-02-15",
          income: 0,
          expense: 150,
          net: -150,
          tx_count: 5,
        },
      ],
      monthAggs: [
        {
          source: "pixiu",
          month: "2024-01",
          income: 10000,
          expense: 3000,
          net: 7000,
          tx_count: 50,
        },
        {
          source: "pixiu",
          month: "2024-02",
          income: 10000,
          expense: 4000,
          net: 6000,
          tx_count: 60,
        },
        {
          source: "pixiu",
          month: "2024-03",
          income: 10000,
          expense: 5000,
          net: 5000,
          tx_count: 70,
        },
      ],
      yearAgg: {
        source: "pixiu",
        year: 2024,
        income: 30000,
        expense: 12000,
        net: 18000,
        tx_count: 180,
      },
    };

    const result = transformYearPixiuData(raw);

    expect(result.daysWithData).toBe(2);
    expect(result.totalIncome).toBe(30000);
    expect(result.totalExpense).toBe(12000);
    expect(result.totalNet).toBe(18000);
    expect(result.transactionCount).toBe(180);
    expect(result.avgMonthlyExpense).toBe(4000); // 12000 / 3 months
    expect(result.avgMonthlyIncome).toBe(10000); // 30000 / 3 months
    expect(result.monthlyIncome).toHaveLength(3);
    expect(result.monthlyExpense).toHaveLength(3);
    expect(result.monthlyNet).toHaveLength(3);
    expect(result.dailyExpense).toHaveLength(2);
  });

  test("extracts top expense months", () => {
    const raw: PixiuYearRawData = {
      year: 2024,
      transactions: [],
      dayAggs: [],
      monthAggs: [
        {
          source: "pixiu",
          month: "2024-01",
          income: 0,
          expense: 3000,
          net: -3000,
          tx_count: 50,
        },
        {
          source: "pixiu",
          month: "2024-02",
          income: 0,
          expense: 5000,
          net: -5000,
          tx_count: 60,
        },
        {
          source: "pixiu",
          month: "2024-03",
          income: 0,
          expense: 4000,
          net: -4000,
          tx_count: 55,
        },
        {
          source: "pixiu",
          month: "2024-04",
          income: 0,
          expense: 2000,
          net: -2000,
          tx_count: 40,
        },
      ],
      yearAgg: null,
    };

    const result = transformYearPixiuData(raw);

    expect(result.topExpenseMonths).toHaveLength(3);
    expect(result.topExpenseMonths[0].month).toBe("2024-02");
    expect(result.topExpenseMonths[0].amount).toBe(5000);
    expect(result.topExpenseMonths[1].month).toBe("2024-03");
    expect(result.topExpenseMonths[1].amount).toBe(4000);
    expect(result.topExpenseMonths[2].month).toBe("2024-01");
    expect(result.topExpenseMonths[2].amount).toBe(3000);
  });

  test("builds category and account breakdowns from transactions", () => {
    const raw: PixiuYearRawData = {
      year: 2024,
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 12:30",
          category_l1: "Food",
          category_l2: "Restaurant",
          inflow: 0,
          outflow: 100,
          currency: "CNY",
          account: "WeChat",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 2,
          source: "pixiu",
          tx_date: "2024-02-15 12:30",
          category_l1: "Food",
          category_l2: "Restaurant",
          inflow: 0,
          outflow: 150,
          currency: "CNY",
          account: "Alipay",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 3,
          source: "pixiu",
          tx_date: "2024-03-15 12:30",
          category_l1: "Shopping",
          category_l2: "Electronics",
          inflow: 0,
          outflow: 500,
          currency: "CNY",
          account: "Credit Card",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 4,
          source: "pixiu",
          tx_date: "2024-01-15 10:00",
          category_l1: "Income",
          category_l2: "Salary",
          inflow: 10000,
          outflow: 0,
          currency: "CNY",
          account: "Bank",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAggs: [],
      monthAggs: [],
      yearAgg: null,
    };

    const result = transformYearPixiuData(raw);

    // Expense breakdown
    expect(result.expenseByCategory).toHaveLength(2);
    expect(result.expenseByCategory[0].category).toBe("Electronics");
    expect(result.expenseByCategory[0].amount).toBe(500);
    expect(result.expenseByCategory[1].category).toBe("Restaurant");
    expect(result.expenseByCategory[1].amount).toBe(250);

    // Income breakdown
    expect(result.incomeByCategory).toHaveLength(1);
    expect(result.incomeByCategory[0].category).toBe("Salary");
    expect(result.incomeByCategory[0].amount).toBe(10000);

    // Account breakdown
    expect(result.byAccount).toHaveLength(4);
    // Sorted by expense descending
    expect(result.byAccount[0].account).toBe("Credit Card");
    expect(result.byAccount[0].expense).toBe(500);
  });
});
