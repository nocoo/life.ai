import { Database } from "bun:sqlite";
import path from "path";

/** Database paths */
export const DB_PATHS = {
  applehealth: path.resolve(process.cwd(), "../db/applehealth.sqlite"),
  footprint: path.resolve(process.cwd(), "../db/footprint.sqlite"),
  pixiu: path.resolve(process.cwd(), "../db/pixiu.sqlite"),
};

/** Get database path with environment override */
export const getDbPath = (
  name: "applehealth" | "footprint" | "pixiu"
): string => {
  const envKey = `${name.toUpperCase()}_DB_PATH`;
  return process.env[envKey] || DB_PATHS[name];
};

/** Open a readonly database connection */
export const openDb = (
  name: "applehealth" | "footprint" | "pixiu"
): Database => {
  const dbPath = getDbPath(name);
  return new Database(dbPath, { readonly: true });
};

/** Open a database by path */
export const openDbByPath = (dbPath: string, readonly = true): Database => {
  return new Database(dbPath, { readonly });
};
