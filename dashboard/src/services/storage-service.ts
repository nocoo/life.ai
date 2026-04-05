import fs from "fs";
import path from "path";
import { DB_PATHS, openDbByPath } from "@/lib/db";

export interface TableStats {
  name: string;
  rowCount: number;
}

export interface DatabaseStats {
  name: string;
  displayName: string;
  sizeBytes: number;
  sizeMB: string;
  tables: TableStats[];
  totalRows: number;
}

export interface StorageOverview {
  totalSizeBytes: number;
  totalSizeMB: string;
  databaseCount: number;
  totalRecords: number;
  gpxFileCount: number;
  gpxSizeBytes: number;
  gpxSizeMB: string;
}

export interface StorageStats {
  overview: StorageOverview;
  databases: DatabaseStats[];
}

const DB_DISPLAY_NAMES: Record<string, string> = {
  applehealth: "Apple Health",
  footprint: "Footprint",
  pixiu: "Pixiu",
};

/** Get all user tables from a SQLite database */
function getTableNames(dbPath: string): string[] {
  const db = openDbByPath(dbPath);
  try {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[];
    return tables.map((t) => t.name);
  } finally {
    db.close();
  }
}

/** Get row count for a specific table */
function getTableRowCount(dbPath: string, tableName: string): number {
  const db = openDbByPath(dbPath);
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
      count: number;
    };
    return result.count;
  } finally {
    db.close();
  }
}

/** Get file size in bytes */
function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/** Format bytes to MB string */
function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Count GPX files and their total size */
function getGpxStats(): { count: number; sizeBytes: number } {
  const gpxDir = path.resolve(process.cwd(), "../data/apple-health/workout-routes");
  let count = 0;
  let sizeBytes = 0;

  try {
    if (fs.existsSync(gpxDir)) {
      const files = fs.readdirSync(gpxDir);
      for (const file of files) {
        if (file.endsWith(".gpx")) {
          count++;
          const filePath = path.join(gpxDir, file);
          sizeBytes += getFileSize(filePath);
        }
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return { count, sizeBytes };
}

export class StorageService {
  getStorageStats(): StorageStats {
    const databases: DatabaseStats[] = [];
    let totalSizeBytes = 0;
    let totalRecords = 0;

    // Process each database
    for (const [name, dbPath] of Object.entries(DB_PATHS)) {
      const sizeBytes = getFileSize(dbPath);
      totalSizeBytes += sizeBytes;

      const tableNames = getTableNames(dbPath);
      const tables: TableStats[] = [];
      let dbTotalRows = 0;

      for (const tableName of tableNames) {
        const rowCount = getTableRowCount(dbPath, tableName);
        tables.push({ name: tableName, rowCount });
        dbTotalRows += rowCount;
      }

      totalRecords += dbTotalRows;

      databases.push({
        name,
        displayName: DB_DISPLAY_NAMES[name] || name,
        sizeBytes,
        sizeMB: formatMB(sizeBytes),
        tables,
        totalRows: dbTotalRows,
      });
    }

    // Get GPX file stats
    const gpxStats = getGpxStats();
    totalSizeBytes += gpxStats.sizeBytes;

    const overview: StorageOverview = {
      totalSizeBytes,
      totalSizeMB: formatMB(totalSizeBytes),
      databaseCount: databases.length,
      totalRecords,
      gpxFileCount: gpxStats.count,
      gpxSizeBytes: gpxStats.sizeBytes,
      gpxSizeMB: formatMB(gpxStats.sizeBytes),
    };

    return { overview, databases };
  }
}
