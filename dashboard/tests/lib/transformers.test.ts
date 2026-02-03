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
    expect(result.distance).toBeNull();
    expect(result.oxygenSaturation).toBeNull();
    expect(result.respiratoryRate).toBeNull();
    expect(result.hrv).toBeNull();
    expect(result.flightsClimbed).toBe(0);
    expect(result.sleepingWristTemperature).toBeUndefined();
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

  test("transforms sleep records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
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
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.sleep).not.toBeNull();
    expect(result.sleep!.start).toBe("00:00");
    expect(result.sleep!.end).toBe("04:45");
    expect(result.sleep!.deepMinutes).toBe(60);
    expect(result.sleep!.coreMinutes).toBe(120);
    expect(result.sleep!.remMinutes).toBe(90);
    expect(result.sleep!.awakeMinutes).toBe(15);
    expect(result.sleep!.duration).toBe(285); // 60 + 120 + 90 + 15
    expect(result.sleep!.stages).toHaveLength(4);
  });

  test("transforms distance records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "0.5",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:15:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "0.3",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:30:00+08:00",
          end_date: "2024-01-15T10:45:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
          unit: "km",
          value: "1.2",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T11:00:00+08:00",
          end_date: "2024-01-15T11:30:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.distance).not.toBeNull();
    expect(result.distance!.total).toBe(2); // 0.5 + 0.3 + 1.2 = 2.0
    expect(result.distance!.records).toHaveLength(2); // 2 hours
    expect(result.distance!.records[0]).toEqual({ hour: 10, distance: 0.8 }); // 0.5 + 0.3
    expect(result.distance!.records[1]).toEqual({ hour: 11, distance: 1.2 });
  });

  test("transforms oxygen saturation records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
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
          value: "0.95",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T04:00:00+08:00",
          end_date: "2024-01-15T04:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierOxygenSaturation",
          unit: "%",
          value: "0.99",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T06:00:00+08:00",
          end_date: "2024-01-15T06:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.oxygenSaturation).not.toBeNull();
    expect(result.oxygenSaturation!.avg).toBe(97); // (98 + 95 + 99) / 3 ≈ 97
    expect(result.oxygenSaturation!.min).toBe(95);
    expect(result.oxygenSaturation!.max).toBe(99);
    expect(result.oxygenSaturation!.records).toHaveLength(3);
  });

  test("transforms respiratory rate records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierRespiratoryRate",
          unit: "count/min",
          value: "14.5",
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
          type: "HKQuantityTypeIdentifierRespiratoryRate",
          unit: "count/min",
          value: "12.0",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T04:00:00+08:00",
          end_date: "2024-01-15T04:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierRespiratoryRate",
          unit: "count/min",
          value: "16.5",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.respiratoryRate).not.toBeNull();
    expect(result.respiratoryRate!.avg).toBe(14.3); // (14.5 + 12.0 + 16.5) / 3 ≈ 14.3
    expect(result.respiratoryRate!.min).toBe(12);
    expect(result.respiratoryRate!.max).toBe(16.5);
    expect(result.respiratoryRate!.records).toHaveLength(3);
  });

  test("transforms HRV records", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
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
          start_date: "2024-01-15T04:00:00+08:00",
          end_date: "2024-01-15T04:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 3,
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          unit: "ms",
          value: "35",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.hrv).not.toBeNull();
    expect(result.hrv!.avg).toBe(45); // (45 + 55 + 35) / 3 = 45
    expect(result.hrv!.min).toBe(35);
    expect(result.hrv!.max).toBe(55);
    expect(result.hrv!.records).toHaveLength(3);
  });

  test("transforms flights climbed", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierFlightsClimbed",
          unit: "count",
          value: "3",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T10:00:00+08:00",
          end_date: "2024-01-15T10:15:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
        {
          id: 2,
          type: "HKQuantityTypeIdentifierFlightsClimbed",
          unit: "count",
          value: "2",
          source_name: "iPhone",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T14:00:00+08:00",
          end_date: "2024-01-15T14:15:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.flightsClimbed).toBe(5); // 3 + 2
  });

  test("transforms sleeping wrist temperature", () => {
    const raw: AppleHealthRawData = {
      date: "2024-01-15",
      records: [
        {
          id: 1,
          type: "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
          unit: "degC",
          value: "0.35",
          source_name: "Apple Watch",
          source_version: null,
          device: null,
          creation_date: null,
          start_date: "2024-01-15T04:00:00+08:00",
          end_date: "2024-01-15T04:00:00+08:00",
          day: "2024-01-15",
          timezone: null,
        },
      ],
      workouts: [],
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.sleepingWristTemperature).toBe(0.4); // rounded to 1 decimal
  });

  test("transforms resting and walking heart rate", () => {
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
        {
          id: 3,
          type: "HKQuantityTypeIdentifierWalkingHeartRateAverage",
          unit: "count/min",
          value: "98",
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
      activitySummary: null,
    };

    const result = transformAppleHealthData(raw);

    expect(result.heartRate).not.toBeNull();
    expect(result.heartRate!.restingHeartRate).toBe(55);
    expect(result.heartRate!.walkingAverage).toBe(98);
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

  test("transforms track points without day aggregation", () => {
    const raw: FootprintRawData = {
      date: "2024-01-15",
      trackPoints: [
        {
          id: 1,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T08:30:00+08:00",
          lat: 39.9042,
          lon: 116.4074,
          ele: null,
          speed: 1.2,
          course: null,
        },
        {
          id: 2,
          source: "footprint",
          track_date: "2024-01-15",
          ts: "2024-01-15T18:45:00+08:00",
          lat: 39.9142,
          lon: 116.4074,
          ele: null,
          speed: 1.8,
          course: null,
        },
      ],
      dayAgg: null, // No day aggregation
    };

    const result = transformFootprintData(raw);

    expect(result.summary).not.toBeNull();
    expect(result.summary!.pointCount).toBe(2);
    expect(result.summary!.avgSpeed).toBe(0); // No avg speed without dayAgg
    expect(result.summary!.minTime).toBe("08:30");
    expect(result.summary!.maxTime).toBe("18:45");
    // Distance should be calculated from track points
    expect(result.summary!.totalDistance).toBeGreaterThan(1000);
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
