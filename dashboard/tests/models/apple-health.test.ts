import { describe, expect, it } from "bun:test";
import {
  createEmptyDayHealthData,
  type DayHealthData,
  type SleepRecord,
  type HeartRateSummary,
  type StepsRecord,
  type WaterRecord,
  type WorkoutRecord,
  type ActivitySummary,
} from "@/models/apple-health";

describe("apple-health model", () => {
  describe("createEmptyDayHealthData", () => {
    it("should create empty health data with given date", () => {
      const date = "2025-01-15";
      const data = createEmptyDayHealthData(date);

      expect(data.date).toBe(date);
      expect(data.sleep).toBeNull();
      expect(data.heartRate).toBeNull();
      expect(data.steps).toEqual([]);
      expect(data.totalSteps).toBe(0);
      expect(data.water).toEqual([]);
      expect(data.totalWater).toBe(0);
      expect(data.workouts).toEqual([]);
      expect(data.activity).toBeNull();
      expect(data.ecgRecords).toEqual([]);
    });
  });

  describe("type definitions", () => {
    it("should allow valid SleepRecord", () => {
      const sleep: SleepRecord = {
        start: "2025-01-14T23:00:00",
        end: "2025-01-15T07:00:00",
        duration: 480,
        stages: [
          { type: "deep", duration: 120 },
          { type: "light", duration: 180 },
          { type: "rem", duration: 90 },
          { type: "awake", duration: 30 },
        ],
      };
      expect(sleep.duration).toBe(480);
    });

    it("should allow valid HeartRateSummary", () => {
      const hr: HeartRateSummary = {
        avg: 72,
        min: 52,
        max: 145,
        records: [
          { time: "08:00", value: 75 },
          { time: "12:00", value: 68 },
        ],
      };
      expect(hr.avg).toBe(72);
    });

    it("should allow valid StepsRecord", () => {
      const steps: StepsRecord = { hour: 8, count: 1234 };
      expect(steps.hour).toBe(8);
    });

    it("should allow valid WaterRecord", () => {
      const water: WaterRecord = { time: "09:00", amount: 250 };
      expect(water.amount).toBe(250);
    });

    it("should allow valid WorkoutRecord", () => {
      const workout: WorkoutRecord = {
        id: "w1",
        type: "HKWorkoutActivityTypeRunning",
        typeName: "Running",
        start: "2025-01-15T18:00:00",
        end: "2025-01-15T18:30:00",
        duration: 30,
        distance: 5000,
        calories: 300,
      };
      expect(workout.typeName).toBe("Running");
    });

    it("should allow valid ActivitySummary", () => {
      const activity: ActivitySummary = {
        activeEnergy: 450,
        exerciseMinutes: 45,
        standHours: 10,
        activeEnergyGoal: 500,
        exerciseGoal: 30,
        standGoal: 12,
      };
      expect(activity.activeEnergy).toBe(450);
    });

    it("should allow valid DayHealthData", () => {
      const data: DayHealthData = {
        date: "2025-01-15",
        sleep: null,
        heartRate: null,
        steps: [],
        totalSteps: 0,
        water: [],
        totalWater: 0,
        workouts: [],
        activity: null,
        ecgRecords: [],
      };
      expect(data.date).toBe("2025-01-15");
    });
  });
});
