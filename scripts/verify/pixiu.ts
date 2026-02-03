import { openDb } from "../import/pixiu/db";

export const defaultCsvPath = "data/pixiu/2025.csv";

type VerifyReport = {
  year: number;
  csvPath: string;
  csv: { total: number; income: number; expense: number };
  db: { total: number; income: number; expense: number };
  dayDiffs: { day: string; income: number; expense: number; dbIncome: number; dbExpense: number }[];
};

type VerifyResult = {
  ok: boolean;
  errors: string[];
  report: VerifyReport;
};

const usageText =
  "Usage: bun run scripts/verify/pixiu.ts <year> [csvPath] [--json]";

const parseNumber = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCsvSummary = async (path: string, targetYear: number) => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`CSV file not found: ${path}`);
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return {
      total: 0,
      income: 0,
      expense: 0,
      dayTotals: new Map<string, { income: number; expense: number }>()
    };
  }

  const header = lines[0].split(",").map((item) => item.trim());
  const rows = lines.slice(1).map((line) => line.split(","));
  const indexes = new Map(header.map((name, idx) => [name, idx]));
  const get = (row: string[], name: string) => {
    const idx = indexes.get(name);
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  let total = 0;
  let income = 0;
  let expense = 0;
  const dayTotals = new Map<string, { income: number; expense: number }>();

  for (const row of rows) {
    const date = get(row, "日期");
    if (!date.startsWith(`${targetYear}-`)) continue;
    const inflow = parseNumber(get(row, "流入金额"));
    const outflow = parseNumber(get(row, "流出金额"));
    income += inflow;
    expense += outflow;
    total += 1;

    const current = dayTotals.get(date) ?? { income: 0, expense: 0 };
    dayTotals.set(date, {
      income: current.income + inflow,
      expense: current.expense + outflow
    });
  }

  return { total, income, expense, dayTotals };
};

export const readDbSummary = (targetYear: number, dbPath?: string) => {
  const db = openDb(dbPath);
  try {
    const totalRow = db
      .query(
        "select count(*) as count, sum(inflow) as income, sum(outflow) as expense from pixiu_transaction where source='pixiu' and year = ?"
      )
      .get(targetYear) as { count: number; income: number | null; expense: number | null };

    const perDay = db
      .query(
        "select day, income, expense from pixiu_day_agg where source='pixiu' and day like ? order by day"
      )
      .all(`${targetYear}-%`) as { day: string; income: number; expense: number }[];

    const dayTotals = new Map<string, { income: number; expense: number }>();
    for (const row of perDay) dayTotals.set(row.day, { income: row.income, expense: row.expense });

    return {
      total: totalRow.count,
      income: totalRow.income ?? 0,
      expense: totalRow.expense ?? 0,
      dayTotals
    };
  } finally {
    db.close();
  }
};

export const compareDayTotals = (
  csvTotals: Map<string, { income: number; expense: number }>,
  dbTotals: Map<string, { income: number; expense: number }>
) => {
  const diffs: { day: string; income: number; expense: number; dbIncome: number; dbExpense: number }[] = [];
  const allDays = new Set<string>([...csvTotals.keys(), ...dbTotals.keys()]);
  for (const day of Array.from(allDays).sort()) {
    const csv = csvTotals.get(day) ?? { income: 0, expense: 0 };
    const db = dbTotals.get(day) ?? { income: 0, expense: 0 };
    if (csv.income !== db.income || csv.expense !== db.expense) {
      diffs.push({ day, income: csv.income, expense: csv.expense, dbIncome: db.income, dbExpense: db.expense });
    }
  }
  return diffs;
};

export const verifyPixiu = async (options: {
  year: number;
  csvPath?: string;
  dbPath?: string;
}): Promise<VerifyResult> => {
  const csvPath = options.csvPath ?? defaultCsvPath;
  const csvSummary = await parseCsvSummary(csvPath, options.year);
  const dbSummary = readDbSummary(options.year, options.dbPath);

  const errors: string[] = [];
  if (csvSummary.total !== dbSummary.total) {
    errors.push(`count mismatch: csv=${csvSummary.total} db=${dbSummary.total}`);
  }
  if (csvSummary.income !== dbSummary.income) {
    errors.push(`income mismatch: csv=${csvSummary.income} db=${dbSummary.income}`);
  }
  if (csvSummary.expense !== dbSummary.expense) {
    errors.push(`expense mismatch: csv=${csvSummary.expense} db=${dbSummary.expense}`);
  }

  const dayDiffs = compareDayTotals(csvSummary.dayTotals, dbSummary.dayTotals);
  if (dayDiffs.length > 0) {
    errors.push(`day totals mismatch: ${dayDiffs.length} day(s)`);
  }

  const report: VerifyReport = {
    year: options.year,
    csvPath,
    csv: { total: csvSummary.total, income: csvSummary.income, expense: csvSummary.expense },
    db: { total: dbSummary.total, income: dbSummary.income, expense: dbSummary.expense },
    dayDiffs
  };

  return { ok: errors.length === 0, errors, report };
};

export const runCli = async (
  args: string[],
  io?: { log: (message: string) => void; error: (message: string) => void }
) => {
  const output = io ?? { log: console.log, error: console.error };
  const yearArg = args[0];
  const year = Number(yearArg);

  if (!Number.isInteger(year)) {
    output.log(usageText);
    return { exitCode: 1, ok: false };
  }

  const csvPath = args[1] && !args[1].startsWith("--") ? args[1] : defaultCsvPath;
  const jsonFlag = args.includes("--json");

  const result = await verifyPixiu({ year, csvPath });

  if (jsonFlag) {
    output.log(JSON.stringify({ ok: result.ok, ...result.report }, null, 2));
  } else {
    if (result.ok) {
      output.log("Verify OK");
    } else {
      output.error("Verify failed:");
      for (const err of result.errors) output.error(`- ${err}`);
    }
    output.log(`year: ${result.report.year}`);
    output.log(`csv: ${result.report.csvPath}`);
    output.log(`count: csv=${result.report.csv.total} db=${result.report.db.total}`);
    output.log(`income: csv=${result.report.csv.income} db=${result.report.db.income}`);
    output.log(`expense: csv=${result.report.csv.expense} db=${result.report.db.expense}`);
    if (result.report.dayDiffs.length > 0) {
      output.log("day diffs:");
      for (const diff of result.report.dayDiffs.slice(0, 10)) {
        output.log(
          `- ${diff.day}: csv=${diff.income}/${diff.expense} db=${diff.dbIncome}/${diff.dbExpense}`
        );
      }
      if (result.report.dayDiffs.length > 10) {
        output.log(`...and ${result.report.dayDiffs.length - 10} more`);
      }
    }
  }

  return { exitCode: result.ok ? 0 : 1, ok: result.ok };
};

if (import.meta.main) {
  const result = await runCli(process.argv.slice(2));
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
