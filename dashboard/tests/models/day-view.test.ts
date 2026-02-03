import { describe, expect, it } from "bun:test";
import {
  createEmptyDaySummary,
  buildDaySummary,
  type DaySummary,
  type DayViewData,
  type TimelineEvent,
  type TimelineEventType,
} from "@/models/day-view";
import { createEmptyDayHealthData } from "@/models/apple-health";
import { createEmptyDayFootprintData } from "@/models/footprint";
import { createEmptyDayPixiuData } from "@/models/pixiu";

describe("day-view model", () => {
  describe("createEmptyDaySummary", () => {
    it("should create empty summary with given date", () => {
      const date = "2025-01-15";
      const summary = createEmptyDaySummary(date);

      expect(summary.date).toBe(date);
      expect(summary.steps).toBe(0);
      expect(summary.heartRateAvg).toBeNull();
      expect(summary.heartRateMin).toBeNull();
      expect(summary.heartRateMax).toBeNull();
      expect(summary.activeEnergy).toBeNull();
      expect(summary.exerciseMinutes).toBeNull();
      expect(summary.standHours).toBeNull();
      expect(summary.sleepHours).toBeNull();
      expect(summary.distance).toBeNull();
      expect(summary.locationCount).toBe(0);
      expect(summary.income).toBe(0);
      expect(summary.expense).toBe(0);
      expect(summary.net).toBe(0);
      expect(summary.transactionCount).toBe(0);
    });
  });

  describe("buildDaySummary", () => {
    it("should build summary from empty data", () => {
      const date = "2025-01-15";
      const health = createEmptyDayHealthData(date);
      const footprint = createEmptyDayFootprintData(date);
      const pixiu = createEmptyDayPixiuData(date);

      const summary = buildDaySummary(date, health, footprint, pixiu);

      expect(summary.date).toBe(date);
      expect(summary.steps).toBe(0);
      expect(summary.heartRateAvg).toBeNull();
      expect(summary.sleepHours).toBeNull();
      expect(summary.distance).toBeNull();
      expect(summary.expense).toBe(0);
    });

    it("should build summary from populated data", () => {
      const date = "2025-01-15";
      const health = {
        ...createEmptyDayHealthData(date),
        totalSteps: 12345,
        heartRate: { avg: 72, min: 52, max: 145, records: [] },
        sleep: {
          start: "23:00",
          end: "07:00",
          duration: 480,
          stages: [],
          deepMinutes: 120,
          coreMinutes: 180,
          remMinutes: 90,
          awakeMinutes: 30,
        },
        activity: {
          activeEnergy: 450,
          exerciseMinutes: 45,
          standHours: 10,
        },
      };
      const footprint = {
        ...createEmptyDayFootprintData(date),
        summary: {
          pointCount: 1000,
          totalDistance: 15000,
          avgSpeed: 1.5,
          minTime: "07:00",
          maxTime: "22:00",
        },
        locations: [
          {
            id: "loc-1",
            name: "Office",
            startTime: "08:00",
            endTime: "17:00",
            lat: 39.9,
            lon: 116.4,
            duration: 540,
          },
        ],
      };
      const pixiu = {
        ...createEmptyDayPixiuData(date),
        summary: {
          income: 0,
          expense: 256.5,
          net: -256.5,
          transactionCount: 6,
        },
      };

      const summary = buildDaySummary(date, health, footprint, pixiu);

      expect(summary.steps).toBe(12345);
      expect(summary.heartRateAvg).toBe(72);
      expect(summary.heartRateMin).toBe(52);
      expect(summary.heartRateMax).toBe(145);
      expect(summary.activeEnergy).toBe(450);
      expect(summary.exerciseMinutes).toBe(45);
      expect(summary.standHours).toBe(10);
      expect(summary.sleepHours).toBe(8);
      expect(summary.distance).toBe(15000);
      expect(summary.locationCount).toBe(1);
      expect(summary.expense).toBe(256.5);
      expect(summary.transactionCount).toBe(6);
    });
  });

  describe("type definitions", () => {
    it("should allow valid DaySummary", () => {
      const summary: DaySummary = {
        date: "2025-01-15",
        steps: 12345,
        heartRateAvg: 72,
        heartRateMin: 52,
        heartRateMax: 145,
        activeEnergy: 450,
        exerciseMinutes: 45,
        standHours: 10,
        sleepHours: 8,
        distance: 15000,
        locationCount: 3,
        income: 0,
        expense: 256.5,
        net: -256.5,
        transactionCount: 6,
      };
      expect(summary.steps).toBe(12345);
    });

    it("should allow valid DayViewData", () => {
      const date = "2025-01-15";
      const data: DayViewData = {
        date,
        summary: createEmptyDaySummary(date),
        health: createEmptyDayHealthData(date),
        footprint: createEmptyDayFootprintData(date),
        pixiu: createEmptyDayPixiuData(date),
      };
      expect(data.date).toBe(date);
    });

    it("should allow valid TimelineEvent", () => {
      const event: TimelineEvent = {
        id: "evt-1",
        type: "workout",
        time: "18:00",
        endTime: "18:30",
        title: "Running",
        subtitle: "5.2 km",
        icon: "run",
        color: "bg-green-500",
      };
      expect(event.type).toBe("workout");
    });

    it("should allow all TimelineEventType values", () => {
      const types: TimelineEventType[] = [
        "sleep",
        "wake",
        "workout",
        "location",
        "transaction",
        "heart_rate",
        "water",
      ];
      expect(types.length).toBe(7);
    });
  });
});
