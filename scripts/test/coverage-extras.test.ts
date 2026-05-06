import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

import { openDb as openAppleDb, testDbPath as appleTestDbPath } from "../import/applehealth/db";
import { openDb as openFootprintDb, testDbPath as footprintTestDbPath } from "../import/footprint/db";
import { openDb as openPixiuDb, testDbPath as pixiuTestDbPath } from "../import/pixiu/db";

import { loadXml } from "../import/applehealth/load-xml";
import { loadEcg } from "../import/applehealth/load-ecg";
import { loadRoutes } from "../import/applehealth/load-routes";
import { loadGpx } from "../import/footprint/load-gpx";
import { loadCsv } from "../import/pixiu/load-csv";

import {
  countXml,
  countEcgFiles,
  countRouteFiles,
  readDbCounts,
  readDbFiles,
  verifyAppleHealth,
  runCli as runAppleCli,
} from "../verify/applehealth";
import {
  parseGpxSummary,
  readDbSummary as readFootprintDbSummary,
  compareDayCounts,
  verifyFootprint,
  runCli as runFootprintCli,
} from "../verify/footprint";
import {
  parseCsvSummary,
  readDbSummary as readPixiuDbSummary,
  verifyPixiu,
  runCli as runPixiuCli,
} from "../verify/pixiu";

import {
  writeAppleHealthXml,
  writeEcgCsv,
  writeRouteGpx,
} from "./applehealth-fixtures";
import { writeGpx } from "./footprint-fixtures";
import { writePixiuCsv } from "./pixiu-fixtures";

const createAppleSchema = (db: ReturnType<typeof openAppleDb>) => {
  db.exec(`
    create table apple_meta (key text primary key, value text not null);
    create table apple_type_dict (type text primary key, kind text not null, unit text, sample_count integer not null default 0, note text);
    create table apple_record (id integer primary key, type text not null, unit text, value text, source_name text, source_version text, device text, creation_date text, start_date text not null, end_date text not null, day text not null, timezone text);
    create table apple_correlation (id integer primary key, type text not null, source_name text, device text, creation_date text, start_date text not null, end_date text not null, day text not null);
    create table apple_correlation_item (correlation_id integer not null, record_id integer not null, primary key (correlation_id, record_id));
    create table apple_workout (id integer primary key, workout_type text not null, duration real, total_distance real, total_energy real, source_name text, device text, creation_date text, start_date text not null, end_date text not null, day text not null);
    create table apple_workout_stat (workout_id integer not null, type text not null, unit text, value real, primary key (workout_id, type));
    create table apple_activity_summary (id integer primary key, date_components text not null, active_energy real, exercise_time real, stand_hours real, movement_energy real, day text not null);
    create table apple_ecg_file (id integer primary key, file_path text not null, recorded_at text, sampling_rate real, sample_count integer, day text not null);
    create table apple_workout_route (id integer primary key, file_path text not null, workout_id integer, start_time text, end_time text, point_count integer, day text not null);
  `);
};

const createFootprintSchema = (db: ReturnType<typeof openFootprintDb>) => {
  db.exec(`
    create table track_point (id integer primary key, source text not null, track_date text not null, ts text not null, lat real not null, lon real not null, ele real, speed real, course real);
    create table track_day_agg (source text not null, day text not null, point_count integer not null, primary key (source, day));
    create table track_week_agg (source text not null, week_start text not null, point_count integer not null, primary key (source, week_start));
    create table track_month_agg (source text not null, month text not null, point_count integer not null, primary key (source, month));
    create table track_year_agg (source text not null, year integer not null, point_count integer not null, primary key (source, year));
  `);
};

const createPixiuSchema = (db: ReturnType<typeof openPixiuDb>) => {
  db.exec(`
    create table pixiu_transaction (id integer primary key, source text not null, tx_date text not null, category_l1 text not null, category_l2 text not null, inflow real not null default 0, outflow real not null default 0, currency text not null, account text not null, tags text, note text, year integer not null);
    create table pixiu_day_agg (source text not null, day text not null, income real not null, expense real not null, net real not null, tx_count integer not null, primary key (source, day));
    create table pixiu_month_agg (source text not null, month text not null, income real not null, expense real not null, net real not null, tx_count integer not null, primary key (source, month));
    create table pixiu_year_agg (source text not null, year integer not null, income real not null, expense real not null, net real not null, tx_count integer not null, primary key (source, year));
  `);
};

