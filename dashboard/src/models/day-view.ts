/**
 * Day view data types - combines all data sources
 */

import type { DayHealthData } from "./apple-health";
import type { DayFootprintData } from "./footprint";
import type { DayPixiuData } from "./pixiu";

/** Day summary card data */
export interface DaySummary {
  date: string; // YYYY-MM-DD
  
  // Health metrics
  steps: number;
  heartRateAvg: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  activeEnergy: number | null; // kcal
  exerciseMinutes: number | null;
  standHours: number | null;
  sleepHours: number | null;
  
  // Footprint metrics
  distance: number | null; // meters
  locationCount: number;
  
  // Expense metrics
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
}

/** Combined day view data */
export interface DayViewData {
  date: string;
  summary: DaySummary;
  health: DayHealthData;
  footprint: DayFootprintData;
  pixiu: DayPixiuData;
}

/** Timeline event types */
export type TimelineEventType =
  | "sleep"
  | "wake"
  | "workout"
  | "location"
  | "transaction"
  | "heart_rate"
  | "water";

/** Timeline event for display */
export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  time: string; // HH:mm
  endTime?: string; // HH:mm for duration events
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
}

/** Create empty day summary */
export const createEmptyDaySummary = (date: string): DaySummary => ({
  date,
  steps: 0,
  heartRateAvg: null,
  heartRateMin: null,
  heartRateMax: null,
  activeEnergy: null,
  exerciseMinutes: null,
  standHours: null,
  sleepHours: null,
  distance: null,
  locationCount: 0,
  income: 0,
  expense: 0,
  net: 0,
  transactionCount: 0,
});

/** Build summary from combined data */
export const buildDaySummary = (
  date: string,
  health: DayHealthData,
  footprint: DayFootprintData,
  pixiu: DayPixiuData
): DaySummary => ({
  date,
  steps: health.totalSteps,
  heartRateAvg: health.heartRate?.avg ?? null,
  heartRateMin: health.heartRate?.min ?? null,
  heartRateMax: health.heartRate?.max ?? null,
  activeEnergy: health.activity?.activeEnergy ?? null,
  exerciseMinutes: health.activity?.exerciseMinutes ?? null,
  standHours: health.activity?.standHours ?? null,
  sleepHours: health.sleep ? health.sleep.duration / 60 : null,
  distance: footprint.summary?.totalDistance ?? null,
  locationCount: footprint.locations.length,
  income: pixiu.summary?.income ?? 0,
  expense: pixiu.summary?.expense ?? 0,
  net: pixiu.summary?.net ?? 0,
  transactionCount: pixiu.summary?.transactionCount ?? 0,
});
