/**
 * Tests for timeline aggregator
 */

import { describe, expect, it } from "bun:test";
import {
  timeToSlotIndex,
  slotIndexToTime,
  generateHealthTimeSlots,
  SLOTS_PER_DAY,
} from "@/lib/timeline-aggregator";
import { createEmptyDayHealthData } from "@/models/apple-health";
import type { DayHealthData } from "@/models/apple-health";

describe("timeline-aggregator", () => {
  describe("SLOTS_PER_DAY", () => {
    it("should be 96 (24 hours × 4 quarters)", () => {
      expect(SLOTS_PER_DAY).toBe(96);
    });
  });

  describe("timeToSlotIndex", () => {
    it("should round to nearest 15-minute boundary", () => {
      // 00:00 - 00:07 → 00:00 (index 0)
      expect(timeToSlotIndex("00:00")).toBe(0);
      expect(timeToSlotIndex("00:07")).toBe(0);

      // 00:08 - 00:22 → 00:15 (index 1)
      expect(timeToSlotIndex("00:08")).toBe(1);
      expect(timeToSlotIndex("00:15")).toBe(1);
      expect(timeToSlotIndex("00:22")).toBe(1);

      // 00:23 - 00:37 → 00:30 (index 2)
      expect(timeToSlotIndex("00:23")).toBe(2);
      expect(timeToSlotIndex("00:30")).toBe(2);
      expect(timeToSlotIndex("00:37")).toBe(2);

      // 00:38 - 00:52 → 00:45 (index 3)
      expect(timeToSlotIndex("00:38")).toBe(3);
      expect(timeToSlotIndex("00:45")).toBe(3);
      expect(timeToSlotIndex("00:52")).toBe(3);

      // 00:53 - 01:07 → 01:00 (index 4)
      expect(timeToSlotIndex("00:53")).toBe(4);
      expect(timeToSlotIndex("01:00")).toBe(4);
      expect(timeToSlotIndex("01:07")).toBe(4);
    });

    it("should handle hour boundaries correctly", () => {
      expect(timeToSlotIndex("12:00")).toBe(48);
      expect(timeToSlotIndex("23:00")).toBe(92);
      expect(timeToSlotIndex("23:45")).toBe(95);
    });

    it("should wrap around at midnight", () => {
      // 23:53 rounds to 00:00 (next day, index 0)
      expect(timeToSlotIndex("23:53")).toBe(0);
    });
  });

  describe("slotIndexToTime", () => {
    it("should convert index to time string", () => {
      expect(slotIndexToTime(0)).toBe("00:00");
      expect(slotIndexToTime(1)).toBe("00:15");
      expect(slotIndexToTime(2)).toBe("00:30");
      expect(slotIndexToTime(3)).toBe("00:45");
      expect(slotIndexToTime(4)).toBe("01:00");
      expect(slotIndexToTime(48)).toBe("12:00");
      expect(slotIndexToTime(95)).toBe("23:45");
    });

    it("should be inverse of timeToSlotIndex for exact times", () => {
      for (let h = 0; h < 24; h++) {
        for (const m of [0, 15, 30, 45]) {
          const time = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
          const index = timeToSlotIndex(time);
          expect(slotIndexToTime(index)).toBe(time);
        }
      }
    });
  });

  describe("generateHealthTimeSlots", () => {
    it("should generate 96 slots for empty data with awake-day indicators", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      const slots = generateHealthTimeSlots(health);

      expect(slots).toHaveLength(96);
      // All slots should have awake-day indicator when no sleep data
      expect(slots.every((s) => s.items.length === 1)).toBe(true);
      expect(slots.every((s) => s.items[0].type === "awake-day")).toBe(true);
      expect(slots.every((s) => s.items[0].label === "起床")).toBe(true);
      expect(slots.every((s) => s.hasData === true)).toBe(true);
    });

    it("should fill sleep stages correctly with Chinese labels", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.sleep = {
        start: "23:30",
        end: "07:00",
        duration: 450,
        deepMinutes: 180,
        coreMinutes: 180,
        remMinutes: 90,
        awakeMinutes: 0,
        stages: [
          { type: "core", start: "23:30", end: "00:30", duration: 60 },
          { type: "deep", start: "00:30", end: "01:30", duration: 60 },
        ],
      };

      const slots = generateHealthTimeSlots(health);

      // 23:30 slot should have core with Chinese label, NO awake-day
      const slot23_30 = slots[timeToSlotIndex("23:30")];
      const coreItem = slot23_30.items.find((i) => i.type === "sleep-core");
      expect(coreItem).toBeDefined();
      expect(coreItem?.label).toBe("浅睡");
      expect(slot23_30.hasData).toBe(true);
      expect(slot23_30.items.some((i) => i.type === "awake-day")).toBe(false);

      // 00:30 slot should have deep with Chinese label, NO awake-day
      const slot00_30 = slots[timeToSlotIndex("00:30")];
      const deepItem = slot00_30.items.find((i) => i.type === "sleep-deep");
      expect(deepItem).toBeDefined();
      expect(deepItem?.label).toBe("深睡");
      expect(slot00_30.items.some((i) => i.type === "awake-day")).toBe(false);

      // 12:00 slot (no sleep) should have awake-day
      const slot12_00 = slots[timeToSlotIndex("12:00")];
      expect(slot12_00.items.some((i) => i.type === "awake-day")).toBe(true);
      expect(slot12_00.items.find((i) => i.type === "awake-day")?.label).toBe("起床");
    });

    it("should fill heart rate with averaged values and fixed 3-digit width", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.heartRate = {
        avg: 70,
        min: 50,
        max: 90,
        records: [
          { time: "08:00", value: 60 },
          { time: "08:05", value: 70 }, // Same slot as 08:00 (rounds to 08:00)
          { time: "08:07", value: 80 }, // Same slot as 08:00 (rounds to 08:00)
          { time: "09:00", value: 75 },
          { time: "10:00", value: 120 }, // 3-digit value
        ],
      };

      const slots = generateHealthTimeSlots(health);

      // 08:00 slot should have averaged heart rate (60+70+80)/3 = 70, padded to 3 digits
      const slot08_00 = slots[timeToSlotIndex("08:00")];
      const hrItem = slot08_00.items.find((i) => i.type === "heartRate");
      expect(hrItem).toBeDefined();
      expect(hrItem?.value).toBe(70);
      expect(hrItem?.label).toBe("♥ 70"); // Space before 70 for 3-digit width

      // 09:00 slot should have 75, padded to 3 digits
      const slot09_00 = slots[timeToSlotIndex("09:00")];
      const hrItem09 = slot09_00.items.find((i) => i.type === "heartRate");
      expect(hrItem09?.value).toBe(75);
      expect(hrItem09?.label).toBe("♥ 75");

      // 10:00 slot should have 120, no padding needed
      const slot10_00 = slots[timeToSlotIndex("10:00")];
      const hrItem10 = slot10_00.items.find((i) => i.type === "heartRate");
      expect(hrItem10?.value).toBe(120);
      expect(hrItem10?.label).toBe("♥120");
    });

    it("should fill workouts correctly", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.workouts = [
        {
          id: "w1",
          type: "HKWorkoutActivityTypeRunning",
          typeName: "Running",
          start: "2024-01-15T18:00:00",
          end: "2024-01-15T18:30:00",
          duration: 30,
          distance: 5000,
        },
      ];

      const slots = generateHealthTimeSlots(health);

      // 18:00 and 18:15 should have workout
      const slot18_00 = slots[timeToSlotIndex("18:00")];
      const workoutItem = slot18_00.items.find((i) => i.type === "workout");
      expect(workoutItem).toBeDefined();
      expect(workoutItem?.label).toBe("🏃 Running");

      const slot18_15 = slots[timeToSlotIndex("18:15")];
      expect(slot18_15.items.some((i) => i.type === "workout")).toBe(true);
    });

    it("should fill water intake correctly", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.water = [
        { time: "07:30", amount: 250 },
        { time: "12:00", amount: 300 },
      ];

      const slots = generateHealthTimeSlots(health);

      const slot07_30 = slots[timeToSlotIndex("07:30")];
      const waterItem = slot07_30.items.find((i) => i.type === "water");
      expect(waterItem).toBeDefined();
      expect(waterItem?.label).toBe("💧 250ml");
      expect(waterItem?.side).toBe("left");
    });

    it("should fill steps at hourly slots", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.steps = [
        { hour: 8, count: 1000 },
        { hour: 12, count: 500 },
      ];

      const slots = generateHealthTimeSlots(health);

      // Steps should be at :00 slots only
      const slot08_00 = slots[8 * 4]; // 08:00
      const stepsItem = slot08_00.items.find((i) => i.type === "steps");
      expect(stepsItem).toBeDefined();
      expect(stepsItem?.label).toBe("👣 1000");
      expect(stepsItem?.side).toBe("right");

      // 08:15 should NOT have steps
      const slot08_15 = slots[8 * 4 + 1];
      expect(slot08_15.items.some((i) => i.type === "steps")).toBe(false);
    });

    it("should fill distance at hourly slots with proper formatting", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.distance = {
        total: 5.5,
        records: [
          { hour: 8, distance: 0.5 }, // 500m
          { hour: 12, distance: 2.5 }, // 2.5km
        ],
      };

      const slots = generateHealthTimeSlots(health);

      const slot08_00 = slots[8 * 4];
      const distItem08 = slot08_00.items.find((i) => i.type === "distance");
      expect(distItem08?.label).toBe("📏 500m"); // < 1km shows meters

      const slot12_00 = slots[12 * 4];
      const distItem12 = slot12_00.items.find((i) => i.type === "distance");
      expect(distItem12?.label).toBe("📏 2.5km"); // >= 1km shows km
    });

    it("should fill oxygen saturation correctly", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.oxygenSaturation = {
        avg: 98,
        min: 95,
        max: 100,
        records: [{ time: "02:30", value: 98 }],
      };

      const slots = generateHealthTimeSlots(health);

      const slot02_30 = slots[timeToSlotIndex("02:30")];
      const o2Item = slot02_30.items.find((i) => i.type === "oxygenSaturation");
      expect(o2Item).toBeDefined();
      expect(o2Item?.label).toBe("SpO₂ 98%");
    });

    it("should fill HRV correctly", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.hrv = {
        avg: 50,
        min: 30,
        max: 80,
        records: [{ time: "06:00", value: 45.5 }],
      };

      const slots = generateHealthTimeSlots(health);

      const slot06_00 = slots[timeToSlotIndex("06:00")];
      const hrvItem = slot06_00.items.find((i) => i.type === "hrv");
      expect(hrvItem).toBeDefined();
      expect(hrvItem?.label).toBe("HRV 46"); // Rounded
    });

    it("should fill respiratory rate correctly with averaging", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.respiratoryRate = {
        avg: 16,
        min: 14,
        max: 20,
        records: [
          { time: "03:00", value: 14.0 },
          { time: "03:05", value: 16.0 }, // Same slot, should be averaged
          { time: "03:07", value: 17.0 }, // Same slot, should be averaged
        ],
      };

      const slots = generateHealthTimeSlots(health);

      const slot03_00 = slots[timeToSlotIndex("03:00")];
      // Should only have ONE respiratory rate item (merged)
      const rrItems = slot03_00.items.filter((i) => i.type === "respiratoryRate");
      expect(rrItems).toHaveLength(1);
      // Average of 14, 16, 17 = 15.67
      const rrItem = rrItems[0];
      expect(rrItem).toBeDefined();
      expect(rrItem?.value).toBeCloseTo(15.67, 1);
      expect(rrItem?.label).toBe("🫁 15.7");
    });

    it("should not add steps with count 0", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.steps = [
        { hour: 3, count: 0 },
        { hour: 8, count: 100 },
      ];

      const slots = generateHealthTimeSlots(health);

      const slot03_00 = slots[3 * 4];
      expect(slot03_00.items.some((i) => i.type === "steps")).toBe(false);

      const slot08_00 = slots[8 * 4];
      expect(slot08_00.items.some((i) => i.type === "steps")).toBe(true);
    });

    it("should use correct workout emoji based on type", () => {
      const health = createEmptyDayHealthData("2024-01-15");
      health.workouts = [
        {
          id: "w1",
          type: "HKWorkoutActivityTypeWalking",
          typeName: "Walking",
          start: "2024-01-15T08:00:00",
          end: "2024-01-15T08:30:00",
          duration: 30,
        },
        {
          id: "w2",
          type: "HKWorkoutActivityTypeCycling",
          typeName: "Cycling",
          start: "2024-01-15T10:00:00",
          end: "2024-01-15T10:30:00",
          duration: 30,
        },
        {
          id: "w3",
          type: "HKWorkoutActivityTypeSwimming",
          typeName: "Swimming",
          start: "2024-01-15T12:00:00",
          end: "2024-01-15T12:30:00",
          duration: 30,
        },
        {
          id: "w4",
          type: "HKWorkoutActivityTypeYoga",
          typeName: "Yoga",
          start: "2024-01-15T14:00:00",
          end: "2024-01-15T14:30:00",
          duration: 30,
        },
      ];

      const slots = generateHealthTimeSlots(health);

      const walkingItem = slots[8 * 4].items.find((i) => i.type === "workout");
      expect(walkingItem?.label).toBe("🚶 Walking");

      const cyclingItem = slots[10 * 4].items.find((i) => i.type === "workout");
      expect(cyclingItem?.label).toBe("🚴 Cycling");

      const swimmingItem = slots[12 * 4].items.find(
        (i) => i.type === "workout"
      );
      expect(swimmingItem?.label).toBe("🏊 Swimming");

      const yogaItem = slots[14 * 4].items.find((i) => i.type === "workout");
      expect(yogaItem?.label).toBe("🏋️ Yoga"); // Default emoji
    });
  });
});
