/**
 * Supplementary edge-case tests for year-transformers to cover branch holes
 */

import { describe, expect, test } from "vitest";
import {
  transformYearHealthData,
  transformYearFootprintData,
  transformYearPixiuData,
} from "@/lib/year-transformers";
import type {
  AppleHealthYearRawData,
  AppleRecordRow,
  AppleWorkoutRow,
  AppleActivitySummaryRow,
} from "@/services/applehealth-service";
import type {
  FootprintYearRawData,
  TrackDayAggRow,
} from "@/services/footprint-service";
import type {
  PixiuYearRawData,
  PixiuTransactionRow,
} from "@/services/pixiu-service";

const sleepRecord = (
  id: number,
  day: string,
  value: string,
  start: string,
  end: string
): AppleRecordRow => ({
  id,
  type: "HKCategoryTypeIdentifierSleepAnalysis",
  unit: null,
  value,
  source_name: "Apple Watch",
  source_version: null,
  device: null,
  creation_date: null,
  start_date: start,
  end_date: end,
  day,
  timezone: null,
});

const valueRecord = (
  id: number,
  type: string,
  day: string,
  value: string,
  unit: string | null = null
): AppleRecordRow => ({
  id,
  type,
  unit,
  value,
  source_name: "Apple Watch",
  source_version: null,
  device: null,
  creation_date: null,
  start_date: `${day} 12:00:00 +0800`,
  end_date: `${day} 12:01:00 +0800`,
  day,
  timezone: null,
});

const workout = (
  id: number,
  day: string,
  workoutType: string,
  duration: number | null,
  distance: number | null,
  energy: number | null
): AppleWorkoutRow => ({
  id,
  workout_type: workoutType,
  duration,
  total_distance: distance,
  total_energy: energy,
  source_name: null,
  device: null,
  creation_date: null,
  start_date: `${day} 10:00:00 +0800`,
  end_date: `${day} 11:00:00 +0800`,
  day,
});

const activity = (
  id: number,
  day: string,
  active: number | null,
  exercise: number | null,
  stand: number | null
): AppleActivitySummaryRow => ({
  id,
  date_components: day,
  active_energy: active,
  exercise_time: exercise,
  stand_hours: stand,
  movement_energy: null,
  day,
});

const footprintAgg = (
  day: string,
  pointCount: number,
  speed: number | null,
  bounds: {
    minLat: number | null;
    maxLat: number | null;
    minLon: number | null;
    maxLon: number | null;
  }
): TrackDayAggRow => ({
  source: "footprint",
  day,
  point_count: pointCount,
  min_ts: `${day}T08:00:00+08:00`,
  max_ts: `${day}T18:00:00+08:00`,
  avg_speed: speed,
  min_lat: bounds.minLat,
  max_lat: bounds.maxLat,
  min_lon: bounds.minLon,
  max_lon: bounds.maxLon,
});

const tx = (
  id: number,
  day: string,
  inflow: number,
  outflow: number,
  l1 = "日常支出",
  l2 = "餐饮"
): PixiuTransactionRow => ({
  id,
  source: "pixiu",
  tx_date: `${day} 12:30`,
  category_l1: l1,
  category_l2: l2,
  inflow,
  outflow,
  currency: "CNY",
  account: "微信",
  tags: null,
  note: null,
  year: parseInt(day.slice(0, 4), 10),
});

