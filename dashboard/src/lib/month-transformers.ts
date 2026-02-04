/**
 * Transform raw API data to month view models
 */

import type {
  AppleRecordRow,
  AppleWorkoutRow,
  AppleActivitySummaryRow,
  AppleHealthMonthRawData,
} from "@/services/applehealth-service";
import type { FootprintMonthRawData } from "@/services/footprint-service";
import type {
  PixiuTransactionRow,
  PixiuMonthRawData,
} from "@/services/pixiu-service";
import type {
  MonthHealthData,
  MonthSleepStats,
  MonthHeartRateStats,
  MonthStepsStats,
  MonthActivityStats,
  MonthDistanceStats,
  MonthWorkoutStats,
  MonthHrvStats,
  MonthOxygenStats,
  DailyDataPoint,
  WorkoutTypeBreakdown,
  MonthFootprintData,
  MonthPixiuData,
  AccountBreakdown,
} from "@/models/month-view";
import type { CategoryBreakdown } from "@/models/pixiu";

// ============================================================================
// Utility Functions
// ============================================================================

/** Get number of days in a month */
export const getDaysInMonth = (month: string): number => {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m, 0).getDate();
};

/** Group records by day */
const groupByDay = <T extends { day?: string }>(
  records: T[],
  getDayFn?: (r: T) => string
): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  records.forEach((r) => {
    const day = getDayFn ? getDayFn(r) : r.day!;
    const existing = map.get(day) || [];
    existing.push(r);
    map.set(day, existing);
  });
  return map;
};

/** Mapping from HK workout type to display name */
const WORKOUT_TYPE_NAMES: Record<string, string> = {
  HKWorkoutActivityTypeRunning: "Running",
  HKWorkoutActivityTypeWalking: "Walking",
  HKWorkoutActivityTypeCycling: "Cycling",
  HKWorkoutActivityTypeSwimming: "Swimming",
  HKWorkoutActivityTypeYoga: "Yoga",
  HKWorkoutActivityTypeHiking: "Hiking",
  HKWorkoutActivityTypeStrengthTraining: "Strength Training",
  HKWorkoutActivityTypeElliptical: "Elliptical",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Functional Training",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "Weight Training",
  HKWorkoutActivityTypeCoreTraining: "Core Training",
  HKWorkoutActivityTypeHighIntensityIntervalTraining: "HIIT",
};

/** Get display name for workout type */
const getWorkoutTypeName = (type: string): string => {
  return WORKOUT_TYPE_NAMES[type] || type.replace(/HKWorkoutActivityType/, "");
};

// ============================================================================
// Apple Health Transformers
// ============================================================================