describe("coverage extras: applehealth load-xml", () => {
  const xmlFile = "db/extras-applehealth.xml";

  beforeEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
  });
  afterEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
  });

  it("loads without year filter and clears all tables", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="HKQuantityTypeIdentifierDietaryWater" startDate="2024-12-31 23:00:00 +0800" endDate="2024-12-31 23:00:01 +0800"/>
<Record type="HKQuantityTypeIdentifierDietaryWater" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" sum="100" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergy" maximum="200" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierBadStat" unit="x"/>
</Workout>
<ActivitySummary dateComponents="2025-01-04"/>
<ActivitySummary dateComponents="2024-12-30"/>
`
    );

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    // Pre-seed to verify clearYear no-year branch wipes everything.
    db.exec(
      `insert into apple_record (type, start_date, end_date, day) values ('seed', 'x', 'x', '2020-01-01');
       insert into apple_workout (workout_type, start_date, end_date, day) values ('seed', 'x', 'x', '2020-01-01');
       insert into apple_activity_summary (date_components, day) values ('2020-01-01', '2020-01-01');`
    );

    const summary = await loadXml(db, undefined, xmlFile);
    expect(summary.records).toBe(2);
    expect(summary.workouts).toBe(1);
    expect(summary.activities).toBe(2);

    // Pre-seeded rows should be cleared (no year branch).
    const seedRows = db
      .query("select count(*) as count from apple_record where day = '2020-01-01'")
      .get() as { count: number };
    expect(seedRows.count).toBe(0);

    // Workout stats only inserted when value parses (BadStat skipped).
    const stats = db
      .query("select count(*) as count from apple_workout_stat")
      .get() as { count: number };
    expect(stats.count).toBe(2);

    db.close();
  });

  it("skips correlation/workout matches when their inner tag is missing", async () => {
    // Construct XML so the multiline regex catches `<Correlation` ... `</Correlation>`
    // and `<Workout` ... `</Workout>`, but the inner-tag regex finds them normally.
    // Also test that records with no startDate get day = "".
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="X" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="C" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="W" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"></Workout>
`
    );

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const summary = await loadXml(db, undefined, xmlFile);
    expect(summary.correlations).toBe(1);
    expect(summary.workouts).toBe(1);
    // The Record with no startDate falls under day="" which still matches no-year filter.
    expect(summary.records).toBe(1);
    db.close();
  });

  it("inserts records/workouts/activities with all optional attributes absent (nullish branches)", async () => {
    // No unit/value/sourceName/sourceVersion/device/creationDate/endDate on Record.
    // Workout without duration/totalDistance/totalEnergy/sourceName/device/creationDate/endDate.
    // Activity with nothing but dateComponents.
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="X" startDate="2025-01-01 10:00:00 +0800"/>
<Workout workoutActivityType="W" startDate="2025-01-03 07:00:00 +0800"></Workout>
<ActivitySummary dateComponents="2025-01-04"/>
`
    );

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const summary = await loadXml(db, 2025, xmlFile);
    expect(summary.records).toBe(1);
    expect(summary.workouts).toBe(1);
    expect(summary.activities).toBe(1);

    const rec = db.query("select unit, value, end_date, timezone from apple_record").get() as {
      unit: string | null;
      value: string | null;
      end_date: string;
      timezone: string | null;
    };
    expect(rec.unit).toBeNull();
    expect(rec.value).toBeNull();
    // startDate has no trailing timezone token, so split(' ').pop() returns last segment.
    // Either way the field is exercised.

    const wk = db.query("select duration, total_distance, total_energy, end_date from apple_workout").get() as {
      duration: number | null;
      total_distance: number | null;
      total_energy: number | null;
      end_date: string;
    };
    expect(wk.duration).toBeNull();
    expect(wk.total_distance).toBeNull();
    expect(wk.total_energy).toBeNull();
    expect(wk.end_date).toBe("");

    const act = db.query("select active_energy, exercise_time, stand_hours, movement_energy from apple_activity_summary").get() as {
      active_energy: number | null;
      exercise_time: number | null;
      stand_hours: number | null;
      movement_energy: number | null;
    };
    expect(act.active_energy).toBeNull();
    expect(act.exercise_time).toBeNull();
    expect(act.stand_hours).toBeNull();
    expect(act.movement_energy).toBeNull();

    db.close();
  });

  it("workoutStatValue prefers sum/average/maximum/minimum, skips invalid", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Workout workoutActivityType="W" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800">
  <WorkoutStatistics type="A" sum="10" unit="x"/>
  <WorkoutStatistics type="B" average="2" unit="x"/>
  <WorkoutStatistics type="C" maximum="9" unit="x"/>
  <WorkoutStatistics type="D" minimum="1" unit="x"/>
  <WorkoutStatistics type="E" sum="not-a-num" unit="x"/>
</Workout>
`
    );
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    await loadXml(db, 2025, xmlFile);
    const stats = db.query("select type, value from apple_workout_stat order by type").all() as { type: string; value: number }[];
    // Only the four with valid numeric fields should be inserted; "E" has no parsable candidate but goes
    // to next candidate which is empty → null returned, not inserted.
    expect(stats.find((s) => s.type === "A")?.value).toBe(10);
    expect(stats.find((s) => s.type === "B")?.value).toBe(2);
    expect(stats.find((s) => s.type === "C")?.value).toBe(9);
    expect(stats.find((s) => s.type === "D")?.value).toBe(1);
    expect(stats.find((s) => s.type === "E")).toBeUndefined();
    db.close();
  });

  it("inserts records/workouts with ALL optional attrs present (other side of ?? branches)", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="X" unit="u" value="1" sourceName="S" sourceVersion="V" device="D" creationDate="2025-01-01 00:00:00 +0800" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="C" sourceName="BP" device="D" creationDate="2025-01-02 00:00:00 +0800" startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="W" duration="30" totalDistance="5" totalEnergyBurned="100" sourceName="Watch" device="D" creationDate="2025-01-03 00:00:00 +0800" startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"></Workout>
<ActivitySummary dateComponents="2025-01-04" activeEnergyBurned="500" appleExerciseTime="30" appleStandHours="12" appleMoveTime="60"/>
`
    );

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    await loadXml(db, 2025, xmlFile);
    const rec = db.query("select unit, value, source_version, device from apple_record").get() as {
      unit: string;
      value: string;
      source_version: string;
      device: string;
    };
    expect(rec.unit).toBe("u");
    expect(rec.value).toBe("1");
    expect(rec.source_version).toBe("V");
    expect(rec.device).toBe("D");

    const corr = db.query("select source_name, device, creation_date from apple_correlation").get() as {
      source_name: string;
      device: string;
      creation_date: string;
    };
    expect(corr.source_name).toBe("BP");
    expect(corr.device).toBe("D");
    expect(corr.creation_date).toBe("2025-01-02 00:00:00 +0800");

    const wk = db.query("select duration, total_distance, total_energy from apple_workout").get() as {
      duration: number;
      total_distance: number;
      total_energy: number;
    };
    expect(wk.duration).toBe(30);
    expect(wk.total_distance).toBe(5);
    expect(wk.total_energy).toBe(100);

    const act = db.query("select active_energy, exercise_time, stand_hours, movement_energy from apple_activity_summary").get() as {
      active_energy: number;
      exercise_time: number;
      stand_hours: number;
      movement_energy: number;
    };
    expect(act.active_energy).toBe(500);
    expect(act.movement_energy).toBe(60);

    db.close();
  });
});

describe("coverage extras: applehealth load-ecg", () => {
  const ecgDir = "db/extras-ecg";
  const file1 = `${ecgDir}/ecg_2025.csv`;
  const file2 = `${ecgDir}/ecg_2024.csv`;

  beforeEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    mkdirSync(ecgDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
  });

  it("loads all years (no year arg) and handles missing metadata", async () => {
    writeEcgCsv(file1, [
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0",
      "abc",
    ]);
    writeEcgCsv(file2, [
      "姓名,Bob",
      "",
      "2.0",
    ]);

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const count = await loadEcg(db, undefined, ecgDir);
    expect(count).toBe(2);

    const rows = db
      .query("select recorded_at, sampling_rate, sample_count from apple_ecg_file order by id")
      .all() as { recorded_at: string | null; sampling_rate: number | null; sample_count: number }[];

    const without = rows.find((r) => r.recorded_at === null);
    expect(without).toBeDefined();
    expect(without!.sampling_rate).toBeNull();

    db.close();
  });
});

describe("coverage extras: applehealth load-routes", () => {
  const routeDir = "db/extras-routes";
  const file = `${routeDir}/route_2025.gpx`;
  const fileNoTime = `${routeDir}/route_notime.gpx`;

  beforeEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(routeDir, { force: true, recursive: true });
    mkdirSync(routeDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(routeDir, { force: true, recursive: true });
  });

  it("loads all years (no year arg) and handles trkpt without time", async () => {
    writeRouteGpx(file, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>',
    ]);
    writeRouteGpx(fileNoTime, [
      '<trkpt lat="1" lon="2"></trkpt>',
    ]);

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const count = await loadRoutes(db, undefined, routeDir);
    expect(count).toBe(2);

    const rows = db
      .query("select start_time, end_time, point_count, day from apple_workout_route order by id")
      .all() as { start_time: string | null; end_time: string | null; point_count: number; day: string }[];
    const noTime = rows.find((r) => r.start_time === null);
    expect(noTime).toBeDefined();
    expect(noTime!.day).toBe("");
    db.close();
  });
});

describe("coverage extras: footprint load-gpx", () => {
  const gpxFile = "db/extras-footprint.gpx";

  beforeEach(() => {
    rmSync(footprintTestDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });
  afterEach(() => {
    rmSync(footprintTestDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("skips invalid lat/lon, invalid time, missing time, and out-of-year points", async () => {
    writeGpx(gpxFile, [
      // missing time
      '<trkpt lat="1" lon="2"><ele>10</ele></trkpt>',
      // invalid time string
      '<trkpt lat="1" lon="2"><time>not-a-date</time></trkpt>',
      // wrong year
      '<trkpt lat="1" lon="2"><time>2023-01-01T00:00:00Z</time></trkpt>',
      // invalid lat
      '<trkpt lat="bad" lon="2"><time>2025-01-01T00:00:00Z</time></trkpt>',
      // valid w/ ele/speed/course present
      '<trkpt lat="1" lon="2"><ele>10</ele><time>2025-01-01T00:00:00Z</time><speed>5</speed><course>180</course></trkpt>',
      // valid w/o optional fields
      '<trkpt lat="3" lon="4"><time>2025-01-02T00:00:00Z</time></trkpt>',
    ]);

    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    const count = await loadGpx(db, 2025, gpxFile, "footprint");
    expect(count).toBe(2);
    const stored = db
      .query("select ele, speed, course from track_point order by track_date")
      .all() as { ele: number | null; speed: number | null; course: number | null }[];
    expect(stored[0].ele).toBe(10);
    expect(stored[0].speed).toBe(5);
    expect(stored[0].course).toBe(180);
    expect(stored[1].ele).toBeNull();
    expect(stored[1].speed).toBeNull();
    expect(stored[1].course).toBeNull();
    db.close();
  });
});

describe("coverage extras: pixiu load-csv", () => {
  const csvFile = "db/extras-pixiu.csv";

  beforeEach(() => {
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });
  afterEach(() => {
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  it("handles non-finite numbers, blank cells, and missing columns", async () => {
    // Header is the first line; subsequent rows include numeric edge cases.
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,not-a-number,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,,,人民币,现金,,",
      "2024-01-03,日常支出,超市,1,000,1,200,人民币,现金,,",
    ]);

    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    const count = await loadCsv(db, 2024, csvFile, "pixiu");
    expect(count).toBe(3);

    const rows = db
      .query("select inflow, outflow from pixiu_transaction order by tx_date")
      .all() as { inflow: number; outflow: number }[];
    expect(rows[0].inflow).toBe(0); // not-a-number → 0
    expect(rows[1].inflow).toBe(0); // blank → 0
    db.close();
  });

  it("handles cell that is whitespace-only (cleaned empty branch)", async () => {
    // Use a row whose inflow column is just a space — parseNumber's cleaned === "" branch.
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资, ,0,人民币,现金,,",
    ]);
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    const count = await loadCsv(db, 2024, csvFile, "pixiu");
    expect(count).toBe(1);
    db.close();
  });
});

describe("coverage extras: db.ts env-var paths", () => {
  it("respects FOOTPRINT_DB_PATH env var and NODE_ENV=test", () => {
    const originalFp = process.env.FOOTPRINT_DB_PATH;
    const originalPx = process.env.PIXIU_DB_PATH;
    const originalNode = process.env.NODE_ENV;

    try {
      process.env.FOOTPRINT_DB_PATH = footprintTestDbPath;
      const fpDb = openFootprintDb();
      fpDb.close();

      delete process.env.FOOTPRINT_DB_PATH;
      process.env.NODE_ENV = "test";
      const fpDb2 = openFootprintDb();
      fpDb2.close();

      // Production path: NODE_ENV != "test" and no env var → falls through to dbPath
      delete process.env.NODE_ENV;
      const fpDb3 = openFootprintDb();
      fpDb3.close();

      process.env.PIXIU_DB_PATH = pixiuTestDbPath;
      const pxDb = openPixiuDb();
      pxDb.close();

      delete process.env.PIXIU_DB_PATH;
      const pxDb2 = openPixiuDb();
      pxDb2.close();

      // Production path: NODE_ENV != "test" and no env var → falls through to dbPath
      const pxDb3 = openPixiuDb();
      pxDb3.close();
    } finally {
      if (originalFp === undefined) delete process.env.FOOTPRINT_DB_PATH;
      else process.env.FOOTPRINT_DB_PATH = originalFp;
      if (originalPx === undefined) delete process.env.PIXIU_DB_PATH;
      else process.env.PIXIU_DB_PATH = originalPx;
      if (originalNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNode;
      rmSync(footprintTestDbPath, { force: true });
      rmSync(pixiuTestDbPath, { force: true });
      rmSync("db/footprint.sqlite", { force: true });
      rmSync("db/pixiu.sqlite", { force: true });
    }
  });
});

describe("coverage extras: verify/applehealth (no-year branches and CLI)", () => {
  const xmlFile = "db/extras-verify-applehealth.xml";
  const ecgDir = "db/extras-verify-ecg";
  const routesDir = "db/extras-verify-routes";

  beforeEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    rmSync(routesDir, { force: true, recursive: true });
    mkdirSync(ecgDir, { recursive: true });
    mkdirSync(routesDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    rmSync(routesDir, { force: true, recursive: true });
  });

  it("verifies without year filter (counts all) — branches in countXml/readDb*", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="X" startDate="2024-01-01 10:00:00 +0800" endDate="2024-01-01 10:00:01 +0800"/>
<Record type="X" startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation type="C" startDate="2024-02-01 08:00:00 +0800" endDate="2024-02-01 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="W" startDate="2024-03-01 07:00:00 +0800" endDate="2024-03-01 07:30:00 +0800"></Workout>
<ActivitySummary dateComponents="2024-04-01"/>
`
    );
    writeEcgCsv(`${ecgDir}/ecg_2024.csv`, ["记录日期,2024-01-01 09:00:00 +0800"]);
    writeRouteGpx(`${routesDir}/route_2024.gpx`, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);

    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    db.exec(`
      insert into apple_record (type, start_date, end_date, day) values ('t', 'x', 'x', '2024-01-01');
      insert into apple_record (type, start_date, end_date, day) values ('t', 'x', 'x', '2025-01-01');
      insert into apple_correlation (type, start_date, end_date, day) values ('c', 'x', 'x', '2024-02-01');
      insert into apple_workout (workout_type, start_date, end_date, day) values ('w', 'x', 'x', '2024-03-01');
      insert into apple_activity_summary (date_components, day) values ('2024-04-01', '2024-04-01');
      insert into apple_ecg_file (file_path, day) values ('ecg', '2024-01-01');
      insert into apple_workout_route (file_path, day) values ('rt', '2024-01-01');
    `);
    db.close();

    const result = await verifyAppleHealth({
      exportPath: xmlFile,
      ecgDir,
      routesDir,
      dbPath: appleTestDbPath,
    });
    expect(result.ok).toBe(true);
    expect(result.report.year).toBeUndefined();
  });

  it("countXml/countEcgFiles/countRouteFiles handle no-year correctly", async () => {
    writeAppleHealthXml(
      xmlFile,
      `<Record type="X" startDate="2024-01-01 10:00:00 +0800" endDate="2024-01-01 10:00:01 +0800"/>`
    );
    const summary = await countXml(xmlFile);
    expect(summary.records).toBe(1);

    writeEcgCsv(`${ecgDir}/ecg_x.csv`, ["记录日期,2024"]);
    writeRouteGpx(`${routesDir}/r_x.gpx`, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const ecg = await countEcgFiles(ecgDir);
    const routes = await countRouteFiles(routesDir);
    expect(ecg).toBe(1);
    expect(routes).toBe(1);
  });

  it("readDbCounts/readDbFiles handle no-year branch", () => {
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    db.exec(
      "insert into apple_record (type, start_date, end_date, day) values ('t', 'x', 'x', '2024-01-01');"
    );
    db.exec(`insert into apple_ecg_file (file_path, day) values ('a', '2024-01-01');`);
    db.exec(`insert into apple_workout_route (file_path, day) values ('a', '2024-01-01');`);
    const counts = readDbCounts(db);
    const files = readDbFiles(db);
    expect(counts.records).toBe(1);
    expect(files.ecg).toBe(1);
    db.close();
  });

  it("runCli prints JSON output and 'all' year label in text", async () => {
    writeAppleHealthXml(
      xmlFile,
      `<Record type="X" startDate="2024-01-01 10:00:00 +0800" endDate="2024-01-01 10:00:01 +0800"/>`
    );
    writeEcgCsv(`${ecgDir}/ecg.csv`, ["记录日期,2024-01-01 09:00:00 +0800"]);
    writeRouteGpx(`${routesDir}/r.gpx`, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    db.exec(
      "insert into apple_record (type, start_date, end_date, day) values ('t', 'x', 'x', '2024-01-01');"
    );
    db.exec(`insert into apple_ecg_file (file_path, day) values ('a', '2024-01-01');`);
    db.exec(`insert into apple_workout_route (file_path, day) values ('a', '2024-01-01');`);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    };

    // No-year run uses default paths which don't exist → throws.
    await expect(runAppleCli([], io)).rejects.toThrow();
    logs.length = 0;
    errors.length = 0;

    // No-year run with explicit args prints "year: all" in text mode.
    const r1 = await runAppleCli(["", xmlFile, ecgDir, routesDir], io);
    expect(r1.exitCode).toBe(0);
    expect(logs.some((l) => l.includes("year: all"))).toBe(true);

    logs.length = 0;
    errors.length = 0;

    // With explicit args + --json
    const r2 = await runAppleCli(["", xmlFile, ecgDir, routesDir, "--json"], io);
    expect(r2.exitCode).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.ok).toBe(true);
  });
});

