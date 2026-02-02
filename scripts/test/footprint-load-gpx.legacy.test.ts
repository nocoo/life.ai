import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { loadGpx } from "../import/footprint/load-gpx";
import { openDb, testDbPath } from "../import/footprint/db";

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


describe("load gpx", () => {
  const dbFile = testDbPath;
  const gpxFile = "db/test.gpx";

  beforeEach(() => {
    rmSync(dbFile, { force: true });
    rmSync(gpxFile, { force: true });
  });

  afterEach(() => {
    rmSync(dbFile, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("loads points from a small gpx", async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="1" lon="2"><ele>3</ele><time>2024-01-01T00:00:00Z</time><extensions><speed>1</speed><course>2</course></extensions></trkpt>
      <trkpt lat="2" lon="3"><time>2024-01-01T01:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
    writeFileSync(gpxFile, gpx, "utf-8");

    const db = openDb(dbFile);
    createSchema(db);
    const count = await loadGpx(db, 2024, gpxFile, "footprint");

    const rows = db.query("select count(*) as count from track_point").get() as {
      count: number;
    };
    expect(rows.count).toBe(2);
    expect(count).toBe(2);

    db.close();
  });

  it("throws when gpx is missing", async () => {
    const db = openDb(dbFile);
    createSchema(db);

    await expect(loadGpx(db, 2024, "db/missing.gpx", "footprint")).rejects.toThrow(
      "GPX file not found"
    );

    db.close();
  });
});
