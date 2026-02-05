import { getDbPath, openDbByPath } from "@/lib/db";

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

/** Raw track point from track_point table */
export interface TrackPointRow {
  id: number;
  source: string;
  track_date: string;
  ts: string;
  lat: number;
  lon: number;
  ele: number | null;
  speed: number | null;
  course: number | null;
}

/** Raw day aggregation from track_day_agg table */
export interface TrackDayAggRow {
  source: string;
  day: string;
  point_count: number;
  min_ts: string | null;
  max_ts: string | null;
  avg_speed: number | null;
  min_lat: number | null;
  max_lat: number | null;
  min_lon: number | null;
  max_lon: number | null;
}

/** Raw data response for a day */
export interface FootprintRawData {
  date: string;
  trackPoints: TrackPointRow[];
  dayAgg: TrackDayAggRow | null;
}

/** Raw month aggregation from track_month_agg table */
export interface TrackMonthAggRow {
  source: string;
  month: string;
  point_count: number;
}

/** Raw year aggregation from track_year_agg table */
export interface TrackYearAggRow {
  source: string;
  year: number;
  point_count: number;
}

/** Raw data response for a month */
export interface FootprintMonthRawData {
  month: string; // YYYY-MM
  dayAggs: TrackDayAggRow[];
  monthAgg: TrackMonthAggRow | null;
}

/** Raw data response for a year */
export interface FootprintYearRawData {
  year: number;
  dayAggs: TrackDayAggRow[];
  monthAggs: TrackMonthAggRow[];
  yearAgg: TrackYearAggRow | null;
}

/** Service for querying Footprint data from SQLite */
export class FootprintService {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDbPath("footprint");
  }

  /** Get all raw data for a specific date */
  getDayData(date: string): FootprintRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const trackPoints = db
        .prepare(
          `SELECT id, source, track_date, ts, lat, lon, ele, speed, course
           FROM track_point 
           WHERE source = 'footprint' AND track_date = ? 
           ORDER BY ts`
        )
        .all(date) as TrackPointRow[];

      const dayAgg = db
        .prepare(
          `SELECT source, day, point_count, min_ts, max_ts, avg_speed,
                  min_lat, max_lat, min_lon, max_lon
           FROM track_day_agg 
           WHERE source = 'footprint' AND day = ?`
        )
        .get(date) as TrackDayAggRow | undefined;

      return {
        date,
        trackPoints,
        dayAgg: dayAgg ?? null,
      };
    } finally {
      db.close();
    }
  }

  /** Get aggregated data for a specific month (YYYY-MM format) */
  getMonthData(month: string): FootprintMonthRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const { startDate, endDate } = getMonthDateRange(month);

      // Get daily aggregations for the month using range query for index usage
      const dayAggs = db
        .prepare(
          `SELECT source, day, point_count, min_ts, max_ts, avg_speed,
                  min_lat, max_lat, min_lon, max_lon
           FROM track_day_agg 
           WHERE source = 'footprint' AND day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as TrackDayAggRow[];

      // Get month aggregation
      const monthAgg = db
        .prepare(
          `SELECT source, month, point_count
           FROM track_month_agg 
           WHERE source = 'footprint' AND month = ?`
        )
        .get(month) as TrackMonthAggRow | undefined;

      return {
        month,
        dayAggs,
        monthAgg: monthAgg ?? null,
      };
    } finally {
      db.close();
    }
  }

  /** Get aggregated data for a specific year */
  getYearData(year: number): FootprintYearRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const { startDate, endDate } = getYearDateRange(year);
      const yearMonthStart = `${year}-01`;
      const yearMonthEnd = `${year}-12`;

      // Get daily aggregations for the year (for heatmap) using range query
      const dayAggs = db
        .prepare(
          `SELECT source, day, point_count, min_ts, max_ts, avg_speed,
                  min_lat, max_lat, min_lon, max_lon
           FROM track_day_agg 
           WHERE source = 'footprint' AND day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as TrackDayAggRow[];

      // Get monthly aggregations for the year using range query
      const monthAggs = db
        .prepare(
          `SELECT source, month, point_count
           FROM track_month_agg 
           WHERE source = 'footprint' AND month >= ? AND month <= ?
           ORDER BY month`
        )
        .all(yearMonthStart, yearMonthEnd) as TrackMonthAggRow[];

      // Get year aggregation
      const yearAgg = db
        .prepare(
          `SELECT source, year, point_count
           FROM track_year_agg 
           WHERE source = 'footprint' AND year = ?`
        )
        .get(year) as TrackYearAggRow | undefined;

      return {
        year,
        dayAggs,
        monthAggs,
        yearAgg: yearAgg ?? null,
      };
    } finally {
      db.close();
    }
  }
}
