import { openDb } from "../import/footprint/db";

export const defaultGpxPath = "data/footprint/20260202.gpx";

type VerifyReport = {
  year: number;
  gpxPath: string;
  gpx: { total: number; minTs: string | null; maxTs: string | null };
  db: { total: number; minTs: string | null; maxTs: string | null };
  dayDiffs: { day: string; gpx: number; db: number }[];
};

type VerifyResult = {
  ok: boolean;
  errors: string[];
  report: VerifyReport;
};

const usageText =
  "Usage: bun run scripts/verify/footprint.ts <year> [gpxPath] [--json]";

export const parseGpxSummary = async (
  path: string,
  targetYear: number
) => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`GPX file not found: ${path}`);
  }

  const xml = await file.text();
  const trkptRegex = /<trkpt\b[^>]*>[\s\S]*?<\/trkpt>/g;
  const timeRegex = /<time>([^<]+)<\/time>/;

  let match: RegExpExecArray | null;
  let total = 0;
  let minTs = "";
  let maxTs = "";
  const dayCounts = new Map<string, number>();

  while ((match = trkptRegex.exec(xml))) {
    const block = match[0];
    const timeMatch = block.match(timeRegex);
    if (!timeMatch) continue;
    const time = timeMatch[1].trim();
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getUTCFullYear() !== targetYear) continue;

    const trackDate = date.toISOString().slice(0, 10);
    total += 1;
    const iso = date.toISOString().replace(".000Z", "Z");
    if (!minTs || iso < minTs) minTs = iso;
    if (!maxTs || iso > maxTs) maxTs = iso;
    dayCounts.set(trackDate, (dayCounts.get(trackDate) ?? 0) + 1);
  }

  return {
    total,
    minTs: minTs || null,
    maxTs: maxTs || null,
    dayCounts
  };
};

export const readDbSummary = (targetYear: number, dbPath?: string) => {
  const db = openDb(dbPath);
  try {
    const countRow = db
      .query(
        "select count(*) as count from track_point where source = 'footprint' and track_date like ?"
      )
      .get(`${targetYear}-%`) as { count: number };
    const rangeRow = db
      .query(
        "select min(ts) as min_ts, max(ts) as max_ts from track_point where source='footprint' and track_date like ?"
      )
      .get(`${targetYear}-%`) as { min_ts: string | null; max_ts: string | null };

    const perDay = db
      .query(
        "select track_date as day, count(*) as count from track_point where source='footprint' and track_date like ? group by track_date order by track_date"
      )
      .all(`${targetYear}-%`) as { day: string; count: number }[];

    const dayCounts = new Map<string, number>();
    for (const row of perDay) dayCounts.set(row.day, row.count);

    return {
      total: countRow.count,
      minTs: rangeRow.min_ts ?? null,
      maxTs: rangeRow.max_ts ?? null,
      dayCounts
    };
  } finally {
    db.close();
  }
};

export const compareDayCounts = (
  gpxCounts: Map<string, number>,
  dbCounts: Map<string, number>
) => {
  const diffs: { day: string; gpx: number; db: number }[] = [];
  const allDays = new Set<string>([...gpxCounts.keys(), ...dbCounts.keys()]);
  for (const day of Array.from(allDays).sort()) {
    const gpx = gpxCounts.get(day) ?? 0;
    const db = dbCounts.get(day) ?? 0;
    if (gpx !== db) diffs.push({ day, gpx, db });
  }
  return diffs;
};

export const verifyFootprint = async (options: {
  year: number;
  gpxPath?: string;
  dbPath?: string;
}): Promise<VerifyResult> => {
  const gpxPath = options.gpxPath ?? defaultGpxPath;
  const gpxSummary = await parseGpxSummary(gpxPath, options.year);
  const dbSummary = readDbSummary(options.year, options.dbPath);

  const errors: string[] = [];
  if (gpxSummary.total !== dbSummary.total) {
    errors.push(
      `count mismatch: gpx=${gpxSummary.total} db=${dbSummary.total}`
    );
  }
  if ((gpxSummary.minTs ?? null) !== (dbSummary.minTs ?? null)) {
    errors.push(`min ts mismatch: gpx=${gpxSummary.minTs} db=${dbSummary.minTs}`);
  }
  if ((gpxSummary.maxTs ?? null) !== (dbSummary.maxTs ?? null)) {
    errors.push(`max ts mismatch: gpx=${gpxSummary.maxTs} db=${dbSummary.maxTs}`);
  }

  const dayDiffs = compareDayCounts(gpxSummary.dayCounts, dbSummary.dayCounts);
  if (dayDiffs.length > 0) {
    errors.push(`day counts mismatch: ${dayDiffs.length} day(s)`);
  }

  const report: VerifyReport = {
    year: options.year,
    gpxPath,
    gpx: {
      total: gpxSummary.total,
      minTs: gpxSummary.minTs,
      maxTs: gpxSummary.maxTs
    },
    db: {
      total: dbSummary.total,
      minTs: dbSummary.minTs,
      maxTs: dbSummary.maxTs
    },
    dayDiffs
  };

  return { ok: errors.length === 0, errors, report };
};

export const runCli = async (
  args: string[],
  io?: {
    log: (message: string) => void;
    error: (message: string) => void;
  }
) => {
  const output = io ?? { log: console.log, error: console.error };
  const yearArg = args[0];
  const year = Number(yearArg);

  if (!Number.isInteger(year)) {
    output.log(usageText);
    return { exitCode: 1, ok: false };
  }

  const gpxPath =
    args[1] && !args[1].startsWith("--") ? args[1] : defaultGpxPath;
  const jsonFlag = args.includes("--json");

  const result = await verifyFootprint({ year, gpxPath });

  if (jsonFlag) {
    output.log(JSON.stringify({ ok: result.ok, ...result.report }, null, 2));
  } else {
    if (result.ok) {
      output.log("✅ Verify OK");
    } else {
      output.error("❌ Verify failed:");
      for (const err of result.errors) output.error(`- ${err}`);
    }
    output.log(`year: ${result.report.year}`);
    output.log(`gpx: ${result.report.gpxPath}`);
    output.log(
      `count: gpx=${result.report.gpx.total} db=${result.report.db.total}`
    );
    output.log(
      `min ts: gpx=${result.report.gpx.minTs} db=${result.report.db.minTs}`
    );
    output.log(
      `max ts: gpx=${result.report.gpx.maxTs} db=${result.report.db.maxTs}`
    );
    if (result.report.dayDiffs.length > 0) {
      output.log("day diffs:");
      for (const diff of result.report.dayDiffs.slice(0, 10)) {
        output.log(`- ${diff.day}: gpx=${diff.gpx} db=${diff.db}`);
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