describe("coverage extras: verify/footprint", () => {
  const gpxFile = "db/extras-verify-footprint.gpx";

  beforeEach(() => {
    rmSync(footprintTestDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });
  afterEach(() => {
    rmSync(footprintTestDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("parseGpxSummary skips invalid timestamps, missing time tags, and other years", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><ele>10</ele></trkpt>',
      '<trkpt lat="1" lon="2"><time>not-a-date</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2023-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-12-31T23:59:59Z</time></trkpt>',
    ]);
    const summary = await parseGpxSummary(gpxFile, 2024);
    expect(summary.total).toBe(2);
    expect(summary.minTs).toBe("2024-01-01T00:00:00Z");
    expect(summary.maxTs).toBe("2024-12-31T23:59:59Z");
  });

  it("verifies success and reports day diffs > 10 via runCli", async () => {
    const trkpts = Array.from({ length: 12 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `<trkpt lat="1" lon="2"><time>2024-01-${day}T00:00:00Z</time></trkpt>`;
    });
    writeGpx(gpxFile, trkpts);

    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.exec(
      `insert into track_point (source, track_date, ts, lat, lon) values ('footprint', '2024-01-01', '2024-01-01T00:00:00Z', 1, 2);`
    );
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
    const result = await runFootprintCli(["2024", gpxFile], io);
    expect(result.exitCode).toBe(1);
    expect(logs.some((l) => l.includes("...and 1 more"))).toBe(true);

    // bad year arg → usage
    const r2 = await runFootprintCli(["bad"], io);
    expect(r2.exitCode).toBe(1);

    // --json path
    logs.length = 0;
    const r3 = await runFootprintCli(["2024", gpxFile, "--json"], io);
    expect(r3.exitCode).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.ok).toBe(false);
  });

  it("verifyFootprint detects min/max ts mismatch", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.exec(
      `insert into track_point (source, track_date, ts, lat, lon) values ('footprint', '2024-01-02', '2024-01-02T00:00:00Z', 1, 2);`
    );
    db.close();
    const result = await verifyFootprint({ year: 2024, gpxPath: gpxFile, dbPath: footprintTestDbPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("min ts"))).toBe(true);
    expect(result.errors.some((e) => e.includes("max ts"))).toBe(true);
  });

  it("compareDayCounts handles disjoint days", () => {
    const a = new Map([["2024-01-01", 5]]);
    const b = new Map([["2024-01-02", 3]]);
    const diffs = compareDayCounts(a, b);
    expect(diffs).toEqual([
      { day: "2024-01-01", gpx: 5, db: 0 },
      { day: "2024-01-02", gpx: 0, db: 3 },
    ]);
  });

  it("readDbSummary returns nulls when db is empty", () => {
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.close();
    const summary = readFootprintDbSummary(2024, footprintTestDbPath);
    expect(summary.total).toBe(0);
    expect(summary.minTs).toBeNull();
    expect(summary.maxTs).toBeNull();
  });
});

