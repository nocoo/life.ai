import { openDb, sourceName } from "./db";

export const defaultCsvPath = "data/pixiu/2025.csv";

const parseNumber = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCsv = (text: string) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((item) => item.trim());
  const rows = lines.slice(1).map((line) => line.split(","));
  return { header, rows };
};

export const loadCsv = async (
  db: ReturnType<typeof openDb>,
  year: number,
  csvPath: string = defaultCsvPath,
  source: string = sourceName
) => {
  const file = Bun.file(csvPath);
  if (!(await file.exists())) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const text = await file.text();
  const { header, rows } = parseCsv(text);
  const indexes = new Map(header.map((name, idx) => [name, idx]));

  const get = (row: string[], name: string) => {
    const idx = indexes.get(name);
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const insert = db.prepare(
    `insert into pixiu_transaction
      (source, tx_date, category_l1, category_l2, inflow, outflow, currency, account, tags, note, year)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec("begin");
  db.prepare("delete from pixiu_transaction where source = ? and year = ?").run(
    source,
    year
  );
  db.prepare("delete from pixiu_day_agg where source = ? and day between ? and ?").run(
    source,
    yearStart,
    yearEnd
  );
  db.prepare("delete from pixiu_month_agg where source = ? and month between ? and ?").run(
    source,
    `${year}-01-01`,
    `${year}-12-01`
  );
  db.prepare("delete from pixiu_year_agg where source = ? and year = ?").run(
    source,
    year
  );

  let count = 0;
  for (const row of rows) {
    const txDate = get(row, "日期");
    if (!txDate.startsWith(`${year}-`)) continue;

    insert.run(
      source,
      txDate,
      get(row, "交易分类"),
      get(row, "交易类型"),
      parseNumber(get(row, "流入金额")),
      parseNumber(get(row, "流出金额")),
      get(row, "币种"),
      get(row, "资金账户"),
      get(row, "标签"),
      get(row, "备注"),
      year
    );
    count += 1;
  }

  db.exec("commit");
  return count;
};
