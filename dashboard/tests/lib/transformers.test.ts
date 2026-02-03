/**
 * Tests for data transformers
 */

import { describe, expect, test } from "bun:test";
import {
  extractTime,
  transformAppleHealthData,
  transformFootprintData,
  transformPixiuData,
} from "@/lib/transformers";
import type { AppleHealthRawData } from "@/services/applehealth-service";
import type { FootprintRawData } from "@/services/footprint-service";
import type { PixiuRawData } from "@/services/pixiu-service";

describe("extractTime", () => {
  test("extracts time from ISO format", () => {
    expect(extractTime("2024-01-15T14:30:00+08:00")).toBe("14:30");
    expect(extractTime("2024-01-15T09:15:00Z")).toBe("09:15");
  });

  test("extracts time from space-separated format", () => {
    expect(extractTime("2024-01-15 14:30")).toBe("14:30");
    expect(extractTime("2024-01-15 09:15")).toBe("09:15");
  });

  test("returns 00:00 for invalid format", () => {
    expect(extractTime("invalid")).toBe("00:00");
    expect(extractTime("2024-01-15")).toBe("00:00");
  });
});

describe("transformAppleHealthData", () => {
  test("transforms empty data", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.date).toBe("2024-01-15");
    expect(result.heartRate).toBeNull();
    expect(result.steps).toEqual([]);
    expect(result.totalSteps).toBe(0);
    expect(result.workouts).toEqual([]);
    expect(result.activity).toBeNull();
  });

  test("transforms heart rate records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
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
          start_date: "2024-01-15T12:00:00+08:00",
          end_date: "2024-01-15T12:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.heartRate).not.toBeNull();
    expect(result.heartRate!.avg).toBe(74); // (72 + 85 + 65) / 3 = 74
    expect(result.heartRate!.min).toBe(65);
    expect(result.heartRate!.max).toBe(85);
    expect(result.heartRate!.records).toHaveLength(3);
    expect(result.heartRate!.records[0]).toEqual({ time: "10:00", value: 72 });
  });

  test("transforms step records by hour", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "500",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:15:00+08:00",
          end_date: "2024-01-15T10:30:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "300",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:45:00+08:00",
          end_date: "2024-01-15T11:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierStepCount",
          unit: "count",
          value: "200",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T11:30:00+08:00",
          end_date: "2024-01-15T11:45:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({ hour: 10, count: 800 }); // 500 + 300
    expect(result.steps[1]).toEqual({ hour: 11, count: 200 });
    expect(result.totalSteps).toBe(1000);
  });

  test("transforms workouts", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
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
      ],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]).toEqual({
      id: "workout-1",
      type: "HKWorkoutActivityTypeRunning",
      typeName: "Running",
      start: "2024-01-15T18:00:00+08:00",
      end: "2024-01-15T18:30:00+08:00",
      duration: 30,
      distance: 5000,
      calories: 300,
    });
  });

  test("transforms activity summary", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [],
      workouts: [],
      activitySummary: {
        id: 1,
        date_components: "2024-01-15",
        active_energy: 450,
        exercise_time: 35,
        stand_hours: 10,
        movement_energy: null,
        day: "2024-01-15",
      },
    };

    const result = transformAppleHealthData(raw);

    expect(result.activity).not.toBeNull();
    expect(result.activity!.activeEnergy).toBe(450);
    expect(result.activity!.exerciseMinutes).toBe(35);
    expect(result.activity!.standHours).toBe(10);
  });
});

