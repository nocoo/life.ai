import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/month/applehealth/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/month-applehealth-api.test.sqlite`;

describe("GET /api/month/applehealth", () => {
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

    // Insert test data for January 2025
    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day)
      values 
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '72', '2025-01-15 08:00:00', '2025-01-15 08:00:00', '2025-01-15'),
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '75', '2025-01-16 08:00:00', '2025-01-16 08:00:00', '2025-01-16'),
        ('HKQuantityTypeIdentifierStepCount', 'count', '5000', '2025-01-15 10:00:00', '2025-01-15 12:00:00', '2025-01-15');
    `);

    db.close();

    process.env.APPLEHEALTH_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.APPLEHEALTH_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if month is missing", async () => {
    const request = new NextRequest("http://localhost/api/month/applehealth");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing required parameter");
  });

  it("should return 400 if month format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/applehealth?month=2025/01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid month format");
  });

  it("should return 400 if month format has day", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/applehealth?month=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid month format");
  });

  it("should return transformed data for valid month", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/applehealth?month=2025-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.month).toBe("2025-01");
    expect(data.data.daysInMonth).toBe(31);
    expect(data.data.daysWithData).toBeGreaterThan(0);
    expect(data.data.heartRate).not.toBeNull();
    expect(data.data.steps).not.toBeNull();
  });

  it("should return empty data for month with no records", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/applehealth?month=2020-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.month).toBe("2020-01");
    expect(data.data.daysWithData).toBe(0);
    expect(data.data.heartRate).toBeNull();
    expect(data.data.steps).toBeNull();
  });

  it("should return 500 when database error occurs", async () => {
    const originalPath = process.env.APPLEHEALTH_DB_PATH;
    process.env.APPLEHEALTH_DB_PATH = "/nonexistent/path/to/db.sqlite";

    const request = new NextRequest(
      "http://localhost/api/month/applehealth?month=2025-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeString();

    process.env.APPLEHEALTH_DB_PATH = originalPath;
  });
});
