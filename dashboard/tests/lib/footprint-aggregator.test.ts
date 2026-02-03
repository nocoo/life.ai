/**
 * Tests for footprint aggregator
 */

import { describe, expect, it } from "bun:test";
import {
  aggregateFootprintData,
  detectTransportMode,
  getTransportModeDisplay,
  formatElevation,
  formatSpeed,
  type SlotTrackData,
} from "@/lib/footprint-aggregator";
import type { TrackPoint } from "@/models/footprint";

describe("footprint-aggregator", () => {
  describe("detectTransportMode", () => {
    it("should detect stationary for very low speeds", () => {
      expect(detectTransportMode(0)).toBe("stationary");
      expect(detectTransportMode(0.5)).toBe("stationary");
      expect(detectTransportMode(0.99)).toBe("stationary");
    });

    it("should detect walking for low to moderate speeds", () => {
      expect(detectTransportMode(1)).toBe("walking");
      expect(detectTransportMode(5)).toBe("walking");
      expect(detectTransportMode(11.9)).toBe("walking");
    });

    it("should detect cycling for moderate to high speeds", () => {
      expect(detectTransportMode(12)).toBe("cycling");
      expect(detectTransportMode(20)).toBe("cycling");
      expect(detectTransportMode(34.9)).toBe("cycling");
    });

    it("should detect driving for high speeds", () => {
      expect(detectTransportMode(35)).toBe("driving");
      expect(detectTransportMode(60)).toBe("driving");
      expect(detectTransportMode(120)).toBe("driving");
    });
  });

  describe("getTransportModeDisplay", () => {
    it("should return correct emoji and label for each mode", () => {
      expect(getTransportModeDisplay("walking")).toEqual({
        emoji: "🚶",
        label: "步行",
      });
      expect(getTransportModeDisplay("cycling")).toEqual({
        emoji: "🚴",
        label: "骑行",
      });
      expect(getTransportModeDisplay("driving")).toEqual({
        emoji: "🚗",
        label: "驾车",
      });
      expect(getTransportModeDisplay("stationary")).toEqual({
        emoji: "📍",
        label: "停留",
      });
    });
  });

  describe("formatElevation", () => {
    it("should format reference elevation with absolute value", () => {
      const slotData: SlotTrackData = {
        slotIndex: 0,
        slot: "00:00",
        pointCount: 1,
        avgSpeed: 0,
        avgSpeedKmh: 0,
        avgElevation: 150,
        elevationDelta: null,
        isElevationReference: true,
        mode: "stationary",
      };

      expect(formatElevation(slotData)).toBe("⛰150m");
    });

    it("should format positive elevation delta with plus sign", () => {
      const slotData: SlotTrackData = {
        slotIndex: 4,
        slot: "01:00",
        pointCount: 1,
        avgSpeed: 0,
        avgSpeedKmh: 0,
        avgElevation: 165,
        elevationDelta: 15,
        isElevationReference: false,
        mode: "stationary",
      };

      expect(formatElevation(slotData)).toBe("⛰+15m");
    });

    it("should format negative elevation delta", () => {
      const slotData: SlotTrackData = {
        slotIndex: 8,
        slot: "02:00",
        pointCount: 1,
        avgSpeed: 0,
        avgSpeedKmh: 0,
        avgElevation: 135,
        elevationDelta: -15,
        isElevationReference: false,
        mode: "stationary",
      };

      expect(formatElevation(slotData)).toBe("⛰-15m");
    });

    it("should return null when no elevation data to display", () => {
      const slotData: SlotTrackData = {
        slotIndex: 12,
        slot: "03:00",
        pointCount: 1,
        avgSpeed: 0,
        avgSpeedKmh: 0,
        avgElevation: 155,
        elevationDelta: null,
        isElevationReference: false,
        mode: "stationary",
      };

      expect(formatElevation(slotData)).toBeNull();
    });
  });

  describe("formatSpeed", () => {
    it("should format speed with one decimal place", () => {
      expect(formatSpeed(5.5)).toBe("5.5km/h");
      expect(formatSpeed(25.123)).toBe("25.1km/h");
    });

    it("should return empty string for very low speeds", () => {
      expect(formatSpeed(0)).toBe("");
      expect(formatSpeed(0.5)).toBe("");
      expect(formatSpeed(0.99)).toBe("");
    });
  });

  describe("aggregateFootprintData", () => {
    it("should return empty result for empty trackpoints", () => {
      const result = aggregateFootprintData([]);

      expect(result.slots).toHaveLength(0);
      expect(result.slotMap.size).toBe(0);
      expect(result.totalDistance).toBe(0);
      expect(result.referenceElevation).toBeNull();
    });

    it("should aggregate trackpoints into correct slots", () => {
      // 08:00, 08:05, 08:07 all round to 08:00 (slot 32)
      // 08:08+ would round to 08:15 (slot 33)
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, ele: 50, speed: 1.5 },
        { ts: "2024-01-15T08:05:00", lat: 39.901, lon: 116.401, ele: 52, speed: 1.4 },
        { ts: "2024-01-15T08:07:00", lat: 39.902, lon: 116.402, ele: 51, speed: 1.6 },
      ];

      const result = aggregateFootprintData(trackPoints);

      // Should have 1 slot: 08:00 (all points round to same slot)
      expect(result.slots).toHaveLength(1);

      // First slot (08:00, index 32)
      const slot08 = result.slotMap.get(32);
      expect(slot08).toBeDefined();
      expect(slot08?.pointCount).toBe(3);
      expect(slot08?.avgSpeedKmh).toBeCloseTo(5.4, 1); // (1.5+1.4+1.6)*3.6/3 = 5.4
    });

    it("should detect transportation mode based on average speed", () => {
      const walkingPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 1.2 }, // 4.32 km/h
      ];

      const cyclingPoints: TrackPoint[] = [
        { ts: "2024-01-15T09:00:00", lat: 39.9, lon: 116.4, speed: 5.5 }, // 19.8 km/h
      ];

      const drivingPoints: TrackPoint[] = [
        { ts: "2024-01-15T10:00:00", lat: 39.9, lon: 116.4, speed: 15.0 }, // 54 km/h
      ];

      const walkingResult = aggregateFootprintData(walkingPoints);
      expect(walkingResult.slots[0].mode).toBe("walking");

      const cyclingResult = aggregateFootprintData(cyclingPoints);
      expect(cyclingResult.slots[0].mode).toBe("cycling");

      const drivingResult = aggregateFootprintData(drivingPoints);
      expect(drivingResult.slots[0].mode).toBe("driving");
    });

    it("should set elevation reference for first slot", () => {
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, ele: 100 },
        { ts: "2024-01-15T09:00:00", lat: 39.91, lon: 116.41, ele: 105 },
      ];

      const result = aggregateFootprintData(trackPoints);

      expect(result.referenceElevation).toBe(100);
      expect(result.slots[0].isElevationReference).toBe(true);
      expect(result.slots[1].isElevationReference).toBe(false);
    });

    it("should track elevation delta when change exceeds 10m", () => {
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, ele: 100 },
        { ts: "2024-01-15T09:00:00", lat: 39.91, lon: 116.41, ele: 105 }, // +5m, no delta
        { ts: "2024-01-15T10:00:00", lat: 39.92, lon: 116.42, ele: 115 }, // +15m from ref, delta
        { ts: "2024-01-15T11:00:00", lat: 39.93, lon: 116.43, ele: 118 }, // +3m from last, no delta
        { ts: "2024-01-15T12:00:00", lat: 39.94, lon: 116.44, ele: 95 }, // -23m from last, delta
      ];

      const result = aggregateFootprintData(trackPoints);

      // Slot 0: reference (100m)
      expect(result.slots[0].isElevationReference).toBe(true);
      expect(result.slots[0].elevationDelta).toBeNull();

      // Slot 1: 105m, +5m from ref, no delta shown
      expect(result.slots[1].elevationDelta).toBeNull();

      // Slot 2: 115m, +15m from ref (100m), delta shown
      expect(result.slots[2].elevationDelta).toBe(15);

      // Slot 3: 118m, +3m from last displayed (115m), no delta shown
      expect(result.slots[3].elevationDelta).toBeNull();

      // Slot 4: 95m, -23m from last displayed (115m), delta shown
      expect(result.slots[4].elevationDelta).toBe(-20);
    });

    it("should calculate total distance from trackpoints", () => {
      // Two points about 111m apart (0.001 degree latitude at equator ≈ 111m)
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4 },
        { ts: "2024-01-15T08:05:00", lat: 39.901, lon: 116.4 }, // ~111m north
      ];

      const result = aggregateFootprintData(trackPoints);

      // Should be approximately 111m (Haversine at this latitude)
      expect(result.totalDistance).toBeGreaterThan(100);
      expect(result.totalDistance).toBeLessThan(120);
    });

    it("should calculate speed from consecutive points when not provided", () => {
      // Two points 5 minutes apart, about 111m apart
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4 },
        { ts: "2024-01-15T08:05:00", lat: 39.901, lon: 116.4 }, // 5 min, ~111m
      ];

      const result = aggregateFootprintData(trackPoints);

      // Speed should be ~111m / 300s ≈ 0.37 m/s ≈ 1.33 km/h
      expect(result.slots[0].avgSpeedKmh).toBeGreaterThan(1);
      expect(result.slots[0].avgSpeedKmh).toBeLessThan(2);
    });

    it("should handle trackpoints without elevation", () => {
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 1.5 },
        { ts: "2024-01-15T09:00:00", lat: 39.91, lon: 116.41, speed: 1.5 },
      ];

      const result = aggregateFootprintData(trackPoints);

      expect(result.referenceElevation).toBeNull();
      expect(result.slots[0].avgElevation).toBeNull();
      expect(result.slots[0].isElevationReference).toBe(false);
    });

    it("should sort trackpoints by time before processing", () => {
      // Intentionally out of order
      const trackPoints: TrackPoint[] = [
        { ts: "2024-01-15T09:00:00", lat: 39.91, lon: 116.41, ele: 110, speed: 2.0 },
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, ele: 100, speed: 1.5 },
      ];

      const result = aggregateFootprintData(trackPoints);

      // First slot should be 08:00 with elevation reference
      expect(result.slots[0].slot).toBe("08:00");
      expect(result.slots[0].isElevationReference).toBe(true);
      expect(result.referenceElevation).toBe(100);
    });
  });
});
