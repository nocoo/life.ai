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
      const records = db
        .prepare(
          `SELECT id, type, unit, value, source_name, source_version, device, 
                  creation_date, start_date, end_date, day, timezone
           FROM apple_record 
           WHERE day = ? 
           ORDER BY start_date`
        )
        .all(date) as AppleRecordRow[];

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
        records,
        workouts,
        activitySummary: activitySummary ?? null,
      };
    } finally {
      db.close();
    }
  }
}
