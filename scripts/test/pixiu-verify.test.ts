import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { openDb, testDbPath } from "../import/pixiu/db";
import {
  compareDayTotals,
  parseCsvSummary,
  readDbSummary,
  runCli,
  verifyPixiu
} from "../verify/pixiu";
import { writePixiuCsv } from "./pixiu-fixtures";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table pixiu_transaction (
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
    create table pixiu_day_agg (
      source text not null,
      day text not null,
      income real not null,
      expense real not null,
      net real not null,
      tx_count integer not null,
      primary key (source, day)
    );
  `);
};

const seedDb = (db: ReturnType<typeof openDb>, rows: Array<{ date: string; inflow: number; outflow: number }>) => {
  const insert = db.prepare(
    `insert into pixiu_transaction
      (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, tags, note, year)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(
      "pixiu",
      row.date,
      "日常收入",
      "工资",
      row.inflow,
      row.outflow,
      "人民币",
      "现金",
      "",
      "",
      Number(row.date.slice(0, 4))
    );
  }

  const agg = db.prepare(
    `insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
     values (?, ?, ?, ?, ?, ?)`
  );
  const perDay = new Map<string, { income: number; expense: number; count: number }>();
  for (const row of rows) {
    const current = perDay.get(row.date) ?? { income: 0, expense: 0, count: 0 };
    perDay.set(row.date, {
      income: current.income + row.inflow,
      expense: current.expense + row.outflow,
      count: current.count + 1
    });
  }
  for (const [day, data] of perDay) {
    agg.run("pixiu", day, data.income, data.expense, data.income - data.expense, data.count);
  }
};

describe("pixiu verify", () => {
  const csvFile = "db/test-pixiu.csv";

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  it("passes when csv and db match", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { date: "2024-01-01", inflow: 100, outflow: 0 },
      { date: "2024-01-02", inflow: 0, outflow: 20 }
    ]);
    db.close();

    const result = await verifyPixiu({ year: 2024, csvPath: csvFile, dbPath: testDbPath });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports mismatched totals", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { date: "2024-01-01", inflow: 100, outflow: 0 }
    ]);
    db.close();

    const result = await verifyPixiu({ year: 2024, csvPath: csvFile, dbPath: testDbPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("count mismatch"))).toBe(true);
  });

  it("summarizes csv data", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2023-01-01,日常收入,工资,50,0,人民币,现金,,"
    ]);

    const summary = await parseCsvSummary(csvFile, 2024);
    expect(summary.total).toBe(1);
    expect(summary.income).toBe(100);
  });

  it("summarizes db data", () => {
    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { date: "2024-01-01", inflow: 100, outflow: 0 },
      { date: "2024-01-02", inflow: 0, outflow: 10 }
    ]);
    db.close();

    const summary = readDbSummary(2024, testDbPath);
    expect(summary.total).toBe(2);
    expect(summary.expense).toBe(10);
  });

  it("rounds totals to two decimals", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,1.005,0,人民币,现金,,",
      "2024-01-02,日常收入,工资,0.005,0,人民币,现金,,"
    ]);

    const summary = await parseCsvSummary(csvFile, 2024);
    expect(summary.income).toBe(1.01);
  });

  it("rounds db totals to two decimals", () => {
    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { date: "2024-01-01", inflow: 1.005, outflow: 0 },
      { date: "2024-01-02", inflow: 0.005, outflow: 0 }
    ]);
    db.close();

    const summary = readDbSummary(2024, testDbPath);
    expect(summary.income).toBe(1.01);
  });

  it("summarizes csv with blanks", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,,人民币,现金,,",
      "2024-01-02,日常支出,超市,,200,人民币,现金,,"
    ]);

    const summary = await parseCsvSummary(csvFile, 2024);
    expect(summary.total).toBe(2);
    expect(summary.income).toBe(100);
    expect(summary.expense).toBe(200);
  });

  it("compares day totals", () => {
    const csvTotals = new Map([
      ["2024-01-01", { income: 100, expense: 0 }],
      ["2024-01-02", { income: 0, expense: 20 }]
    ]);
    const dbTotals = new Map([
      ["2024-01-01", { income: 100, expense: 0 }],
      ["2024-01-03", { income: 0, expense: 5 }]
    ]);

    const diffs = compareDayTotals(csvTotals, dbTotals);
    expect(diffs).toEqual([
      { day: "2024-01-02", income: 0, expense: 20, dbIncome: 0, dbExpense: 0 },
      { day: "2024-01-03", income: 0, expense: 0, dbIncome: 0, dbExpense: 5 }
    ]);
  });

  it("returns usage on invalid args", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const result = await runCli([], io);
    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(logs[0]).toContain("Usage:");
    expect(errors).toHaveLength(0);
  });

  it("throws when csv is missing", async () => {
    await expect(parseCsvSummary("db/missing.csv", 2024)).rejects.toThrow(
      "CSV file not found"
    );
  });

  it("prints json output", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ date: "2024-01-01", inflow: 100, outflow: 0 }]);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const result = await runCli(["2024", csvFile, "--json"], io);
    expect(result.exitCode).toBe(0);
    expect(errors).toHaveLength(0);
    const payload = JSON.parse(logs[0]) as { ok: boolean; year: number };
    expect(payload.ok).toBe(true);
    expect(payload.year).toBe(2024);
  });

  it("prints day diffs when mismatched", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,",
      "2024-01-03,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-04,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-05,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-06,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-07,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-08,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-09,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-10,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-11,日常支出,超市,0,10,人民币,现金,,",
      "2024-01-12,日常支出,超市,0,10,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [{ date: "2024-01-01", inflow: 100, outflow: 0 }]);
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg)
    };

    const result = await runCli(["2024", csvFile], io);
    expect(result.exitCode).toBe(1);
    expect(errors[0]).toBe("Verify failed:");
    expect(logs.some((line) => line.startsWith("- 2024-01-"))).toBe(true);
    expect(logs.some((line) => line.includes("...and 1 more"))).toBe(true);
  });

  it("summarizes empty csv", async () => {
    writePixiuCsv(csvFile, []);

    const summary = await parseCsvSummary(csvFile, 2024);
    expect(summary.total).toBe(0);
    expect(summary.income).toBe(0);
    expect(summary.expense).toBe(0);
  });

  it("reports mismatched income and expense", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    seedDb(db, [
      { date: "2024-01-01", inflow: 90, outflow: 0 },
      { date: "2024-01-02", inflow: 0, outflow: 30 }
    ]);
    db.close();

    const result = await verifyPixiu({ year: 2024, csvPath: csvFile, dbPath: testDbPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((err) => err.includes("income mismatch"))).toBe(true);
    expect(result.errors.some((err) => err.includes("expense mismatch"))).toBe(true);
  });
});
