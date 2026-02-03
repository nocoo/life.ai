import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { openDb, testDbPath } from "../import/applehealth/db";
import {
  countEcgFiles,
  countRouteFiles,
  countXml,
  readDbCounts,
  readDbFiles,
  verifyAppleHealth,
  runCli
} from "../verify/applehealth";
import { writeAppleHealthXml, writeEcgCsv, writeRouteGpx } from "./applehealth-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table apple_record (id integer primary key, type text not null, unit text, value text, source_name text, source_version text, device text, creation_date text, start_date text not null, end_date text not null, day text not null, timezone text);
    create table apple_correlation (id integer primary key, type text not null, source_name text, device text, creation_date text, start_date text not null, end_date text not null, day text not null);
    create table apple_workout (id integer primary key, workout_type text not null, duration real, total_distance real, total_energy real, source_name text, device text, creation_date text, start_date text not null, end_date text not null, day text not null);
    create table apple_activity_summary (id integer primary key, date_components text not null, active_energy real, exercise_time real, stand_hours real, movement_energy real, day text not null);
    create table apple_ecg_file (id integer primary key, file_path text not null, recorded_at text, sampling_rate real, sample_count integer, day text not null);
    create table apple_workout_route (id integer primary key, file_path text not null, workout_id integer, start_time text, end_time text, point_count integer, day text not null);
  `);
};

describe("applehealth verify", () => {
  const xmlFile = "db/test-applehealth.xml";
  const ecgDir = "db/test-ecg";
  const routesDir = "db/test-routes";
  const ecgFile = `${ecgDir}/ecg_2025-01-05.csv`;
  const routeFile = `${routesDir}/route_2025-01-05_1.00pm.gpx`;

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    rmSync(routesDir, { force: true, recursive: true });
    mkdirSync(ecgDir, { recursive: true });
    mkdirSync(routesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    rmSync(routesDir, { force: true, recursive: true });
  });

  it("verifies counts", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="HKCorrelationTypeIdentifierBloodPressure" sourceName="BP" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" sourceName="Watch" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"></Workout>
<ActivitySummary dateComponents="2025-01-04" activeEnergyBurned="500" appleExerciseTime="30" appleStandHours="12"/>
`
    );
    writeEcgCsv(ecgFile, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(`
      insert into apple_record (type, start_date, end_date, day) values ('t', '2025-01-01 10:00:00 +0800', '2025-01-01 10:00:01 +0800', '2025-01-01');
      insert into apple_correlation (type, start_date, end_date, day) values ('c', '2025-01-02 08:00:00 +0800', '2025-01-02 08:00:01 +0800', '2025-01-02');
      insert into apple_workout (workout_type, start_date, end_date, day) values ('w', '2025-01-03 07:00:00 +0800', '2025-01-03 07:30:00 +0800', '2025-01-03');
      insert into apple_activity_summary (date_components, day) values ('2025-01-04', '2025-01-04');
      insert into apple_ecg_file (file_path, day) values ('${ecgFile}', '2025-01-05');
      insert into apple_workout_route (file_path, day) values ('${routeFile}', '2025-01-05');
    `);
    db.close();

    const result = await verifyAppleHealth({
      year: 2025,
      exportPath: xmlFile,
      ecgDir,
      routesDir,
      dbPath: testDbPath
    });
    expect(result.ok).toBe(true);
  });

  it("returns usage on invalid args", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };
    const result = await runCli(["bad"], io);
    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(logs[0]).toContain("Usage:");
  });

  it("reports mismatched counts", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 11:00:00 +0800" endDate="2025-01-01 11:00:01 +0800"/>
`
    );
    writeEcgCsv(ecgFile, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(
      "insert into apple_record (type, start_date, end_date, day) values ('t', '2025-01-01 10:00:00 +0800', '2025-01-01 10:00:01 +0800', '2025-01-01');"
    );
    db.close();

    const result = await verifyAppleHealth({
      year: 2025,
      exportPath: xmlFile,
      ecgDir,
      routesDir,
      dbPath: testDbPath
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("record count mismatch"))).toBe(
      true
    );
  });

  it("counts xml entities", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="HKCorrelationTypeIdentifierBloodPressure" sourceName="BP" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" sourceName="Watch" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"></Workout>
<ActivitySummary dateComponents="2025-01-04" activeEnergyBurned="500" appleExerciseTime="30" appleStandHours="12"/>
`
    );

    const summary = await countXml(xmlFile, 2025);
    expect(summary.records).toBe(1);
    expect(summary.correlations).toBe(1);
    expect(summary.workouts).toBe(1);
    expect(summary.activities).toBe(1);
  });

  it("counts files", async () => {
    writeEcgCsv(ecgFile, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>'
    ]);

    const ecgCount = await countEcgFiles(ecgDir, 2025);
    const routeCount = await countRouteFiles(routesDir, 2025);
    expect(ecgCount).toBe(1);
    expect(routeCount).toBe(1);
  });

  it("reads db counts", () => {
    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(`
      insert into apple_record (type, start_date, end_date, day) values ('t', '2025-01-01 10:00:00 +0800', '2025-01-01 10:00:01 +0800', '2025-01-01');
      insert into apple_correlation (type, start_date, end_date, day) values ('c', '2025-01-02 08:00:00 +0800', '2025-01-02 08:00:01 +0800', '2025-01-02');
      insert into apple_workout (workout_type, start_date, end_date, day) values ('w', '2025-01-03 07:00:00 +0800', '2025-01-03 07:30:00 +0800', '2025-01-03');
      insert into apple_activity_summary (date_components, day) values ('2025-01-04', '2025-01-04');
      insert into apple_ecg_file (file_path, day) values ('${ecgFile}', '2025-01-05');
      insert into apple_workout_route (file_path, day) values ('${routeFile}', '2025-01-05');
    `);

    const counts = readDbCounts(db, 2025);
    const files = readDbFiles(db, 2025);
    expect(counts.records).toBe(1);
    expect(counts.correlations).toBe(1);
    expect(counts.workouts).toBe(1);
    expect(counts.activities).toBe(1);
    expect(files.ecg).toBe(1);
    expect(files.routes).toBe(1);

    db.close();
  });

  it("counts all years", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2024-01-01 10:00:00 +0800" endDate="2024-01-01 10:00:01 +0800"/>
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
`
    );
    writeEcgCsv(ecgFile, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(`
      insert into apple_record (type, start_date, end_date, day) values ('t', '2024-01-01 10:00:00 +0800', '2024-01-01 10:00:01 +0800', '2024-01-01');
      insert into apple_record (type, start_date, end_date, day) values ('t', '2025-01-01 10:00:00 +0800', '2025-01-01 10:00:01 +0800', '2025-01-01');
      insert into apple_ecg_file (file_path, day) values ('${ecgFile}', '2025-01-05');
      insert into apple_workout_route (file_path, day) values ('${routeFile}', '2025-01-05');
    `);

    const xmlCounts = await countXml(xmlFile);
    const ecgCount = await countEcgFiles(ecgDir);
    const routeCount = await countRouteFiles(routesDir);
    const dbCounts = readDbCounts(db);
    const dbFiles = readDbFiles(db);

    expect(xmlCounts.records).toBe(2);
    expect(ecgCount).toBe(1);
    expect(routeCount).toBe(1);
    expect(dbCounts.records).toBe(2);
    expect(dbFiles.ecg).toBe(1);
    expect(dbFiles.routes).toBe(1);

    db.close();
  });

  it("counts mismatched routes and ecg", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" value="500" sourceName="Grow" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
`
    );
    writeEcgCsv(ecgFile, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(
      "insert into apple_record (type, start_date, end_date, day) values ('t', '2025-01-01 10:00:00 +0800', '2025-01-01 10:00:01 +0800', '2025-01-01');"
    );
    db.close();

    const result = await verifyAppleHealth({
      year: 2025,
      exportPath: xmlFile,
      ecgDir,
      routesDir,
      dbPath: testDbPath
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("ecg count mismatch"))).toBe(
      true
    );
    expect(result.errors.some((err) => err.includes("routes count mismatch"))).toBe(
      true
    );
  });
});
