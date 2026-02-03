/**
 * Mock data for Pixiu (expense tracking)
 */

import type {
  DayPixiuData,
  DayExpenseSummary,
  Transaction,
  CategoryBreakdown,
} from "@/models/pixiu";

/** Generate mock transactions */
export const createMockTransactions = (): Transaction[] => [
  {
    id: "tx-1",
    time: "07:45",
    categoryL1: "日常支出",
    categoryL2: "餐饮",
    amount: 15,
    isIncome: false,
    account: "支付宝",
    note: "早餐 - 豆浆油条",
  },
  {
    id: "tx-2",
    time: "12:30",
    categoryL1: "日常支出",
    categoryL2: "餐饮",
    amount: 35,
    isIncome: false,
    account: "微信",
    note: "午餐 - 盖浇饭",
  },
  {
    id: "tx-3",
    time: "15:00",
    categoryL1: "日常支出",
    categoryL2: "饮品",
    amount: 28,
    isIncome: false,
    account: "微信",
    note: "咖啡",
  },
  {
    id: "tx-4",
    time: "18:30",
    categoryL1: "日常支出",
    categoryL2: "餐饮",
    amount: 68.5,
    isIncome: false,
    account: "微信",
    note: "晚餐 - 火锅",
  },
  {
    id: "tx-5",
    time: "19:15",
    categoryL1: "日常支出",
    categoryL2: "超市",
    amount: 138,
    isIncome: false,
    account: "支付宝",
    note: "日用品采购",
  },
  {
    id: "tx-6",
    time: "20:00",
    categoryL1: "日常支出",
    categoryL2: "交通",
    amount: 12,
    isIncome: false,
    account: "微信",
    note: "地铁",
  },
];

/** Generate mock expense summary */
export const createMockExpenseSummary = (
  transactions: Transaction[]
): DayExpenseSummary => {
  const income = transactions
    .filter((t) => t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => !t.isIncome)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    income,
    expense,
    net: income - expense,
    transactionCount: transactions.length,
  };
};

/** Generate mock category breakdown */
export const createMockCategoryBreakdown = (
  transactions: Transaction[],
  isIncome: boolean
): CategoryBreakdown[] => {
  const filtered = transactions.filter((t) => t.isIncome === isIncome);
  const total = filtered.reduce((sum, t) => sum + t.amount, 0);

  const categoryMap = new Map<string, { amount: number; count: number }>();

  filtered.forEach((t) => {
    const existing = categoryMap.get(t.categoryL2) || { amount: 0, count: 0 };
    categoryMap.set(t.categoryL2, {
      amount: existing.amount + t.amount,
      count: existing.count + 1,
    });
  });

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percentage: total > 0 ? (data.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

/** Generate complete mock pixiu data for a day */
export const createMockDayPixiuData = (date: string): DayPixiuData => {
  const transactions = createMockTransactions();

  return {
    date,
    summary: createMockExpenseSummary(transactions),
    transactions,
    expenseByCategory: createMockCategoryBreakdown(transactions, false),
    incomeByCategory: createMockCategoryBreakdown(transactions, true),
  };
};
