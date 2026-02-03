import { openDb } from "./db";

export const defaultEcgDir = "data/apple-health/electrocardiograms";

const parseHeader = (lines: string[]) => {
  const meta = new Map<string, string>();
  for (const line of lines) {
    if (!line.includes(",")) continue;
    const [key, value] = line.split(/,(.+)/);
    if (!key || value === undefined) continue;
    meta.set(key.trim(), value.trim().replace(/^"|"$/g, ""));
  }
  return meta;
};

const countSamples = (lines: string[]) => {
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) count += 1;
  }
  return count;
};

const extractDay = (dateValue: string | undefined) =>
  dateValue ? dateValue.split(" ")[0] : "";

export const loadEcg = async (
  db: ReturnType<typeof openDb>,
  year?: number,
  dirPath: string = defaultEcgDir
) => {
  const files = await Array.fromAsync(
    new Bun.Glob(`${dirPath}/*.csv`).scan({ absolute: true })
  );
  if (files.length === 0) {
    throw new Error(`ECG dir not found: ${dirPath}`);
  }

  const insert = db.prepare(
    `insert into apple_ecg_file
      (file_path, recorded_at, sampling_rate, sample_count, day)
     values (?, ?, ?, ?, ?)`
  );

  db.exec("begin");
  if (year) {
    db.prepare("delete from apple_ecg_file where day between ? and ?").run(
      `${year}-01-01`,
      `${year}-12-31`
    );
  } else {
    db.exec("delete from apple_ecg_file");
  }

  let count = 0;
  for (const filePath of files) {
    const file = Bun.file(filePath);
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const meta = parseHeader(lines);
    const recordedAt = meta.get("记录日期") ?? null;
    const day = extractDay(recordedAt ?? "");
    if (year && !day.startsWith(`${year}-`)) continue;

    const rateRaw = meta.get("采样率") ?? "";
    const rate = rateRaw ? Number(rateRaw.replace(/[^0-9.]/g, "")) : null;
    const samples = countSamples(lines);

    insert.run(filePath, recordedAt, rate, samples, day);
    count += 1;
  }

  db.exec("commit");
  return count;
};
