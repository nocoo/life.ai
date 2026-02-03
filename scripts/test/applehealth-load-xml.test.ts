import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { openDb, testDbPath } from "../import/applehealth/db";
import { loadXml } from "../import/applehealth/load-xml";
import { writeAppleHealthXml } from "./applehealth-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table apple_meta (key text primary key, value text not null);
    create table apple_type_dict (type text primary key, kind text not null, unit text, sample_count integer not null default 0, note text);
    create table apple_record (
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
    create table apple_correlation (
      id integer primary key,
      type text not null,
      source_name text,
      device text,
      creation_date text,
      start_date text not null,
      end_date text not null,
      day text not null
    );
    create table apple_correlation_item (
      correlation_id integer not null,
      record_id integer not null,
      primary key (correlation_id, record_id)
    );
    create table apple_workout (
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
    create table apple_workout_stat (
      workout_id integer not null,
      type text not null,
      unit text,
      value real,
      primary key (workout_id, type)
    );
    create table apple_activity_summary (
      id integer primary key,
      date_components text not null,
      active_energy real,
      exercise_time real,
      stand_hours real,
      movement_energy real,
      day text not null
    );
  `);
};

describe("applehealth load xml", () => {
  const xmlFile = "db/test-applehealth.xml";

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(xmlFile, { force: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(xmlFile, { force: true });
  });

  it("loads records, correlations, workouts, activities", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="HKCorrelationTypeIdentifierBloodPressure" sourceName="BP" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800">
  <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" unit="mmHg" value="120" sourceName="BP" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"/>
</Correlation>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" sourceName="Watch" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="120" unit="count/min" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"/>
</Workout>
<ActivitySummary dateComponents="2025-01-04" activeEnergyBurned="500" appleExerciseTime="30" appleStandHours="12"/>
`
    );

    const db = openDb(testDbPath);
    createSchema(db);
    const summary = await loadXml(db, 2025, xmlFile);

    expect(summary.records).toBe(1);
    expect(summary.correlations).toBe(1);
    expect(summary.workouts).toBe(1);
    expect(summary.activities).toBe(1);

    const recordCount = db
      .query("select count(*) as count from apple_record")
      .get() as { count: number };
    const corrCount = db
      .query("select count(*) as count from apple_correlation")
      .get() as { count: number };
    const workoutStats = db
      .query("select count(*) as count from apple_workout_stat")
      .get() as { count: number };
    const activityCount = db
      .query("select count(*) as count from apple_activity_summary")
      .get() as { count: number };

    expect(recordCount.count).toBe(1);
    expect(corrCount.count).toBe(1);
    expect(workoutStats.count).toBe(1);
    expect(activityCount.count).toBe(1);

    const typeRows = db
      .query("select type, kind from apple_type_dict order by kind, type")
      .all() as { type: string; kind: string }[];
    expect(typeRows.length).toBeGreaterThanOrEqual(3);

    db.close();
  });

  it("filters by year", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2024-12-31 23:00:00 +0800" endDate="2024-12-31 23:00:01 +0800"/>
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="600" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
`
    );

    const db = openDb(testDbPath);
    createSchema(db);
    const summary = await loadXml(db, 2025, xmlFile);
    expect(summary.records).toBe(1);

    const count = db
      .query("select count(*) as count from apple_record")
      .get() as { count: number };
    expect(count.count).toBe(1);

    db.close();
  });

  it("throws when xml missing", async () => {
    const db = openDb(testDbPath);
    createSchema(db);

    await expect(loadXml(db, 2025, "db/missing.xml")).rejects.toThrow(
      "XML file not found"
    );

    db.close();
  });
});
