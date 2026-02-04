/**
 * Month view data types - aggregated data for monthly statistics
 */

import type { CategoryBreakdown } from "./pixiu";

// ============================================================================
// Common Types
// ============================================================================

/** Daily data point for trend charts */
export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Workout type breakdown */
export interface WorkoutTypeBreakdown {
  type: string; // e.g., "Running", "Swimming", "Walking"
  typeName: string; // Display name
  count: number; // Number of workouts
  totalDuration: number; // Total minutes
  totalDistance: number; // Total meters
  totalCalories: number; // Total kcal
}

// ============================================================================
// Apple Health - Month Data
// ============================================================================

/** Sleep statistics for a month */
export interface MonthSleepStats {
  avgDuration: number; // Average hours per night
  totalHours: number; // Total sleep hours
  daysWithData: number; // Days with sleep records
  avgDeepMinutes: number;
  avgCoreMinutes: number;
  avgRemMinutes: number;
  avgAwakeMinutes: number;
  dailyDuration: DailyDataPoint[]; // Daily sleep hours
}

/** Heart rate statistics for a month */
export interface MonthHeartRateStats {
  avgHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  avgRestingHeartRate: number;
  daysWithData: number;
  dailyAvg: DailyDataPoint[]; // Daily average HR
  dailyResting: DailyDataPoint[]; // Daily resting HR
}

/** Steps statistics for a month */
export interface MonthStepsStats {
  totalSteps: number;
  avgSteps: number;
  maxSteps: number;
  maxStepsDate: string;
  daysWithData: number;
  dailySteps: DailyDataPoint[]; // Daily step counts
}

/** Activity ring statistics for a month */
export interface MonthActivityStats {
  totalActiveEnergy: number; // Total kcal
  avgActiveEnergy: number;
  totalExerciseMinutes: number;
  avgExerciseMinutes: number;
  totalStandHours: number;
  avgStandHours: number;
  daysWithData: number;
  ringCloseCount: {
    // Days where rings were closed
    move: number;
    exercise: number;
    stand: number;
    all: number; // All three closed
  };
  dailyActiveEnergy: DailyDataPoint[];
  dailyExerciseMinutes: DailyDataPoint[];
}

/** Distance statistics for a month */
export interface MonthDistanceStats {
  totalDistance: number; // Total km
  avgDistance: number;
  maxDistance: number;
  maxDistanceDate: string;
  totalFlightsClimbed: number;
  avgFlightsClimbed: number;
  daysWithData: number;
  dailyDistance: DailyDataPoint[];
}

/** Workout statistics for a month */
export interface MonthWorkoutStats {
  totalWorkouts: number;
  totalDuration: number; // Total minutes
  totalDistance: number; // Total meters
  totalCalories: number; // Total kcal
  daysWithWorkouts: number;
  byType: WorkoutTypeBreakdown[];
  dailyWorkouts: DailyDataPoint[]; // Daily workout count
}

/** HRV statistics for a month */
export interface MonthHrvStats {
  avgHrv: number;
  minHrv: number;
  maxHrv: number;
  daysWithData: number;
  dailyHrv: DailyDataPoint[];
}

/** Oxygen saturation statistics for a month */
export interface MonthOxygenStats {
  avgOxygen: number;
  minOxygen: number;
  maxOxygen: number;
  daysWithData: number;
  dailyOxygen: DailyDataPoint[];
}

/** All health data for a month */
export interface MonthHealthData {
  month: string; // YYYY-MM
  daysInMonth: number;
  daysWithData: number;
  sleep: MonthSleepStats | null;
  heartRate: MonthHeartRateStats | null;
  steps: MonthStepsStats | null;
  activity: MonthActivityStats | null;
  distance: MonthDistanceStats | null;
  workouts: MonthWorkoutStats | null;
  hrv: MonthHrvStats | null;
  oxygen: MonthOxygenStats | null;
}

/** Create an empty month health data object */
export const createEmptyMonthHealthData = (month: string): MonthHealthData => ({
  month,
  daysInMonth: 0,
  daysWithData: 0,
  sleep: null,
  heartRate: null,
  steps: null,
  activity: null,
  distance: null,
  workouts: null,
  hrv: null,
  oxygen: null,
});

// ============================================================================
// Footprint - Month Data
// ============================================================================

