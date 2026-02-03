import { describe, expect, it } from "bun:test";
import {
  createMockDayViewData,
  buildTimelineEvents,
  getMockDayData,
  createMockDayHealthData,
  createMockDayFootprintData,
  createMockDayPixiuData,
} from "@/mocks";

describe("mocks", () => {
  describe("createMockDayHealthData", () => {
    it("should create mock health data for a date", () => {
      const date = "2025-01-15";
      const data = createMockDayHealthData(date);

      expect(data.date).toBe(date);
      expect(data.sleep).not.toBeNull();
      expect(data.heartRate).not.toBeNull();
      expect(data.steps.length).toBeGreaterThan(0);
      expect(data.totalSteps).toBeGreaterThan(0);
      expect(data.water.length).toBeGreaterThan(0);
      expect(data.totalWater).toBeGreaterThan(0);
      expect(data.workouts.length).toBeGreaterThan(0);
      expect(data.activity).not.toBeNull();
    });

    it("should have valid sleep data", () => {
      const data = createMockDayHealthData("2025-01-15");
      expect(data.sleep!.duration).toBeGreaterThan(0);
      expect(data.sleep!.stages.length).toBeGreaterThan(0);
    });

    it("should have valid heart rate data", () => {
      const data = createMockDayHealthData("2025-01-15");
      expect(data.heartRate!.avg).toBeGreaterThan(0);
      expect(data.heartRate!.min).toBeLessThanOrEqual(data.heartRate!.avg);
      expect(data.heartRate!.max).toBeGreaterThanOrEqual(data.heartRate!.avg);
    });
  });

  describe("createMockDayFootprintData", () => {
    it("should create mock footprint data for a date", () => {
      const date = "2025-01-15";
      const data = createMockDayFootprintData(date);

      expect(data.date).toBe(date);
      expect(data.summary).not.toBeNull();
      expect(data.locations.length).toBeGreaterThan(0);
      expect(data.segments.length).toBeGreaterThan(0);
    });

    it("should have valid summary data", () => {
      const data = createMockDayFootprintData("2025-01-15");
      expect(data.summary!.totalDistance).toBeGreaterThan(0);
      expect(data.summary!.pointCount).toBeGreaterThan(0);
    });
  });

  describe("createMockDayPixiuData", () => {
    it("should create mock pixiu data for a date", () => {
      const date = "2025-01-15";
      const data = createMockDayPixiuData(date);

      expect(data.date).toBe(date);
      expect(data.summary).not.toBeNull();
      expect(data.transactions.length).toBeGreaterThan(0);
      expect(data.expenseByCategory.length).toBeGreaterThan(0);
    });

    it("should have valid summary data", () => {
      const data = createMockDayPixiuData("2025-01-15");
      expect(data.summary!.expense).toBeGreaterThan(0);
      expect(data.summary!.transactionCount).toBe(data.transactions.length);
    });

    it("should calculate category breakdown correctly", () => {
      const data = createMockDayPixiuData("2025-01-15");
      const totalCategoryAmount = data.expenseByCategory.reduce(
        (sum, cat) => sum + cat.amount,
        0
      );
      expect(totalCategoryAmount).toBeCloseTo(data.summary!.expense, 2);
    });
  });

  describe("createMockDayViewData", () => {
    it("should create complete day view data", () => {
      const date = "2025-01-15";
      const data = createMockDayViewData(date);

      expect(data.date).toBe(date);
      expect(data.summary).not.toBeNull();
      expect(data.health).not.toBeNull();
      expect(data.footprint).not.toBeNull();
      expect(data.pixiu).not.toBeNull();
    });

    it("should build summary from combined data", () => {
      const data = createMockDayViewData("2025-01-15");
      expect(data.summary.steps).toBe(data.health.totalSteps);
      expect(data.summary.expense).toBe(data.pixiu.summary!.expense);
    });
  });

  describe("buildTimelineEvents", () => {
    it("should build timeline events from day data", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      expect(events.length).toBeGreaterThan(0);
    });

    it("should include sleep events", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      const sleepEvents = events.filter((e) => e.type === "sleep");
      expect(sleepEvents.length).toBeGreaterThan(0);
    });

    it("should include wake events", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      const wakeEvents = events.filter((e) => e.type === "wake");
      expect(wakeEvents.length).toBeGreaterThan(0);
    });

    it("should include workout events", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      const workoutEvents = events.filter((e) => e.type === "workout");
      expect(workoutEvents.length).toBe(data.health.workouts.length);
    });

    it("should include transaction events", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      const txEvents = events.filter((e) => e.type === "transaction");
      expect(txEvents.length).toBe(data.pixiu.transactions.length);
    });

    it("should sort events by time", () => {
      const data = createMockDayViewData("2025-01-15");
      const events = buildTimelineEvents(data);

      for (let i = 1; i < events.length; i++) {
        expect(events[i].time >= events[i - 1].time).toBe(true);
      }
    });
  });

  describe("getMockDayData", () => {
    it("should return mock data for a Date object", () => {
      const date = new Date("2025-01-15");
      const data = getMockDayData(date);

      expect(data.date).toBe("2025-01-15");
      expect(data.summary).not.toBeNull();
    });
  });
});
