/**
 * Apple Health data types for day view
 */

/** Sleep stage type */
export type SleepStageType = "deep" | "light" | "rem" | "awake";

/** Single sleep stage record */
export interface SleepStage {
  type: SleepStageType;
  duration: number; // minutes
}

/** Sleep record for a day */
export interface SleepRecord {
  start: string; // ISO datetime
  end: string; // ISO datetime
  duration: number; // total minutes
  stages: SleepStage[];
}

/** Heart rate record at a point in time */
export interface HeartRateRecord {
  time: string; // ISO datetime or HH:mm
  value: number; // bpm
}

/** Heart rate summary for a day */
export interface HeartRateSummary {
  avg: number;
  min: number;
  max: number;
  records: HeartRateRecord[];
}

/** Steps record per hour */
export interface StepsRecord {
  hour: number; // 0-23
  count: number;
}

/** Water intake record */
export interface WaterRecord {
  time: string; // HH:mm
  amount: number; // ml
}

/** Workout record */
export interface WorkoutRecord {
  id: string;
  type: string; // e.g., "HKWorkoutActivityTypeRunning"
  typeName: string; // e.g., "Running"
  start: string; // ISO datetime
  end: string; // ISO datetime
  duration: number; // minutes
  distance?: number; // meters
  calories?: number; // kcal
}

/** Activity summary (Apple Watch rings) */
export interface ActivitySummary {
  activeEnergy: number; // kcal
  exerciseMinutes: number;
  standHours: number;
  activeEnergyGoal?: number;
  exerciseGoal?: number;
  standGoal?: number;
}

/** ECG file record */
export interface EcgRecord {
  id: string;
  filePath: string;
  recordedAt: string;
  samplingRate: number;
}

/** All health data for a single day */
export interface DayHealthData {
  date: string; // YYYY-MM-DD
  sleep: SleepRecord | null;
  heartRate: HeartRateSummary | null;
  steps: StepsRecord[];
  totalSteps: number;
  water: WaterRecord[];
  totalWater: number; // ml
  workouts: WorkoutRecord[];
  activity: ActivitySummary | null;
  ecgRecords: EcgRecord[];
}

/** Create an empty day health data object */
export const createEmptyDayHealthData = (date: string): DayHealthData => ({
  date,
  sleep: null,
  heartRate: null,
  steps: [],
  totalSteps: 0,
  water: [],
  totalWater: 0,
  workouts: [],
  activity: null,
  ecgRecords: [],
});
