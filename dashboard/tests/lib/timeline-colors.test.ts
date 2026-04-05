/**
 * Tests for timeline color mapping
 */

import { describe, expect, it } from "bun:test";
import {
  TIMELINE_COLORS,
  LEFT_SIDE_TYPES,
  getItemSide,
  getHeartRateColor,
} from "@/lib/timeline-colors";
import type { TimelineDataType } from "@/models/day-view";

describe("timeline-colors", () => {
  describe("TIMELINE_COLORS", () => {
    it("should have colors for all data types", () => {
      const allTypes: TimelineDataType[] = [
        "sleep-deep",
        "sleep-core",
        "sleep-rem",
        "sleep-awake",
        "awake-day",
        "workout",
        "water",
        "transport-walking",
        "transport-cycling",
        "transport-driving",
        "transport-stationary",
        "elevation",
        "heartRate",
        "hrv",
        "oxygenSaturation",
        "respiratoryRate",
        "steps",
        "distance",
      ];

      for (const type of allTypes) {
        expect(TIMELINE_COLORS[type]).toBeDefined();
        expect(TIMELINE_COLORS[type]).toStartWith("bg-");
      }
    });

    it("should use dark color variants (500-800)", () => {
      for (const color of Object.values(TIMELINE_COLORS)) {
        // All colors should be in 500-800 range for dark backgrounds
        expect(color).toMatch(/bg-\w+-(5|6|7|8)00/);
      }
    });

    it("should have intuitive sleep stage colors", () => {
      // Deep should be darkest (800)
      expect(TIMELINE_COLORS["sleep-deep"]).toContain("800");
      // Core should be medium (500)
      expect(TIMELINE_COLORS["sleep-core"]).toContain("500");
      // REM should be green
      expect(TIMELINE_COLORS["sleep-rem"]).toContain("green");
      // Awake should be orange
      expect(TIMELINE_COLORS["sleep-awake"]).toContain("orange");
    });
  });

  describe("LEFT_SIDE_TYPES", () => {
    it("should include activity items (workout and water)", () => {
      expect(LEFT_SIDE_TYPES.has("workout")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("water")).toBe(true);
    });

    it("should include activity metrics (steps, distance)", () => {
      expect(LEFT_SIDE_TYPES.has("steps")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("distance")).toBe(true);
    });

    it("should include transportation modes and elevation", () => {
      expect(LEFT_SIDE_TYPES.has("transport-walking")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("transport-cycling")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("transport-driving")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("transport-stationary")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("transport-summary")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("elevation")).toBe(true);
    });

    it("should not include sleep stages (now on right side)", () => {
      expect(LEFT_SIDE_TYPES.has("sleep-deep")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("sleep-core")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("sleep-rem")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("sleep-awake")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("awake-day")).toBe(false);
    });

    it("should not include physiological metrics (on right side)", () => {
      expect(LEFT_SIDE_TYPES.has("heartRate")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("hrv")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("oxygenSaturation")).toBe(false);
    });
  });

  describe("getItemSide", () => {
    it("should return right for sleep stages", () => {
      expect(getItemSide("sleep-deep")).toBe("right");
      expect(getItemSide("sleep-core")).toBe("right");
      expect(getItemSide("sleep-rem")).toBe("right");
      expect(getItemSide("sleep-awake")).toBe("right");
      expect(getItemSide("awake-day")).toBe("right");
    });

    it("should return left for workout and water", () => {
      expect(getItemSide("workout")).toBe("left");
      expect(getItemSide("water")).toBe("left");
    });

    it("should return left for activity metrics (steps, distance)", () => {
      expect(getItemSide("steps")).toBe("left");
      expect(getItemSide("distance")).toBe("left");
    });

    it("should return left for transportation modes", () => {
      expect(getItemSide("transport-walking")).toBe("left");
      expect(getItemSide("transport-cycling")).toBe("left");
      expect(getItemSide("transport-driving")).toBe("left");
    });

    it("should return right for physiological metrics", () => {
      expect(getItemSide("heartRate")).toBe("right");
      expect(getItemSide("hrv")).toBe("right");
      expect(getItemSide("oxygenSaturation")).toBe("right");
      expect(getItemSide("respiratoryRate")).toBe("right");
    });
  });

  describe("getHeartRateColor", () => {
    it("should return green for ideal heart rate (< 70 bpm)", () => {
      expect(getHeartRateColor(60)).toBe("bg-green-600");
    });

    it("should return yellow for elevated heart rate (70-84 bpm)", () => {
      expect(getHeartRateColor(75)).toBe("bg-yellow-600");
    });

    it("should return orange for high heart rate (85-99 bpm)", () => {
      expect(getHeartRateColor(90)).toBe("bg-orange-600");
    });

    it("should return red for very high heart rate (>= 100 bpm)", () => {
      expect(getHeartRateColor(110)).toBe("bg-red-600");
    });
  });
});
