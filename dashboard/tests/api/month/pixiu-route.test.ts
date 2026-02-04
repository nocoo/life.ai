import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/month/pixiu/route";

const TEST_DB_DIR = "tests/.tmp";
const TEST_DB_PATH = `${TEST_DB_DIR}/month-pixiu-api.test.sqlite`;

describe("GET /api/month/pixiu", () => {
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
        currency text not null default 'CNY',
        account text not null,
        tags text,
        note text,
        year integer not null
      );
      create table if not exists pixiu_day_agg (
        source text not null,
        day text not null,
        income real not null default 0,
        expense real not null default 0,
        net real not null default 0,
        tx_count integer not null default 0,
        primary key (source, day)
      );
      create table if not exists pixiu_month_agg (
        source text not null,
        month text not null,
        income real not null default 0,
        expense real not null default 0,
        net real not null default 0,
        tx_count integer not null default 0,
        primary key (source, month)
      );
    `);

    // Insert test data
    db.exec(`
      insert into pixiu_transaction (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, year)
      values 
        ('pixiu', '2025-01-15 12:30', 'Food', 'Lunch', 0, 35, 'CNY', 'WeChat', 2025),
        ('pixiu', '2025-01-16 18:00', 'Transport', 'Taxi', 0, 25, 'CNY', 'Alipay', 2025);
      
      insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
      values 
        ('pixiu', '2025-01-15', 0, 35, -35, 1),
        ('pixiu', '2025-01-16', 0, 25, -25, 1);
      
      insert into pixiu_month_agg (source, month, income, expense, net, tx_count)
      values ('pixiu', '2025-01', 0, 60, -60, 2);
    `);

    db.close();

    process.env.PIXIU_DB_PATH = TEST_DB_PATH;
  });

  afterAll(() => {
    delete process.env.PIXIU_DB_PATH;
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it("should return 400 if month is missing", async () => {
    const request = new NextRequest("http://localhost/api/month/pixiu");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing required parameter");
  });

  it("should return 400 if month format is invalid", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/pixiu?month=2025/01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid month format");
  });

  it("should return transformed data for valid month", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/pixiu?month=2025-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.month).toBe("2025-01");
    expect(data.data.daysInMonth).toBe(31);
    expect(data.data.daysWithData).toBe(2);
    expect(data.data.totalExpense).toBe(60);
    expect(data.data.transactionCount).toBe(2);
    expect(data.data.expenseByCategory).toBeArray();
    expect(data.data.byAccount).toBeArray();
  });

  it("should return empty data for month with no records", async () => {
    const request = new NextRequest(
      "http://localhost/api/month/pixiu?month=2020-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.month).toBe("2020-01");
    expect(data.data.daysWithData).toBe(0);
    expect(data.data.totalExpense).toBe(0);
  });

  it("should return 500 when database error occurs", async () => {
    const originalPath = process.env.PIXIU_DB_PATH;
    process.env.PIXIU_DB_PATH = "/nonexistent/path/to/db.sqlite";

    const request = new NextRequest(
      "http://localhost/api/month/pixiu?month=2025-01"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeString();

    process.env.PIXIU_DB_PATH = originalPath;
  });
});
