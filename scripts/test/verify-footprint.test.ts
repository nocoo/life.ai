import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { openDb, testDbPath } from "../import/footprint/db";
import {
  compareDayCounts,
  parseGpxSummary,
  readDbSummary,
  runCli,
  verifyFootprint
} from "../verify/footprint";
import { writeGpx } from "./footprint-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table track_point (
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
  `);
};

const seedDb = (db: ReturnType<typeof openDb>, rows: Array<{ ts: string }>) => {
  const insert = db.prepare(
    `insert into track_point
      (source, track_date, ts, lat, lon, ele, speed, course)
     values (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(
      "footprint",
      row.ts.slice(0, 10),
      row.ts,
      1,
      2,
      null,
      null,
      null
    );
  }
};

describe("verify footprint", () => {
  const gpxFile = "db/test-verify.gpx";

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("passes when gpx and db match", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-01T01:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-02T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { ts: "2024-01-01T00:00:00Z" },
      { ts: "2024-01-01T01:00:00Z" },
      { ts: "2024-01-02T00:00:00Z" }
    ]);
    db.close();

    const result = await verifyFootprint({
      year: 2024,
      gpxPath: gpxFile,
      dbPath: testDbPath
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.report.gpx.total).toBe(3);
    expect(result.report.db.total).toBe(3);
  });

  it("reports mismatched day counts", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-02T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { ts: "2024-01-01T00:00:00Z" },
      { ts: "2024-01-01T01:00:00Z" }
    ]);
    db.close();

    const result = await verifyFootprint({
      year: 2024,
      gpxPath: gpxFile,
      dbPath: testDbPath
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("day counts mismatch"))).toBe(
      true
    );
    expect(result.report.dayDiffs).toHaveLength(2);
  });

  it("summarizes gpx data for a year", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2023-01-01T00:00:00Z</time></trkpt>'
    ]);

    const summary = await parseGpxSummary(gpxFile, 2024);
    expect(summary.total).toBe(1);
    expect(summary.minTs).toBe("2024-01-01T00:00:00Z");
    expect(summary.maxTs).toBe("2024-01-01T00:00:00Z");
    expect(summary.dayCounts.get("2024-01-01")).toBe(1);
  });

  it("summarizes db data for a year", () => {
    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { ts: "2024-01-01T00:00:00Z" },
      { ts: "2024-01-02T00:00:00Z" }
    ]);
    db.close();

    const summary = readDbSummary(2024, testDbPath);
    expect(summary.total).toBe(2);
    expect(summary.minTs).toBe("2024-01-01T00:00:00Z");
    expect(summary.maxTs).toBe("2024-01-02T00:00:00Z");
    expect(summary.dayCounts.get("2024-01-02")).toBe(1);
  });

  it("compares day counts", () => {
    const gpxCounts = new Map([
      ["2024-01-01", 2],
      ["2024-01-02", 1]
    ]);
    const dbCounts = new Map([
      ["2024-01-01", 1],
      ["2024-01-03", 1]
    ]);

    const diffs = compareDayCounts(gpxCounts, dbCounts);
    expect(diffs).toEqual([
      { day: "2024-01-01", gpx: 2, db: 1 },
      { day: "2024-01-02", gpx: 1, db: 0 },
      { day: "2024-01-03", gpx: 0, db: 1 }
    ]);
  });

  it("returns usage on invalid args", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const result = await runCli([], io);
    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(logs[0]).toContain("Usage:");
    expect(errors).toHaveLength(0);
  });

  it("throws when gpx is missing", async () => {
    await expect(parseGpxSummary("db/missing.gpx", 2024)).rejects.toThrow(
      "GPX file not found"
    );
  });

  it("reports mismatched totals and ranges", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ ts: "2024-01-02T00:00:00Z" }]);
    db.close();

    const result = await verifyFootprint({
      year: 2024,
      gpxPath: gpxFile,
      dbPath: testDbPath
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("min ts mismatch"))).toBe(
      true
    );
    expect(result.errors.some((err) => err.includes("max ts mismatch"))).toBe(
      true
    );
  });

  it("reports mismatched totals", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2024-01-01T01:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ ts: "2024-01-01T00:00:00Z" }]);
    db.close();

    const result = await verifyFootprint({
      year: 2024,
      gpxPath: gpxFile,
      dbPath: testDbPath
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("count mismatch"))).toBe(
      true
    );
  });

  it("prints json output when requested", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ ts: "2024-01-01T00:00:00Z" }]);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const result = await runCli(["2024", gpxFile, "--json"], io);
    expect(result.exitCode).toBe(0);
    expect(errors).toHaveLength(0);
    expect(logs).toHaveLength(1);
    const payload = JSON.parse(logs[0]) as { ok: boolean; year: number };
    expect(payload.ok).toBe(true);
    expect(payload.year).toBe(2024);
  });

  it("prints text output for ok result", async () => {
    writeGpx(gpxFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ ts: "2024-01-01T00:00:00Z" }]);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const prevPath = process.env.FOOTPRINT_DB_PATH;
    process.env.FOOTPRINT_DB_PATH = testDbPath;
    try {
      const result = await runCli(["2024", gpxFile], io);
      expect(result.exitCode).toBe(0);
    } finally {
      if (prevPath === undefined) {
        delete process.env.FOOTPRINT_DB_PATH;
      } else {
        process.env.FOOTPRINT_DB_PATH = prevPath;
      }
    }

    expect(errors).toHaveLength(0);
    expect(logs[0]).toBe("✅ Verify OK");
    expect(logs.some((line) => line.includes("count: gpx=1 db=1"))).toBe(true);
  });

  it("prints day diffs with overflow", async () => {
    const points: string[] = [];
    for (let i = 1; i <= 12; i += 1) {
      const day = String(i).padStart(2, "0");
      points.push(
        `<trkpt lat="1" lon="2"><time>2024-01-${day}T00:00:00Z</time></trkpt>`
      );
    }
    writeGpx(gpxFile, points);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, []);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const prevPath = process.env.FOOTPRINT_DB_PATH;
    process.env.FOOTPRINT_DB_PATH = testDbPath;
    try {
      const result = await runCli(["2024", gpxFile], io);
      expect(result.exitCode).toBe(1);
    } finally {
      if (prevPath === undefined) {
        delete process.env.FOOTPRINT_DB_PATH;
      } else {
        process.env.FOOTPRINT_DB_PATH = prevPath;
      }
    }

    expect(errors[0]).toBe("❌ Verify failed:");
    expect(logs.some((line) => line.startsWith("- 2024-01-"))).toBe(true);
    expect(logs.some((line) => line.includes("...and 2 more"))).toBe(true);
  });
});
