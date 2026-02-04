/**
 * Year view data types - aggregated data for yearly statistics
 */

import type { CategoryBreakdown } from "./pixiu";
import type {
  DailyDataPoint,
  WorkoutTypeBreakdown,
  TransportModeBreakdown,
  AccountBreakdown,
} from "./month-view";

// ============================================================================
// Common Types
// ============================================================================

/** Monthly data point for trend charts */
export interface MonthlyDataPoint {
  month: string; // YYYY-MM
  value: number;
}

// ============================================================================
// Apple Health - Year Data
// ============================================================================

/** Sleep statistics for a year */
export interface YearSleepStats {
  avgDuration: number; // Average hours per night
  totalHours: number; // Total sleep hours
  daysWithData: number;
  avgDeepMinutes: number;
  avgCoreMinutes: number;
  avgRemMinutes: number;
  avgAwakeMinutes: number;
  monthlyDuration: MonthlyDataPoint[]; // Monthly average sleep hours
  dailyDuration: DailyDataPoint[]; // For calendar heatmap
}

/** Heart rate statistics for a year */
export interface YearHeartRateStats {
  avgHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  avgRestingHeartRate: number;
  daysWithData: number;
  monthlyAvg: MonthlyDataPoint[];
  monthlyResting: MonthlyDataPoint[];
}

/** Steps statistics for a year */
export interface YearStepsStats {
  totalSteps: number;
  avgSteps: number;
  maxSteps: number;
  maxStepsDate: string;
  daysWithData: number;
  monthlySteps: MonthlyDataPoint[];
  dailySteps: DailyDataPoint[]; // For calendar heatmap
}

/** Activity ring statistics for a year */
export interface YearActivityStats {
  totalActiveEnergy: number;
  avgActiveEnergy: number;
  totalExerciseMinutes: number;
  avgExerciseMinutes: number;
  totalStandHours: number;
  avgStandHours: number;
  daysWithData: number;
  ringCloseCount: {
    move: number;
    exercise: number;
    stand: number;
    all: number;
  };
  monthlyActiveEnergy: MonthlyDataPoint[];
  monthlyExerciseMinutes: MonthlyDataPoint[];
  dailyActiveEnergy: DailyDataPoint[]; // For calendar heatmap
}

/** Distance statistics for a year */
export interface YearDistanceStats {
  totalDistance: number; // Total km
  avgDistance: number;
  maxDistance: number;
  maxDistanceDate: string;
  totalFlightsClimbed: number;
  avgFlightsClimbed: number;
  daysWithData: number;
  monthlyDistance: MonthlyDataPoint[];
}

/** Workout statistics for a year */
export interface YearWorkoutStats {
  totalWorkouts: number;
  totalDuration: number; // Total minutes
  totalDistance: number; // Total meters
  totalCalories: number; // Total kcal
  daysWithWorkouts: number;
  byType: WorkoutTypeBreakdown[];
  monthlyWorkouts: MonthlyDataPoint[];
  monthlyDuration: MonthlyDataPoint[];
}

/** HRV statistics for a year */
export interface YearHrvStats {
  avgHrv: number;
  minHrv: number;
  maxHrv: number;
  daysWithData: number;
  monthlyHrv: MonthlyDataPoint[];
}

/** Oxygen saturation statistics for a year */
export interface YearOxygenStats {
  avgOxygen: number;
  minOxygen: number;
  maxOxygen: number;
  daysWithData: number;
  monthlyOxygen: MonthlyDataPoint[];
}

/** All health data for a year */
export interface YearHealthData {
  year: number;
  daysInYear: number;
  daysWithData: number;
  sleep: YearSleepStats | null;
  heartRate: YearHeartRateStats | null;
  steps: YearStepsStats | null;
  activity: YearActivityStats | null;
  distance: YearDistanceStats | null;
  workouts: YearWorkoutStats | null;
  hrv: YearHrvStats | null;
  oxygen: YearOxygenStats | null;
}

/** Create an empty year health data object */
export const createEmptyYearHealthData = (year: number): YearHealthData => ({
  year,
  daysInYear: 0,
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
// Footprint - Year Data
// ============================================================================

/** Year footprint statistics */
export interface YearFootprintData {
  year: number;
  daysInYear: number;
  daysWithData: number;
  totalDistance: number; // meters
  totalTrackPoints: number;
  avgSpeed: number; // m/s
  byTransportMode: TransportModeBreakdown[];
  monthlyDistance: MonthlyDataPoint[];
  monthlyTrackPoints: MonthlyDataPoint[];
  dailyDistance: DailyDataPoint[]; // For calendar heatmap
  // Bounding box for the year
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
}

/** Create an empty year footprint data object */
export const createEmptyYearFootprintData = (year: number): YearFootprintData => ({
  year,
  daysInYear: 0,
  daysWithData: 0,
  totalDistance: 0,
  totalTrackPoints: 0,
  avgSpeed: 0,
  byTransportMode: [],
  monthlyDistance: [],
  monthlyTrackPoints: [],
  dailyDistance: [],
  bounds: null,
});

// ============================================================================
// Pixiu - Year Data
// ============================================================================

/** Year financial statistics */
export interface YearPixiuData {
  year: number;
  daysInYear: number;
  daysWithData: number;
  // Summary
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  transactionCount: number;
  avgMonthlyExpense: number;
  avgMonthlyIncome: number;
  // Breakdowns
  expenseByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
  byAccount: AccountBreakdown[];
  // Monthly trends
  monthlyIncome: MonthlyDataPoint[];
  monthlyExpense: MonthlyDataPoint[];
  monthlyNet: MonthlyDataPoint[];
  // Daily trends for heatmap
  dailyExpense: DailyDataPoint[];
  // Top spending months
  topExpenseMonths: {
    month: string;
    amount: number;
  }[];
}

/** Create an empty year pixiu data object */
export const createEmptyYearPixiuData = (year: number): YearPixiuData => ({
  year,
  daysInYear: 0,
  daysWithData: 0,
  totalIncome: 0,
  totalExpense: 0,
  totalNet: 0,
  transactionCount: 0,
  avgMonthlyExpense: 0,
  avgMonthlyIncome: 0,
  expenseByCategory: [],
  incomeByCategory: [],
  byAccount: [],
  monthlyIncome: [],
  monthlyExpense: [],
  monthlyNet: [],
  dailyExpense: [],
  topExpenseMonths: [],
});

// ============================================================================
// Combined Year View
// ============================================================================

/** Year summary card data */
export interface YearSummary {
  year: number;
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

/** Combined year view data */
export interface YearViewData {
  year: number;
  summary: YearSummary;
  health: YearHealthData;
  footprint: YearFootprintData;
  pixiu: YearPixiuData;
}

/** Build year summary from combined data */
export const buildYearSummary = (
  year: number,
  health: YearHealthData,
  footprint: YearFootprintData,
  pixiu: YearPixiuData
): YearSummary => ({
  year,
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
