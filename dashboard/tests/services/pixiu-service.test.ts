import { describe, it, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  PixiuService,
  type PixiuRawData,
  type PixiuMonthRawData,
  type PixiuYearRawData,
} from "@/services/pixiu-service";
import * as dbModule from "@/lib/db";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/pixiu.test.sqlite`;

describe("PixiuService", () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    db = new Database(TEST_DB_PATH);
    db.exec(`
      create table if not exists pixiu_transaction (
        id integer primary key,
        source text not null,
        tx_date text not null,
        category_l1 text not null,
        category_l2 text not null,
        inflow real not null default 0,
        outflow real not null default 0,
        currency text not null,
        account text not null,
        tags text,
        note text,
        year integer not null
      );

      create table if not exists pixiu_day_agg (
        source text not null,
        day text not null,
        income real not null,
        expense real not null,
        net real not null,
        tx_count integer not null,
        primary key (source, day)
      );

      create table if not exists pixiu_month_agg (
        source text not null,
        month text not null,
        income real not null,
        expense real not null,
        net real not null,
        tx_count integer not null,
        primary key (source, month)
      );

      create table if not exists pixiu_year_agg (
        source text not null,
        year integer not null,
        income real not null,
        expense real not null,
        net real not null,
        tx_count integer not null,
        primary key (source, year)
      );
    `);

    const testDay = "2025-01-15";
    const testDay2 = "2025-01-20";
    const testDay3 = "2025-02-10";

    // Transactions
    db.exec(`
      insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, note, year)
      values 
        ('pixiu', '${testDay} 08:30', '日常支出', '餐饮', 0, 35.5, 'CNY', '支付宝', '早餐', 2025),
        ('pixiu', '${testDay} 12:00', '日常支出', '餐饮', 0, 45.0, 'CNY', '微信', '午餐', 2025),
        ('pixiu', '${testDay} 14:00', '日常支出', '交通', 0, 10.0, 'CNY', '支付宝', '地铁', 2025),
        ('pixiu', '${testDay} 18:00', '日常收入', '工资', 5000, 0, 'CNY', '银行卡', '月薪', 2025);
    `);

    // Day aggregation
    db.exec(`
      insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
      values ('pixiu', '${testDay}', 5000, 90.5, 4909.5, 4);
    `);

    // Data for 2025-01-20
    db.exec(`
      insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, note, year)
      values 
        ('pixiu', '${testDay2} 12:00', '日常支出', '购物', 0, 200, 'CNY', '支付宝', '日用品', 2025),
        ('pixiu', '${testDay2} 15:00', '日常支出', '娱乐', 0, 50, 'CNY', '微信', '电影票', 2025);
    `);

    db.exec(`
      insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
      values ('pixiu', '${testDay2}', 0, 250, -250, 2);
    `);

    // Data for 2025-02-10
    db.exec(`
      insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, note, year)
      values 
        ('pixiu', '${testDay3} 09:00', '日常收入', '兼职', 1000, 0, 'CNY', '银行卡', '外快', 2025);
    `);

    db.exec(`
      insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
      values ('pixiu', '${testDay3}', 1000, 0, 1000, 1);
    `);

    // Month aggregations
    db.exec(`
      insert into pixiu_month_agg (source, month, income, expense, net, tx_count)
      values 
        ('pixiu', '2025-01', 5000, 340.5, 4659.5, 6),
        ('pixiu', '2025-02', 1000, 0, 1000, 1);
    `);

    // Year aggregation
    db.exec(`
      insert into pixiu_year_agg (source, year, income, expense, net, tx_count)
      values ('pixiu', 2025, 6000, 340.5, 5659.5, 7);
    `);

    db.close();
  });

  afterAll(() => {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe("getDayData", () => {
    it("should return raw data for a specific date", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data).toBeDefined();
      expect(data.date).toBe("2025-01-15");
      expect(data.transactions).toBeArray();
      expect(data.transactions.length).toBe(4);
      expect(data.dayAgg).toBeDefined();
    });

    it("should return transactions with correct fields", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      const firstTx = data.transactions[0];
      expect(firstTx.category_l1).toBe("日常支出");
      expect(firstTx.category_l2).toBe("餐饮");
      expect(firstTx.outflow).toBe(35.5);
      expect(firstTx.account).toBe("支付宝");
    });

    it("should return day aggregation", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      expect(data.dayAgg).not.toBeNull();
      expect(data.dayAgg?.income).toBe(5000);
      expect(data.dayAgg?.expense).toBe(90.5);
      expect(data.dayAgg?.net).toBe(4909.5);
      expect(data.dayAgg?.tx_count).toBe(4);
    });

    it("should return income and expense transactions", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getDayData("2025-01-15");

      const expenseTxs = data.transactions.filter((tx: { outflow: number }) => tx.outflow > 0);
      const incomeTxs = data.transactions.filter((tx: { inflow: number }) => tx.inflow > 0);

      expect(expenseTxs.length).toBe(3);
      expect(incomeTxs.length).toBe(1);
    });

    it("should return empty data for date with no records", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getDayData("2020-01-01");

      expect(data.date).toBe("2020-01-01");
      expect(data.transactions).toEqual([]);
      expect(data.dayAgg).toBeNull();
    });
  });

  describe("type validation", () => {
    it("should match PixiuRawData type structure", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data: PixiuRawData = service.getDayData("2025-01-15");

      expect(typeof data.date).toBe("string");
      expect(Array.isArray(data.transactions)).toBe(true);
    });
  });

  describe("getMonthData", () => {
    it("should return all data for a specific month", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data).toBeDefined();
      expect(data.month).toBe("2025-01");
      expect(data.transactions.length).toBe(6); // 4 from 15th + 2 from 20th
      expect(data.dayAggs.length).toBe(2);
    });

    it("should return month aggregation", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      expect(data.monthAgg).not.toBeNull();
      expect(data.monthAgg?.income).toBe(5000);
      expect(data.monthAgg?.expense).toBe(340.5);
      expect(data.monthAgg?.tx_count).toBe(6);
    });

    it("should not include data from other months", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getMonthData("2025-01");

      const febTxs = data.transactions.filter((t) =>
        t.tx_date.startsWith("2025-02")
      );
      expect(febTxs.length).toBe(0);
    });

    it("should return empty data for month with no records", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getMonthData("2020-01");

      expect(data.month).toBe("2020-01");
      expect(data.transactions).toEqual([]);
      expect(data.dayAggs).toEqual([]);
      expect(data.monthAgg).toBeNull();
    });

    it("should match PixiuMonthRawData type structure", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data: PixiuMonthRawData = service.getMonthData("2025-01");

      expect(typeof data.month).toBe("string");
      expect(Array.isArray(data.transactions)).toBe(true);
      expect(Array.isArray(data.dayAggs)).toBe(true);
    });
  });

  describe("getYearData", () => {
    it("should return all data for a specific year", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data).toBeDefined();
      expect(data.year).toBe(2025);
      expect(data.transactions.length).toBe(7); // All transactions
      expect(data.dayAggs.length).toBe(3);
      expect(data.monthAggs.length).toBe(2);
    });

    it("should return year aggregation", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      expect(data.yearAgg).not.toBeNull();
      expect(data.yearAgg?.income).toBe(6000);
      expect(data.yearAgg?.expense).toBe(340.5);
      expect(data.yearAgg?.net).toBe(5659.5);
      expect(data.yearAgg?.tx_count).toBe(7);
    });

    it("should include data from multiple months", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getYearData(2025);

      const janTxs = data.transactions.filter((t) =>
        t.tx_date.startsWith("2025-01")
      );
      const febTxs = data.transactions.filter((t) =>
        t.tx_date.startsWith("2025-02")
      );

      expect(janTxs.length).toBe(6);
      expect(febTxs.length).toBe(1);
    });

    it("should return empty data for year with no records", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data = service.getYearData(2020);

      expect(data.year).toBe(2020);
      expect(data.transactions).toEqual([]);
      expect(data.dayAggs).toEqual([]);
      expect(data.monthAggs).toEqual([]);
      expect(data.yearAgg).toBeNull();
    });

    it("should match PixiuYearRawData type structure", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const data: PixiuYearRawData = service.getYearData(2025);

      expect(typeof data.year).toBe("number");
      expect(Array.isArray(data.transactions)).toBe(true);
      expect(Array.isArray(data.dayAggs)).toBe(true);
      expect(Array.isArray(data.monthAggs)).toBe(true);
    });
  });

  describe("caching behavior", () => {
    it("should cache historical month data on second call", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const data2 = service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should cache historical year data on second call", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      // First call - should hit database
      const data1 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const data2 = service.getYearData(2025);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      expect(data1).toEqual(data2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current month data", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.getMonthData(currentMonth);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should NOT cache current year data", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      const currentYear = new Date().getFullYear();

      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.getYearData(currentYear);
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });

    it("should allow clearing the cache", () => {
      const service = new PixiuService(TEST_DB_PATH);
      const openDbSpy = spyOn(dbModule, "openDbByPath");

      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(1);

      service.clearCache();

      service.getMonthData("2025-01");
      expect(openDbSpy).toHaveBeenCalledTimes(2);

      openDbSpy.mockRestore();
    });
  });
});
