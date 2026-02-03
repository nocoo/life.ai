/**
 * Tests for timeline color mapping
 */

import { describe, expect, it } from "bun:test";
import {
  TIMELINE_COLORS,
  LEFT_SIDE_TYPES,
  getItemSide,
  getTimelineColor,
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
        "workout",
        "water",
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

    it("should use dark color variants (600-800)", () => {
      for (const color of Object.values(TIMELINE_COLORS)) {
        // All colors should be in 600-800 range for dark backgrounds
        expect(color).toMatch(/bg-\w+-(6|7|8)00/);
      }
    });

    it("should have intuitive sleep stage colors", () => {
      // Deep should be darkest (800)
      expect(TIMELINE_COLORS["sleep-deep"]).toContain("800");
      // Core should be medium (600)
      expect(TIMELINE_COLORS["sleep-core"]).toContain("600");
    });
  });

  describe("LEFT_SIDE_TYPES", () => {
    it("should include sleep stages", () => {
      expect(LEFT_SIDE_TYPES.has("sleep-deep")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("sleep-core")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("sleep-rem")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("sleep-awake")).toBe(true);
    });

    it("should include workout and water", () => {
      expect(LEFT_SIDE_TYPES.has("workout")).toBe(true);
      expect(LEFT_SIDE_TYPES.has("water")).toBe(true);
    });

    it("should not include metrics", () => {
      expect(LEFT_SIDE_TYPES.has("heartRate")).toBe(false);
      expect(LEFT_SIDE_TYPES.has("steps")).toBe(false);
    });
  });

  describe("getItemSide", () => {
    it("should return left for sleep stages", () => {
      expect(getItemSide("sleep-deep")).toBe("left");
      expect(getItemSide("sleep-core")).toBe("left");
      expect(getItemSide("sleep-rem")).toBe("left");
      expect(getItemSide("sleep-awake")).toBe("left");
    });

    it("should return left for workout and water", () => {
      expect(getItemSide("workout")).toBe("left");
      expect(getItemSide("water")).toBe("left");
    });

    it("should return right for physiological metrics", () => {
      expect(getItemSide("heartRate")).toBe("right");
      expect(getItemSide("hrv")).toBe("right");
      expect(getItemSide("oxygenSaturation")).toBe("right");
      expect(getItemSide("respiratoryRate")).toBe("right");
    });

    it("should return right for activity metrics", () => {
      expect(getItemSide("steps")).toBe("right");
      expect(getItemSide("distance")).toBe("right");
    });
  });

  describe("getTimelineColor", () => {
    it("should return the correct color for each type", () => {
      expect(getTimelineColor("sleep-deep")).toBe("bg-indigo-800");
      expect(getTimelineColor("heartRate")).toBe("bg-rose-700");
      expect(getTimelineColor("water")).toBe("bg-blue-700");
    });
  });
});
