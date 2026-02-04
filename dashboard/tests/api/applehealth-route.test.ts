import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/day/applehealth/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/applehealth-api.test.sqlite`;

describe("GET /api/day/applehealth", () => {
  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    const db = new Database(TEST_DB_PATH);
    db.exec(`
      create table if not exists apple_record (
        id integer primary key,
        type text not null,
        unit text,
        value text,
        source_name text,
        source_version text,
        device text,
        creation_date text,
        start_date text not null,
        end_date text not null,
        day text not null,
        timezone text
      );
      create table if not exists apple_workout (
        id integer primary key,
        workout_type text not null,
        duration real,
        total_distance real,
        total_energy real,
        source_name text,
        device text,
        creation_date text,
        start_date text not null,
        end_date text not null,
        day text not null
      );
      create table if not exists apple_activity_summary (
        id integer primary key,
        date_components text not null,
        active_energy real,
        exercise_time real,
        stand_hours real,
        movement_energy real,
        day text not null
      );
    `);

    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day)
      values ('HKQuantityTypeIdentifierHeartRate', 'count/min', '72', '2025-01-15 08:00:00', '2025-01-15 08:00:00', '2025-01-15');
    `);

    db.close();

    // Set environment variable to use test database
    process.env.APPLEHEALTH_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.APPLEHEALTH_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if date is missing", async () => {
    const request = new NextRequest("http://localhost/api/day/applehealth");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing required parameter");
  });

  it("should return 400 if date format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/applehealth?date=2025/01/15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid date format");
  });

  it("should return data for valid date", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/applehealth?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.date).toBe("2025-01-15");
    expect(data.data.records).toBeArray();
    expect(data.data.records.length).toBeGreaterThan(0);
  });

  it("should return empty data for date with no records", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/applehealth?date=2020-01-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.records).toEqual([]);
  });

  it("should return 500 when database error occurs", async () => {
    // Point to non-existent database to trigger error
    const originalPath = process.env.APPLEHEALTH_DB_PATH;
    process.env.APPLEHEALTH_DB_PATH = "/nonexistent/path/to/db.sqlite";

    const request = new NextRequest(
      "http://localhost/api/day/applehealth?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeString();

    // Restore original path
    process.env.APPLEHEALTH_DB_PATH = originalPath;
  });
});
