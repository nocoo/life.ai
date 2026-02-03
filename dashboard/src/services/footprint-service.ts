import { getDbPath, openDbByPath } from "@/lib/db";

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
        .query(
          `SELECT id, source, track_date, ts, lat, lon, ele, speed, course
           FROM track_point 
           WHERE source = 'footprint' AND track_date = ? 
           ORDER BY ts`
        )
        .all(date) as TrackPointRow[];

      const dayAgg = db
        .query(
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
}