/** Transport mode breakdown */
export interface TransportModeBreakdown {
  mode: "walking" | "cycling" | "driving" | "stationary";
  modeName: string;
  totalDistance: number; // meters
  totalDuration: number; // minutes
  percentage: number; // 0-100
}

/** Month footprint statistics */
export interface MonthFootprintData {
  month: string; // YYYY-MM
  daysInMonth: number;
  daysWithData: number;
  totalDistance: number; // meters
  totalTrackPoints: number;
  avgSpeed: number; // m/s
  byTransportMode: TransportModeBreakdown[];
  dailyDistance: DailyDataPoint[]; // Daily distance
  dailyTrackPoints: DailyDataPoint[]; // Daily track points
  // Bounding box for the month
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
}

/** Create an empty month footprint data object */
export const createEmptyMonthFootprintData = (
  month: string
): MonthFootprintData => ({
  month,
  daysInMonth: 0,
  daysWithData: 0,
  totalDistance: 0,
  totalTrackPoints: 0,
  avgSpeed: 0,
  byTransportMode: [],
  dailyDistance: [],
  dailyTrackPoints: [],
  bounds: null,
});

// ============================================================================
// Pixiu - Month Data
// ============================================================================

/** Account breakdown */
export interface AccountBreakdown {
  account: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  percentage: number; // 0-100 (percentage of total expense/income)
}

/** Month financial statistics */
export interface MonthPixiuData {
  month: string; // YYYY-MM
  daysInMonth: number;
  daysWithData: number;
  // Summary
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  transactionCount: number;
  avgDailyExpense: number;
  avgDailyIncome: number;
  // Breakdowns
  expenseByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
  byAccount: AccountBreakdown[];
  // Daily trends
  dailyIncome: DailyDataPoint[];
  dailyExpense: DailyDataPoint[];
  dailyNet: DailyDataPoint[];
  // Top transactions
  topExpenses: {
    date: string;
    category: string;
    amount: number;
    note: string;
  }[];
}

/** Create an empty month pixiu data object */
export const createEmptyMonthPixiuData = (month: string): MonthPixiuData => ({
  month,
  daysInMonth: 0,
  daysWithData: 0,
  totalIncome: 0,
  totalExpense: 0,
  totalNet: 0,
  transactionCount: 0,
  avgDailyExpense: 0,
  avgDailyIncome: 0,
  expenseByCategory: [],
  incomeByCategory: [],
  byAccount: [],
  dailyIncome: [],
  dailyExpense: [],
  dailyNet: [],
  topExpenses: [],
});

// ============================================================================
// Combined Month View
// ============================================================================

/** Month summary card data */
export interface MonthSummary {
  month: string;
  // Health metrics
  totalSteps: number;
  avgHeartRate: number | null;
  totalActiveEnergy: number | null;
  totalExerciseMinutes: number | null;
  avgSleepHours: number | null;
  totalWorkouts: number;
  // Footprint metrics
  totalDistance: number | null;
  daysWithTracking: number;
  // Expense metrics
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  transactionCount: number;
}

/** Combined month view data */
export interface MonthViewData {
  month: string;
  summary: MonthSummary;
  health: MonthHealthData;
  footprint: MonthFootprintData;
  pixiu: MonthPixiuData;
}

/** Build month summary from combined data */
export const buildMonthSummary = (
  month: string,
  health: MonthHealthData,
  footprint: MonthFootprintData,
  pixiu: MonthPixiuData
): MonthSummary => ({
  month,
  totalSteps: health.steps?.totalSteps ?? 0,
  avgHeartRate: health.heartRate?.avgHeartRate ?? null,
  totalActiveEnergy: health.activity?.totalActiveEnergy ?? null,
  totalExerciseMinutes: health.activity?.totalExerciseMinutes ?? null,
  avgSleepHours: health.sleep?.avgDuration ?? null,
  totalWorkouts: health.workouts?.totalWorkouts ?? 0,
  totalDistance: footprint.totalDistance > 0 ? footprint.totalDistance : null,
  daysWithTracking: footprint.daysWithData,
  totalIncome: pixiu.totalIncome,
  totalExpense: pixiu.totalExpense,
  totalNet: pixiu.totalNet,
  transactionCount: pixiu.transactionCount,
});
