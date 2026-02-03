import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { openDb, testDbPath } from "../import/pixiu/db";
import { aggregate, runAggregateCli } from "../import/pixiu/aggregate";

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

const seed = (db: ReturnType<typeof openDb>) => {
  const insert = db.prepare(
    `insert into pixiu_transaction
      (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, tags, note, year)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insert.run("pixiu", "2024-01-01", "日常收入", "工资", 100, 0, "人民币", "现金", "", "", 2024);
  insert.run("pixiu", "2024-01-01", "日常支出", "超市", 0, 20, "人民币", "现金", "", "", 2024);
  insert.run("pixiu", "2024-02-01", "日常支出", "超市", 0, 10, "人民币", "现金", "", "", 2024);
  insert.run("pixiu", "2025-01-01", "日常收入", "工资", 50, 0, "人民币", "现金", "", "", 2025);
};

describe("pixiu aggregate", () => {
  const dbFile = testDbPath;

  beforeEach(() => {
    rmSync(dbFile, { force: true });
  });

  afterEach(() => {
    rmSync(dbFile, { force: true });
  });

  it("creates day/month/year aggregates", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);
    aggregate(db, "pixiu");

    const day = db.query(
      "select day, income, expense, net, tx_count from pixiu_day_agg order by day"
    ).all();
    const month = db.query(
      "select month, income, expense, net, tx_count from pixiu_month_agg order by month"
    ).all();
    const year = db.query(
      "select year, income, expense, net, tx_count from pixiu_year_agg order by year"
    ).all();

    expect(day).toEqual([
      { day: "2024-01-01", income: 100, expense: 20, net: 80, tx_count: 2 },
      { day: "2024-02-01", income: 0, expense: 10, net: -10, tx_count: 1 },
      { day: "2025-01-01", income: 50, expense: 0, net: 50, tx_count: 1 }
    ]);
    expect(month).toEqual([
      { month: "2024-01-01", income: 100, expense: 20, net: 80, tx_count: 2 },
      { month: "2024-02-01", income: 0, expense: 10, net: -10, tx_count: 1 },
      { month: "2025-01-01", income: 50, expense: 0, net: 50, tx_count: 1 }
    ]);
    expect(year).toEqual([
      { year: 2024, income: 100, expense: 30, net: 70, tx_count: 3 },
      { year: 2025, income: 50, expense: 0, net: 50, tx_count: 1 }
    ]);

    db.close();
  });

  it("replaces existing aggregates for source", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);
    aggregate(db, "pixiu");
    aggregate(db, "pixiu");

    const day = db.query(
      "select count(*) as count from pixiu_day_agg where source = 'pixiu'"
    ).get() as { count: number };
    const month = db.query(
      "select count(*) as count from pixiu_month_agg where source = 'pixiu'"
    ).get() as { count: number };
    const year = db.query(
      "select count(*) as count from pixiu_year_agg where source = 'pixiu'"
    ).get() as { count: number };

    expect(day.count).toBe(3);
    expect(month.count).toBe(3);
    expect(year.count).toBe(2);

    db.close();
  });

  it("runs aggregate cli entrypoint", () => {
    const db = openDb(dbFile);
    createSchema(db);
    seed(db);
    db.close();

    const prevPath = process.env.PIXIU_DB_PATH;
    process.env.PIXIU_DB_PATH = dbFile;
    try {
      runAggregateCli({ force: true });
    } finally {
      if (prevPath === undefined) {
        delete process.env.PIXIU_DB_PATH;
      } else {
        process.env.PIXIU_DB_PATH = prevPath;
      }
    }

    const verifyDb = openDb(dbFile);
    const rows = verifyDb
      .query("select count(*) as count from pixiu_year_agg where source = 'pixiu'")
      .get() as { count: number };
    expect(rows.count).toBe(2);
    verifyDb.close();
  });
});
