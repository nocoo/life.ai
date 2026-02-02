import { Database } from "bun:sqlite";

export const dbPath = "db/footprint.sqlite";
export const testDbPath = "db/footprint.test.sqlite";
export const sourceName = "footprint";

const resolveDbPath = () => {
  if (process.env.FOOTPRINT_DB_PATH) return process.env.FOOTPRINT_DB_PATH;
  if (process.env.NODE_ENV === "test") return testDbPath;
  return dbPath;
};

export const openDb = (path: string = resolveDbPath()) => new Database(path);
