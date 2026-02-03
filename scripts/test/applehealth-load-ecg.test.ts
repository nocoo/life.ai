import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { openDb, testDbPath } from "../import/applehealth/db";
import { loadEcg } from "../import/applehealth/load-ecg";
import { writeEcgCsv } from "./applehealth-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table apple_ecg_file (
      id integer primary key,
      file_path text not null,
      recorded_at text,
      sampling_rate real,
      sample_count integer,
      day text not null
    );
  `);
};

describe("applehealth load ecg", () => {
  const ecgDir = "db/test-ecg";
  const ecgFile = `${ecgDir}/ecg_2025-01-05.csv`;

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
    mkdirSync(ecgDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(ecgDir, { force: true, recursive: true });
  });

  it("loads ecg metadata", async () => {
    writeEcgCsv(ecgFile, [
      "姓名,李征",
      "记录日期,2025-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0",
      "2.0",
      "3.0"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadEcg(db, 2025, ecgDir);
    expect(count).toBe(1);

    const row = db
      .query("select recorded_at, sampling_rate, sample_count, day from apple_ecg_file")
      .get() as {
      recorded_at: string;
      sampling_rate: number;
      sample_count: number;
      day: string;
    };
    expect(row.recorded_at).toBe("2025-01-05 09:54:54 +0800");
    expect(row.sampling_rate).toBe(512);
    expect(row.sample_count).toBe(3);
    expect(row.day).toBe("2025-01-05");

    db.close();
  });

  it("filters by year", async () => {
    writeEcgCsv(ecgFile, [
      "记录日期,2024-01-05 09:54:54 +0800",
      "采样率,512赫兹",
      "",
      "1.0"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadEcg(db, 2025, ecgDir);
    expect(count).toBe(0);
    db.close();
  });

  it("throws when dir missing", async () => {
    const db = openDb(testDbPath);
    createSchema(db);
    await expect(loadEcg(db, 2025, "db/missing-ecg")).rejects.toThrow(
      "ECG dir not found"
    );
    db.close();
  });
});
