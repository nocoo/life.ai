/**
 * Footprint (GPS trackpoint) aggregator for 15-minute time slots
 *
 * Features:
 * - Aggregates GPS trackpoints into 96 slots (24 hours × 4 quarters)
 * - Calculates average speed per slot to determine transportation mode
 * - Tracks elevation changes (only shows when delta > 10m from reference)
 * - Transportation mode detection: walking, cycling, driving
 */

import type { TrackPoint } from "@/models/footprint";

/** Transportation mode based on speed */
export type TransportMode = "walking" | "cycling" | "driving" | "stationary";

/** Aggregated trackpoint data for a single 15-minute slot */
export interface SlotTrackData {
  /** Slot index (0-95) */
  slotIndex: number;
  /** Time string (HH:mm) */
  slot: string;
  /** Number of trackpoints in this slot */
  pointCount: number;
  /** Average speed in m/s */
  avgSpeed: number;
  /** Average speed in km/h (for display) */
  avgSpeedKmh: number;
  /** Average elevation in meters */
  avgElevation: number | null;
  /** Elevation delta from reference (only set when |delta| > 10m) */
  elevationDelta: number | null;
  /** Whether this is the elevation reference slot */
  isElevationReference: boolean;
  /** Detected transportation mode */
  mode: TransportMode;
}

/** Result of footprint aggregation */
export interface FootprintAggregation {
  /** All slots with trackpoint data */
  slots: SlotTrackData[];
  /** Map from slot index to SlotTrackData for quick lookup */
  slotMap: Map<number, SlotTrackData>;
  /** Total distance in meters (sum of segment distances) */
  totalDistance: number;
  /** Reference elevation (first slot's average elevation) */
  referenceElevation: number | null;
  /** Continuous movement segments (for summary capsules) */
  movementSegments: MovementSegment[];
}

/**
 * A continuous movement segment (e.g., a driving trip)
 * Used to generate summary capsules for movements > 30 minutes
 */
export interface MovementSegment {
  /** Start slot index */
  startSlotIndex: number;
  /** End slot index (inclusive) */
  endSlotIndex: number;
  /** Start time (HH:mm) */
  startTime: string;
  /** End time (HH:mm) */
  endTime: string;
  /** Dominant transportation mode (most common in the segment) */
  mode: TransportMode;
  /** Duration in minutes */
  durationMinutes: number;
  /** Total distance in meters */
  distanceMeters: number;
  /** Average speed in km/h */
  avgSpeedKmh: number;
}

/** Minimum duration for showing summary capsule (30 minutes) */
const MIN_SUMMARY_DURATION_MINUTES = 30;

/**
 * Speed thresholds for transportation mode detection (km/h)
 *
 * Based on typical average speeds:
 * - Walking: 3-6 km/h
 * - Running: 8-15 km/h (grouped with cycling for simplicity)
 * - Cycling: 15-30 km/h
 * - Driving: > 30 km/h
 *
 * We use conservative thresholds to account for GPS errors:
 * - < 1 km/h: stationary (GPS drift)
 * - 1-12 km/h: walking/running
 * - 12-35 km/h: cycling
 * - > 35 km/h: driving
 */
const SPEED_THRESHOLDS = {
  /** Below this speed, considered stationary (GPS drift) */
  stationary: 1,
  /** Below this speed, considered walking */
  walking: 12,
  /** Below this speed, considered cycling */
  cycling: 35,
  // Above cycling threshold = driving
} as const;

/**
 * Elevation change threshold in meters
 * Only show elevation delta when change exceeds this value
 */
const ELEVATION_THRESHOLD = 10;

/**
 * Convert slot index to time string
 */
function slotIndexToTime(index: number): string {
  const hour = Math.floor(index / 4);
  const quarter = index % 4;
  return `${hour.toString().padStart(2, "0")}:${(quarter * 15).toString().padStart(2, "0")}`;
}

/**
 * Extract time components from ISO datetime string
 * Returns { hour, minute } or null if parsing fails
 */
function parseTrackPointTime(ts: string): { hour: number; minute: number } | null {
  const match = ts.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    hour: parseInt(match[1], 10),
    minute: parseInt(match[2], 10),
  };
}

/**
 * Calculate slot index from hour and minute
 * Rounds to the nearest 15-minute boundary
 */
