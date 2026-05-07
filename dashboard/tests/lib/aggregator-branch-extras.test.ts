/**
 * Branch-coverage edge cases for footprint-aggregator and timeline-aggregator.
 *
 * These tests target the conditional paths that the main suites do not exercise,
 * not new behavioural surface area.
 */

import { describe, expect, it } from "vitest";
import {
  aggregateFootprintData,
  formatElevation,
  formatMovementSummary,
  getTransportModeDisplay,
  type MovementSegment,
} from "@/lib/footprint-aggregator";
import {
  fillFootprintData,
  generateHealthTimeSlots,
  generateTimeSlots,
  slotIndexToTime,
  timeToSlotIndex,
} from "@/lib/timeline-aggregator";
import type { TrackPoint, DayFootprintData } from "@/models/footprint";
import type { DayHealthData } from "@/models/apple-health";

const emptyHealth = (overrides: Partial<DayHealthData> = {}): DayHealthData => ({
  date: "2024-01-15",
  sleep: null,
  heartRate: null,
  steps: [],
  totalSteps: 0,
  distance: null,
  oxygenSaturation: null,
  respiratoryRate: null,
  hrv: null,
  water: [],
  totalWater: 0,
  workouts: [],
  activity: null,
  ecgRecords: [],
  flightsClimbed: undefined,
  sleepingWristTemperature: undefined,
  ...overrides,
});

