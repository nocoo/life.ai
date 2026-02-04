/**
 * Transform raw API data to year view models
 */

import type {
  AppleRecordRow,
  AppleWorkoutRow,
  AppleActivitySummaryRow,
  AppleHealthYearRawData,
} from "@/services/applehealth-service";
import type { FootprintYearRawData } from "@/services/footprint-service";
import type {
  PixiuTransactionRow,
  PixiuYearRawData,
} from "@/services/pixiu-service";
import type {
  YearHealthData,
  YearSleepStats,
  YearHeartRateStats,
  YearStepsStats,
  YearActivityStats,
  YearDistanceStats,
  YearWorkoutStats,
  YearHrvStats,
  YearOxygenStats,
  MonthlyDataPoint,
  YearFootprintData,
  YearPixiuData,
} from "@/models/year-view";
import type { DailyDataPoint, WorkoutTypeBreakdown, AccountBreakdown } from "@/models/month-view";
import type { CategoryBreakdown } from "@/models/pixiu";

// ============================================================================
// Utility Functions
// ============================================================================

/** Check if year is leap year */
const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
};

/** Get number of days in a year */
export const getDaysInYear = (year: number): number => {
  return isLeapYear(year) ? 366 : 365;
};

/** Group records by month */
const groupByMonth = <T extends { day?: string }>(
  records: T[],
  getDayFn?: (r: T) => string
): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  records.forEach((r) => {
    const day = getDayFn ? getDayFn(r) : r.day!;
    const month = day.slice(0, 7); // YYYY-MM
    const existing = map.get(month) || [];
    existing.push(r);
    map.set(month, existing);
  });
  return map;
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