/** Transform sleep records to monthly stats */
const transformMonthSleep = (
  records: AppleRecordRow[],
  month: string
): MonthSleepStats | null => {
  // Filter sleep records
  const sleepRecords = records.filter(
    (r) =>
      r.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (sleepRecords.length === 0) return null;

  // Group by day to calculate daily totals
  const byDay = groupByDay(sleepRecords);
  const dailyDuration: DailyDataPoint[] = [];
  let totalMinutes = 0;
  let totalDeep = 0;
  let totalCore = 0;
  let totalRem = 0;
  let totalAwake = 0;

  byDay.forEach((dayRecords, day) => {
    let dayDeep = 0;
    let dayCore = 0;
    let dayRem = 0;
    let dayAwake = 0;

    dayRecords.forEach((r) => {
      const start = new Date(r.start_date.replace(" +", "+").replace(" ", "T"));
      const end = new Date(r.end_date.replace(" +", "+").replace(" ", "T"));
      const duration = (end.getTime() - start.getTime()) / 60000; // minutes

      if (r.value === "HKCategoryValueSleepAnalysisAsleepDeep") dayDeep += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAsleepCore") dayCore += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAsleepREM") dayRem += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAwake") dayAwake += duration;
    });

    const dayTotal = dayDeep + dayCore + dayRem + dayAwake;
    if (dayTotal > 0) {
      dailyDuration.push({ date: day, value: dayTotal / 60 }); // hours
      totalMinutes += dayTotal;
      totalDeep += dayDeep;
      totalCore += dayCore;
      totalRem += dayRem;
      totalAwake += dayAwake;
    }
  });

  const daysWithData = dailyDuration.length;
  if (daysWithData === 0) return null;

  return {
    avgDuration: totalMinutes / 60 / daysWithData,
    totalHours: totalMinutes / 60,
    daysWithData,
    avgDeepMinutes: totalDeep / daysWithData,
    avgCoreMinutes: totalCore / daysWithData,
    avgRemMinutes: totalRem / daysWithData,
    avgAwakeMinutes: totalAwake / daysWithData,
    dailyDuration: dailyDuration.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform heart rate records to monthly stats */
const transformMonthHeartRate = (
  records: AppleRecordRow[],
  month: string
): MonthHeartRateStats | null => {
  const hrRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierHeartRate" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (hrRecords.length === 0) return null;

  // Group by day for daily averages
  const byDay = groupByDay(hrRecords);
  const dailyAvg: DailyDataPoint[] = [];
  const dailyResting: DailyDataPoint[] = [];
  let allValues: number[] = [];
  const restingValues: number[] = [];

  // Get resting heart rate records
  const restingRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierRestingHeartRate" &&
      r.value &&
      r.day.startsWith(month)
  );
  const restingByDay = groupByDay(restingRecords);

  byDay.forEach((dayRecords, day) => {
    const values = dayRecords.map((r) => parseFloat(r.value!));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    dailyAvg.push({ date: day, value: Math.round(avg) });
    allValues = allValues.concat(values);

    // Add resting HR for this day
    const restingForDay = restingByDay.get(day);
    if (restingForDay && restingForDay.length > 0) {
      const restingValue = parseFloat(restingForDay[0].value!);
      dailyResting.push({ date: day, value: Math.round(restingValue) });
      restingValues.push(restingValue);
    }
  });

  const daysWithData = dailyAvg.length;

  return {
    avgHeartRate: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minHeartRate: Math.round(Math.min(...allValues)),
    maxHeartRate: Math.round(Math.max(...allValues)),
    avgRestingHeartRate:
      restingValues.length > 0
        ? Math.round(restingValues.reduce((a, b) => a + b, 0) / restingValues.length)
        : 0,
    daysWithData,
    dailyAvg: dailyAvg.sort((a, b) => a.date.localeCompare(b.date)),
    dailyResting: dailyResting.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform step records to monthly stats */
const transformMonthSteps = (
  records: AppleRecordRow[],
  month: string
): MonthStepsStats | null => {
  const stepRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierStepCount" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (stepRecords.length === 0) return null;

  // Group by day
  const byDay = groupByDay(stepRecords);
  const dailySteps: DailyDataPoint[] = [];
  let totalSteps = 0;
  let maxSteps = 0;
  let maxStepsDate = "";

  byDay.forEach((dayRecords, day) => {
    const dayTotal = dayRecords.reduce((sum, r) => sum + parseInt(r.value!, 10), 0);
    dailySteps.push({ date: day, value: dayTotal });
    totalSteps += dayTotal;

    if (dayTotal > maxSteps) {
      maxSteps = dayTotal;
      maxStepsDate = day;
    }
  });

  const daysWithData = dailySteps.length;

  return {
    totalSteps,
    avgSteps: Math.round(totalSteps / daysWithData),
    maxSteps,
    maxStepsDate,
    daysWithData,
    dailySteps: dailySteps.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform activity summaries to monthly stats */
const transformMonthActivity = (
  summaries: AppleActivitySummaryRow[],
  month: string
): MonthActivityStats | null => {
  const monthSummaries = summaries.filter((s) => s.day.startsWith(month));

  if (monthSummaries.length === 0) return null;

  let totalActiveEnergy = 0;
  let totalExerciseMinutes = 0;
  let totalStandHours = 0;
  const dailyActiveEnergy: DailyDataPoint[] = [];
  const dailyExerciseMinutes: DailyDataPoint[] = [];

  // Default goals (Apple Watch defaults)
  const moveGoal = 500; // kcal
  const exerciseGoal = 30; // minutes
  const standGoal = 12; // hours

  let moveClose = 0;
  let exerciseClose = 0;
  let standClose = 0;
  let allClose = 0;

  monthSummaries.forEach((s) => {
    const activeEnergy = s.active_energy ?? 0;
    const exerciseMinutes = s.exercise_time ?? 0;
    const standHours = s.stand_hours ?? 0;

    totalActiveEnergy += activeEnergy;
    totalExerciseMinutes += exerciseMinutes;
    totalStandHours += standHours;

    dailyActiveEnergy.push({ date: s.day, value: activeEnergy });
    dailyExerciseMinutes.push({ date: s.day, value: exerciseMinutes });

    // Check ring closes
    const moveClosedToday = activeEnergy >= moveGoal;
    const exerciseClosedToday = exerciseMinutes >= exerciseGoal;
    const standClosedToday = standHours >= standGoal;

    if (moveClosedToday) moveClose++;
    if (exerciseClosedToday) exerciseClose++;
    if (standClosedToday) standClose++;
    if (moveClosedToday && exerciseClosedToday && standClosedToday) allClose++;
  });

  const daysWithData = monthSummaries.length;

  return {
    totalActiveEnergy,
    avgActiveEnergy: Math.round(totalActiveEnergy / daysWithData),
    totalExerciseMinutes,
    avgExerciseMinutes: Math.round(totalExerciseMinutes / daysWithData),
    totalStandHours,
    avgStandHours: Math.round((totalStandHours / daysWithData) * 10) / 10,
    daysWithData,
    ringCloseCount: {
      move: moveClose,
      exercise: exerciseClose,
      stand: standClose,
      all: allClose,
    },
    dailyActiveEnergy: dailyActiveEnergy.sort((a, b) => a.date.localeCompare(b.date)),
    dailyExerciseMinutes: dailyExerciseMinutes.sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
  };
};

/** Transform distance records to monthly stats */
const transformMonthDistance = (
  records: AppleRecordRow[],
  month: string
): MonthDistanceStats | null => {
  const distanceRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierDistanceWalkingRunning" &&
      r.value &&
      r.day.startsWith(month)
  );

  const flightRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierFlightsClimbed" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (distanceRecords.length === 0) return null;

  // Group by day
  const byDay = groupByDay(distanceRecords);
  const flightsByDay = groupByDay(flightRecords);
  const dailyDistance: DailyDataPoint[] = [];
  let totalDistance = 0;
  let maxDistance = 0;
  let maxDistanceDate = "";
  let totalFlights = 0;

  byDay.forEach((dayRecords, day) => {
    const dayTotal = dayRecords.reduce((sum, r) => sum + parseFloat(r.value!), 0);
    dailyDistance.push({ date: day, value: dayTotal });
    totalDistance += dayTotal;

    if (dayTotal > maxDistance) {
      maxDistance = dayTotal;
      maxDistanceDate = day;
    }
  });

  flightsByDay.forEach((dayRecords) => {
    totalFlights += dayRecords.reduce((sum, r) => sum + parseInt(r.value!, 10), 0);
  });

  const daysWithData = dailyDistance.length;

  return {
    totalDistance,
    avgDistance: Math.round((totalDistance / daysWithData) * 100) / 100,
    maxDistance,
    maxDistanceDate,
    totalFlightsClimbed: totalFlights,
    avgFlightsClimbed: Math.round((totalFlights / daysWithData) * 10) / 10,
    daysWithData,
    dailyDistance: dailyDistance.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform workout records to monthly stats */
const transformMonthWorkouts = (
  workouts: AppleWorkoutRow[],
  month: string
): MonthWorkoutStats | null => {
  const monthWorkouts = workouts.filter((w) => w.day.startsWith(month));

  if (monthWorkouts.length === 0) return null;

  let totalDuration = 0;
  let totalDistance = 0;
  let totalCalories = 0;
  const daysSet = new Set<string>();
  const byType = new Map<
    string,
    { count: number; duration: number; distance: number; calories: number }
  >();
  const dailyWorkouts: DailyDataPoint[] = [];
  const dailyCount = new Map<string, number>();

  monthWorkouts.forEach((w) => {
    const duration = w.duration ? w.duration / 60 : 0; // seconds to minutes
    const distance = w.total_distance ?? 0;
    const calories = w.total_energy ?? 0;

    totalDuration += duration;
    totalDistance += distance;
    totalCalories += calories;
    daysSet.add(w.day);

    // By type
    const existing = byType.get(w.workout_type) || {
      count: 0,
      duration: 0,
      distance: 0,
      calories: 0,
    };
    byType.set(w.workout_type, {
      count: existing.count + 1,
      duration: existing.duration + duration,
      distance: existing.distance + distance,
      calories: existing.calories + calories,
    });

    // Daily count
    dailyCount.set(w.day, (dailyCount.get(w.day) || 0) + 1);
  });

  dailyCount.forEach((count, day) => {
    dailyWorkouts.push({ date: day, value: count });
  });

  const byTypeBreakdown: WorkoutTypeBreakdown[] = Array.from(byType.entries())
    .map(([type, data]) => ({
      type,
      typeName: getWorkoutTypeName(type),
      count: data.count,
      totalDuration: Math.round(data.duration),
      totalDistance: Math.round(data.distance),
      totalCalories: Math.round(data.calories),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalWorkouts: monthWorkouts.length,
    totalDuration: Math.round(totalDuration),
    totalDistance: Math.round(totalDistance),
    totalCalories: Math.round(totalCalories),
    daysWithWorkouts: daysSet.size,
    byType: byTypeBreakdown,
    dailyWorkouts: dailyWorkouts.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform HRV records to monthly stats */
const transformMonthHrv = (
  records: AppleRecordRow[],
  month: string
): MonthHrvStats | null => {
  const hrvRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (hrvRecords.length === 0) return null;

  const byDay = groupByDay(hrvRecords);
  const dailyHrv: DailyDataPoint[] = [];
  const allValues: number[] = [];

  byDay.forEach((dayRecords, day) => {
    const values = dayRecords.map((r) => parseFloat(r.value!));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    dailyHrv.push({ date: day, value: Math.round(avg) });
    allValues.push(...values);
  });

  return {
    avgHrv: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minHrv: Math.round(Math.min(...allValues)),
    maxHrv: Math.round(Math.max(...allValues)),
    daysWithData: dailyHrv.length,
    dailyHrv: dailyHrv.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform oxygen saturation records to monthly stats */
const transformMonthOxygen = (
  records: AppleRecordRow[],
  month: string
): MonthOxygenStats | null => {
  const o2Records = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierOxygenSaturation" &&
      r.value &&
      r.day.startsWith(month)
  );

  if (o2Records.length === 0) return null;

  const byDay = groupByDay(o2Records);
  const dailyOxygen: DailyDataPoint[] = [];
  const allValues: number[] = [];

  byDay.forEach((dayRecords, day) => {
    const values = dayRecords.map((r) => parseFloat(r.value!) * 100);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    dailyOxygen.push({ date: day, value: Math.round(avg) });
    allValues.push(...values);
  });

  return {
    avgOxygen: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minOxygen: Math.round(Math.min(...allValues)),
    maxOxygen: Math.round(Math.max(...allValues)),
    daysWithData: dailyOxygen.length,
    dailyOxygen: dailyOxygen.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform raw Apple Health month data to MonthHealthData */
export const transformMonthHealthData = (
  raw: AppleHealthMonthRawData
): MonthHealthData => {
  const daysInMonth = getDaysInMonth(raw.month);
  const uniqueDays = new Set(raw.records.map((r) => r.day));

  return {
    month: raw.month,
    daysInMonth,
    daysWithData: uniqueDays.size,
    sleep: transformMonthSleep(raw.records, raw.month),
    heartRate: transformMonthHeartRate(raw.records, raw.month),
    steps: transformMonthSteps(raw.records, raw.month),
    activity: transformMonthActivity(raw.activitySummaries, raw.month),
    distance: transformMonthDistance(raw.records, raw.month),
    workouts: transformMonthWorkouts(raw.workouts, raw.month),
    hrv: transformMonthHrv(raw.records, raw.month),
    oxygen: transformMonthOxygen(raw.records, raw.month),
  };
};

// ============================================================================
// Footprint Transformers
// ============================================================================

/** Transform raw Footprint month data to MonthFootprintData */
export const transformMonthFootprintData = (
  raw: FootprintMonthRawData
): MonthFootprintData => {
  const daysInMonth = getDaysInMonth(raw.month);
  const dailyDistance: DailyDataPoint[] = [];
  const dailyTrackPoints: DailyDataPoint[] = [];

  let totalDistance = 0;
  let totalPoints = 0;

  raw.dayAggs.forEach((agg) => {
    // Estimate distance from avg_speed and time range
    // This is a rough estimate; actual distance would need track points
    const points = agg.point_count;
    const speed = agg.avg_speed ?? 0;
    // Assuming 1 point per 5 seconds, estimate duration
    const estimatedDuration = points * 5; // seconds
    const estimatedDistance = speed * estimatedDuration; // meters

    dailyDistance.push({ date: agg.day, value: estimatedDistance });
    dailyTrackPoints.push({ date: agg.day, value: points });
    totalDistance += estimatedDistance;
    totalPoints += points;
  });

  // Use month aggregation if available
  const monthAgg = raw.monthAgg;
  if (monthAgg) {
    totalPoints = monthAgg.point_count;
  }

  return {
    month: raw.month,
    daysInMonth,
    daysWithData: raw.dayAggs.length,
    totalDistance: Math.round(totalDistance),
    totalTrackPoints: totalPoints,
    avgSpeed: monthAgg?.avg_speed ?? 0,
    byTransportMode: [], // Would need detailed track analysis
    dailyDistance: dailyDistance.sort((a, b) => a.date.localeCompare(b.date)),
    dailyTrackPoints: dailyTrackPoints.sort((a, b) => a.date.localeCompare(b.date)),
    bounds:
      monthAgg &&
      monthAgg.min_lat !== null &&
      monthAgg.max_lat !== null &&
      monthAgg.min_lon !== null &&
      monthAgg.max_lon !== null
        ? {
            minLat: monthAgg.min_lat,
            maxLat: monthAgg.max_lat,
            minLon: monthAgg.min_lon,
            maxLon: monthAgg.max_lon,
          }
        : null,
  };
};

// ============================================================================
// Pixiu Transformers
// ============================================================================

/** Build category breakdown from transactions */
const buildMonthCategoryBreakdown = (
  transactions: PixiuTransactionRow[],
  isIncome: boolean
): CategoryBreakdown[] => {
  const filtered = transactions.filter((t) =>
    isIncome ? t.inflow > 0 : t.outflow > 0
  );
  const total = filtered.reduce(
    (sum, t) => sum + (isIncome ? t.inflow : t.outflow),
    0
  );

  const categoryMap = new Map<string, { amount: number; count: number }>();

  filtered.forEach((t) => {
    const amount = isIncome ? t.inflow : t.outflow;
    const existing = categoryMap.get(t.category_l2) || { amount: 0, count: 0 };
    categoryMap.set(t.category_l2, {
      amount: existing.amount + amount,
      count: existing.count + 1,
    });
  });

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percentage: total > 0 ? (data.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

/** Build account breakdown from transactions */
const buildAccountBreakdown = (
  transactions: PixiuTransactionRow[]
): AccountBreakdown[] => {
  const accountMap = new Map<
    string,
    { income: number; expense: number; count: number }
  >();

  transactions.forEach((t) => {
    const existing = accountMap.get(t.account) || {
      income: 0,
      expense: 0,
      count: 0,
    };
    accountMap.set(t.account, {
      income: existing.income + t.inflow,
      expense: existing.expense + t.outflow,
      count: existing.count + 1,
    });
  });

  const totalExpense = transactions.reduce((sum, t) => sum + t.outflow, 0);

  return Array.from(accountMap.entries())
    .map(([account, data]) => ({
      account,
      income: data.income,
      expense: data.expense,
      net: data.income - data.expense,
      transactionCount: data.count,
      percentage: totalExpense > 0 ? (data.expense / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.expense - a.expense);
};

/** Transform raw Pixiu month data to MonthPixiuData */
export const transformMonthPixiuData = (raw: PixiuMonthRawData): MonthPixiuData => {
  const daysInMonth = getDaysInMonth(raw.month);
  const dailyIncome: DailyDataPoint[] = [];
  const dailyExpense: DailyDataPoint[] = [];
  const dailyNet: DailyDataPoint[] = [];

  raw.dayAggs.forEach((agg) => {
    dailyIncome.push({ date: agg.day, value: agg.income });
    dailyExpense.push({ date: agg.day, value: agg.expense });
    dailyNet.push({ date: agg.day, value: agg.net });
  });

  // Get top 5 expenses
  const expenseTransactions = raw.transactions
    .filter((t) => t.outflow > 0)
    .sort((a, b) => b.outflow - a.outflow)
    .slice(0, 5)
    .map((t) => ({
      date: t.tx_date.slice(0, 10),
      category: t.category_l2,
      amount: t.outflow,
      note: t.note || "",
    }));

  const monthAgg = raw.monthAgg;
  const daysWithData = raw.dayAggs.length;

  return {
    month: raw.month,
    daysInMonth,
    daysWithData,
    totalIncome: monthAgg?.income ?? 0,
    totalExpense: monthAgg?.expense ?? 0,
    totalNet: monthAgg?.net ?? 0,
    transactionCount: monthAgg?.tx_count ?? raw.transactions.length,
    avgDailyExpense:
      daysWithData > 0 ? (monthAgg?.expense ?? 0) / daysWithData : 0,
    avgDailyIncome:
      daysWithData > 0 ? (monthAgg?.income ?? 0) / daysWithData : 0,
    expenseByCategory: buildMonthCategoryBreakdown(raw.transactions, false),
    incomeByCategory: buildMonthCategoryBreakdown(raw.transactions, true),
    byAccount: buildAccountBreakdown(raw.transactions),
    dailyIncome: dailyIncome.sort((a, b) => a.date.localeCompare(b.date)),
    dailyExpense: dailyExpense.sort((a, b) => a.date.localeCompare(b.date)),
    dailyNet: dailyNet.sort((a, b) => a.date.localeCompare(b.date)),
    topExpenses: expenseTransactions,
  };
};