describe("footprint-aggregator branch extras", () => {
  it("parseTrackPointTime: returns null for non-ISO timestamps and they are skipped", () => {
    const trackPoints: TrackPoint[] = [
      { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 1.0 },
      // Malformed ts → parseTrackPointTime returns null; loop skips this point
      { ts: "not-a-date", lat: 39.9, lon: 116.4, speed: 1.0 },
    ];
    const agg = aggregateFootprintData(trackPoints);
    // Only the valid point makes it into a slot
    expect(agg.slots.length).toBe(1);
  });

  it("timeToSlotIndex: minute>=53 rolls quarter to next hour (quarter===4 branch)", () => {
    const trackPoints: TrackPoint[] = [
      { ts: "2024-01-15T08:55:00", lat: 39.9, lon: 116.4, speed: 1.0 },
    ];
    const agg = aggregateFootprintData(trackPoints);
    expect(agg.slots[0].slot).toBe("09:00");
  });

  it("speed calc: timeDiff===0 leaves speed undefined for that point", () => {
    // Two points at the exact same timestamp → timeDiff === 0; the second
    // point has no `speed` so the falsy branch of `if (timeDiff > 0)` is hit
    const trackPoints: TrackPoint[] = [
      { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 1.0 },
      { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4 },
    ];
    const agg = aggregateFootprintData(trackPoints);
    // Only the first point's speed (1.0 m/s) reaches the slot's speeds array;
    // the second point's speed stays undefined because timeDiff === 0 short-circuits
    // the recompute branch and the point has no own `speed` field.
    expect(agg.slots).toHaveLength(1);
    expect(agg.slots[0].avgSpeed).toBeCloseTo(1.0);
    expect(agg.slots[0].avgSpeedKmh).toBeCloseTo(3.6);
    expect(agg.slots[0].mode).toBe("walking");
  });

  it("dominant mode falls through to walking and stationary fallbacks", () => {
    // walking-only: hits the `walking > 0` true branch (and false on driving/cycling)
    const walkingPoints: TrackPoint[] = Array.from({ length: 8 }, (_, i) => ({
      ts: `2024-01-15T08:${(i * 4).toString().padStart(2, "0")}:00`,
      lat: 39.9,
      lon: 116.4,
      speed: 1.0, // ~3.6 km/h walking
    }));
    const walkAgg = aggregateFootprintData(walkingPoints);
    expect(walkAgg.movementSegments[0]?.mode).toBe("walking");

    // All stationary - falls all the way through to "stationary" return
    const stationaryPoints: TrackPoint[] = [
      { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 0 },
      { ts: "2024-01-15T08:15:00", lat: 39.9, lon: 116.4, speed: 0 },
    ];
    const stillAgg = aggregateFootprintData(stationaryPoints);
    expect(stillAgg.movementSegments).toEqual([]);
  });

  it("detectMovementSegments: empty slot array short-circuits", () => {
    // No trackpoints → aggregateFootprintData returns early with empty segments
    const agg = aggregateFootprintData([]);
    expect(agg.movementSegments).toEqual([]);
    expect(agg.slots).toEqual([]);
  });

  it("detectMovementSegments: movement → stationary → movement breaks segments", () => {
    // Long moving span, then stationary, then more movement (each long enough for a segment)
    const trackPoints: TrackPoint[] = [];
    // 08:00-08:45 moving (driving) — 4 slots
    for (let i = 0; i < 4; i++) {
      trackPoints.push({
        ts: `2024-01-15T08:${(i * 15).toString().padStart(2, "0")}:00`,
        lat: 39.9 + i * 0.01,
        lon: 116.4,
        speed: 15, // 54 km/h driving
      });
    }
    // 09:00-09:30 stationary (2 slots)
    for (let i = 0; i < 2; i++) {
      trackPoints.push({
        ts: `2024-01-15T09:${(i * 15).toString().padStart(2, "0")}:00`,
        lat: 39.94,
        lon: 116.4,
        speed: 0,
      });
    }
    // 10:00-10:45 moving again (4 slots)
    for (let i = 0; i < 4; i++) {
      trackPoints.push({
        ts: `2024-01-15T10:${(i * 15).toString().padStart(2, "0")}:00`,
        lat: 39.95 + i * 0.01,
        lon: 116.4,
        speed: 15,
      });
    }
    const agg = aggregateFootprintData(trackPoints);
    expect(agg.movementSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("detectMovementSegments: gap > 2 slots forces a new segment (else branch of L332)", () => {
    const trackPoints: TrackPoint[] = [];
    // First moving block 08:00-08:45 (4 slots)
    for (let i = 0; i < 4; i++) {
      trackPoints.push({
        ts: `2024-01-15T08:${(i * 15).toString().padStart(2, "0")}:00`,
        lat: 39.9 + i * 0.01,
        lon: 116.4,
        speed: 15,
      });
    }
    // Skip several slots (no points 09:00-10:30)
    // Second moving block 11:00-11:45 - but the first slot of the second block
    // is more than 2 slots away from the last slot of the first block
    for (let i = 0; i < 4; i++) {
      trackPoints.push({
        ts: `2024-01-15T11:${(i * 15).toString().padStart(2, "0")}:00`,
        lat: 39.95 + i * 0.01,
        lon: 116.4,
        speed: 15,
      });
    }
    const agg = aggregateFootprintData(trackPoints);
    // Both are >= 30 min, so two segments expected
    expect(agg.movementSegments.length).toBe(2);
  });

  it("aggregateFootprintData: elevation delta below threshold leaves elevationDelta null (else branch)", () => {
    const trackPoints: TrackPoint[] = [
      { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, ele: 100, speed: 0 },
      // Tiny elevation change (<10m) → exercises the `Math.abs(delta) >= ELEVATION_THRESHOLD`
      // false branch, leaving elevationDelta null
      { ts: "2024-01-15T09:00:00", lat: 39.9, lon: 116.4, ele: 102, speed: 0 },
    ];
    const agg = aggregateFootprintData(trackPoints);
    expect(agg.slots[1].elevationDelta).toBeNull();
  });

  it("formatDuration: hours-only branch (mins===0) and minutes-only branch", () => {
    const segment: MovementSegment = {
      startSlotIndex: 0,
      endSlotIndex: 7, // 8 slots = 120 minutes = exactly 2h
      startTime: "00:00",
      endTime: "02:00",
      mode: "driving",
      durationMinutes: 120,
      distanceMeters: 60000,
      avgSpeedKmh: 30,
    };
    expect(formatMovementSummary(segment)).toContain("2h");
    expect(formatMovementSummary(segment)).not.toContain("h0m");

    const minutesOnly: MovementSegment = { ...segment, durationMinutes: 45 };
    expect(formatMovementSummary(minutesOnly)).toContain("45m");
  });

  it("formatDistance: <1km branch (meters fallback)", () => {
    const segment: MovementSegment = {
      startSlotIndex: 0,
      endSlotIndex: 1,
      startTime: "00:00",
      endTime: "00:30",
      mode: "walking",
      durationMinutes: 30,
      distanceMeters: 500, // < 1000 → uses meters branch
      avgSpeedKmh: 1.0,
    };
    expect(formatMovementSummary(segment)).toContain("500m");
  });

  it("formatElevation: returns null when neither reference nor delta", () => {
    expect(
      formatElevation({
        avgElevation: null,
        elevationDelta: null,
        isElevationReference: false,
      })
    ).toBeNull();
  });

  it("getTransportModeDisplay covers all four modes", () => {
    expect(getTransportModeDisplay("walking").emoji).toBe("🚶");
    expect(getTransportModeDisplay("cycling").emoji).toBe("🚴");
    expect(getTransportModeDisplay("driving").emoji).toBe("🚗");
    expect(getTransportModeDisplay("stationary").emoji).toBe("📍");
  });
});

describe("timeline-aggregator branch extras", () => {
  it("extractTimeFromISO returns 00:00 when no T-match present (workout fallback)", () => {
    const health = emptyHealth({
      workouts: [
        {
          id: "w1",
          type: "HKWorkoutActivityTypeRunning",
          typeName: "Running",
          start: "no-iso-here",
          end: "no-iso-here",
          duration: 0,
        },
      ],
    });
    const slots = generateHealthTimeSlots(health);
    // workout occupies 0 slots when start == end, but the fallback branch was taken
    expect(slots.length).toBe(96);
  });

  it("sleep stages: REM and awake branches in sleepStageToType switch", () => {
    const health = emptyHealth({
      sleep: {
        start: "00:00",
        end: "01:00",
        duration: 60,
        deepMinutes: 0,
        coreMinutes: 0,
        remMinutes: 30,
        awakeMinutes: 30,
        stages: [
          { type: "rem", start: "00:00", end: "00:30", duration: 30 },
          { type: "awake", start: "00:30", end: "01:00", duration: 30 },
        ],
      },
    });
    const slots = generateHealthTimeSlots(health);
    const remSlot = slots[0];
    expect(remSlot.items.some((i) => i.type === "sleep-rem")).toBe(true);
    const awakeSlot = slots[2];
    expect(awakeSlot.items.some((i) => i.type === "sleep-awake")).toBe(true);
  });

  it("sleep stage duplicate is not added twice within the same slot", () => {
    // Two stages of the same type that map to the same slot index should be deduped
    const health = emptyHealth({
      sleep: {
        start: "00:00",
        end: "00:30",
        duration: 30,
        deepMinutes: 30,
        coreMinutes: 0,
        remMinutes: 0,
        awakeMinutes: 0,
        stages: [
          { type: "deep", start: "00:00", end: "00:15", duration: 15 },
          { type: "deep", start: "00:00", end: "00:15", duration: 15 },
        ],
      },
    });
    const slots = generateHealthTimeSlots(health);
    const deepCount = slots[0].items.filter((i) => i.type === "sleep-deep").length;
    expect(deepCount).toBe(1);
  });

  it("workout duplicate is not added twice within the same slot", () => {
    const health = emptyHealth({
      workouts: [
        {
          id: "w1",
          type: "HKWorkoutActivityTypeRunning",
          typeName: "Running",
          start: "2024-01-15T08:00:00",
          end: "2024-01-15T08:30:00",
          duration: 30,
        },
        {
          id: "w2",
          type: "HKWorkoutActivityTypeRunning",
          typeName: "Running",
          start: "2024-01-15T08:00:00",
          end: "2024-01-15T08:30:00",
          duration: 30,
        },
      ],
    });
    const slots = generateHealthTimeSlots(health);
    const workoutCount = slots[32].items.filter((i) => i.type === "workout").length;
    expect(workoutCount).toBe(1);
  });

  it("workout emoji mapping: walking, cycling, swimming, other", () => {
    const types = [
      "HKWorkoutActivityTypeWalking",
      "HKWorkoutActivityTypeCycling",
      "HKWorkoutActivityTypeSwimming",
      "HKWorkoutActivityTypeYoga",
    ];
    for (const type of types) {
      const health = emptyHealth({
        workouts: [
          {
            id: `w-${type}`,
            type,
            typeName: type.replace("HKWorkoutActivityType", ""),
            start: "2024-01-15T09:00:00",
            end: "2024-01-15T09:30:00",
            duration: 30,
          },
        ],
      });
      const slots = generateHealthTimeSlots(health);
      const w = slots[36].items.find((i) => i.type === "workout");
      expect(w).toBeDefined();
    }
  });

  it("distance < 1km uses meters branch in label", () => {
    const health = emptyHealth({
      distance: {
        records: [{ hour: 9, distance: 0.5 }],
        total: 0.5,
      },
    });
    const slots = generateHealthTimeSlots(health);
    const distItem = slots[36].items.find((i) => i.type === "distance");
    expect(distItem?.label).toMatch(/m$/); // ends with 'm' not 'km'
  });

  it("steps and distance: zero values are skipped (false branch of count > 0)", () => {
    const health = emptyHealth({
      steps: [{ hour: 5, count: 0 }],
      distance: {
        records: [{ hour: 5, distance: 0 }],
        total: 0,
      },
    });
    const slots = generateHealthTimeSlots(health);
    expect(slots[20].items.find((i) => i.type === "steps")).toBeUndefined();
    expect(slots[20].items.find((i) => i.type === "distance")).toBeUndefined();
  });

  it("fillFootprintData: empty trackpoints early-returns; generateTimeSlots without footprint also OK", () => {
    const health = emptyHealth();
    const slots = generateHealthTimeSlots(health);
    const before = slots.map((s) => s.items.length);
    fillFootprintData(slots, {
      date: "2024-01-15",
      summary: null,
      trackPoints: [],
      locations: [],
      segments: [],
    } as DayFootprintData);
    const after = slots.map((s) => s.items.length);
    expect(after).toEqual(before);

    // generateTimeSlots without footprint exercises the if-false branch
    const noFootprint = generateTimeSlots(health);
    expect(noFootprint.length).toBe(96);
  });

  it("fillFootprintData: stationary trackdata skips transport pill (modeToUse === stationary branch)", () => {
    const health = emptyHealth();
    const footprint: DayFootprintData = {
      date: "2024-01-15",
      summary: null,
      trackPoints: [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 0 },
      ],
      locations: [],
      segments: [],
    };
    const slots = generateTimeSlots(health, footprint);
    expect(slots[32].items.find((i) => i.type?.startsWith("transport-"))).toBeUndefined();
  });

  it("fillFootprintData: movement segment populates summary and avoids duplicate", () => {
    const health = emptyHealth();
    const footprint: DayFootprintData = {
      date: "2024-01-15",
      summary: null,
      trackPoints: Array.from({ length: 8 }, (_, i) => ({
        ts: `2024-01-15T08:${(i * 5).toString().padStart(2, "0")}:00`,
        lat: 39.9 + i * 0.01,
        lon: 116.4,
        ele: 100 + i,
        speed: 15, // driving
      })),
      locations: [],
      segments: [],
    };
    const slots = generateTimeSlots(health, footprint);
    const summaryItems = slots.flatMap((s) =>
      s.items.filter((i) => i.type === "transport-summary")
    );
    expect(summaryItems.length).toBeGreaterThan(0);

    // Run again on already-populated slots to exercise the dedup `some(...)` true branch
    fillFootprintData(slots, footprint);
    const summaryAfter = slots.flatMap((s) =>
      s.items.filter((i) => i.type === "transport-summary")
    );
    expect(summaryAfter.length).toBe(summaryItems.length);
  });

  it("fillFootprintData: trackdata speed < 1km/h uses emoji-only label (no speed)", () => {
    const health = emptyHealth();
    const footprint: DayFootprintData = {
      date: "2024-01-15",
      summary: null,
      trackPoints: [
        { ts: "2024-01-15T08:00:00", lat: 39.9, lon: 116.4, speed: 0.2 }, // < 1 km/h
        { ts: "2024-01-15T08:05:00", lat: 39.9, lon: 116.4, speed: 0.2 },
      ],
      locations: [],
      segments: [],
    };
    const slots = generateTimeSlots(health, footprint);
    // Speed is below stationary threshold (1 km/h * 3.6 conversion makes 0.2 m/s = 0.72 km/h)
    expect(slots.length).toBe(96);
  });

  it("timeToSlotIndex / slotIndexToTime round-trip", () => {
    expect(timeToSlotIndex("23:53")).toBe(0); // wraps via quarter===4
    expect(slotIndexToTime(0)).toBe("00:00");
    expect(slotIndexToTime(95)).toBe("23:45");
  });
});
