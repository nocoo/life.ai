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

/** Raw month aggregation from pixiu_month_agg table */
export interface PixiuMonthAggRow {
  source: string;
  month: string;
  income: number;
  expense: number;
  net: number;
  tx_count: number;
}

/** Raw year aggregation from pixiu_year_agg table */
export interface PixiuYearAggRow {
  source: string;
  year: number;
  income: number;
  expense: number;
  net: number;
  tx_count: number;
}

/** Raw data response for a month */
export interface PixiuMonthRawData {
  month: string; // YYYY-MM
  transactions: PixiuTransactionRow[];
  dayAggs: PixiuDayAggRow[];
  monthAgg: PixiuMonthAggRow | null;
}

/** Raw data response for a year */
export interface PixiuYearRawData {
  year: number;
  transactions: PixiuTransactionRow[];
  dayAggs: PixiuDayAggRow[];
  monthAggs: PixiuMonthAggRow[];
  yearAgg: PixiuYearAggRow | null;
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

  /** Get all data for a specific month (YYYY-MM format) */
  getMonthData(month: string): PixiuMonthRawData {
    const db = openDbByPath(this.dbPath);
    try {
      // Get all transactions for the month
      const transactions = db
        .prepare(
          `SELECT id, source, tx_date, category_l1, category_l2, 
                  inflow, outflow, currency, account, tags, note, year
           FROM pixiu_transaction 
           WHERE source = 'pixiu' AND tx_date LIKE ? 
           ORDER BY tx_date`
        )
        .all(`${month}%`) as PixiuTransactionRow[];

      // Get daily aggregations for the month
      const dayAggs = db
        .prepare(
          `SELECT source, day, income, expense, net, tx_count
           FROM pixiu_day_agg 
           WHERE source = 'pixiu' AND day LIKE ?
           ORDER BY day`
        )
        .all(`${month}%`) as PixiuDayAggRow[];

      // Get month aggregation
      const monthAgg = db
        .prepare(
          `SELECT source, month, income, expense, net, tx_count
           FROM pixiu_month_agg 
           WHERE source = 'pixiu' AND month = ?`
        )
        .get(month) as PixiuMonthAggRow | undefined;

      return {
        month,
        transactions,
        dayAggs,
        monthAgg: monthAgg ?? null,
      };
    } finally {
      db.close();
    }
  }

  /** Get all data for a specific year */
  getYearData(year: number): PixiuYearRawData {
    const db = openDbByPath(this.dbPath);
    try {
      const yearPrefix = `${year}-%`;

      // Get all transactions for the year (for category breakdown)
      const transactions = db
        .prepare(
          `SELECT id, source, tx_date, category_l1, category_l2, 
                  inflow, outflow, currency, account, tags, note, year
           FROM pixiu_transaction 
           WHERE source = 'pixiu' AND year = ? 
           ORDER BY tx_date`
        )
        .all(year) as PixiuTransactionRow[];

      // Get daily aggregations for the year (for heatmap)
      const dayAggs = db
        .prepare(
          `SELECT source, day, income, expense, net, tx_count
           FROM pixiu_day_agg 
           WHERE source = 'pixiu' AND day LIKE ?
           ORDER BY day`
        )
        .all(yearPrefix) as PixiuDayAggRow[];

      // Get monthly aggregations for the year
      const monthAggs = db
        .prepare(
          `SELECT source, month, income, expense, net, tx_count
           FROM pixiu_month_agg 
           WHERE source = 'pixiu' AND month LIKE ?
           ORDER BY month`
        )
        .all(yearPrefix) as PixiuMonthAggRow[];

      // Get year aggregation
      const yearAgg = db
        .prepare(
          `SELECT source, year, income, expense, net, tx_count
           FROM pixiu_year_agg 
           WHERE source = 'pixiu' AND year = ?`
        )
        .get(year) as PixiuYearAggRow | undefined;

      return {
        year,
        transactions,
        dayAggs,
        monthAggs,
        yearAgg: yearAgg ?? null,
      };
    } finally {
      db.close();
    }
  }
}
