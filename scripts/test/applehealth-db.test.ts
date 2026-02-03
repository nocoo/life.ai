import { afterEach, describe, expect, it } from "bun:test";
import { openDb, dbPath, testDbPath } from "../import/applehealth/db";

const resetEnv = (value?: string) => {
  if (value === undefined) {
    delete process.env.APPLEHEALTH_DB_PATH;
  } else {
    process.env.APPLEHEALTH_DB_PATH = value;
  }
};

describe("applehealth db", () => {
  const prevEnv = process.env.APPLEHEALTH_DB_PATH;
  const prevNodeEnv = process.env.NODE_ENV;
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value,
      writable: true,
      configurable: true,
      enumerable: true
    });
  };

  afterEach(() => {
    resetEnv(prevEnv);
    if (prevNodeEnv === undefined) {
      setNodeEnv("");
    } else {
      setNodeEnv(prevNodeEnv);
    }
  });

  it("uses explicit env path", () => {
    process.env.APPLEHEALTH_DB_PATH = "db/custom-applehealth.sqlite";
    const db = openDb();
    expect(db.filename).toBe("db/custom-applehealth.sqlite");
    db.close();
  });

  it("uses test path when NODE_ENV=test", () => {
    resetEnv(undefined);
    setNodeEnv("test");
    const db = openDb();
    expect(db.filename).toBe(testDbPath);
    db.close();
  });

  it("falls back to default path", () => {
    resetEnv(undefined);
    setNodeEnv("");
    const db = openDb();
    expect(db.filename).toBe(dbPath);
    db.close();
  });
});
