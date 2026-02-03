/**
 * Transform raw API data to view models
 */

import type {
  AppleRecordRow,
  AppleWorkoutRow,
  AppleActivitySummaryRow,
  AppleHealthRawData,
} from "@/services/applehealth-service";
import type {
  TrackPointRow,
  TrackDayAggRow,
  FootprintRawData,
} from "@/services/footprint-service";
import type {
  PixiuTransactionRow,
  PixiuDayAggRow,
  PixiuRawData,
} from "@/services/pixiu-service";
import type {
  DayHealthData,
  HeartRateSummary,
  StepsRecord,
  WorkoutRecord,
  ActivitySummary,
} from "@/models/apple-health";
import type {
  DayFootprintData,
  DayTrackSummary,
} from "@/models/footprint";
import type {
  DayPixiuData,
  DayExpenseSummary,
  Transaction,
  CategoryBreakdown,
} from "@/models/pixiu";

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
  HKWorkoutActivityTypeJumping: "Jumping",
  HKWorkoutActivityTypeDance: "Dance",
  HKWorkoutActivityTypeBarre: "Barre",
  HKWorkoutActivityTypePilates: "Pilates",
  HKWorkoutActivityTypeMindAndBody: "Mind & Body",
  HKWorkoutActivityTypeSoccer: "Soccer",
  HKWorkoutActivityTypeBasketball: "Basketball",
  HKWorkoutActivityTypeTennis: "Tennis",
  HKWorkoutActivityTypeBadminton: "Badminton",
  HKWorkoutActivityTypeTableTennis: "Table Tennis",
};

/** Extract time (HH:mm) from ISO datetime or datetime string */
export const extractTime = (datetime: string): string => {
  // Handle ISO format: 2024-01-01T12:30:00+08:00
  const isoMatch = datetime.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];

  // Handle space format: 2024-01-01 12:30
  const spaceMatch = datetime.match(/ (\d{2}:\d{2})/);
  if (spaceMatch) return spaceMatch[1];

  return "00:00";
};

/** Get display name for workout type */
const getWorkoutTypeName = (type: string): string => {
  return WORKOUT_TYPE_NAMES[type] || type.replace(/HKWorkoutActivityType/, "");
};

/** Transform raw Apple Health records to heart rate summary */
const transformHeartRate = (records: AppleRecordRow[]): HeartRateSummary | null => {
  const hrRecords = records.filter(
    (r) => r.type === "HKQuantityTypeIdentifierHeartRate" && r.value
  );

  if (hrRecords.length === 0) return null;

  const values = hrRecords.map((r) => parseFloat(r.value!));
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));

  return {
    avg,
    min,
    max,
    records: hrRecords.map((r) => ({
      time: extractTime(r.start_date),
      value: Math.round(parseFloat(r.value!)),
    })),
  };
};