/** Transform sleep records to yearly stats */
const transformYearSleep = (
  records: AppleRecordRow[],
  year: number
): YearSleepStats | null => {
  const yearPrefix = `${year}-`;
  const sleepRecords = records.filter(
    (r) =>
      r.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (sleepRecords.length === 0) return null;

  // Group by day for daily duration (for heatmap)
  const byDay = groupByDay(sleepRecords);
  const dailyDuration: DailyDataPoint[] = [];
  const monthlyTotals = new Map<string, { minutes: number; days: number }>();

  let totalMinutes = 0;
  let totalDeep = 0;
  let totalCore = 0;
  let totalRem = 0;
  let totalAwake = 0;
  let daysWithData = 0;

  byDay.forEach((dayRecords, day) => {
    let dayTotal = 0;
    let dayDeep = 0;
    let dayCore = 0;
    let dayRem = 0;
    let dayAwake = 0;

    dayRecords.forEach((r) => {
      const start = new Date(r.start_date.replace(" +", "+").replace(" ", "T"));
      const end = new Date(r.end_date.replace(" +", "+").replace(" ", "T"));
      const duration = (end.getTime() - start.getTime()) / 60000;

      if (r.value === "HKCategoryValueSleepAnalysisAsleepDeep") dayDeep += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAsleepCore") dayCore += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAsleepREM") dayRem += duration;
      else if (r.value === "HKCategoryValueSleepAnalysisAwake") dayAwake += duration;
    });

    dayTotal = dayDeep + dayCore + dayRem + dayAwake;
    if (dayTotal > 0) {
      dailyDuration.push({ date: day, value: dayTotal / 60 });
      daysWithData++;
      totalMinutes += dayTotal;
      totalDeep += dayDeep;
      totalCore += dayCore;
      totalRem += dayRem;
      totalAwake += dayAwake;

      // Monthly totals
      const month = day.slice(0, 7);
      const existing = monthlyTotals.get(month) || { minutes: 0, days: 0 };
      monthlyTotals.set(month, {
        minutes: existing.minutes + dayTotal,
        days: existing.days + 1,
      });
    }
  });

  if (daysWithData === 0) return null;

  // Calculate monthly averages
  const monthlyDuration: MonthlyDataPoint[] = Array.from(monthlyTotals.entries())
    .map(([month, data]) => ({
      month,
      value: data.minutes / 60 / data.days, // Average hours per night
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    avgDuration: totalMinutes / 60 / daysWithData,
    totalHours: totalMinutes / 60,
    daysWithData,
    avgDeepMinutes: totalDeep / daysWithData,
    avgCoreMinutes: totalCore / daysWithData,
    avgRemMinutes: totalRem / daysWithData,
    avgAwakeMinutes: totalAwake / daysWithData,
    monthlyDuration,
    dailyDuration: dailyDuration.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform heart rate records to yearly stats */
const transformYearHeartRate = (
  records: AppleRecordRow[],
  year: number
): YearHeartRateStats | null => {
  const yearPrefix = `${year}-`;
  const hrRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierHeartRate" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (hrRecords.length === 0) return null;

  const restingRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierRestingHeartRate" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  const byMonth = groupByMonth(hrRecords);
  const restingByMonth = groupByMonth(restingRecords);
  const monthlyAvg: MonthlyDataPoint[] = [];
  const monthlyResting: MonthlyDataPoint[] = [];
  let allValues: number[] = [];
  let allRestingValues: number[] = [];

  byMonth.forEach((monthRecords, month) => {
    const values = monthRecords.map((r) => parseFloat(r.value!));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    monthlyAvg.push({ month, value: Math.round(avg) });
    allValues = allValues.concat(values);
  });

  restingByMonth.forEach((monthRecords, month) => {
    const values = monthRecords.map((r) => parseFloat(r.value!));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    monthlyResting.push({ month, value: Math.round(avg) });
    allRestingValues = allRestingValues.concat(values);
  });

  return {
    avgHeartRate: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minHeartRate: Math.round(Math.min(...allValues)),
    maxHeartRate: Math.round(Math.max(...allValues)),
    avgRestingHeartRate:
      allRestingValues.length > 0
        ? Math.round(allRestingValues.reduce((a, b) => a + b, 0) / allRestingValues.length)
        : 0,
    daysWithData: groupByDay(hrRecords).size,
    monthlyAvg: monthlyAvg.sort((a, b) => a.month.localeCompare(b.month)),
    monthlyResting: monthlyResting.sort((a, b) => a.month.localeCompare(b.month)),
  };
};

/** Transform step records to yearly stats */
const transformYearSteps = (
  records: AppleRecordRow[],
  year: number
): YearStepsStats | null => {
  const yearPrefix = `${year}-`;
  const stepRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierStepCount" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (stepRecords.length === 0) return null;

  const byDay = groupByDay(stepRecords);
  const byMonth = groupByMonth(stepRecords);
  const dailySteps: DailyDataPoint[] = [];
  const monthlySteps: MonthlyDataPoint[] = [];
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

  byMonth.forEach((monthRecords, month) => {
    const monthTotal = monthRecords.reduce((sum, r) => sum + parseInt(r.value!, 10), 0);
    monthlySteps.push({ month, value: monthTotal });
  });

  return {
    totalSteps,
    avgSteps: Math.round(totalSteps / dailySteps.length),
    maxSteps,
    maxStepsDate,
    daysWithData: dailySteps.length,
    monthlySteps: monthlySteps.sort((a, b) => a.month.localeCompare(b.month)),
    dailySteps: dailySteps.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform activity summaries to yearly stats */
const transformYearActivity = (
  summaries: AppleActivitySummaryRow[],
  year: number
): YearActivityStats | null => {
  const yearPrefix = `${year}-`;
  const yearSummaries = summaries.filter((s) => s.day.startsWith(yearPrefix));

  if (yearSummaries.length === 0) return null;

  const byMonth = new Map<string, AppleActivitySummaryRow[]>();
  yearSummaries.forEach((s) => {
    const month = s.day.slice(0, 7);
    const existing = byMonth.get(month) || [];
    existing.push(s);
    byMonth.set(month, existing);
  });

  let totalActiveEnergy = 0;
  let totalExerciseMinutes = 0;
  let totalStandHours = 0;
  const monthlyActiveEnergy: MonthlyDataPoint[] = [];
  const monthlyExerciseMinutes: MonthlyDataPoint[] = [];
  const dailyActiveEnergy: DailyDataPoint[] = [];

  const moveGoal = 500;
  const exerciseGoal = 30;
  const standGoal = 12;
  let moveClose = 0;
  let exerciseClose = 0;
  let standClose = 0;
  let allClose = 0;

  byMonth.forEach((monthSummaries, month) => {
    let monthEnergy = 0;
    let monthExercise = 0;

    monthSummaries.forEach((s) => {
      const activeEnergy = s.active_energy ?? 0;
      const exerciseMinutes = s.exercise_time ?? 0;
      const standHours = s.stand_hours ?? 0;

      totalActiveEnergy += activeEnergy;
      totalExerciseMinutes += exerciseMinutes;
      totalStandHours += standHours;
      monthEnergy += activeEnergy;
      monthExercise += exerciseMinutes;

      dailyActiveEnergy.push({ date: s.day, value: activeEnergy });

      const moveClosedToday = activeEnergy >= moveGoal;
      const exerciseClosedToday = exerciseMinutes >= exerciseGoal;
      const standClosedToday = standHours >= standGoal;

      if (moveClosedToday) moveClose++;
      if (exerciseClosedToday) exerciseClose++;
      if (standClosedToday) standClose++;
      if (moveClosedToday && exerciseClosedToday && standClosedToday) allClose++;
    });

    monthlyActiveEnergy.push({ month, value: monthEnergy });
    monthlyExerciseMinutes.push({ month, value: monthExercise });
  });

  const daysWithData = yearSummaries.length;

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
    monthlyActiveEnergy: monthlyActiveEnergy.sort((a, b) => a.month.localeCompare(b.month)),
    monthlyExerciseMinutes: monthlyExerciseMinutes.sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
    dailyActiveEnergy: dailyActiveEnergy.sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Transform distance records to yearly stats */
const transformYearDistance = (
  records: AppleRecordRow[],
  year: number
): YearDistanceStats | null => {
  const yearPrefix = `${year}-`;
  const distanceRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierDistanceWalkingRunning" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  const flightRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierFlightsClimbed" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (distanceRecords.length === 0) return null;

  const byDay = groupByDay(distanceRecords);
  const byMonth = groupByMonth(distanceRecords);
  const flightsByDay = groupByDay(flightRecords);
  const monthlyDistance: MonthlyDataPoint[] = [];
  let totalDistance = 0;
  let maxDistance = 0;
  let maxDistanceDate = "";
  let totalFlights = 0;

  byDay.forEach((dayRecords, day) => {
    const dayTotal = dayRecords.reduce((sum, r) => sum + parseFloat(r.value!), 0);
    totalDistance += dayTotal;
    if (dayTotal > maxDistance) {
      maxDistance = dayTotal;
      maxDistanceDate = day;
    }
  });

  byMonth.forEach((monthRecords, month) => {
    const monthTotal = monthRecords.reduce((sum, r) => sum + parseFloat(r.value!), 0);
    monthlyDistance.push({ month, value: monthTotal });
  });

  flightsByDay.forEach((dayRecords) => {
    totalFlights += dayRecords.reduce((sum, r) => sum + parseInt(r.value!, 10), 0);
  });

  const daysWithData = byDay.size;

  return {
    totalDistance,
    avgDistance: Math.round((totalDistance / daysWithData) * 100) / 100,
    maxDistance,
    maxDistanceDate,
    totalFlightsClimbed: totalFlights,
    avgFlightsClimbed: Math.round((totalFlights / daysWithData) * 10) / 10,
    daysWithData,
    monthlyDistance: monthlyDistance.sort((a, b) => a.month.localeCompare(b.month)),
  };
};

/** Transform workout records to yearly stats */
const transformYearWorkouts = (
  workouts: AppleWorkoutRow[],
  year: number
): YearWorkoutStats | null => {
  const yearPrefix = `${year}-`;
  const yearWorkouts = workouts.filter((w) => w.day.startsWith(yearPrefix));

  if (yearWorkouts.length === 0) return null;

  let totalDuration = 0;
  let totalDistance = 0;
  let totalCalories = 0;
  const daysSet = new Set<string>();
  const byType = new Map<
    string,
    { count: number; duration: number; distance: number; calories: number }
  >();
  const byMonth = new Map<string, { count: number; duration: number }>();

  yearWorkouts.forEach((w) => {
    const duration = w.duration ? w.duration / 60 : 0;
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

    // By month
    const month = w.day.slice(0, 7);
    const existingMonth = byMonth.get(month) || { count: 0, duration: 0 };
    byMonth.set(month, {
      count: existingMonth.count + 1,
      duration: existingMonth.duration + duration,
    });
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

  const monthlyWorkouts: MonthlyDataPoint[] = Array.from(byMonth.entries())
    .map(([month, data]) => ({ month, value: data.count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const monthlyDuration: MonthlyDataPoint[] = Array.from(byMonth.entries())
    .map(([month, data]) => ({ month, value: Math.round(data.duration) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalWorkouts: yearWorkouts.length,
    totalDuration: Math.round(totalDuration),
    totalDistance: Math.round(totalDistance),
    totalCalories: Math.round(totalCalories),
    daysWithWorkouts: daysSet.size,
    byType: byTypeBreakdown,
    monthlyWorkouts,
    monthlyDuration,
  };
};

/** Transform HRV records to yearly stats */
const transformYearHrv = (
  records: AppleRecordRow[],
  year: number
): YearHrvStats | null => {
  const yearPrefix = `${year}-`;
  const hrvRecords = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (hrvRecords.length === 0) return null;

  const byMonth = groupByMonth(hrvRecords);
  const monthlyHrv: MonthlyDataPoint[] = [];
  const allValues: number[] = [];

  byMonth.forEach((monthRecords, month) => {
    const values = monthRecords.map((r) => parseFloat(r.value!));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    monthlyHrv.push({ month, value: Math.round(avg) });
    allValues.push(...values);
  });

  return {
    avgHrv: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minHrv: Math.round(Math.min(...allValues)),
    maxHrv: Math.round(Math.max(...allValues)),
    daysWithData: groupByDay(hrvRecords).size,
    monthlyHrv: monthlyHrv.sort((a, b) => a.month.localeCompare(b.month)),
  };
};

/** Transform oxygen saturation records to yearly stats */
const transformYearOxygen = (
  records: AppleRecordRow[],
  year: number
): YearOxygenStats | null => {
  const yearPrefix = `${year}-`;
  const o2Records = records.filter(
    (r) =>
      r.type === "HKQuantityTypeIdentifierOxygenSaturation" &&
      r.value &&
      r.day.startsWith(yearPrefix)
  );

  if (o2Records.length === 0) return null;

  const byMonth = groupByMonth(o2Records);
  const monthlyOxygen: MonthlyDataPoint[] = [];
  const allValues: number[] = [];

  byMonth.forEach((monthRecords, month) => {
    const values = monthRecords.map((r) => parseFloat(r.value!) * 100);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    monthlyOxygen.push({ month, value: Math.round(avg) });
    allValues.push(...values);
  });

  return {
    avgOxygen: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
    minOxygen: Math.round(Math.min(...allValues)),
    maxOxygen: Math.round(Math.max(...allValues)),
    daysWithData: groupByDay(o2Records).size,
    monthlyOxygen: monthlyOxygen.sort((a, b) => a.month.localeCompare(b.month)),
  };
};

/** Transform raw Apple Health year data to YearHealthData */
export const transformYearHealthData = (
  raw: AppleHealthYearRawData
): YearHealthData => {
  const daysInYear = getDaysInYear(raw.year);
  const uniqueDays = new Set(raw.records.map((r) => r.day));

  return {
    year: raw.year,
    daysInYear,
    daysWithData: uniqueDays.size,
    sleep: transformYearSleep(raw.records, raw.year),
    heartRate: transformYearHeartRate(raw.records, raw.year),
    steps: transformYearSteps(raw.records, raw.year),
    activity: transformYearActivity(raw.activitySummaries, raw.year),
    distance: transformYearDistance(raw.records, raw.year),
    workouts: transformYearWorkouts(raw.workouts, raw.year),
    hrv: transformYearHrv(raw.records, raw.year),
    oxygen: transformYearOxygen(raw.records, raw.year),
  };
};

// ============================================================================
// Footprint Transformers
// ============================================================================

/** Transform raw Footprint year data to YearFootprintData */
export const transformYearFootprintData = (
  raw: FootprintYearRawData
): YearFootprintData => {
  const daysInYear = getDaysInYear(raw.year);
  const dailyDistance: DailyDataPoint[] = [];
  const monthlyDistance: MonthlyDataPoint[] = [];
  const monthlyTrackPoints: MonthlyDataPoint[] = [];

  let minLat: number | null = null;
  let maxLat: number | null = null;
  let minLon: number | null = null;
  let maxLon: number | null = null;
  let totalSpeed = 0;
  let speedCount = 0;

  // Calculate daily distances from dayAggs and accumulate bounds
  raw.dayAggs.forEach((agg) => {
    const points = agg.point_count;
    const speed = agg.avg_speed ?? 0;
    const estimatedDuration = points * 5;
    const estimatedDistance = speed * estimatedDuration;
    dailyDistance.push({ date: agg.day, value: estimatedDistance });

    // Accumulate speed for average
    if (agg.avg_speed !== null) {
      totalSpeed += agg.avg_speed;
      speedCount++;
    }

    // Calculate bounds from day aggregations
    if (agg.min_lat !== null) {
      minLat = minLat === null ? agg.min_lat : Math.min(minLat, agg.min_lat);
    }
    if (agg.max_lat !== null) {
      maxLat = maxLat === null ? agg.max_lat : Math.max(maxLat, agg.max_lat);
    }
    if (agg.min_lon !== null) {
      minLon = minLon === null ? agg.min_lon : Math.min(minLon, agg.min_lon);
    }
    if (agg.max_lon !== null) {
      maxLon = maxLon === null ? agg.max_lon : Math.max(maxLon, agg.max_lon);
    }
  });

  // Group daily data by month to calculate monthly aggregations
  const monthlyData = new Map<string, { points: number; distance: number }>();
  raw.dayAggs.forEach((agg) => {
    const month = agg.day.slice(0, 7);
    const existing = monthlyData.get(month) || { points: 0, distance: 0 };
    const speed = agg.avg_speed ?? 0;
    const estimatedDuration = agg.point_count * 5;
    const estimatedDistance = speed * estimatedDuration;
    monthlyData.set(month, {
      points: existing.points + agg.point_count,
      distance: existing.distance + estimatedDistance,
    });
  });

  // Also use monthAggs if available for more accurate point counts
  raw.monthAggs.forEach((agg) => {
    const existing = monthlyData.get(agg.month);
    if (existing) {
      // Use the point_count from month aggregation (more accurate)
      monthlyData.set(agg.month, {
        ...existing,
        points: agg.point_count,
      });
    } else {
      monthlyData.set(agg.month, {
        points: agg.point_count,
        distance: 0,
      });
    }
  });

  monthlyData.forEach((data, month) => {
    monthlyDistance.push({ month, value: data.distance });
    monthlyTrackPoints.push({ month, value: data.points });
  });

  const yearAgg = raw.yearAgg;
  const avgSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;
  const totalDistance = dailyDistance.reduce((sum, d) => sum + d.value, 0);

  return {
    year: raw.year,
    daysInYear,
    daysWithData: raw.dayAggs.length,
    totalDistance: yearAgg
      ? yearAgg.point_count * 5 * avgSpeed
      : totalDistance,
    totalTrackPoints: yearAgg?.point_count ?? 0,
    avgSpeed,
    byTransportMode: [],
    monthlyDistance: monthlyDistance.sort((a, b) => a.month.localeCompare(b.month)),
    monthlyTrackPoints: monthlyTrackPoints.sort((a, b) => a.month.localeCompare(b.month)),
    dailyDistance: dailyDistance.sort((a, b) => a.date.localeCompare(b.date)),
    bounds:
      minLat !== null && maxLat !== null && minLon !== null && maxLon !== null
        ? { minLat, maxLat, minLon, maxLon }
        : null,
  };
};

// ============================================================================
// Pixiu Transformers
// ============================================================================

/** Build category breakdown from transactions */
const buildYearCategoryBreakdown = (
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
const buildYearAccountBreakdown = (
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

/** Transform raw Pixiu year data to YearPixiuData */
export const transformYearPixiuData = (raw: PixiuYearRawData): YearPixiuData => {
  const daysInYear = getDaysInYear(raw.year);
  const monthlyIncome: MonthlyDataPoint[] = [];
  const monthlyExpense: MonthlyDataPoint[] = [];
  const monthlyNet: MonthlyDataPoint[] = [];
  const dailyExpense: DailyDataPoint[] = [];

  // Monthly data from monthAggs
  raw.monthAggs.forEach((agg) => {
    monthlyIncome.push({ month: agg.month, value: agg.income });
    monthlyExpense.push({ month: agg.month, value: agg.expense });
    monthlyNet.push({ month: agg.month, value: agg.net });
  });

  // Daily expenses for heatmap
  raw.dayAggs.forEach((agg) => {
    dailyExpense.push({ date: agg.day, value: agg.expense });
  });

  // Top expense months
  const topExpenseMonths = [...raw.monthAggs]
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 3)
    .map((m) => ({ month: m.month, amount: m.expense }));

  const yearAgg = raw.yearAgg;
  const monthsWithData = raw.monthAggs.length;

  return {
    year: raw.year,
    daysInYear,
    daysWithData: raw.dayAggs.length,
    totalIncome: yearAgg?.income ?? 0,
    totalExpense: yearAgg?.expense ?? 0,
    totalNet: yearAgg?.net ?? 0,
    transactionCount: yearAgg?.tx_count ?? raw.transactions.length,
    avgMonthlyExpense:
      monthsWithData > 0 ? (yearAgg?.expense ?? 0) / monthsWithData : 0,
    avgMonthlyIncome:
      monthsWithData > 0 ? (yearAgg?.income ?? 0) / monthsWithData : 0,
    expenseByCategory: buildYearCategoryBreakdown(raw.transactions, false),
    incomeByCategory: buildYearCategoryBreakdown(raw.transactions, true),
    byAccount: buildYearAccountBreakdown(raw.transactions),
    monthlyIncome: monthlyIncome.sort((a, b) => a.month.localeCompare(b.month)),
    monthlyExpense: monthlyExpense.sort((a, b) => a.month.localeCompare(b.month)),
    monthlyNet: monthlyNet.sort((a, b) => a.month.localeCompare(b.month)),
    dailyExpense: dailyExpense.sort((a, b) => a.date.localeCompare(b.date)),
    topExpenseMonths,
  };
};
