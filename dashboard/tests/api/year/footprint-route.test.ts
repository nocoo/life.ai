import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/year/footprint/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/year-footprint-api.test.sqlite`;

describe("GET /api/year/footprint", () => {
  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    const db = new Database(TEST_DB_PATH);
    db.exec(`
      create table if not exists track_day_agg (
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
      create table if not exists track_month_agg (
        source text not null,
        month text not null,
        point_count integer not null,
        primary key (source, month)
      );
      create table if not exists track_year_agg (
        source text not null,
        year integer not null,
        point_count integer not null,
        primary key (source, year)
      );
    `);

    // Insert test data for 2025
    db.exec(`
      insert into track_day_agg (source, day, point_count, min_ts, max_ts, avg_speed, min_lat, max_lat, min_lon, max_lon)
      values 
        ('footprint', '2025-01-15', 100, '2025-01-15T08:00:00+08:00', '2025-01-15T18:00:00+08:00', 1.5, 39.9, 39.95, 116.4, 116.45),
        ('footprint', '2025-02-16', 80, '2025-02-16T09:00:00+08:00', '2025-02-16T17:00:00+08:00', 1.2, 39.85, 39.9, 116.35, 116.4);
      
      insert into track_month_agg (source, month, point_count)
      values 
        ('footprint', '2025-01', 500),
        ('footprint', '2025-02', 400);
      
      insert into track_year_agg (source, year, point_count)
      values ('footprint', 2025, 900);
    `);

    db.close();

    process.env.FOOTPRINT_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.FOOTPRINT_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if year is missing", async () => {
    const request = new NextRequest("http://localhost/api/year/footprint");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing required parameter");
  });

  it("should return 400 if year format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/year/footprint?year=25"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid year format");
  });

  it("should return transformed data for valid year", async () => {
    const request = new NextRequest(
      "http://localhost/api/year/footprint?year=2025"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.year).toBe(2025);
    expect(data.data.daysInYear).toBe(365);
    expect(data.data.daysWithData).toBe(2);
    expect(data.data.totalTrackPoints).toBe(900);
    // avgSpeed is computed from day aggregations: (1.5 + 1.2) / 2 = 1.35
    expect(data.data.avgSpeed).toBe(1.35);
    expect(data.data.monthlyTrackPoints).toHaveLength(2);
    expect(data.data.bounds).not.toBeNull();
  });

  it("should return empty data for year with no records", async () => {
    const request = new NextRequest(
      "http://localhost/api/year/footprint?year=2020"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.year).toBe(2020);
    expect(data.data.daysWithData).toBe(0);
    expect(data.data.totalTrackPoints).toBe(0);
  });

  it("should return 500 when database error occurs", async () => {
    const originalPath = process.env.FOOTPRINT_DB_PATH;
    process.env.FOOTPRINT_DB_PATH = "/nonexistent/path/to/db.sqlite";

    const request = new NextRequest(
      "http://localhost/api/year/footprint?year=2025"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeString();

    process.env.FOOTPRINT_DB_PATH = originalPath;
  });
});
