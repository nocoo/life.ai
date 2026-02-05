import { getDbPath, openDbByPath } from "@/lib/db";

/** Get date range for a month (YYYY-MM format) */
const getMonthDateRange = (
  month: string
): { startDate: string; endDate: string } => {
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  // Get last day of month
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
};

/** Get date range for a year */
const getYearDateRange = (
  year: number
): { startDate: string; endDate: string } => {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

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
      const { startDate, endDate } = getMonthDateRange(month);
      // tx_date format is "YYYY-MM-DD HH:mm", need range from startDate to endDate+1day
      const txStartDate = startDate;
      const txEndDate = endDate + " 23:59";

      // Get all transactions for the month using range query
      const transactions = db
        .prepare(
          `SELECT id, source, tx_date, category_l1, category_l2, 
                  inflow, outflow, currency, account, tags, note, year
           FROM pixiu_transaction 
           WHERE source = 'pixiu' AND tx_date >= ? AND tx_date <= ?
           ORDER BY tx_date`
        )
        .all(txStartDate, txEndDate) as PixiuTransactionRow[];

      // Get daily aggregations for the month using range query
      const dayAggs = db
        .prepare(
          `SELECT source, day, income, expense, net, tx_count
           FROM pixiu_day_agg 
           WHERE source = 'pixiu' AND day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as PixiuDayAggRow[];

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
      const { startDate, endDate } = getYearDateRange(year);
      const yearMonthStart = `${year}-01`;
      const yearMonthEnd = `${year}-12`;

      // Get all transactions for the year (for category breakdown)
      // Using year column which has index
      const transactions = db
        .prepare(
          `SELECT id, source, tx_date, category_l1, category_l2, 
                  inflow, outflow, currency, account, tags, note, year
           FROM pixiu_transaction 
           WHERE source = 'pixiu' AND year = ? 
           ORDER BY tx_date`
        )
        .all(year) as PixiuTransactionRow[];

      // Get daily aggregations for the year (for heatmap) using range query
      const dayAggs = db
        .prepare(
          `SELECT source, day, income, expense, net, tx_count
           FROM pixiu_day_agg 
           WHERE source = 'pixiu' AND day >= ? AND day <= ?
           ORDER BY day`
        )
        .all(startDate, endDate) as PixiuDayAggRow[];

      // Get monthly aggregations for the year using range query
      const monthAggs = db
        .prepare(
          `SELECT source, month, income, expense, net, tx_count
           FROM pixiu_month_agg 
           WHERE source = 'pixiu' AND month >= ? AND month <= ?
           ORDER BY month`
        )
        .all(yearMonthStart, yearMonthEnd) as PixiuMonthAggRow[];

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
