import { getDbPath, openDbByPath } from "@/lib/db";

/** Raw transaction from pixiu_transaction table */
export interface PixiuTransactionRow {
  id: number;
  source: string;
  tx_date: string;
  category_l1: string;
  category_l2: string;
  inflow: number;
  outflow: number;
  currency: string;
  account: string;
  tags: string | null;
  note: string | null;
  year: number;
}

/** Raw day aggregation from pixiu_day_agg table */
export interface PixiuDayAggRow {
  source: string;
  day: string;
  income: number;
  expense: number;
  net: number;
  tx_count: number;
}

/** Raw data response for a day */
export interface PixiuRawData {
  date: string;
  transactions: PixiuTransactionRow[];
  dayAgg: PixiuDayAggRow | null;
}

/** Service for querying Pixiu data from SQLite */
export class PixiuService {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDbPath("pixiu");
  }

  /** Get all raw data for a specific date */
  getDayData(date: string): PixiuRawData {
    const db = openDbByPath(this.dbPath);
    try {
      // tx_date format is "YYYY-MM-DD HH:mm", so we need to use LIKE
      const transactions = db
        .prepare(
          `SELECT id, source, tx_date, category_l1, category_l2, 
                  inflow, outflow, currency, account, tags, note, year
           FROM pixiu_transaction 
           WHERE source = 'pixiu' AND tx_date LIKE ? 
           ORDER BY tx_date`
        )
        .all(`${date}%`) as PixiuTransactionRow[];

      const dayAgg = db
        .prepare(
          `SELECT source, day, income, expense, net, tx_count
           FROM pixiu_day_agg 
           WHERE source = 'pixiu' AND day = ?`
        )
        .get(date) as PixiuDayAggRow | undefined;

      return {
        date,
        transactions,
        dayAgg: dayAgg ?? null,
      };
    } finally {
      db.close();
    }
  }
}
