/**
 * Branch-coverage edge cases for transformers.ts
 *
 * Targets uncovered ternary/nullish branches around workouts, activity,
 * track summary fallbacks, and category breakdown when total is zero.
 */

import { describe, expect, test } from "vitest";
import {
  transformAppleHealthData,
  transformFootprintData,
  transformPixiuData,
} from "@/lib/transformers";
import type {
  AppleHealthRawData,
  AppleRecordRow,
  AppleWorkoutRow,
  AppleActivitySummaryRow,
} from "@/services/applehealth-service";
import type {
  FootprintRawData,
  TrackPointRow,
  TrackDayAggRow,
} from "@/services/footprint-service";
import type {
  PixiuRawData,
  PixiuTransactionRow,
} from "@/services/pixiu-service";

const sleepRecord = (
  id: number,
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
  day: start.slice(0, 10),
  timezone: null,
});

const baseHealth: AppleHealthRawData = {
  date: "2024-01-15",
  records: [],
  workouts: [],
  activitySummary: null,
};

describe("transformers branch extras", () => {
  test("workout with unknown type falls back to type-name strip (L97)", () => {
    const w: AppleWorkoutRow = {
      id: 1,
      workout_type: "HKWorkoutActivityTypeFooBar",
      duration: null, // falsy → 0 branch
      total_distance: null, // ?? undefined branch
      total_energy: null,
      source_name: null,
      device: null,
      creation_date: null,
      start_date: "2024-01-15 10:00:00 +0800",
      end_date: "2024-01-15 11:00:00 +0800",
      day: "2024-01-15",
    };
    const result = transformAppleHealthData({ ...baseHealth, workouts: [w] });
    expect(result.workouts[0].typeName).toBe("FooBar");
    expect(result.workouts[0].duration).toBe(0);
    expect(result.workouts[0].distance).toBeUndefined();
    expect(result.workouts[0].calories).toBeUndefined();
  });

  test("sleep: unknown stage value, post-noon stage, gap > 2h split, and zero stages", () => {
    // Unknown stage value → SLEEP_STAGE_MAP[r.value!] is undefined → returns null (L141)
    const unknownStage = sleepRecord(
      1,
      "HKCategoryValueSleepAnalysisInBed",
      "2024-01-15 00:00:00 +0800",
      "2024-01-15 01:00:00 +0800"
    );
    // Post-noon → endDateTime >= noonCutoff → returns null (L147)
    const postNoonStage = sleepRecord(
      2,
      "HKCategoryValueSleepAnalysisAsleepCore",
      "2024-01-15 14:00:00 +0800",
      "2024-01-15 15:00:00 +0800"
    );
    // First-session and second-session split with > 2h gap (L178 break)
    const overnightFirst = sleepRecord(
      3,
      "HKCategoryValueSleepAnalysisAsleepCore",
      "2024-01-15 00:00:00 +0800",
      "2024-01-15 02:00:00 +0800"
    );
    const overnightSecond = sleepRecord(
      4,
      "HKCategoryValueSleepAnalysisAsleepCore",
      "2024-01-15 06:00:00 +0800", // 4h gap → split
      "2024-01-15 07:00:00 +0800"
    );
    const result = transformAppleHealthData({
      ...baseHealth,
      records: [unknownStage, postNoonStage, overnightFirst, overnightSecond],
    });
    // Only the first overnight session is kept
    expect(result.sleep?.duration).toBe(120);

    // Zero valid stages after filter (only post-noon + unknown) → returns null (L164)
    const noneValid = transformAppleHealthData({
      ...baseHealth,
      records: [postNoonStage, unknownStage],
    });
    expect(noneValid.sleep).toBeNull();
  });

  test("activity summary: null fields fall through ?? 0 branches", () => {
    const summary: AppleActivitySummaryRow = {
      id: 1,
      date_components: "2024-01-15",
      active_energy: null,
      exercise_time: null,
      stand_hours: null,
      movement_energy: null,
      day: "2024-01-15",
    };
    const result = transformAppleHealthData({ ...baseHealth, activitySummary: summary });
    expect(result.activity).toEqual({
      activeEnergy: 0,
      exerciseMinutes: 0,
      standHours: 0,
    });
  });

  test("footprint: dayAgg with null min_ts/max_ts hits fallback to 00:00/23:59", () => {
    const dayAgg: TrackDayAggRow = {
      source: "footprint",
      day: "2024-01-15",
      point_count: 0,
      min_ts: null,
      max_ts: null,
      avg_speed: null, // ?? 0 branch
      min_lat: null,
      max_lat: null,
      min_lon: null,
      max_lon: null,
    };
    const data: FootprintRawData = {
      date: "2024-01-15",
      trackPoints: [],
      dayAgg,
    };
    const result = transformFootprintData(data);
    expect(result.summary?.minTime).toBe("00:00");
    expect(result.summary?.maxTime).toBe("23:59");
    expect(result.summary?.avgSpeed).toBe(0);
  });

  test("footprint: no dayAgg, no points → null summary", () => {
    const result = transformFootprintData({
      date: "2024-01-15",
      trackPoints: [],
      dayAgg: null,
    });
    expect(result.summary).toBeNull();
  });

  test("footprint: points only (no dayAgg) computes summary from points (L495/L496 fallbacks)", () => {
    const points: TrackPointRow[] = [
      {
        id: 1,
        source: "footprint",
        track_date: "2024-01-15",
        ts: "2024-01-15T08:00:00+08:00",
        lat: 39.9,
        lon: 116.4,
        ele: null,
        speed: null, // forces speed undefined branch
        course: null,
      },
    ];
    const result = transformFootprintData({
      date: "2024-01-15",
      trackPoints: points,
      dayAgg: null,
    });
    expect(result.summary?.minTime).toBe("08:00");
    expect(result.summary?.maxTime).toBe("08:00");
  });

  test("pixiu: empty transactions and no dayAgg → no summary; income-only category triggers total===0 fallback (L622)", () => {
    const result = transformPixiuData({
      date: "2024-01-15",
      transactions: [],
      dayAgg: null,
    });
    expect(result.summary).toBeNull();

    // Income-only transactions exercise the buildCategoryBreakdown call path
    // for expenses where filtered.length is 0 → total === 0 → fallback to 0
    const incomeTx: PixiuTransactionRow = {
      id: 1,
      source: "pixiu",
      tx_date: "2024-01-15 12:00",
      category_l1: "收入",
      category_l2: "工资",
      inflow: 1000,
      outflow: 0,
      currency: "CNY",
      account: "微信",
      tags: null,
      note: null,
      year: 2024,
    };
    const incomeOnly: PixiuRawData = {
      date: "2024-01-15",
      transactions: [incomeTx],
      dayAgg: null,
    };
    const incomeResult = transformPixiuData(incomeOnly);
    expect(incomeResult.summary?.income).toBe(1000);
  });
});
