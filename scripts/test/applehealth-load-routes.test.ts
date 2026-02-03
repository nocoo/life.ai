import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { openDb, testDbPath } from "../import/applehealth/db";
import { loadRoutes } from "../import/applehealth/load-routes";
import { writeRouteGpx } from "./applehealth-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table apple_workout_route (
      id integer primary key,
      file_path text not null,
      workout_id integer,
      start_time text,
      end_time text,
      point_count integer,
      day text not null
    );
  `);
};

describe("applehealth load routes", () => {
  const routeDir = "db/test-routes";
  const routeFile = `${routeDir}/route_2025-01-05_1.00pm.gpx`;

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(routeDir, { force: true, recursive: true });
    mkdirSync(routeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(routeDir, { force: true, recursive: true });
  });

  it("loads route metadata", async () => {
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:00:00Z</time></trkpt>',
      '<trkpt lat="1" lon="2"><time>2025-01-05T00:01:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadRoutes(db, 2025, routeDir);
    expect(count).toBe(1);

    const row = db
      .query("select start_time, end_time, point_count, day from apple_workout_route")
      .get() as { start_time: string; end_time: string; point_count: number; day: string };
    expect(row.start_time).toBe("2025-01-05T00:00:00Z");
    expect(row.end_time).toBe("2025-01-05T00:01:00Z");
    expect(row.point_count).toBe(2);
    expect(row.day).toBe("2025-01-05");

    db.close();
  });

  it("filters by year", async () => {
    writeRouteGpx(routeFile, [
      '<trkpt lat="1" lon="2"><time>2024-01-05T00:00:00Z</time></trkpt>'
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadRoutes(db, 2025, routeDir);
    expect(count).toBe(0);
    db.close();
  });

  it("throws when dir missing", async () => {
    const db = openDb(testDbPath);
    createSchema(db);
    await expect(loadRoutes(db, 2025, "db/missing-routes")).rejects.toThrow(
      "Routes dir not found"
    );
    db.close();
  });
});
