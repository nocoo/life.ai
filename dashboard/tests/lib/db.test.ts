import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { DB_PATHS, getDbPath, openDb, openDbByPath } from "@/lib/db";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/db-lib.test.sqlite`;

describe("db.ts", () => {
  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    const db = new Database(TEST_DB_PATH);
    db.exec(`
      create table test_table (
        id integer primary key,
        name text not null
      );
      insert into test_table (name) values ('Alice'), ('Bob');
    `);
    db.close();
  });

  afterAll(() => {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe("DB_PATHS", () => {
    it("should have paths for all databases", () => {
      expect(DB_PATHS.applehealth).toContain("applehealth.sqlite");
      expect(DB_PATHS.footprint).toContain("footprint.sqlite");
      expect(DB_PATHS.pixiu).toContain("pixiu.sqlite");
    });
  });

  describe("getDbPath", () => {
    it("should return default path when env not set", () => {
      const originalEnv = process.env.APPLEHEALTH_DB_PATH;
      delete process.env.APPLEHEALTH_DB_PATH;

      const path = getDbPath("applehealth");
      expect(path).toBe(DB_PATHS.applehealth);

      if (originalEnv) process.env.APPLEHEALTH_DB_PATH = originalEnv;
    });

    it("should return env path when set", () => {
      const originalEnv = process.env.FOOTPRINT_DB_PATH;
      process.env.FOOTPRINT_DB_PATH = "/custom/path/footprint.db";

      const path = getDbPath("footprint");
      expect(path).toBe("/custom/path/footprint.db");

      if (originalEnv) {
        process.env.FOOTPRINT_DB_PATH = originalEnv;
      } else {
        delete process.env.FOOTPRINT_DB_PATH;
      }
    });
  });

  describe("openDb", () => {
    it("should open database by name using env path", () => {
      process.env.APPLEHEALTH_DB_PATH = TEST_DB_PATH;

      const db = openDb("applehealth");
      const result = db.prepare("SELECT name FROM test_table").all();
      expect(result).toHaveLength(2);
      db.close();

      delete process.env.APPLEHEALTH_DB_PATH;
    });
  });

  describe("openDbByPath", () => {
    it("should open database and execute queries", () => {
      const db = openDbByPath(TEST_DB_PATH);

      const allRows = db.prepare("SELECT * FROM test_table").all();
      expect(allRows).toHaveLength(2);

      const row = db.prepare("SELECT name FROM test_table WHERE id = ?").get(1);
      expect(row).toEqual({ name: "Alice" });

      db.close();
    });

    it("should return null for non-existent row", () => {
      const db = openDbByPath(TEST_DB_PATH);

      const row = db.prepare("SELECT name FROM test_table WHERE id = ?").get(999);
      expect(row).toBeNull();

      db.close();
    });

    it("should throw error for non-existent database", () => {
      expect(() => openDbByPath("/nonexistent/path/db.sqlite")).toThrow();
    });
  });
});
