import { describe, expect, it } from "bun:test";
import {
  createEmptyDayPixiuData,
  type DayPixiuData,
  type DayExpenseSummary,
  type Transaction,
  type CategoryBreakdown,
} from "@/models/pixiu";

describe("pixiu model", () => {
  describe("createEmptyDayPixiuData", () => {
    it("should create empty pixiu data with given date", () => {
      const date = "2025-01-15";
      const data = createEmptyDayPixiuData(date);

      expect(data.date).toBe(date);
      expect(data.summary).toBeNull();
      expect(data.transactions).toEqual([]);
      expect(data.expenseByCategory).toEqual([]);
      expect(data.incomeByCategory).toEqual([]);
    });
  });

  describe("type definitions", () => {
    it("should allow valid DayExpenseSummary", () => {
      const summary: DayExpenseSummary = {
        income: 1000,
        expense: 500,
        net: 500,
        transactionCount: 5,
      };
      expect(summary.net).toBe(500);
    });

    it("should allow valid Transaction", () => {
      const tx: Transaction = {
        id: "tx-1",
        time: "12:30",
        categoryL1: "日常支出",
        categoryL2: "餐饮",
        amount: 35,
        isIncome: false,
        account: "微信",
        tags: "工作日",
        note: "午餐",
      };
      expect(tx.categoryL2).toBe("餐饮");
    });

    it("should allow valid CategoryBreakdown", () => {
      const cat: CategoryBreakdown = {
        category: "餐饮",
        amount: 150,
        count: 5,
        percentage: 45.5,
      };
      expect(cat.percentage).toBe(45.5);
    });

    it("should allow valid DayPixiuData", () => {
      const data: DayPixiuData = {
        date: "2025-01-15",
        summary: null,
        transactions: [],
        expenseByCategory: [],
        incomeByCategory: [],
      };
      expect(data.date).toBe("2025-01-15");
    });
  });
});
