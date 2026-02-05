import { describe, it, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  FootprintService,
  type FootprintRawData,
  type FootprintMonthRawData,
  type FootprintYearRawData,
} from "@/services/footprint-service";
import * as dbModule from "@/lib/db";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/footprint.test.sqlite`;

describe("FootprintService", () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    db = new Database(TEST_DB_PATH);
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

    const testDay = "2025-01-15";
    const testDay2 = "2025-01-20";
    const testDay3 = "2025-02-10";

    // Track points
    db.exec(`
      insert into track_point (source, track_date, ts, lat, lon, ele, speed)
      values 
        ('footprint', '${testDay}', '2025-01-15T08:00:00Z', 31.2304, 121.4737, 10.5, 1.5),
        ('footprint', '${testDay}', '2025-01-15T08:01:00Z', 31.2305, 121.4738, 10.6, 1.6),
        ('footprint', '${testDay}', '2025-01-15T08:02:00Z', 31.2306, 121.4739, 10.7, 1.7),
        ('footprint', '${testDay}', '2025-01-15T12:00:00Z', 31.2400, 121.4800, 15.0, 2.0),
        ('footprint', '${testDay}', '2025-01-15T12:01:00Z', 31.2401, 121.4801, 15.1, 2.1);
    `);

    // Day aggregation
    db.exec(`
      insert into track_day_agg (source, day, point_count, min_ts, max_ts, avg_speed, min_lat, max_lat, min_lon, max_lon)
      values ('footprint', '${testDay}', 5, '2025-01-15T08:00:00Z', '2025-01-15T12:01:00Z', 1.78, 31.2304, 31.2401, 121.4737, 121.4801);
    `);

    // Add data for 2025-01-20
    db.exec(`
      insert into track_point (source, track_date, ts, lat, lon, ele, speed)
      values 
        ('footprint', '${testDay2}', '2025-01-20T10:00:00Z', 31.2500, 121.5000, 20.0, 3.0),
        ('footprint', '${testDay2}', '2025-01-20T10:05:00Z', 31.2510, 121.5010, 21.0, 3.5);
    `);

    db.exec(`
      insert into track_day_agg (source, day, point_count, min_ts, max_ts, avg_speed, min_lat, max_lat, min_lon, max_lon)
      values ('footprint', '${testDay2}', 2, '2025-01-20T10:00:00Z', '2025-01-20T10:05:00Z', 3.25, 31.2500, 31.2510, 121.5000, 121.5010);
    `);

    // Add data for 2025-02-10
    db.exec(`
      insert into track_point (source, track_date, ts, lat, lon, ele, speed)
      values 
        ('footprint', '${testDay3}', '2025-02-10T14:00:00Z', 31.3000, 121.6000, 5.0, 1.0);
    `);

    db.exec(`
      insert into track_day_agg (source, day, point_count, min_ts, max_ts, avg_speed, min_lat, max_lat, min_lon, max_lon)
      values ('footprint', '${testDay3}', 1, '2025-02-10T14:00:00Z', '2025-02-10T14:00:00Z', 1.0, 31.3000, 31.3000, 121.6000, 121.6000);
    `);

    // Month aggregation
    db.exec(`
      insert into track_month_agg (source, month, point_count)
      values 
        ('footprint', '2025-01', 7),
        ('footprint', '2025-02', 1);
    `);

    // Year aggregation
    db.exec(`
      insert into track_year_agg (source, year, point_count)
      values ('footprint', 2025, 8);
    `);

    db.close();
  });

  afterAll(() => {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe("getDayData", () => {
    it("should return raw data for a specific date", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data).toBeDefined();
      expect(data.date).toBe("2025-01-15");
      expect(data.trackPoints).toBeArray();
      expect(data.trackPoints.length).toBe(5);
      expect(data.dayAgg).toBeDefined();
    });

    it("should return track points with correct fields", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      const firstPoint = data.trackPoints[0];
      expect(firstPoint.lat).toBe(31.2304);
      expect(firstPoint.lon).toBe(121.4737);
      expect(firstPoint.ele).toBe(10.5);
      expect(firstPoint.speed).toBe(1.5);
      expect(firstPoint.ts).toBe("2025-01-15T08:00:00Z");
    });

    it("should return day aggregation", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data.dayAgg).not.toBeNull();
      expect(data.dayAgg?.point_count).toBe(5);
      expect(data.dayAgg?.avg_speed).toBe(1.78);
      expect(data.dayAgg?.min_lat).toBe(31.2304);
      expect(data.dayAgg?.max_lat).toBe(31.2401);
    });

    it("should return empty data for date with no records", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getDayData("2020-01-01");

      expect(data.date).toBe("2020-01-01");
      expect(data.trackPoints).toEqual([]);
      expect(data.dayAgg).toBeNull();
    });
  });

  describe("type validation", () => {
    it("should match FootprintRawData type structure", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data: FootprintRawData = service.getDayData("2025-01-15");

      expect(typeof data.date).toBe("string");
      expect(Array.isArray(data.trackPoints)).toBe(true);
    });
  });

  describe("getMonthData", () => {
    it("should return aggregated data for a specific month", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data).toBeDefined();
      expect(data.month).toBe("2025-01");
      expect(data.dayAggs.length).toBe(2); // 2025-01-15 and 2025-01-20
    });

    it("should return month aggregation", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data.monthAgg).not.toBeNull();
      expect(data.monthAgg?.point_count).toBe(7);
    });

    it("should not include data from other months", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      const febDays = data.dayAggs.filter((d) => d.day.startsWith("2025-02"));
      expect(febDays.length).toBe(0);
    });

    it("should return empty data for month with no records", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getMonthData("2020-01");

      expect(data.month).toBe("2020-01");
      expect(data.dayAggs).toEqual([]);
      expect(data.monthAgg).toBeNull();
    });

    it("should match FootprintMonthRawData type structure", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data: FootprintMonthRawData = service.getMonthData("2025-01");

      expect(typeof data.month).toBe("string");
      expect(Array.isArray(data.dayAggs)).toBe(true);
    });
  });

  describe("getYearData", () => {
    it("should return aggregated data for a specific year", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data).toBeDefined();
      expect(data.year).toBe(2025);
      expect(data.dayAggs.length).toBe(3); // All 3 days
      expect(data.monthAggs.length).toBe(2); // Jan and Feb
    });

    it("should return year aggregation", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data.yearAgg).not.toBeNull();
      expect(data.yearAgg?.point_count).toBe(8);
    });

    it("should include data from multiple months", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      const janDays = data.dayAggs.filter((d) => d.day.startsWith("2025-01"));
      const febDays = data.dayAggs.filter((d) => d.day.startsWith("2025-02"));

      expect(janDays.length).toBe(2);
      expect(febDays.length).toBe(1);
    });

    it("should return empty data for year with no records", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data = service.getYearData(2020);

      expect(data.year).toBe(2020);
      expect(data.dayAggs).toEqual([]);
      expect(data.monthAggs).toEqual([]);
      expect(data.yearAgg).toBeNull();
    });

    it("should match FootprintYearRawData type structure", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const data: FootprintYearRawData = service.getYearData(2025);

      expect(typeof data.year).toBe("number");
      expect(Array.isArray(data.dayAggs)).toBe(true);
      expect(Array.isArray(data.monthAggs)).toBe(true);
    });
  });

  describe("caching behavior", () => {
    it("should cache historical month data on second call", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const data2 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should cache historical year data on second call", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const data2 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current month data", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current year data", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      const currentYear = new Date().getFullYear();

      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should allow clearing the cache", () => {
      const service = new FootprintService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.clearCache();

      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });
  });
});
