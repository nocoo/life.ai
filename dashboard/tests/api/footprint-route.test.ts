import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/day/footprint/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/footprint-api.test.sqlite`;

describe("GET /api/day/footprint", () => {
  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    const db = new Database(TEST_DB_PATH);
    db.exec(`
      create table if not exists track_point (
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
    `);

    db.exec(`
      insert into track_point (source, track_date, ts, lat, lon, ele, speed)
      values ('footprint', '2025-01-15', '2025-01-15T08:00:00Z', 31.2304, 121.4737, 10.5, 1.5);
    `);

    db.close();

    process.env.FOOTPRINT_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.FOOTPRINT_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if date is missing", async () => {
    const request = new NextRequest("http://localhost/api/day/footprint");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should return 400 if date format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/footprint?date=invalid"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should return data for valid date", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/footprint?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.date).toBe("2025-01-15");
    expect(data.data.trackPoints).toBeArray();
    expect(data.data.trackPoints.length).toBeGreaterThan(0);
  });

  it("should return 500 when database error occurs", async () => {
    // Point to non-existent database to trigger error
    const originalPath = process.env.FOOTPRINT_DB_PATH;
    process.env.FOOTPRINT_DB_PATH = "/nonexistent/path/to/db.sqlite";

    const request = new NextRequest(
      "http://localhost/api/day/footprint?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeString();

    // Restore original path
    process.env.FOOTPRINT_DB_PATH = originalPath;
  });
});
