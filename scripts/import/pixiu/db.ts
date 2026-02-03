import { Database } from "bun:sqlite";

export const dbPath = "db/pixiu.sqlite";
export const testDbPath = "db/pixiu.test.sqlite";
export const sourceName = "pixiu";

const resolveDbPath = () => {
  if (process.env.PIXIU_DB_PATH) return process.env.PIXIU_DB_PATH;
  if (process.env.NODE_ENV === "test") return testDbPath;
  return dbPath;
};

export const openDb = (path: string = resolveDbPath()) => new Database(path);
