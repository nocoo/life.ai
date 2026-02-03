import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  FootprintService,
  type FootprintRawData,
} from "@/services/footprint-service";

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
    `);

    const testDay = "2025-01-15";

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
});
