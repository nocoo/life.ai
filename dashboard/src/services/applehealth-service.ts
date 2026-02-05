import { getDbPath, openDbByPath } from "@/lib/db";

/** Raw record from apple_record table */
export interface AppleRecordRow {
  id: number;
  type: string;
  unit: string | null;
  value: string | null;
  source_name: string | null;
  source_version: string | null;
  device: string | null;
  creation_date: string | null;
  start_date: string;
  end_date: string;
  day: string;
  timezone: string | null;
}

/** Raw workout from apple_workout table */
export interface AppleWorkoutRow {
  id: number;
  workout_type: string;
  duration: number | null;
  total_distance: number | null;
  total_energy: number | null;
  source_name: string | null;
  device: string | null;
  creation_date: string | null;
  start_date: string;
  end_date: string;
  day: string;
}

/** Raw activity summary from apple_activity_summary table */
export interface AppleActivitySummaryRow {
  id: number;
  date_components: string;
  active_energy: number | null;
  exercise_time: number | null;
  stand_hours: number | null;
  movement_energy: number | null;
  day: string;
}

/** Raw data response for a day */
export interface AppleHealthRawData {
  date: string;
  records: AppleRecordRow[];
  workouts: AppleWorkoutRow[];
  activitySummary: AppleActivitySummaryRow | null;
}

/** Raw data response for a month */
export interface AppleHealthMonthRawData {
  month: string; // YYYY-MM
  records: AppleRecordRow[];
  workouts: AppleWorkoutRow[];
  activitySummaries: AppleActivitySummaryRow[];
}

/** Raw data response for a year */
export interface AppleHealthYearRawData {
  year: number;
  records: AppleRecordRow[];
  workouts: AppleWorkoutRow[];
  activitySummaries: AppleActivitySummaryRow[];
}

/** Calculate previous day in YYYY-MM-DD format */
const getPreviousDay = (date: string): string => {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Get date range for a month (YYYY-MM format) */
const getMonthDateRange = (
  month: string
): { startDate: string; endDate: string } => {
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  // Get last day of month
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
};

/** Get date range for a year */
const getYearDateRange = (
  year: number
): { startDate: string; endDate: string } => {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

/** Service for querying Apple Health data from SQLite */
export class AppleHealthService {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDbPath("applehealth");
  }

  /** Get all raw data for a specific date */
  getDayData(date: string): AppleHealthRawData {
    const db = openDbByPath(this.dbPath);
    try {
      // Get regular records for the specified date
      const records = db
        .prepare(
          `SELECT id, type, unit, value, source_name, source_version, device, 
                  creation_date, start_date, end_date, day, timezone
           FROM apple_record 
           WHERE day = ? 
           ORDER BY start_date`
        )
        .all(date) as AppleRecordRow[];

      // Get sleep records from previous day that ended on this date
      // Sleep starting at 23:00 on day N-1 belongs to day N-1 in the 'day' column,
      // but we want to include it when viewing day N
      const prevDay = getPreviousDay(date);
      const prevDaySleepRecords = db
        .prepare(
          `SELECT id, type, unit, value, source_name, source_version, device, 
                  creation_date, start_date, end_date, day, timezone
           FROM apple_record 
           WHERE day = ? 
             AND type = 'HKCategoryTypeIdentifierSleepAnalysis'
           ORDER BY start_date`
        )
        .all(prevDay) as AppleRecordRow[];

      // Merge previous day's sleep records with current day's records
      // Keep all current day records, add only previous day's sleep records
      const allRecords = [...prevDaySleepRecords, ...records];

      const workouts = db
        .prepare(
          `SELECT id, workout_type, duration, total_distance, total_energy,
                  source_name, device, creation_date, start_date, end_date, day
           FROM apple_workout 
           WHERE day = ? 
           ORDER BY start_date`
        )
        .all(date) as AppleWorkoutRow[];

      const activitySummary = db
        .prepare(
          `SELECT id, date_components, active_energy, exercise_time, 
                  stand_hours, movement_energy, day
           FROM apple_activity_summary 
           WHERE day = ?`
        )
        .get(date) as AppleActivitySummaryRow | undefined;

      return {
        date,
        records: allRecords,
        workouts,
        activitySummary: activitySummary ?? null,
      };
    } finally {
      db.close();
    }
  }

  /** Get all raw data for a specific month (YYYY-MM format) */
  getMonthData(month: string): AppleHealthMonthRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const { startDate, endDate } = getMonthDateRange(month);

      // Query records for the entire month using range query for index usage
      const records = db
        .prepare(
          `SELECT id, type, unit, value, source_name, source_version, device, 
                  creation_date, start_date, end_date, day, timezone
           FROM apple_record 
           WHERE day >= ? AND day <= ?
           ORDER BY start_date`
        )
        .all(startDate, endDate) as AppleRecordRow[];

      const workouts = db
        .prepare(
          `SELECT id, workout_type, duration, total_distance, total_energy,
                  source_name, device, creation_date, start_date, end_date, day
           FROM apple_workout 
           WHERE day >= ? AND day <= ?
           ORDER BY start_date`
        )
        .all(startDate, endDate) as AppleWorkoutRow[];

      const activitySummaries = db
        .prepare(
          `SELECT id, date_components, active_energy, exercise_time, 
                  stand_hours, movement_energy, day
           FROM apple_activity_summary 
           WHERE day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as AppleActivitySummaryRow[];

      return {
        month,
        records,
        workouts,
        activitySummaries,
      };
    } finally {
      db.close();
    }
  }

  /** Get all raw data for a specific year */
  getYearData(year: number): AppleHealthYearRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const { startDate, endDate } = getYearDateRange(year);

      // Query records for the entire year using range query for index usage
      const records = db
        .prepare(
          `SELECT id, type, unit, value, source_name, source_version, device, 
                  creation_date, start_date, end_date, day, timezone
           FROM apple_record 
           WHERE day >= ? AND day <= ?
           ORDER BY start_date`
        )
        .all(startDate, endDate) as AppleRecordRow[];

      const workouts = db
        .prepare(
          `SELECT id, workout_type, duration, total_distance, total_energy,
                  source_name, device, creation_date, start_date, end_date, day
           FROM apple_workout 
           WHERE day >= ? AND day <= ?
           ORDER BY start_date`
        )
        .all(startDate, endDate) as AppleWorkoutRow[];

      const activitySummaries = db
        .prepare(
          `SELECT id, date_components, active_energy, exercise_time, 
                  stand_hours, movement_energy, day
           FROM apple_activity_summary 
           WHERE day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as AppleActivitySummaryRow[];

      return {
        year,
        records,
        workouts,
        activitySummaries,
      };
    } finally {
      db.close();
    }
  }
}
