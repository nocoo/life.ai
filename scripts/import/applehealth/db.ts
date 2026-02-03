import { Database } from "bun:sqlite";

export const dbPath = "db/applehealth.sqlite";
export const testDbPath = "db/applehealth.test.sqlite";
export const sourceName = "applehealth";

const resolveDbPath = () => {
  if (process.env.APPLEHEALTH_DB_PATH) return process.env.APPLEHEALTH_DB_PATH;
  if (process.env.NODE_ENV === "test") return testDbPath;
  return dbPath;
};

export const openDb = (path: string = resolveDbPath()) => new Database(path);