describe("coverage extras: verify/pixiu", () => {
  const csvFile = "db/extras-verify-pixiu.csv";

  beforeEach(() => {
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });
  afterEach(() => {
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  it("parseCsvSummary handles non-finite cells and missing columns", async () => {
    // Single row with non-numeric inflow and missing outflow column position.
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,not-a-num,blank,人民币,现金,,",
    ]);
    const summary = await parseCsvSummary(csvFile, 2024);
    expect(summary.total).toBe(1);
    expect(summary.income).toBe(0);
    expect(summary.expense).toBe(0);
  });

  it("readDbSummary handles null totals", () => {
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    db.close();
    const s = readPixiuDbSummary(2024, pixiuTestDbPath);
    expect(s.total).toBe(0);
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
  });

  it("runCli text-mode success", async () => {
    writePixiuCsv(csvFile, ["2024-01-01,日常收入,工资,100,0,人民币,现金,,"]);
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    db.exec(
      `insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, year)
       values ('pixiu', '2024-01-01', '日常收入', '工资', 100, 0, '人民币', '现金', 2024);
       insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
       values ('pixiu', '2024-01-01', 100, 0, 100, 1);`
    );
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
    const r = await runPixiuCli(["2024", csvFile], io);
    expect(r.exitCode).toBe(0);
    expect(logs.some((l) => l.includes("✅ Verify OK"))).toBe(true);
  });

  it("verifyPixiu reports day diffs error", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,",
    ]);
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    db.exec(
      `insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, year)
       values ('pixiu', '2024-01-01', '日常收入', '工资', 100, 0, '人民币', '现金', 2024),
              ('pixiu', '2024-01-02', '日常支出', '超市', 0, 20, '人民币', '现金', 2024);
       insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
       values ('pixiu', '2024-01-01', 100, 0, 100, 1),
              ('pixiu', '2024-01-02', 0, 25, -25, 1);`
    );
    db.close();
    const result = await verifyPixiu({ year: 2024, csvPath: csvFile, dbPath: pixiuTestDbPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("day totals mismatch"))).toBe(true);
  });
});

