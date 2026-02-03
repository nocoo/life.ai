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

/** Check if running in Bun runtime */
const isBun = typeof globalThis.Bun !== "undefined";

/** Database wrapper interface */
export interface DbWrapper {
  prepare(sql: string): StatementWrapper;
  close(): void;
}

/** Statement wrapper interface */
export interface StatementWrapper {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown | undefined;
}

/** Open a readonly database connection */
export const openDb = (
  name: "applehealth" | "footprint" | "pixiu"
): DbWrapper => {
  const dbPath = getDbPath(name);
  return openDbByPath(dbPath);
};

/** Open a database by path */
export const openDbByPath = (dbPath: string, readonly = true): DbWrapper => {
  if (isBun) {
    // Use bun:sqlite
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath, { readonly });
    return {
      prepare(sql: string): StatementWrapper {
        const stmt = db.query(sql);
        return {
          all(...params: unknown[]) {
            return stmt.all(...params);
          },
          get(...params: unknown[]) {
            return stmt.get(...params);
          },
        };
      },
      close() {
        db.close();
      },
    };
  } else {
    // Use better-sqlite3 for Node.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly });
    return {
      prepare(sql: string): StatementWrapper {
        const stmt = db.prepare(sql);
        return {
          all(...params: unknown[]) {
            return stmt.all(...params);
          },
          get(...params: unknown[]) {
            return stmt.get(...params);
          },
        };
      },
      close() {
        db.close();
      },
    };
  }
};
