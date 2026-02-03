/**
 * Pixiu (expense tracking) data types for day view
 */

/** Single transaction record */
export interface Transaction {
  id: string;
  time: string; // HH:mm
  categoryL1: string; // e.g., "日常支出", "日常收入"
  categoryL2: string; // e.g., "餐饮", "工资"
  amount: number; // positive value
  isIncome: boolean;
  account: string; // e.g., "支付宝", "微信"
  tags?: string;
  note?: string;
}

/** Day expense summary */
export interface DayExpenseSummary {
  income: number;
  expense: number;
  net: number; // income - expense
  transactionCount: number;
}

/** Category breakdown */
export interface CategoryBreakdown {
  category: string;
  amount: number;
  count: number;
  percentage: number; // 0-100
}

/** All pixiu data for a single day */
export interface DayPixiuData {
  date: string; // YYYY-MM-DD
  summary: DayExpenseSummary | null;
  transactions: Transaction[];
  expenseByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
}

/** Create an empty day pixiu data object */
export const createEmptyDayPixiuData = (date: string): DayPixiuData => ({
  date,
  summary: null,
  transactions: [],
  expenseByCategory: [],
  incomeByCategory: [],
});
