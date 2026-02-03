import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/day/pixiu/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/pixiu-api.test.sqlite`;

describe("GET /api/day/pixiu", () => {
  beforeAll(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });

    const db = new Database(TEST_DB_PATH);
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

    db.exec(`
      insert into pixiu_transaction (source, tx_date, category_l1, category_l2, outflow, currency, account, year)
      values ('pixiu', '2025-01-15 08:30', '日常支出', '餐饮', 35.5, 'CNY', '支付宝', 2025);
    `);

    db.close();

    process.env.PIXIU_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.PIXIU_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if date is missing", async () => {
    const request = new NextRequest("http://localhost/api/day/pixiu");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should return 400 if date format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/pixiu?date=20250115"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should return data for valid date", async () => {
    const request = new NextRequest(
      "http://localhost/api/day/pixiu?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.date).toBe("2025-01-15");
    expect(data.data.transactions).toBeArray();
    expect(data.data.transactions.length).toBeGreaterThan(0);
  });
});
