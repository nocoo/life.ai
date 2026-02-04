/**
 * Unified color and label definitions for the application
 * All colors use Tailwind CSS classes for consistency
 */

import type { TimelineDataType } from "@/models/day-view";
import type { SleepStageType } from "@/models/apple-health";

// ============================================================================
// Sleep Stage Colors & Labels
// ============================================================================

/**
 * Sleep stage colors - used in sleep cards and timeline
 * Maps SleepStageType to Tailwind background color classes
 */
export const SLEEP_STAGE_COLORS: Record<SleepStageType, string> = {
  deep: "bg-indigo-800",    // Deep sleep = darkest indigo
  core: "bg-indigo-500",    // Core/light sleep = medium indigo
  rem: "bg-green-600",      // REM = green (active brain state)
  awake: "bg-orange-500",   // Awake during sleep = orange (alert)
};

/**
 * Sleep stage Chinese labels
 */
export const SLEEP_STAGE_LABELS: Record<SleepStageType, string> = {
  deep: "深睡",
  core: "浅睡",
  rem: "快速眼动",
  awake: "清醒",
};

/**
 * Get sleep stage color
 */
export function getSleepStageColor(type: SleepStageType): string {
  return SLEEP_STAGE_COLORS[type];
}

/**
 * Get sleep stage label
 */
export function getSleepStageLabel(type: SleepStageType): string {
  return SLEEP_STAGE_LABELS[type];
}

// ============================================================================
// Timeline Colors
// ============================================================================

/**
 * Stable color mapping for timeline data types
 * Colors are chosen with semantic meaning where possible:
 * - Sleep stages: indigo spectrum (deep = darkest)
 * - REM: green (active brain)
 * - Awake: orange (alert state)
 * - Workout: emerald (activity/energy)
 * - Heart rate: rose (blood/heart)
 * - Oxygen: sky blue
 * - Water: blue
 */
export const TIMELINE_COLORS: Record<TimelineDataType, string> = {
  // Sleep stages - matching SLEEP_STAGE_COLORS
  "sleep-deep": SLEEP_STAGE_COLORS.deep,
  "sleep-core": SLEEP_STAGE_COLORS.core,
  "sleep-rem": SLEEP_STAGE_COLORS.rem,
  "sleep-awake": SLEEP_STAGE_COLORS.awake,
  "awake-day": "bg-yellow-500", // Daytime awake = yellow (起床/清醒)

  // Activities
  workout: "bg-emerald-700", // Green = energy/activity
  water: "bg-blue-700", // Blue = water

  // Transportation modes (from GPS trackpoints)
  "transport-walking": "bg-teal-600", // Teal = walking
  "transport-cycling": "bg-yellow-600", // Yellow = cycling
  "transport-driving": "bg-violet-600", // Violet = driving
  "transport-stationary": "bg-stone-500", // Stone = stationary
  "transport-summary": "bg-violet-700", // Violet darker = summary capsule

  // Elevation
  elevation: "bg-emerald-600", // Emerald = mountain/elevation

  // Physiological metrics
  heartRate: "bg-rose-700", // Red = heart/blood
  hrv: "bg-orange-700", // Orange = heart rate variability
  oxygenSaturation: "bg-sky-700", // Sky blue = oxygen
  respiratoryRate: "bg-cyan-700", // Cyan = breathing

  // Activity metrics
  steps: "bg-amber-700", // Amber = walking
  distance: "bg-lime-700", // Lime green = distance/travel
} as const;

/**
 * Types that should be displayed on the left side of the timeline
 * Left side: Activity/movement related items
 * Right side: State/physiological metrics (sleep, heart rate, etc.)
 */
export const LEFT_SIDE_TYPES = new Set<TimelineDataType>([
  // Activity items
  "workout",
  "water",
  // Activity metrics (movement related)
  "steps",
  "distance",
  // Transportation modes
  "transport-walking",
  "transport-cycling",
  "transport-driving",
  "transport-stationary",
  "transport-summary",
  // Elevation
  "elevation",
]);

/**
 * Get the display side for a data type
 * Left side: Activity/movement items (workout, steps, transport, etc.)
 * Right side: State/physiological metrics (sleep, heart rate, oxygen, etc.)
 */
export function getItemSide(type: TimelineDataType): "left" | "right" {
  return LEFT_SIDE_TYPES.has(type) ? "left" : "right";
}

/**
 * Get the color class for a data type
 */
export function getTimelineColor(type: TimelineDataType): string {
  return TIMELINE_COLORS[type];
}

/**
 * Heart rate zones for a 40-year-old male
 * Based on resting heart rate health indicators:
 * - Green (Ideal): 50-70 bpm - excellent cardiovascular health
 * - Yellow (Elevated): 70-85 bpm - normal but slightly elevated
 * - Orange (High): 85-100 bpm - elevated, may indicate stress or deconditioning
 * - Red (Very High): >100 bpm - tachycardia territory, needs attention
 */
export type HeartRateZone = "ideal" | "elevated" | "high" | "very-high";

export const HEART_RATE_ZONE_COLORS: Record<HeartRateZone, string> = {
  ideal: "bg-green-600",      // Green - healthy resting heart rate
  elevated: "bg-yellow-600",  // Yellow - slightly elevated
  high: "bg-orange-600",      // Orange - high
  "very-high": "bg-red-600",  // Red - very high / tachycardia
};

/**
 * Get the heart rate zone based on BPM value
 * Thresholds designed for 40-year-old male resting heart rate
 */
export function getHeartRateZone(bpm: number): HeartRateZone {
  if (bpm < 70) return "ideal";
  if (bpm < 85) return "elevated";
  if (bpm < 100) return "high";
  return "very-high";
}

/**
 * Get dynamic color class for heart rate based on BPM value
 */
export function getHeartRateColor(bpm: number): string {
  const zone = getHeartRateZone(bpm);
  return HEART_RATE_ZONE_COLORS[zone];
}
