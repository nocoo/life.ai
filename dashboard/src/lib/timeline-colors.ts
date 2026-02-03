/**
 * Timeline color mapping with stable hash
 * All colors use dark backgrounds with white text for consistency
 */

import type { TimelineDataType } from "@/models/day-view";

/**
 * Stable color mapping for timeline data types
 * Colors are chosen with semantic meaning where possible:
 * - Sleep stages: indigo/purple spectrum (deep = darkest)
 * - Workout: emerald (activity/energy)
 * - Heart rate: rose (blood/heart)
 * - Oxygen: sky blue (oxygen)
 * - Water: blue
 */
export const TIMELINE_COLORS: Record<TimelineDataType, string> = {
  // Sleep stages - intuitive depth mapping
  "sleep-deep": "bg-indigo-800", // Deepest sleep = darkest blue
  "sleep-core": "bg-indigo-600", // Core sleep = medium blue
  "sleep-rem": "bg-purple-700", // REM/dreams = purple
  "sleep-awake": "bg-slate-600", // Awake during sleep = neutral gray
  "awake-day": "bg-green-600", // Daytime awake = green (起床)

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
 * These are typically duration-based or state-based items
 */
export const LEFT_SIDE_TYPES = new Set<TimelineDataType>([
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
  "transport-summary",
  "elevation",
]);

/**
 * Get the display side for a data type
 * Left side: duration/state items (sleep, workout, water)
 * Right side: instant metrics (heart rate, steps, etc.)
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