describe("transformFootprintData", () => {
  test("transforms empty data", () => {
    const raw: FootprintRawData = {
      date: "2024-01-15",
      trackPoints: [],
      dayAgg: null,
    };

    const result = transformFootprintData(raw);

    expect(result.date).toBe("2024-01-15");
    expect(result.summary).toBeNull();
    expect(result.locations).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  test("transforms with day aggregation", () => {
    const raw: FootprintRawData = {
      date: "2024-01-15",
      trackPoints: [
        {
          id: 1,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T10:00:00+08:00",
          lat: 39.9042,
          lon: 116.4074,
          ele: null,
          speed: 1.5,
          course: null,
        },
        {
          id: 2,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T10:01:00+08:00",
          lat: 39.9043,
          lon: 116.4075,
          ele: null,
          speed: 1.6,
          course: null,
        },
      ],
      dayAgg: {
        source: "footprint",
        day: "2024-01-15",
        point_count: 2,
        min_ts: "2024-01-15T10:00:00+08:00",
        max_ts: "2024-01-15T10:01:00+08:00",
        avg_speed: 1.55,
        min_lat: 39.9042,
        max_lat: 39.9043,
        min_lon: 116.4074,
        max_lon: 116.4075,
      },
    };

    const result = transformFootprintData(raw);

    expect(result.summary).not.toBeNull();
    expect(result.summary!.pointCount).toBe(2);
    expect(result.summary!.avgSpeed).toBe(1.55);
    expect(result.summary!.minTime).toBe("10:00");
    expect(result.summary!.maxTime).toBe("10:01");
  });

  test("calculates distance from track points", () => {
    const raw: FootprintRawData = {
      date: "2024-01-15",
      trackPoints: [
        {
          id: 1,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T10:00:00+08:00",
          lat: 39.9042,
          lon: 116.4074,
          ele: null,
          speed: null,
          course: null,
        },
        {
          id: 2,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T10:10:00+08:00",
          lat: 39.9142, // ~1.1 km north
          lon: 116.4074,
          ele: null,
          speed: null,
          course: null,
        },
      ],
      dayAgg: {
        source: "footprint",
        day: "2024-01-15",
        point_count: 2,
        min_ts: "2024-01-15T10:00:00+08:00",
        max_ts: "2024-01-15T10:10:00+08:00",
        avg_speed: null,
        min_lat: 39.9042,
        max_lat: 39.9142,
        min_lon: 116.4074,
        max_lon: 116.4074,
      },
    };

    const result = transformFootprintData(raw);

    expect(result.summary).not.toBeNull();
    // ~1.11 km for 0.01 degree of latitude
    expect(result.summary!.totalDistance).toBeGreaterThan(1000);
    expect(result.summary!.totalDistance).toBeLessThan(1200);
  });
});

describe("transformPixiuData", () => {
  test("transforms empty data", () => {
    const raw: PixiuRawData = {
      date: "2024-01-15",
      transactions: [],
      dayAgg: null,
    };

    const result = transformPixiuData(raw);

    expect(result.date).toBe("2024-01-15");
    expect(result.summary).toBeNull();
    expect(result.transactions).toEqual([]);
    expect(result.expenseByCategory).toEqual([]);
    expect(result.incomeByCategory).toEqual([]);
  });

  test("transforms transactions", () => {
    const raw: PixiuRawData = {
      date: "2024-01-15",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 12:30",
          category_l1: "日常支出",
          category_l2: "餐饮",
          inflow: 0,
          outflow: 35,
          currency: "CNY",
          account: "微信",
          tags: null,
          note: "午餐",
          year: 2024,
        },
        {
          id: 2,
          source: "pixiu",
          tx_date: "2024-01-15 18:00",
          category_l1: "日常支出",
          category_l2: "交通",
          inflow: 0,
          outflow: 10,
          currency: "CNY",
          account: "支付宝",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAgg: null,
    };

    const result = transformPixiuData(raw);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      id: "tx-1",
      time: "12:30",
      categoryL1: "日常支出",
      categoryL2: "餐饮",
      amount: 35,
      isIncome: false,
      account: "微信",
      tags: undefined,
      note: "午餐",
    });
  });

  test("transforms income transactions", () => {
    const raw: PixiuRawData = {
      date: "2024-01-15",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 10:00",
          category_l1: "日常收入",
          category_l2: "工资",
          inflow: 10000,
          outflow: 0,
          currency: "CNY",
          account: "银行卡",
          tags: null,
          note: "月薪",
          year: 2024,
        },
      ],
      dayAgg: null,
    };

    const result = transformPixiuData(raw);

    expect(result.transactions[0].isIncome).toBe(true);
    expect(result.transactions[0].amount).toBe(10000);
  });

  test("uses day aggregation for summary", () => {
    const raw: PixiuRawData = {
      date: "2024-01-15",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 12:30",
          category_l1: "日常支出",
          category_l2: "餐饮",
          inflow: 0,
          outflow: 35,
          currency: "CNY",
          account: "微信",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAgg: {
        source: "pixiu",
        day: "2024-01-15",
        income: 0,
        expense: 35,
        net: -35,
        tx_count: 1,
      },
    };

    const result = transformPixiuData(raw);

    expect(result.summary).not.toBeNull();
    expect(result.summary!.income).toBe(0);
    expect(result.summary!.expense).toBe(35);
    expect(result.summary!.net).toBe(-35);
    expect(result.summary!.transactionCount).toBe(1);
  });

  test("builds category breakdown", () => {
    const raw: PixiuRawData = {
      date: "2024-01-15",
      transactions: [
        {
          id: 1,
          source: "pixiu",
          tx_date: "2024-01-15 08:00",
          category_l1: "日常支出",
          category_l2: "餐饮",
          inflow: 0,
          outflow: 15,
          currency: "CNY",
          account: "支付宝",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 2,
          source: "pixiu",
          tx_date: "2024-01-15 12:30",
          category_l1: "日常支出",
          category_l2: "餐饮",
          inflow: 0,
          outflow: 35,
          currency: "CNY",
          account: "微信",
          tags: null,
          note: null,
          year: 2024,
        },
        {
          id: 3,
          source: "pixiu",
          tx_date: "2024-01-15 18:00",
          category_l1: "日常支出",
          category_l2: "交通",
          inflow: 0,
          outflow: 10,
          currency: "CNY",
          account: "微信",
          tags: null,
          note: null,
          year: 2024,
        },
      ],
      dayAgg: null,
    };

    const result = transformPixiuData(raw);

    expect(result.expenseByCategory).toHaveLength(2);
    // Sorted by amount descending
    expect(result.expenseByCategory[0].category).toBe("餐饮");
    expect(result.expenseByCategory[0].amount).toBe(50);
    expect(result.expenseByCategory[0].count).toBe(2);
    expect(result.expenseByCategory[0].percentage).toBeCloseTo(83.33, 1);

    expect(result.expenseByCategory[1].category).toBe("交通");
    expect(result.expenseByCategory[1].amount).toBe(10);
    expect(result.expenseByCategory[1].count).toBe(1);
    expect(result.expenseByCategory[1].percentage).toBeCloseTo(16.67, 1);
  });
});