/** Transform raw Apple Health records to steps by hour */
const transformSteps = (records: AppleRecordRow[]): { steps: StepsRecord[]; total: number } => {
  const stepRecords = records.filter(
    (r) => r.type === "HKQuantityTypeIdentifierStepCount" && r.value
  );

  // Aggregate by hour
  const hourMap = new Map<number, number>();
  stepRecords.forEach((r) => {
    const hour = parseInt(extractTime(r.start_date).split(":")[0], 10);
    const count = parseInt(r.value!, 10);
    hourMap.set(hour, (hourMap.get(hour) || 0) + count);
  });

  const steps = Array.from(hourMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  const total = steps.reduce((sum, s) => sum + s.count, 0);

  return { steps, total };
};

/** Transform raw workout rows to workout records */
const transformWorkouts = (workouts: AppleWorkoutRow[]): WorkoutRecord[] => {
  return workouts.map((w) => ({
    id: `workout-${w.id}`,
    type: w.workout_type,
    typeName: getWorkoutTypeName(w.workout_type),
    start: w.start_date,
    end: w.end_date,
    duration: w.duration ? Math.round(w.duration / 60) : 0, // seconds to minutes
    distance: w.total_distance ?? undefined,
    calories: w.total_energy ?? undefined,
  }));
};

/** Transform raw activity summary to ActivitySummary */
const transformActivity = (
  summary: AppleActivitySummaryRow | null
): ActivitySummary | null => {
  if (!summary) return null;

  return {
    activeEnergy: summary.active_energy ?? 0,
    exerciseMinutes: summary.exercise_time ?? 0,
    standHours: summary.stand_hours ?? 0,
  };
};

/** Transform raw Apple Health data to DayHealthData view model */
export const transformAppleHealthData = (raw: AppleHealthRawData): DayHealthData => {
  const heartRate = transformHeartRate(raw.records);
  const { steps, total: totalSteps } = transformSteps(raw.records);
  const workouts = transformWorkouts(raw.workouts);
  const activity = transformActivity(raw.activitySummary);

  return {
    date: raw.date,
    sleep: null, // Sleep data requires special handling (spans multiple days)
    heartRate,
    steps,
    totalSteps,
    water: [], // Water intake not commonly in Apple Health export
    totalWater: 0,
    workouts,
    activity,
    ecgRecords: [], // ECG files handled separately
  };
};

/** Transform raw Footprint data to DayFootprintData view model */
export const transformFootprintData = (raw: FootprintRawData): DayFootprintData => {
  const summary = transformTrackSummary(raw.trackPoints, raw.dayAgg);
  const trackPoints = transformTrackPoints(raw.trackPoints);

  return {
    date: raw.date,
    summary,
    trackPoints,
    locations: [], // Location clustering requires additional processing
    segments: [], // Segment detection requires additional processing
  };
};

/** Transform raw track point rows to TrackPoint view model */
const transformTrackPoints = (points: TrackPointRow[]): DayFootprintData["trackPoints"] => {
  return points.map((p) => ({
    ts: p.ts,
    lat: p.lat,
    lon: p.lon,
    ele: p.ele ?? undefined,
    speed: p.speed !== null && p.speed >= 0 ? p.speed : undefined,
  }));
};

/** Transform track points and day agg to DayTrackSummary */
const transformTrackSummary = (
  points: TrackPointRow[],
  dayAgg: TrackDayAggRow | null
): DayTrackSummary | null => {
  if (points.length === 0 && !dayAgg) return null;

  if (dayAgg) {
    return {
      pointCount: dayAgg.point_count,
      totalDistance: calculateTotalDistance(points),
      avgSpeed: dayAgg.avg_speed ?? 0,
      minTime: dayAgg.min_ts ? extractTime(dayAgg.min_ts) : "00:00",
      maxTime: dayAgg.max_ts ? extractTime(dayAgg.max_ts) : "23:59",
    };
  }

  // Calculate from points if no aggregation
  const times = points.map((p) => extractTime(p.ts)).sort();
  return {
    pointCount: points.length,
    totalDistance: calculateTotalDistance(points),
    avgSpeed: 0,
    minTime: times[0] || "00:00",
    maxTime: times[times.length - 1] || "23:59",
  };
};

/** Calculate total distance from track points using Haversine formula */
const calculateTotalDistance = (points: TrackPointRow[]): number => {
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return Math.round(total);
};

/** Calculate distance between two coordinates in meters */
const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/** Transform raw Pixiu data to DayPixiuData view model */
export const transformPixiuData = (raw: PixiuRawData): DayPixiuData => {
  const transactions = transformTransactions(raw.transactions);
  const summary = transformExpenseSummary(transactions, raw.dayAgg);
  const expenseByCategory = buildCategoryBreakdown(transactions, false);
  const incomeByCategory = buildCategoryBreakdown(transactions, true);

  return {
    date: raw.date,
    summary,
    transactions,
    expenseByCategory,
    incomeByCategory,
  };
};

/** Transform raw transaction rows to Transaction view model */
const transformTransactions = (rows: PixiuTransactionRow[]): Transaction[] => {
  return rows.map((r) => ({
    id: `tx-${r.id}`,
    time: extractTime(r.tx_date),
    categoryL1: r.category_l1,
    categoryL2: r.category_l2,
    amount: r.inflow > 0 ? r.inflow : r.outflow,
    isIncome: r.inflow > 0,
    account: r.account,
    tags: r.tags ?? undefined,
    note: r.note ?? undefined,
  }));
};

/** Transform to expense summary */
const transformExpenseSummary = (
  transactions: Transaction[],
  dayAgg: PixiuDayAggRow | null
): DayExpenseSummary | null => {
  if (transactions.length === 0 && !dayAgg) return null;

  if (dayAgg) {
    return {
      income: dayAgg.income,
      expense: dayAgg.expense,
      net: dayAgg.net,
      transactionCount: dayAgg.tx_count,
    };
  }

  // Calculate from transactions
  const income = transactions
    .filter((t) => t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => !t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    income,
    expense,
    net: income - expense,
    transactionCount: transactions.length,
  };
};

/** Build category breakdown from transactions */
const buildCategoryBreakdown = (
  transactions: Transaction[],
  isIncome: boolean
): CategoryBreakdown[] => {
  const filtered = transactions.filter((t) => t.isIncome === isIncome);
  const total = filtered.reduce((sum, t) => sum + t.amount, 0);

  const categoryMap = new Map<string, { amount: number; count: number }>();

  filtered.forEach((t) => {
    const existing = categoryMap.get(t.categoryL2) || { amount: 0, count: 0 };
    categoryMap.set(t.categoryL2, {
      amount: existing.amount + t.amount,
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
