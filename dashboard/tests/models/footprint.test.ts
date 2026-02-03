import { describe, expect, it } from "bun:test";
import {
  createEmptyDayFootprintData,
  type DayFootprintData,
  type DayTrackSummary,
  type LocationRecord,
  type TrackSegment,
} from "@/models/footprint";

describe("footprint model", () => {
  describe("createEmptyDayFootprintData", () => {
    it("should create empty footprint data with given date", () => {
      const date = "2025-01-15";
      const data = createEmptyDayFootprintData(date);

      expect(data.date).toBe(date);
      expect(data.summary).toBeNull();
      expect(data.locations).toEqual([]);
      expect(data.segments).toEqual([]);
    });
  });

  describe("type definitions", () => {
    it("should allow valid DayTrackSummary", () => {
      const summary: DayTrackSummary = {
        pointCount: 1000,
        totalDistance: 15000,
        avgSpeed: 1.5,
        minTime: "07:00",
        maxTime: "22:00",
      };
      expect(summary.totalDistance).toBe(15000);
    });

    it("should allow valid LocationRecord", () => {
      const loc: LocationRecord = {
        id: "loc-1",
        name: "Office",
        startTime: "08:00",
        endTime: "17:00",
        lat: 39.9042,
        lon: 116.4074,
        duration: 540,
      };
      expect(loc.name).toBe("Office");
    });

    it("should allow valid TrackSegment", () => {
      const seg: TrackSegment = {
        id: "seg-1",
        startTime: "07:30",
        endTime: "08:15",
        pointCount: 540,
        distance: 8500,
        avgSpeed: 3.1,
        startLocation: "Home",
        endLocation: "Office",
      };
      expect(seg.distance).toBe(8500);
    });

    it("should allow valid DayFootprintData", () => {
      const data: DayFootprintData = {
        date: "2025-01-15",
        summary: null,
        trackPoints: [],
        locations: [],
        segments: [],
      };
      expect(data.date).toBe("2025-01-15");
    });
  });
});