function timeToSlotIndex(hour: number, minute: number): number {
  const quarter = Math.round(minute / 15);
  if (quarter === 4) {
    return ((hour + 1) % 24) * 4;
  }
  return hour * 4 + quarter;
}

/**
 * Determine transportation mode based on average speed
 */
export function detectTransportMode(speedKmh: number): TransportMode {
  if (speedKmh < SPEED_THRESHOLDS.stationary) {
    return "stationary";
  }
  if (speedKmh < SPEED_THRESHOLDS.walking) {
    return "walking";
  }
  if (speedKmh < SPEED_THRESHOLDS.cycling) {
    return "cycling";
  }
  return "driving";
}

/**
 * Calculate distance between two GPS points using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Group trackpoints by slot and calculate per-point speeds
 */
function groupTrackPointsBySlot(
  trackPoints: TrackPoint[]
): Map<number, { points: TrackPoint[]; speeds: number[]; elevations: number[] }> {
  const slotGroups = new Map<
    number,
    { points: TrackPoint[]; speeds: number[]; elevations: number[] }
  >();

  // Sort trackpoints by time
  const sorted = [...trackPoints].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    const time = parseTrackPointTime(point.ts);
    if (!time) continue;

    const slotIndex = timeToSlotIndex(time.hour, time.minute);

    if (!slotGroups.has(slotIndex)) {
      slotGroups.set(slotIndex, { points: [], speeds: [], elevations: [] });
    }

    const group = slotGroups.get(slotIndex)!;
    group.points.push(point);

    // Calculate speed from consecutive points if not provided
    let speed = point.speed;
    if (speed === undefined && i > 0) {
      const prevPoint = sorted[i - 1];
      const distance = haversineDistance(
        prevPoint.lat,
        prevPoint.lon,
        point.lat,
        point.lon
      );
      const timeDiff =
        (new Date(point.ts).getTime() - new Date(prevPoint.ts).getTime()) / 1000;
      if (timeDiff > 0) {
        speed = distance / timeDiff;
      }
    }

    if (speed !== undefined && speed >= 0) {
      group.speeds.push(speed);
    }

    if (point.ele !== undefined) {
      group.elevations.push(point.ele);
    }
  }

  return slotGroups;
}

/**
 * Determine the dominant mode for a segment based on slot modes
 * Priority: driving > cycling > walking (higher speed modes take precedence)
 */
function getDominantMode(slots: SlotTrackData[]): TransportMode {
  const modeCounts: Record<TransportMode, number> = {
    driving: 0,
    cycling: 0,
    walking: 0,
    stationary: 0,
  };

  for (const slot of slots) {
    modeCounts[slot.mode]++;
  }

  // If any driving slots exist, it's likely a driving segment
  if (modeCounts.driving > 0) return "driving";
  if (modeCounts.cycling > 0) return "cycling";
  if (modeCounts.walking > 0) return "walking";
  return "stationary";
}

/**
 * Calculate distance between trackpoints within a time range
 */
function calculateDistanceInRange(
  trackPoints: TrackPoint[],
  startSlotIndex: number,
  endSlotIndex: number
): number {
  const sorted = [...trackPoints].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  let distance = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = parseTrackPointTime(sorted[i - 1].ts);
    const currTime = parseTrackPointTime(sorted[i].ts);
    if (!prevTime || !currTime) continue;

    const prevSlot = timeToSlotIndex(prevTime.hour, prevTime.minute);
    const currSlot = timeToSlotIndex(currTime.hour, currTime.minute);

    // Only count if both points are within the range
    if (prevSlot >= startSlotIndex && currSlot <= endSlotIndex) {
      distance += haversineDistance(
        sorted[i - 1].lat,
        sorted[i - 1].lon,
        sorted[i].lat,
        sorted[i].lon
      );
    }
  }

  return distance;
}

/**
 * Detect continuous movement segments from slots
 * 
 * Logic:
 * - Merge consecutive slots with moving modes (walking/cycling/driving)
 * - Even if speed varies (e.g., traffic jam), keep as one segment
 * - Break segment when stationary or gap in data
 * - Only return segments >= 30 minutes for summary capsule
 */
