/**
 * Mock data for Apple Health
 */

import type {
  DayHealthData,
  SleepRecord,
  HeartRateSummary,
  StepsRecord,
  WaterRecord,
  WorkoutRecord,
  ActivitySummary,
  OxygenSaturationSummary,
  RespiratoryRateSummary,
  HrvSummary,
  DistanceSummary,
} from "@/models/apple-health";

/** Generate mock sleep data */
export const createMockSleep = (): SleepRecord => ({
  start: "23:30",
  end: "07:00",
  duration: 450, // 7.5 hours
  deepMinutes: 195,
  coreMinutes: 180,
  remMinutes: 75,
  awakeMinutes: 0,
  stages: [
    { type: "core", start: "23:30", end: "00:15", duration: 45 },
    { type: "deep", start: "00:15", end: "01:45", duration: 90 },
    { type: "rem", start: "01:45", end: "02:15", duration: 30 },
    { type: "core", start: "02:15", end: "03:15", duration: 60 },
    { type: "deep", start: "03:15", end: "04:30", duration: 75 },
    { type: "rem", start: "04:30", end: "05:15", duration: 45 },
    { type: "core", start: "05:15", end: "06:00", duration: 45 },
    { type: "deep", start: "06:00", end: "06:30", duration: 30 },
    { type: "core", start: "06:30", end: "07:00", duration: 30 },
  ],
});

/** Generate mock heart rate data */
export const createMockHeartRate = (): HeartRateSummary => ({
  avg: 72,
  min: 52,
  max: 145,
  restingHeartRate: 58,
  walkingAverage: 95,
  records: [
    { time: "00:30", value: 58 },
    { time: "03:00", value: 52 },
    { time: "06:00", value: 55 },
    { time: "07:00", value: 68 },
    { time: "08:00", value: 75 },
    { time: "09:00", value: 82 },
    { time: "10:00", value: 78 },
    { time: "11:00", value: 85 },
    { time: "12:00", value: 72 },
    { time: "13:00", value: 68 },
    { time: "14:00", value: 75 },
    { time: "15:00", value: 80 },
    { time: "16:00", value: 88 },
    { time: "17:00", value: 92 },
    { time: "18:00", value: 145 }, // workout
    { time: "19:00", value: 95 },
    { time: "20:00", value: 72 },
    { time: "21:00", value: 68 },
    { time: "22:00", value: 62 },
    { time: "23:00", value: 58 },
  ],
});

/** Generate mock steps data */
export const createMockSteps = (): StepsRecord[] => [
  { hour: 7, count: 234 },
  { hour: 8, count: 1567 },
  { hour: 9, count: 892 },
  { hour: 10, count: 456 },
  { hour: 11, count: 678 },
  { hour: 12, count: 1234 },
  { hour: 13, count: 345 },
  { hour: 14, count: 567 },
  { hour: 15, count: 789 },
  { hour: 16, count: 1023 },
  { hour: 17, count: 1456 },
  { hour: 18, count: 2345 }, // workout
  { hour: 19, count: 1123 },
  { hour: 20, count: 456 },
  { hour: 21, count: 234 },
  { hour: 22, count: 123 },
];

/** Generate mock distance data */
export const createMockDistance = (): DistanceSummary => ({
  total: 8.5,
  records: [
    { hour: 7, distance: 0.15 },
    { hour: 8, distance: 1.1 },
    { hour: 9, distance: 0.6 },
    { hour: 10, distance: 0.3 },
    { hour: 11, distance: 0.45 },
    { hour: 12, distance: 0.85 },
    { hour: 17, distance: 1.0 },
    { hour: 18, distance: 3.5 }, // workout
    { hour: 19, distance: 0.55 },
  ],
});

/** Generate mock water intake data */
export const createMockWater = (): WaterRecord[] => [
  { time: "07:30", amount: 250 },
  { time: "09:00", amount: 200 },
  { time: "10:30", amount: 300 },
  { time: "12:30", amount: 250 },
  { time: "14:00", amount: 200 },
  { time: "15:30", amount: 350 },
  { time: "17:00", amount: 250 },
  { time: "19:00", amount: 300 },
  { time: "21:00", amount: 200 },
];

/** Generate mock workout data */
export const createMockWorkouts = (date: string): WorkoutRecord[] => [
  {
    id: "workout-1",
    type: "HKWorkoutActivityTypeRunning",
    typeName: "Running",
    start: `${date}T18:00:00`,
    end: `${date}T18:35:00`,
    duration: 35,
    distance: 5200,
    calories: 320,
  },
  {
    id: "workout-2",
    type: "HKWorkoutActivityTypeWalking",
    typeName: "Walking",
    start: `${date}T08:15:00`,
    end: `${date}T08:45:00`,
    duration: 30,
    distance: 2100,
    calories: 85,
  },
];

/** Generate mock activity summary */
export const createMockActivity = (): ActivitySummary => ({
  activeEnergy: 450,
  exerciseMinutes: 45,
  standHours: 10,
  activeEnergyGoal: 500,
  exerciseGoal: 30,
  standGoal: 12,
});

/** Generate mock oxygen saturation data */
export const createMockOxygenSaturation = (): OxygenSaturationSummary => ({
  avg: 97,
  min: 94,
  max: 100,
  records: [
    { time: "00:16", value: 98 },
    { time: "02:07", value: 97 },
    { time: "04:19", value: 98 },
    { time: "09:52", value: 100 },
    { time: "14:50", value: 99 },
    { time: "21:38", value: 99 },
  ],
});

/** Generate mock respiratory rate data */
export const createMockRespiratoryRate = (): RespiratoryRateSummary => ({
  avg: 17.5,
  min: 15,
  max: 25,
  records: [
    { time: "00:03", value: 17.5 },
    { time: "01:05", value: 17 },
    { time: "02:20", value: 19 },
    { time: "03:18", value: 16 },
    { time: "04:25", value: 16.5 },
  ],
});

/** Generate mock HRV data */
export const createMockHrv = (): HrvSummary => ({
  avg: 50,
  min: 23,
  max: 94,
  records: [
    { time: "00:23", value: 30 },
    { time: "02:23", value: 23 },
    { time: "04:23", value: 37 },
    { time: "06:33", value: 63 },
    { time: "10:26", value: 68 },
    { time: "14:31", value: 66 },
    { time: "21:38", value: 94 },
  ],
});

/** Generate complete mock health data for a day */
export const createMockDayHealthData = (date: string): DayHealthData => {
  const steps = createMockSteps();
  const water = createMockWater();

  return {
    date,
    sleep: createMockSleep(),
    heartRate: createMockHeartRate(),
    steps,
    totalSteps: steps.reduce((sum, s) => sum + s.count, 0),
    distance: createMockDistance(),
    oxygenSaturation: createMockOxygenSaturation(),
    respiratoryRate: createMockRespiratoryRate(),
    hrv: createMockHrv(),
    water,
    totalWater: water.reduce((sum, w) => sum + w.amount, 0),
    workouts: createMockWorkouts(date),
    activity: createMockActivity(),
    ecgRecords: [],
    flightsClimbed: 5,
    sleepingWristTemperature: 35.8,
  };
};
