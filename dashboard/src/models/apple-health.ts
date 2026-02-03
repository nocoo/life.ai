/**
 * Apple Health data types for day view
 */

/** Sleep stage type */
export type SleepStageType = "deep" | "core" | "rem" | "awake";

/** Single sleep stage record */
export interface SleepStage {
  type: SleepStageType;
  start: string; // HH:mm
  end: string; // HH:mm
  duration: number; // minutes
}

/** Sleep record for a day */
export interface SleepRecord {
  start: string; // HH:mm
  end: string; // HH:mm
  duration: number; // total minutes
  stages: SleepStage[];
  // Summary by stage type
  deepMinutes: number;
  coreMinutes: number;
  remMinutes: number;
  awakeMinutes: number;
}

/** Heart rate record at a point in time */
export interface HeartRateRecord {
  time: string; // HH:mm
  value: number; // bpm
}

/** Heart rate summary for a day */
export interface HeartRateSummary {
  avg: number;
  min: number;
  max: number;
  restingHeartRate?: number; // resting heart rate
  walkingAverage?: number; // walking average heart rate
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

/** Blood oxygen record */
export interface OxygenSaturationRecord {
  time: string; // HH:mm
  value: number; // 0-100 (percentage)
}

/** Blood oxygen summary */
export interface OxygenSaturationSummary {
  avg: number;
  min: number;
  max: number;
  records: OxygenSaturationRecord[];
}

/** Respiratory rate record */
export interface RespiratoryRateRecord {
  time: string; // HH:mm
  value: number; // breaths per minute
}

/** Respiratory rate summary */
export interface RespiratoryRateSummary {
  avg: number;
  min: number;
  max: number;
  records: RespiratoryRateRecord[];
}

/** Heart rate variability (HRV) record */
export interface HrvRecord {
  time: string; // HH:mm
  value: number; // ms (SDNN)
}

/** HRV summary */
export interface HrvSummary {
  avg: number;
  min: number;
  max: number;
  records: HrvRecord[];
}

/** Walking/running distance per hour */
export interface DistanceRecord {
  hour: number; // 0-23
  distance: number; // km
}

/** Distance summary */
export interface DistanceSummary {
  total: number; // km
  records: DistanceRecord[];
}

/** All health data for a single day */
export interface DayHealthData {
  date: string; // YYYY-MM-DD
  // Core metrics
  sleep: SleepRecord | null;
  heartRate: HeartRateSummary | null;
  steps: StepsRecord[];
  totalSteps: number;
  distance: DistanceSummary | null;
  // Health metrics
  oxygenSaturation: OxygenSaturationSummary | null;
  respiratoryRate: RespiratoryRateSummary | null;
  hrv: HrvSummary | null;
  // Other
  water: WaterRecord[];
  totalWater: number; // ml
  workouts: WorkoutRecord[];
  activity: ActivitySummary | null;
  ecgRecords: EcgRecord[];
  // Additional metrics
  flightsClimbed: number;
  sleepingWristTemperature?: number; // degC
}

/** Create an empty day health data object */
export const createEmptyDayHealthData = (date: string): DayHealthData => ({
  date,
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
  flightsClimbed: 0,
  sleepingWristTemperature: undefined,
});
