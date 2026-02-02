import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { openDb, testDbPath } from "../import/footprint/db";
import { loadGpx } from "../import/footprint/load-gpx";
import { writeGpx } from "./footprint-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table track_point (
      id integer primary key,
      source text not null,
      track_date text not null,
      ts text not null,
      lat real not null,
      lon real not null,
      ele real,
      speed real,
      course real
    );
    create table track_day_agg (
      source text not null,
      day text not null,
      point_count integer not null,
      min_ts text,
      max_ts text,
      avg_speed real,
      min_lat real,
      max_lat real,
      min_lon real,
      max_lon real,
      primary key (source, day)
    );
    create table track_week_agg (
      source text not null,
      week_start text not null,
      point_count integer not null,
      primary key (source, week_start)
    );
    create table track_month_agg (
      source text not null,
      month text not null,
      point_count integer not null,
      primary key (source, month)
    );
    create table track_year_agg (
      source text not null,
      year integer not null,
      point_count integer not null,
      primary key (source, year)
    );
  `);
};

describe("load gpx (year filter)", () => {
  const gpxFile = "db/test-footprint.gpx";

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("loads only points for the requested year and clears existing data", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="2" lon="3"><time>2024-12-31T23:59:59Z</time></trkpt>',
      '<trkpt lat="3" lon="4"><time>2025-01-01T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(`
      insert into track_point
        (source, track_date, ts, lat, lon, ele, speed, course)
      values
        ('footprint', '2024-06-01', '2024-06-01T00:00:00Z', 1, 1, null, null, null),
        ('footprint', '2023-06-01', '2023-06-01T00:00:00Z', 1, 1, null, null, null);
      insert into track_day_agg (source, day, point_count) values ('footprint', '2024-06-01', 1);
      insert into track_week_agg (source, week_start, point_count) values ('footprint', '2024-05-27', 1);
      insert into track_month_agg (source, month, point_count) values ('footprint', '2024-06-01', 1);
      insert into track_year_agg (source, year, point_count) values ('footprint', 2024, 1);
    `);

    const count = await loadGpx(db, 2024, gpxFile, "footprint");

    const rows = db
      .query(
        "select track_date from track_point where track_date like '2024-%' order by track_date"
      )
      .all() as { track_date: string }[];
    const years = rows.map((row) => row.track_date.slice(0, 4));

    expect(count).toBe(2);
    expect(rows).toHaveLength(2);
    expect(years).toEqual(["2024", "2024"]);

    const leftover2023 = db
      .query("select count(*) as count from track_point where track_date like '2023-%'")
      .get() as { count: number };
    expect(leftover2023.count).toBe(1);

    const leftover2024 = db
      .query(
        "select count(*) as count from track_point where track_date = '2024-06-01'"
      )
      .get() as { count: number };
    expect(leftover2024.count).toBe(0);

    const dayCount = db
      .query("select count(*) as count from track_day_agg where day like '2024-%'")
      .get() as { count: number };
    const weekCount = db
      .query("select count(*) as count from track_week_agg where week_start like '2024-%'")
      .get() as { count: number };
    const monthCount = db
      .query("select count(*) as count from track_month_agg where month like '2024-%'")
      .get() as { count: number };
    const yearCount = db
      .query("select count(*) as count from track_year_agg where year = 2024")
      .get() as { count: number };

    expect(dayCount.count).toBe(0);
    expect(weekCount.count).toBe(0);
    expect(monthCount.count).toBe(0);
    expect(yearCount.count).toBe(0);

    db.close();
  });

  it("throws when gpx is missing", async () => {
    const db = openDb(testDbPath);
    createSchema(db);

    await expect(loadGpx(db, 2024, "db/missing.gpx", "footprint")).rejects.toThrow(
      "GPX file not found"
    );

    db.close();
  });
});
