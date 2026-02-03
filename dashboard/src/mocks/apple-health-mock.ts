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
} from "@/models/apple-health";

/** Generate mock sleep data */
export const createMockSleep = (date: string): SleepRecord => ({
  start: `${date.replace(/\d{2}$/, (d) => String(Number(d) - 1).padStart(2, "0"))}T23:30:00`,
  end: `${date}T07:00:00`,
  duration: 450, // 7.5 hours
  stages: [
    { type: "light", duration: 45 },
    { type: "deep", duration: 90 },
    { type: "rem", duration: 30 },
    { type: "light", duration: 60 },
    { type: "deep", duration: 75 },
    { type: "rem", duration: 45 },
    { type: "light", duration: 45 },
    { type: "deep", duration: 30 },
    { type: "light", duration: 30 },
  ],
});

/** Generate mock heart rate data */
export const createMockHeartRate = (): HeartRateSummary => ({
  avg: 72,
  min: 52,
  max: 145,
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

/** Generate complete mock health data for a day */
export const createMockDayHealthData = (date: string): DayHealthData => {
  const steps = createMockSteps();
  const water = createMockWater();

  return {
    date,
    sleep: createMockSleep(date),
    heartRate: createMockHeartRate(),
    steps,
    totalSteps: steps.reduce((sum, s) => sum + s.count, 0),
    water,
    totalWater: water.reduce((sum, w) => sum + w.amount, 0),
    workouts: createMockWorkouts(date),
    activity: createMockActivity(),
    ecgRecords: [],
  };
};
