import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { openDb, testDbPath } from "../import/pixiu/db";
import { loadCsv } from "../import/pixiu/load-csv";
import { ensureParentDir, writePixiuCsv } from "./pixiu-fixtures";
import { withIsolatedCwd } from "./helpers/isolated-cwd";

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
    create table pixiu_month_agg (
      source text not null,
      month text not null,
      income real not null,
      expense real not null,
      net real not null,
      tx_count integer not null,
      primary key (source, month)
    );
    create table pixiu_year_agg (
      source text not null,
      year integer not null,
      income real not null,
      expense real not null,
      net real not null,
      tx_count integer not null,
      primary key (source, year)
    );
  `);
};

describe("pixiu load csv", () => {
  const csvFile = "db/test-pixiu.csv";

  beforeEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(csvFile, { force: true });
  });

  it("loads only requested year and clears aggregates", async () => {
    writePixiuCsv(csvFile, [
      "2024-01-01,日常收入,工资,100,0,人民币,现金,,",
      "2024-01-02,日常支出,超市,0,20,人民币,现金,,",
      "2023-01-01,日常支出,超市,0,5,人民币,现金,,"
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    db.exec(`
      insert into pixiu_transaction
        (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, tags, note, year)
      values
        ('pixiu', '2024-02-01', '日常收入', '工资', 50, 0, '人民币', '现金', '', '', 2024),
        ('pixiu', '2022-01-01', '日常支出', '超市', 0, 10, '人民币', '现金', '', '', 2022);
      insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
      values ('pixiu', '2024-02-01', 50, 0, 50, 1);
      insert into pixiu_month_agg (source, month, income, expense, net, tx_count)
      values ('pixiu', '2024-02-01', 50, 0, 50, 1);
      insert into pixiu_year_agg (source, year, income, expense, net, tx_count)
      values ('pixiu', 2024, 50, 0, 50, 1);
    `);

    const count = await loadCsv(db, 2024, csvFile, "pixiu");
    expect(count).toBe(2);

    const rows = db
      .query("select tx_date from pixiu_transaction where year = 2024 order by tx_date")
      .all() as { tx_date: string }[];
    expect(rows).toEqual([{ tx_date: "2024-01-01" }, { tx_date: "2024-01-02" }]);

    const leftover = db
      .query("select count(*) as count from pixiu_transaction where year = 2022")
      .get() as { count: number };
    expect(leftover.count).toBe(1);

    const dayCount = db
      .query("select count(*) as count from pixiu_day_agg where day like '2024-%'")
      .get() as { count: number };
    expect(dayCount.count).toBe(0);

    db.close();
  });

  it("throws when csv missing", async () => {
    const db = openDb(testDbPath);
    createSchema(db);

    await expect(loadCsv(db, 2024, "db/missing.csv", "pixiu")).rejects.toThrow(
      "CSV file not found"
    );

    db.close();
  });

  it("uses default csv path and source when arguments are omitted", async () => {
    const db = openDb(testDbPath);
    createSchema(db);

    await withIsolatedCwd(async () => {
      await expect(loadCsv(db, 2024)).rejects.toThrow(
        "CSV file not found: data/pixiu/2025.csv"
      );
    });

    db.close();
  });

  it("handles whitespace-only numbers and short rows", async () => {
    writePixiuCsv(csvFile, [
      "2024-03-01,日常收入,工资, ,0,人民币,现金,,",
      "2024-03-02,日常支出,超市,0,5,人民币,现金",
    ]);

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadCsv(db, 2024, csvFile, "pixiu");
    expect(count).toBe(2);
    db.close();
  });

  it("returns empty string when requested column is missing from header", async () => {
    // Header omits "标签" and "备注"; loader requests them via get() →
    // exercises the `idx === undefined` branch in get().
    const header = "日期,交易分类,交易类型,流入金额,流出金额,币种,资金账户";
    const body = "2024-04-01,日常收入,工资,100,0,人民币,现金";
    ensureParentDir(csvFile);
    writeFileSync(csvFile, `${header}\n${body}`, "utf-8");

    const db = openDb(testDbPath);
    createSchema(db);
    const count = await loadCsv(db, 2024, csvFile, "pixiu");
    expect(count).toBe(1);

    const row = db
      .query("select tags, note from pixiu_transaction where tx_date = '2024-04-01'")
      .get() as { tags: string; note: string };
    expect(row.tags).toBe("");
    expect(row.note).toBe("");
    db.close();
  });
});
