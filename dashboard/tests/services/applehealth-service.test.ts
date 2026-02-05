import { describe, it, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  AppleHealthService,
  type AppleHealthRawData,
  type AppleHealthMonthRawData,
  type AppleHealthYearRawData,
} from "@/services/applehealth-service";
import * as dbModule from "@/lib/db";

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
    const testDay2 = "2025-01-20";
    const testDay3 = "2025-02-10";

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

    // Add more data for month/year tests
    // Data for 2025-01-20
    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day, source_name)
      values 
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '70', '${testDay2} 09:00:00', '${testDay2} 09:00:00', '${testDay2}', 'Apple Watch'),
        ('HKQuantityTypeIdentifierStepCount', 'count', '3000', '${testDay2} 10:00:00', '${testDay2} 11:00:00', '${testDay2}', 'iPhone');
    `);

    db.exec(`
      insert into apple_workout (workout_type, duration, total_distance, total_energy, start_date, end_date, day, source_name)
      values ('HKWorkoutActivityTypeSwimming', 45, 1000, 250, '${testDay2} 18:00:00', '${testDay2} 18:45:00', '${testDay2}', 'Apple Watch');
    `);

    db.exec(`
      insert into apple_activity_summary (date_components, active_energy, exercise_time, stand_hours, day)
      values ('${testDay2}', 380, 45, 12, '${testDay2}');
    `);

    // Data for 2025-02-10 (different month)
    db.exec(`
      insert into apple_record (type, unit, value, start_date, end_date, day, source_name)
      values 
        ('HKQuantityTypeIdentifierHeartRate', 'count/min', '68', '${testDay3} 08:00:00', '${testDay3} 08:00:00', '${testDay3}', 'Apple Watch');
    `);

    db.exec(`
      insert into apple_activity_summary (date_components, active_energy, exercise_time, stand_hours, day)
      values ('${testDay3}', 400, 30, 11, '${testDay3}');
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

  describe("getMonthData", () => {
    it("should return all records for a specific month", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data).toBeDefined();
      expect(data.month).toBe("2025-01");
      // Should include records from both 2025-01-15 and 2025-01-20
      expect(data.records.length).toBeGreaterThan(3);
    });

    it("should return workouts for the month", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      // Should include both running and swimming workouts
      expect(data.workouts.length).toBe(2);
      const workoutTypes = data.workouts.map((w) => w.workout_type);
      expect(workoutTypes).toContain("HKWorkoutActivityTypeRunning");
      expect(workoutTypes).toContain("HKWorkoutActivityTypeSwimming");
    });

    it("should return activity summaries for the month", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data.activitySummaries.length).toBe(2);
      expect(data.activitySummaries[0].day).toBe("2025-01-15");
      expect(data.activitySummaries[1].day).toBe("2025-01-20");
    });

    it("should not include data from other months", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      // Should not include February data
      const febRecords = data.records.filter((r) => r.day.startsWith("2025-02"));
      expect(febRecords.length).toBe(0);
    });

    it("should return empty data for month with no records", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getMonthData("2020-01");

      expect(data.month).toBe("2020-01");
      expect(data.records).toEqual([]);
      expect(data.workouts).toEqual([]);
      expect(data.activitySummaries).toEqual([]);
    });

    it("should match AppleHealthMonthRawData type structure", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data: AppleHealthMonthRawData = service.getMonthData("2025-01");

      expect(typeof data.month).toBe("string");
      expect(Array.isArray(data.records)).toBe(true);
      expect(Array.isArray(data.workouts)).toBe(true);
      expect(Array.isArray(data.activitySummaries)).toBe(true);
    });
  });

  describe("getYearData", () => {
    it("should return all records for a specific year", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data).toBeDefined();
      expect(data.year).toBe(2025);
      // Should include records from all months in 2025
      expect(data.records.length).toBeGreaterThan(5);
    });

    it("should include data from multiple months", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      // Check that we have data from both January and February
      const janRecords = data.records.filter((r) => r.day.startsWith("2025-01"));
      const febRecords = data.records.filter((r) => r.day.startsWith("2025-02"));

      expect(janRecords.length).toBeGreaterThan(0);
      expect(febRecords.length).toBeGreaterThan(0);
    });

    it("should return all workouts for the year", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data.workouts.length).toBe(2);
    });

    it("should return all activity summaries for the year", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      // Should have summaries for all 3 days with data
      expect(data.activitySummaries.length).toBe(3);
    });

    it("should return empty data for year with no records", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data = service.getYearData(2020);

      expect(data.year).toBe(2020);
      expect(data.records).toEqual([]);
      expect(data.workouts).toEqual([]);
      expect(data.activitySummaries).toEqual([]);
    });

    it("should match AppleHealthYearRawData type structure", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const data: AppleHealthYearRawData = service.getYearData(2025);

      expect(typeof data.year).toBe("number");
      expect(Array.isArray(data.records)).toBe(true);
      expect(Array.isArray(data.workouts)).toBe(true);
      expect(Array.isArray(data.activitySummaries)).toBe(true);
    });
  });

  describe("caching behavior", () => {
    it("should cache historical month data on second call", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache (no additional DB call)
      const data2 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Data should be identical
      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should cache historical year data on second call", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const data2 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1); // Still 1

      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current month data", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // Get current month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // First call
      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should hit database again (not cached)
      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current year data", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      const currentYear = new Date().getFullYear();

      // First call
      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should hit database again
      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should allow clearing the cache", () => {
      const service = new AppleHealthService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - cache it
      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Should hit database again
      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });
  });
});
