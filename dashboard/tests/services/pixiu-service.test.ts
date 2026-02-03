import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import {
  PixiuService,
  type PixiuRawData,
} from "@/services/pixiu-service";

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
    `);

    const testDay = "2025-01-15";

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
});