describe("coverage extras: more branch holes", () => {
  const xmlFile = "db/extras-more.xml";
  const csvFile = "db/extras-more-pixiu.csv";
  const gpxFile = "db/extras-more-footprint.gpx";

  beforeEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(footprintTestDbPath, { force: true });
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(csvFile, { force: true });
    rmSync(gpxFile, { force: true });
  });
  afterEach(() => {
    rmSync(appleTestDbPath, { force: true });
    rmSync(footprintTestDbPath, { force: true });
    rmSync(pixiuTestDbPath, { force: true });
    rmSync(xmlFile, { force: true });
    rmSync(csvFile, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("loadXml: handles workout/correlation tag where attrs are absent (?? '' branches)", async () => {
    // Records and workouts without optional attributes — exercises the `?? ""` and `?? null` "right side" branches.
    // Also a Workout where `startDate` is missing → extractDay returns "" → skipped via withinYear (since year set).
    writeAppleHealthXml(
      xmlFile,
      `
<Record startDate="2025-01-01 10:00:00 +0800" endDate="2025-01-01 10:00:01 +0800"/>
<Correlation startDate="2025-01-02 08:00:00 +0800" endDate="2025-01-02 08:00:01 +0800"></Correlation>
<Workout startDate="2025-01-03 07:00:00 +0800" endDate="2025-01-03 07:30:00 +0800"></Workout>
<Workout endDate="2025-01-04 07:00:00 +0800"></Workout>
<ActivitySummary/>
`
    );
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const summary = await loadXml(db, 2025, xmlFile);
    expect(summary.records).toBe(1);
    expect(summary.correlations).toBe(1);
    expect(summary.workouts).toBe(1); // The one without startDate is skipped by withinYear.
    expect(summary.activities).toBe(0);
    db.close();
  });

  it("loadCsv: empty file (lines.length===0) and default args throw", async () => {
    // Empty CSV file → parseCsv returns empty header and rows → no inserts.
    writeFileSync(csvFile, "", "utf-8");
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    const count = await loadCsv(db, 2025, csvFile, "pixiu");
    expect(count).toBe(0);
    db.close();
  });

  it("loadCsv: row missing column index returns '' fallback", async () => {
    // CSV header has the standard 9 columns; a row with too few columns exercises (row[idx] ?? "").trim()
    // with row[idx] === undefined.
    writeFileSync(
      csvFile,
      "日期,交易分类,交易类型,流入金额,流出金额,币种,资金账户,标签,备注\n2025-01-01,日常收入,工资",
      "utf-8"
    );
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    const count = await loadCsv(db, 2025, csvFile, "pixiu");
    expect(count).toBe(1);
    db.close();
  });

  it("loadCsv with default csvPath/source args throws CSV not found", async () => {
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    await expect(loadCsv(db, 2099)).rejects.toThrow("CSV file not found");
    db.close();
  });

  it("verify/pixiu parseCsvSummary handles empty csv and missing columns", async () => {
    writeFileSync(csvFile, "", "utf-8");
    const empty = await parseCsvSummary(csvFile, 2025);
    expect(empty.total).toBe(0);
    expect(empty.dayTotals.size).toBe(0);

    // CSV with header missing columns referenced by get(): "日期" not in header → idx undefined branch.
    writeFileSync(
      csvFile,
      "x,y,z\nfoo,bar,baz",
      "utf-8"
    );
    const summary = await parseCsvSummary(csvFile, 2025);
    expect(summary.total).toBe(0);
  });

  it("verify/pixiu runCli with default io (no io passed) and bad args", async () => {
    // No io → uses default { log: console.log, error: console.error } (line 184 default branch).
    // Bad year → usage path.
    const r = await runPixiuCli(["bad"]);
    expect(r.exitCode).toBe(1);
  });

  it("verify/footprint runCli with default io", async () => {
    const r = await runFootprintCli(["bad"]);
    expect(r.exitCode).toBe(1);
  });

  it("verify/applehealth runCli with default io and bad year", async () => {
    const r = await runAppleCli(["bad"]);
    expect(r.exitCode).toBe(1);
  });

  it("verify/applehealth: extractDay handles undefined (records w/o startDate)", async () => {
    // ActivitySummary already exercises the ?? "" branch via line 104. Now hit countXml with
    // a Record element missing startDate.
    writeAppleHealthXml(
      xmlFile,
      `<Record type="X" endDate="2024-01-01 00:00:00 +0800"/>`
    );
    const summary = await countXml(xmlFile, 2024);
    // Record without startDate has day "" → withinYear false → skipped.
    expect(summary.records).toBe(0);
  });

  it("verify/applehealth: verifyAppleHealth with no paths uses defaults (throws)", async () => {
    await expect(verifyAppleHealth({})).rejects.toThrow();
  });

  it("verify/footprint: parseGpxSummary trkpt without time tag is skipped", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><ele>10</ele></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const summary = await parseGpxSummary(gpxFile, 2024);
    expect(summary.total).toBe(1);
  });

  it("verify/footprint: verifyFootprint with default gpxPath throws", async () => {
    await expect(verifyFootprint({ year: 2099 })).rejects.toThrow();
  });

  it("loadGpx: trkpt block without attrs (lat/lon NaN) is skipped", async () => {
    writeGpx(gpxFile, [
      "<trkpt><time>2025-01-01T00:00:00Z</time></trkpt>",
    ]);
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    const count = await loadGpx(db, 2025, gpxFile, "footprint");
    expect(count).toBe(0);
    db.close();
  });

  it("loadEcg: with year arg filters out files for other years", async () => {
    const dir = "db/extras-more-ecg";
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir, { recursive: true });
    writeEcgCsv(`${dir}/a.csv`, ["记录日期,2024-01-01 09:00:00 +0800", "1.0"]);
    writeEcgCsv(`${dir}/b.csv`, ["记录日期,2025-01-01 09:00:00 +0800", "2.0"]);
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const count = await loadEcg(db, 2025, dir);
    expect(count).toBe(1);
    db.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it("loadRoutes: with year filters out other years' files", async () => {
    const dir = "db/extras-more-routes";
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir, { recursive: true });
    writeRouteGpx(`${dir}/a.gpx`, ['<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>']);
    writeRouteGpx(`${dir}/b.gpx`, ['<trkpt lat="1" lon="2"><time>2025-01-01T00:00:00Z</time></trkpt>']);
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const count = await loadRoutes(db, 2025, dir);
    expect(count).toBe(1);
    db.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it("loadXml without year: insert correlation/workout/record without startDate (?? '' branch)", async () => {
    // year=undefined → withinYear always true. Records/correlations/workouts without startDate get day="",
    // but still insert, exercising `startDate ?? ""` and `attrs.get("endDate") ?? ""` branches.
    writeAppleHealthXml(
      xmlFile,
      `
<Record type="X"/>
<Correlation type="C"></Correlation>
<Workout workoutActivityType="W"></Workout>
`
    );
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    const summary = await loadXml(db, undefined, xmlFile);
    expect(summary.records).toBe(1);
    expect(summary.correlations).toBe(1);
    expect(summary.workouts).toBe(1);
    const rec = db.query("select start_date, end_date, day, timezone from apple_record").get() as {
      start_date: string; end_date: string; day: string; timezone: string | null;
    };
    expect(rec.start_date).toBe("");
    expect(rec.end_date).toBe("");
    expect(rec.timezone).toBeNull();
    db.close();
  });

  it("verify/applehealth: countXml correlations and workouts skipped via withinYear", async () => {
    // Hit the false branches in countXml's loops for Correlation and Workout (lines 87, 97).
    writeAppleHealthXml(
      xmlFile,
      `
<Correlation type="C" startDate="2023-01-01 08:00:00 +0800" endDate="2023-01-01 08:00:01 +0800"></Correlation>
<Workout workoutActivityType="W" startDate="2023-01-01 07:00:00 +0800" endDate="2023-01-01 07:30:00 +0800"></Workout>
`
    );
    const summary = await countXml(xmlFile, 2024);
    expect(summary.correlations).toBe(0);
    expect(summary.workouts).toBe(0);
  });

  it("loadXml: workout stats without unit/type attrs (?? null/?? '' branches)", async () => {
    writeAppleHealthXml(
      xmlFile,
      `
<Workout workoutActivityType="W" startDate="2025-06-01 07:00:00 +0800" endDate="2025-06-01 07:30:00 +0800">
  <WorkoutStatistics sum="42"/>
</Workout>
`
    );
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    await loadXml(db, 2025, xmlFile);
    const stat = db.query("select type, unit from apple_workout_stat").get() as {
      type: string;
      unit: string | null;
    };
    expect(stat.type).toBe("");
    expect(stat.unit).toBeNull();
    db.close();
  });

  it("loadXml: ActivitySummary without dateComponents (?? '' branch on insert)", async () => {
    // No year filter so withinYear is always true.
    writeAppleHealthXml(xmlFile, `<ActivitySummary activeEnergyBurned="100"/>`);
    const db = openAppleDb(appleTestDbPath);
    createAppleSchema(db);
    await loadXml(db, undefined, xmlFile);
    const row = db.query("select date_components, active_energy from apple_activity_summary").get() as {
      date_components: string;
      active_energy: number;
    };
    expect(row.date_components).toBe("");
    expect(row.active_energy).toBe(100);
    db.close();
  });

  it("verify/applehealth: countXml ActivitySummary without dateComponents, year filter skips", async () => {
    writeAppleHealthXml(xmlFile, `<ActivitySummary activeEnergyBurned="100"/>`);
    const summary = await countXml(xmlFile, 2024);
    expect(summary.activities).toBe(0);
  });

  it("verify/footprint: parseGpxSummary records exactly one trkpt (minTs/maxTs first-set branches)", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-15T12:00:00Z</time></trkpt>',
    ]);
    const s = await parseGpxSummary(gpxFile, 2024);
    expect(s.total).toBe(1);
    expect(s.minTs).toBe("2024-01-15T12:00:00Z");
    expect(s.maxTs).toBe("2024-01-15T12:00:00Z");
  });

  it("verify/footprint: verifyFootprint detects ts when both null vs set (one side asymmetric)", async () => {
    // GPX has data, DB is empty → gpxSummary.minTs is set, dbSummary.minTs is null → mismatch.
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.close();
    const r = await verifyFootprint({ year: 2024, gpxPath: gpxFile, dbPath: footprintTestDbPath });
    expect(r.ok).toBe(false);
  });

  it("verify/footprint: runCli json with year only", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.exec(`insert into track_point (source, track_date, ts, lat, lon) values ('footprint', '2024-01-01', '2024-01-01T00:00:00Z', 1, 2);`);
    db.close();
    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
    // gpxPath not provided (uses default which doesn't exist) → throws
    await expect(runFootprintCli(["2024", "--json"], io)).rejects.toThrow();
  });

  it("verify/pixiu: runCli with default csvPath (--json arg in slot 1) throws", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
    await expect(runPixiuCli(["2099", "--json"], io)).rejects.toThrow();
  });

  it("verify/footprint: parseGpxSummary handles out-of-order timestamps (iso<minTs/iso<maxTs branch)", async () => {
    // Timestamps not monotonic so the if-skipped branch (when current iso doesn't extend the range) is hit.
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-06-15T12:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-06-15T11:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-06-15T13:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-06-15T12:30:00Z</time></trkpt>',
    ]);
    const s = await parseGpxSummary(gpxFile, 2024);
    expect(s.total).toBe(4);
    expect(s.minTs).toBe("2024-06-15T11:00:00Z");
    expect(s.maxTs).toBe("2024-06-15T13:00:00Z");
  });

  it("verify/footprint: verifyFootprint passing case with no day diffs", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
    ]);
    const db = openFootprintDb(footprintTestDbPath);
    createFootprintSchema(db);
    db.exec(`insert into track_point (source, track_date, ts, lat, lon) values ('footprint', '2024-01-01', '2024-01-01T00:00:00Z', 1, 2);`);
    db.close();
    const r = await verifyFootprint({ year: 2024, gpxPath: gpxFile, dbPath: footprintTestDbPath });
    expect(r.ok).toBe(true);
  });

  it("verify/pixiu: runCli text-mode failure (mismatch)", async () => {
    writeFileSync(
      csvFile,
      "日期,交易分类,交易类型,流入金额,流出金额,币种,资金账户,标签,备注\n2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "utf-8"
    );
    const db = openPixiuDb(pixiuTestDbPath);
    createPixiuSchema(db);
    db.close();
    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
    const r = await runPixiuCli(["2024", csvFile], io);
    expect(r.exitCode).toBe(1);
    expect(errors.some((e) => e.includes("Verify failed"))).toBe(true);
  });
});