function detectMovementSegments(
  slots: SlotTrackData[],
  trackPoints: TrackPoint[]
): MovementSegment[] {
  if (slots.length === 0) return [];

  const segments: MovementSegment[] = [];
  let segmentStart: SlotTrackData | null = null;
  let segmentSlots: SlotTrackData[] = [];

  // Sort slots by index
  const sortedSlots = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);

  for (let i = 0; i < sortedSlots.length; i++) {
    const slot = sortedSlots[i];
    const isMoving = slot.mode !== "stationary";
    const isConsecutive = segmentStart !== null && 
      slot.slotIndex === segmentSlots[segmentSlots.length - 1].slotIndex + 1;

    if (isMoving) {
      if (segmentStart === null) {
        // Start new segment
        segmentStart = slot;
        segmentSlots = [slot];
      } else if (isConsecutive || slot.slotIndex - segmentSlots[segmentSlots.length - 1].slotIndex <= 2) {
        // Continue segment (allow small gaps of up to 2 slots / 30 min for GPS gaps)
        segmentSlots.push(slot);
      } else {
        // Gap too large, finalize current segment and start new one
        if (segmentSlots.length > 0) {
          const segment = buildMovementSegment(segmentSlots, trackPoints);
          if (segment && segment.durationMinutes >= MIN_SUMMARY_DURATION_MINUTES) {
            segments.push(segment);
          }
        }
        segmentStart = slot;
        segmentSlots = [slot];
      }
    } else {
      // Stationary - finalize current segment if exists
      if (segmentSlots.length > 0) {
        const segment = buildMovementSegment(segmentSlots, trackPoints);
        if (segment && segment.durationMinutes >= MIN_SUMMARY_DURATION_MINUTES) {
          segments.push(segment);
        }
      }
      segmentStart = null;
      segmentSlots = [];
    }
  }

  // Don't forget the last segment
  if (segmentSlots.length > 0) {
    const segment = buildMovementSegment(segmentSlots, trackPoints);
    if (segment && segment.durationMinutes >= MIN_SUMMARY_DURATION_MINUTES) {
      segments.push(segment);
    }
  }

  return segments;
}

/**
 * Build a MovementSegment from a list of slots
 */
function buildMovementSegment(
  slots: SlotTrackData[],
  trackPoints: TrackPoint[]
): MovementSegment | null {
  if (slots.length === 0) return null;

  const startSlot = slots[0];
  const endSlot = slots[slots.length - 1];

  // Calculate duration: each slot is 15 minutes, but we need end time of last slot
  const durationMinutes = (endSlot.slotIndex - startSlot.slotIndex + 1) * 15;

  // Calculate distance
  const distanceMeters = calculateDistanceInRange(
    trackPoints,
    startSlot.slotIndex,
    endSlot.slotIndex
  );

  // Calculate average speed
  const avgSpeedKmh = durationMinutes > 0
    ? (distanceMeters / 1000) / (durationMinutes / 60)
    : 0;

  // Get dominant mode
  const mode = getDominantMode(slots);

  // Calculate end time (add 15 minutes to last slot)
  const endSlotIndex = endSlot.slotIndex + 1;
  const endHour = Math.floor(endSlotIndex / 4) % 24;
  const endQuarter = endSlotIndex % 4;
  const endTime = `${endHour.toString().padStart(2, "0")}:${(endQuarter * 15).toString().padStart(2, "0")}`;

  return {
    startSlotIndex: startSlot.slotIndex,
    endSlotIndex: endSlot.slotIndex,
    startTime: startSlot.slot,
    endTime,
    mode,
    durationMinutes,
    distanceMeters,
    avgSpeedKmh,
  };
}

/**
 * Aggregate GPS trackpoints into 15-minute time slots
 *
 * @param trackPoints - Array of GPS trackpoints for the day
 * @returns FootprintAggregation with per-slot data
 */
