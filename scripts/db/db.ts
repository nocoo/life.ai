import { Database } from "bun:sqlite";

export const dbPath = "db/footprint.sqlite";
export const sourceName = "footprint";

export const openDb = (path: string = dbPath) => new Database(path);