describe("year-transformers extras", () => {
  test("sleep: covers Core/REM/Awake branches and dayTotal === 0 case", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        sleepRecord(
          1,
          "2024-01-15",
          "HKCategoryValueSleepAnalysisAsleepCore",
          "2024-01-15 00:00:00 +0800",
          "2024-01-15 01:00:00 +0800"
        ),
        sleepRecord(
          2,
          "2024-01-15",
          "HKCategoryValueSleepAnalysisAsleepREM",
          "2024-01-15 01:00:00 +0800",
          "2024-01-15 01:30:00 +0800"
        ),
        sleepRecord(
          3,
          "2024-01-15",
          "HKCategoryValueSleepAnalysisAwake",
          "2024-01-15 01:30:00 +0800",
          "2024-01-15 01:45:00 +0800"
        ),
        // A day with only a non-sleep value -> dayTotal === 0 (else branch of L149)
        sleepRecord(
          4,
          "2024-02-10",
          "HKCategoryValueSleepAnalysisInBed",
          "2024-02-10 00:00:00 +0800",
          "2024-02-10 00:00:00 +0800"
        ),
      ],
      workouts: [],
      activitySummaries: [],
    };
    const result = transformYearHealthData(raw);
    expect(result.sleep).not.toBeNull();
    // Only 2024-01-15 contributes sleep minutes (Core 60 + REM 30 + Awake 15);
    // 2024-02-10 has only InBed -> dayTotal === 0 and is excluded from
    // daysWithData and the avg-* breakdown denominators.
    expect(result.sleep!.daysWithData).toBe(1);
    expect(result.sleep!.avgCoreMinutes).toBe(60);
    expect(result.sleep!.avgRemMinutes).toBe(30);
    expect(result.sleep!.avgAwakeMinutes).toBe(15);
    expect(result.sleep!.avgDeepMinutes).toBe(0);
    // 105 minutes of sleep for the single contributing day -> 1.75h avg/total
    expect(result.sleep!.totalHours).toBeCloseTo(1.75);
    expect(result.sleep!.avgDuration).toBeCloseTo(1.75);
  });

  test("workouts: type fallback when not in WORKOUT_TYPE_NAMES, falsy duration, null distance/energy", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [],
      workouts: [
        // Unknown type -> fallback branch on L96
        workout(1, "2024-03-01", "HKWorkoutActivityTypeUnknownXYZ", null, null, null),
      ],
      activitySummaries: [],
    };
    const result = transformYearHealthData(raw);
    expect(result.workouts).not.toBeNull();
    // Falsy duration / null distance / null energy collapse to 0 totals
    expect(result.workouts!.totalWorkouts).toBe(1);
    expect(result.workouts!.totalDuration).toBe(0);
    expect(result.workouts!.totalDistance).toBe(0);
    expect(result.workouts!.totalCalories).toBe(0);
    expect(result.workouts!.daysWithWorkouts).toBe(1);
    // Unknown type falls back to stripping the `HKWorkoutActivityType` prefix
    expect(result.workouts!.byType).toEqual([
      {
        type: "HKWorkoutActivityTypeUnknownXYZ",
        typeName: "UnknownXYZ",
        count: 1,
        totalDuration: 0,
        totalDistance: 0,
        totalCalories: 0,
      },
    ]);
  });

  test("activity: null active_energy/exercise_time/stand_hours hit ?? 0 branches", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [],
      workouts: [],
      activitySummaries: [activity(1, "2024-04-10", null, null, null)],
    };
    const result = transformYearHealthData(raw);
    expect(result.activity).not.toBeNull();
    // All three nullable activity fields collapse to 0 totals (and 0 averages)
    expect(result.activity!.totalActiveEnergy).toBe(0);
    expect(result.activity!.avgActiveEnergy).toBe(0);
    expect(result.activity!.totalExerciseMinutes).toBe(0);
    expect(result.activity!.avgExerciseMinutes).toBe(0);
    expect(result.activity!.totalStandHours).toBe(0);
    expect(result.activity!.avgStandHours).toBe(0);
    expect(result.activity!.daysWithData).toBe(1);
  });

  test("distance: maxDistance comparison with smaller dayTotal hits false branch", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        valueRecord(
          1,
          "HKQuantityTypeIdentifierDistanceWalkingRunning",
          "2024-05-01",
          "5000",
          "m"
        ),
        valueRecord(
          2,
          "HKQuantityTypeIdentifierDistanceWalkingRunning",
          "2024-05-02",
          "1000",
          "m"
        ),
      ],
      workouts: [],
      activitySummaries: [],
    };
    const result = transformYearHealthData(raw);
    expect(result.distance).not.toBeNull();
    // 5000 m on 2024-05-01 stays the maximum even though 2024-05-02 (1000 m)
    // is processed afterwards and exercises the false branch of `v > maxDistance`.
    expect(result.distance!.maxDistance).toBe(5000);
    expect(result.distance!.maxDistanceDate).toBe("2024-05-01");
    expect(result.distance!.totalDistance).toBe(6000);
  });

  test("hrv/oxygen: descending values exercise the false branch of v>maxValue", () => {
    const raw: AppleHealthYearRawData = {
      year: 2024,
      records: [
        valueRecord(1, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "2024-06-01", "60"),
        valueRecord(2, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "2024-06-02", "50"),
        valueRecord(3, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "2024-06-03", "40"),
        valueRecord(4, "HKQuantityTypeIdentifierOxygenSaturation", "2024-06-01", "0.99"),
        valueRecord(5, "HKQuantityTypeIdentifierOxygenSaturation", "2024-06-02", "0.97"),
        valueRecord(6, "HKQuantityTypeIdentifierOxygenSaturation", "2024-06-03", "0.95"),
      ],
      workouts: [],
      activitySummaries: [],
    };
    const result = transformYearHealthData(raw);
    expect(result.hrv).not.toBeNull();
    expect(result.oxygen).not.toBeNull();
  });

  test("footprint: null avg_speed and null bounds exercise nullable branches", () => {
    const raw: FootprintYearRawData = {
      year: 2024,
      dayAggs: [
        footprintAgg("2024-07-01", 10, null, {
          minLat: null,
          maxLat: null,
          minLon: null,
          maxLon: null,
        }),
        // Second day with non-null bounds to exercise both branches
        footprintAgg("2024-07-02", 20, 1.0, {
          minLat: 39.0,
          maxLat: 39.5,
          minLon: 116.0,
          maxLon: 116.5,
        }),
      ],
      monthAggs: [],
      yearAgg: null,
    };
    const result = transformYearFootprintData(raw);
    expect(result.daysWithData).toBeGreaterThanOrEqual(1);
  });

  test("pixiu: zero-total expense breakdown hits 0 fallback in percentage ternary", () => {
    const raw: PixiuYearRawData = {
      year: 2024,
      transactions: [
        // income only -> when computing expense breakdown total === 0
        tx(1, "2024-08-01", 1000, 0, "收入", "工资"),
      ],
      dayAggs: [],
      monthAggs: [],
      yearAgg: null,
    };
    const result = transformYearPixiuData(raw);
    expect(result).toBeDefined();
  });
});