export function aggregateFootprintData(
  trackPoints: TrackPoint[]
): FootprintAggregation {
  if (trackPoints.length === 0) {
    return {
      slots: [],
      slotMap: new Map(),
      totalDistance: 0,
      referenceElevation: null,
      movementSegments: [],
    };
  }

  // Group trackpoints by slot
  const slotGroups = groupTrackPointsBySlot(trackPoints);

  // Calculate total distance
  const sorted = [...trackPoints].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  let totalDistance = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDistance += haversineDistance(
      sorted[i - 1].lat,
      sorted[i - 1].lon,
      sorted[i].lat,
      sorted[i].lon
    );
  }

  // Convert to SlotTrackData
  const slots: SlotTrackData[] = [];
  const slotMap = new Map<number, SlotTrackData>();

  // Get sorted slot indices
  const sortedSlotIndices = Array.from(slotGroups.keys()).sort((a, b) => a - b);

  // Determine reference elevation (first slot with elevation data)
  let referenceElevation: number | null = null;
  let lastDisplayedElevation: number | null = null;

  for (const slotIndex of sortedSlotIndices) {
    const group = slotGroups.get(slotIndex)!;

    // Calculate average speed
    const avgSpeed =
      group.speeds.length > 0
        ? group.speeds.reduce((a, b) => a + b, 0) / group.speeds.length
        : 0;
    const avgSpeedKmh = avgSpeed * 3.6; // Convert m/s to km/h

    // Calculate average elevation
    const avgElevation =
      group.elevations.length > 0
        ? group.elevations.reduce((a, b) => a + b, 0) / group.elevations.length
        : null;

    // Determine if this is the reference slot or needs delta display
    let isElevationReference = false;
    let elevationDelta: number | null = null;

    if (avgElevation !== null) {
      if (referenceElevation === null) {
        // First slot with elevation - this is our reference
        referenceElevation = avgElevation;
        lastDisplayedElevation = avgElevation;
        isElevationReference = true;
      } else if (lastDisplayedElevation !== null) {
        // Check if delta exceeds threshold
        const delta = avgElevation - lastDisplayedElevation;
        if (Math.abs(delta) >= ELEVATION_THRESHOLD) {
          elevationDelta = Math.round(delta);
          lastDisplayedElevation = avgElevation;
        }
      }
    }

    const slotData: SlotTrackData = {
      slotIndex,
      slot: slotIndexToTime(slotIndex),
      pointCount: group.points.length,
      avgSpeed,
      avgSpeedKmh,
      avgElevation,
      elevationDelta,
      isElevationReference,
      mode: detectTransportMode(avgSpeedKmh),
    };

    slots.push(slotData);
    slotMap.set(slotIndex, slotData);
  }

  // Detect continuous movement segments
  const movementSegments = detectMovementSegments(slots, trackPoints);

  return {
    slots,
    slotMap,
    totalDistance,
    referenceElevation,
    movementSegments,
  };
}

/**
 * Get emoji and Chinese label for transportation mode
 */
export function getTransportModeDisplay(mode: TransportMode): {
  emoji: string;
  label: string;
} {
  switch (mode) {
    case "walking":
      return { emoji: "🚶", label: "步行" };
    case "cycling":
      return { emoji: "🚴", label: "骑行" };
    case "driving":
      return { emoji: "🚗", label: "驾车" };
    case "stationary":
      return { emoji: "📍", label: "停留" };
  }
}

/**
 * Format elevation for display
 * - Reference: shows absolute elevation
 * - Delta: shows +/- change
 */
export function formatElevation(
  slotData: SlotTrackData
): string | null {
  if (slotData.isElevationReference && slotData.avgElevation !== null) {
    return `⛰${Math.round(slotData.avgElevation)}m`;
  }
  if (slotData.elevationDelta !== null) {
    const sign = slotData.elevationDelta > 0 ? "+" : "";
    return `⛰${sign}${slotData.elevationDelta}m`;
  }
  return null;
}

/**
 * Format speed for display (km/h)
 */
export function formatSpeed(speedKmh: number): string {
  if (speedKmh < 1) {
    return "";
  }
  return `${speedKmh.toFixed(1)}km/h`;
}

/**
 * Format duration for display (Xh Ym or Ym)
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Format distance for display (X.Xkm or Xm)
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/**
 * Format movement segment summary for display
 * Example: "驾车 1h30m · 45.2km · 均速30.1km/h"
 */
export function formatMovementSummary(segment: MovementSegment): string {
  const { emoji, label } = getTransportModeDisplay(segment.mode);
  const duration = formatDuration(segment.durationMinutes);
  const distance = formatDistance(segment.distanceMeters);
  const avgSpeed = `${segment.avgSpeedKmh.toFixed(1)}km/h`;
  
  return `${emoji}${label} ${duration} · ${distance} · 均速${avgSpeed}`;
}
