import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  AppleHealthService,
  type AppleHealthRawData,
} from "@/services/applehealth-service";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/applehealth.test.sqlite`;

describe("AppleHealthService", () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    // Create temp directory
    mkdirSync(TEST_DB_DIR, { recursive: true });

    // Create test database with schema
    db = new Database(TEST_DB_PATH);
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

    // Insert test data for 2025-01-15
    const testDay = "2025-01-15";

    // Heart rate records
    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day, source_name)
      values 
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '72', '${testDay} 08:00:00', '${testDay} 08:00:00', '${testDay}', 'Apple Watch'),
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '85', '${testDay} 12:00:00', '${testDay} 12:00:00', '${testDay}', 'Apple Watch'),
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '65', '${testDay} 22:00:00', '${testDay} 22:00:00', '${testDay}', 'Apple Watch');
    `);

    // Step count records
    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day, source_name)
      values 
        ('HKQuantityTypeIdentifierStepCount', 'count', '1500', '${testDay} 08:00:00', '${testDay} 09:00:00', '${testDay}', 'iPhone'),
        ('HKQuantityTypeIdentifierStepCount', 'count', '2000', '${testDay} 12:00:00', '${testDay} 13:00:00', '${testDay}', 'iPhone');
    `);

    // Workout
    db.exec(`
      insert into apple_workout (workout_type, duration, total_distance, total_energy, start_date, end_date, day, source_name)
      values ('HKWorkoutActivityTypeRunning', 30.5, 5000, 300, '${testDay} 07:00:00', '${testDay} 07:30:00', '${testDay}', 'Apple Watch');
    `);

    // Activity summary
    db.exec(`
      insert into apple_activity_summary (date_components, active_energy, exercise_time, stand_hours, day)
      values ('${testDay}', 450.5, 35, 10, '${testDay}');
    `);

    db.close();
  });

  afterAll(() => {
    // Clean up test database
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe("getDayData", () => {
    it("should return raw data for a specific date", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data).toBeDefined();
      expect(data.date).toBe("2025-01-15");
      expect(data.records).toBeArray();
      expect(data.records.length).toBeGreaterThan(0);
      expect(data.workouts).toBeArray();
      expect(data.activitySummary).toBeDefined();
    });

    it("should return heart rate records", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      const heartRateRecords = data.records.filter(
        (r: { type: string }) => r.type === "HKQuantityTypeIdentifierHeartRate"
      );
      expect(heartRateRecords.length).toBe(3);
      expect(heartRateRecords[0].value).toBe("72");
    });

    it("should return step count records", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      const stepRecords = data.records.filter(
        (r: { type: string }) => r.type === "HKQuantityTypeIdentifierStepCount"
      );
      expect(stepRecords.length).toBe(2);
    });

    it("should return workout data", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data.workouts.length).toBe(1);
      expect(data.workouts[0].workout_type).toBe("HKWorkoutActivityTypeRunning");
      expect(data.workouts[0].duration).toBe(30.5);
      expect(data.workouts[0].total_distance).toBe(5000);
    });

    it("should return activity summary", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data.activitySummary).not.toBeNull();
      expect(data.activitySummary?.active_energy).toBe(450.5);
      expect(data.activitySummary?.exercise_time).toBe(35);
      expect(data.activitySummary?.stand_hours).toBe(10);
    });

    it("should return empty data for date with no records", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getDayData("2020-01-01");

      expect(data.date).toBe("2020-01-01");
      expect(data.records).toEqual([]);
      expect(data.workouts).toEqual([]);
      expect(data.activitySummary).toBeNull();
    });
  });

  describe("type validation", () => {
    it("should match AppleHealthRawData type structure", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data: AppleHealthRawData = service.getDayData("2025-01-15");

      // Type-level check - if this compiles, types are correct
      expect(typeof data.date).toBe("string");
      expect(Array.isArray(data.records)).toBe(true);
      expect(Array.isArray(data.workouts)).toBe(true);
    });
  });
});
