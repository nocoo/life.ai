import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
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

const seed = (db: ReturnType<typeof openDb>) => {
  const insert = db.prepare(
    `insert into track_point
     (source, track_date, ts, lat, lon, ele, speed, course)
     values (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insert.run("footprint", "2024-01-01", "2024-01-01T00:00:00Z", 1, 2, 3, 1, 10);
  insert.run("footprint", "2024-01-01", "2024-01-01T12:00:00Z", 2, 3, 4, 2, 11);
  insert.run("footprint", "2024-01-02", "2024-01-02T00:00:00Z", 3, 4, 5, 3, 12);
  insert.run("footprint", "2024-01-08", "2024-01-08T00:00:00Z", 4, 5, 6, 4, 13);
};

import { aggregate, runAggregateCli } from "../import/footprint/aggregate";

describe("aggregate", () => {
  const dbFile = testDbPath;

  beforeEach(() => {
    rmSync(dbFile, { force: true });
  });

  afterEach(() => {
    rmSync(dbFile, { force: true });
  });

  it("creates day/week/month/year aggregates", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);
    aggregate(db, "footprint");

    const day = db.query(
      "select day, point_count from track_day_agg order by day"
    ).all();
    const week = db.query(
      "select week_start, point_count from track_week_agg order by week_start"
    ).all();
    const month = db.query(
      "select month, point_count from track_month_agg order by month"
    ).all();
    const year = db.query(
      "select year, point_count from track_year_agg order by year"
    ).all();

    expect(day).toEqual([
      { day: "2024-01-01", point_count: 2 },
      { day: "2024-01-02", point_count: 1 },
      { day: "2024-01-08", point_count: 1 }
    ]);
    expect(week).toEqual([
      { week_start: "2024-01-01", point_count: 3 },
      { week_start: "2024-01-08", point_count: 1 }
    ]);
    expect(month).toEqual([{ month: "2024-01-01", point_count: 4 }]);
    expect(year).toEqual([{ year: 2024, point_count: 4 }]);

    db.close();
  });

  it("replaces existing aggregates for source", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);
    aggregate(db, "footprint");
    aggregate(db, "footprint");

    const day = db.query(
      "select count(*) as count from track_day_agg where source = 'footprint'"
    ).get() as { count: number };
    const week = db.query(
      "select count(*) as count from track_week_agg where source = 'footprint'"
    ).get() as { count: number };
    const month = db.query(
      "select count(*) as count from track_month_agg where source = 'footprint'"
    ).get() as { count: number };
    const year = db.query(
      "select count(*) as count from track_year_agg where source = 'footprint'"
    ).get() as { count: number };

    expect(day.count).toBe(3);
    expect(week.count).toBe(2);
    expect(month.count).toBe(1);
    expect(year.count).toBe(1);

    db.close();
  });

  it("runs from the module entrypoint", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);

    runAggregateCli({ force: true });

    const year = db.query(
      "select count(*) as count from track_year_agg where source = 'footprint'"
    ).get() as { count: number };
    expect(year.count).toBe(1);

    db.close();
  });
});
