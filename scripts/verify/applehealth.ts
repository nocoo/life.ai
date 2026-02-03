import { openDb } from "../import/applehealth/db";

export const defaultExportPath = "data/apple-health/导出.xml";
export const defaultEcgDir = "data/apple-health/electrocardiograms";
export const defaultRoutesDir = "data/apple-health/workout-routes";

type VerifyReport = {
  year?: number;
  exportPath: string;
  xml: {
    records: number;
    correlations: number;
    workouts: number;
    activities: number;
  };
  db: {
    records: number;
    correlations: number;
    workouts: number;
    activities: number;
  };
  ecg: { files: number; dbFiles: number };
  routes: { files: number; dbFiles: number };
};

type VerifyResult = {
  ok: boolean;
  errors: string[];
  report: VerifyReport;
};

const usageText =
  "Usage: bun run scripts/verify/applehealth.ts [year] [exportPath] [ecgDir] [routesDir] [--json]";

const attrRegex = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;

const parseAttributes = (tag: string) => {
  const attrs = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag))) {
    attrs.set(match[1], match[2]);
  }
  return attrs;
};

const extractDay = (dateValue: string | undefined) =>
  dateValue ? dateValue.split(" ")[0] : "";

const withinYear = (day: string, year?: number) => {
  if (!year) return true;
  return day.startsWith(`${year}-`);
};

export const countXml = async (path: string, year?: number) => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`XML file not found: ${path}`);
  }

  const xml = await file.text();
  const correlationRegex = /<Correlation\b[^>]*>[\s\S]*?<\/Correlation>/g;
  const workoutRegex = /<Workout\b[^>]*>[\s\S]*?<\/Workout>/g;
  const recordRegex = /<Record\b[^>]*>/g;
  const activityRegex = /<ActivitySummary\b[^>]*>/g;

  const xmlNoCorr = xml.replace(correlationRegex, "");

  let records = 0;
  let correlations = 0;
  let workouts = 0;
  let activities = 0;

  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(xmlNoCorr))) {
    const attrs = parseAttributes(match[0]);
    const day = extractDay(attrs.get("startDate"));
    if (!withinYear(day, year)) continue;
    records += 1;
  }

  let corrMatch: RegExpExecArray | null;
  while ((corrMatch = correlationRegex.exec(xml))) {
    const tag = corrMatch[0].match(/<Correlation\b[^>]*>/);
    if (!tag) continue;
    const attrs = parseAttributes(tag[0]);
    const day = extractDay(attrs.get("startDate"));
    if (!withinYear(day, year)) continue;
    correlations += 1;
  }

  let workoutMatch: RegExpExecArray | null;
  while ((workoutMatch = workoutRegex.exec(xml))) {
    const tag = workoutMatch[0].match(/<Workout\b[^>]*>/);
    if (!tag) continue;
    const attrs = parseAttributes(tag[0]);
    const day = extractDay(attrs.get("startDate"));
    if (!withinYear(day, year)) continue;
    workouts += 1;
  }

  let activityMatch: RegExpExecArray | null;
  while ((activityMatch = activityRegex.exec(xml))) {
    const attrs = parseAttributes(activityMatch[0]);
    const day = attrs.get("dateComponents") ?? "";
    if (!withinYear(day, year)) continue;
    activities += 1;
  }

  return { records, correlations, workouts, activities };
};

export const countEcgFiles = async (dirPath: string, year?: number) => {
  const files = await Array.fromAsync(
    new Bun.Glob(`${dirPath}/*.csv`).scan({ absolute: true })
  );
  if (files.length === 0) {
    throw new Error(`ECG dir not found: ${dirPath}`);
  }
  if (!year) return files.length;
  return files.filter((file) => file.includes(`${year}-`)).length;
};

export const countRouteFiles = async (dirPath: string, year?: number) => {
  const files = await Array.fromAsync(
    new Bun.Glob(`${dirPath}/*.gpx`).scan({ absolute: true })
  );
  if (files.length === 0) {
    throw new Error(`Routes dir not found: ${dirPath}`);
  }
  if (!year) return files.length;
  return files.filter((file) => file.includes(`${year}-`)).length;
};

export const readDbCounts = (db: ReturnType<typeof openDb>, year?: number) => {
  if (!year) {
    const records = db.query("select count(*) as count from apple_record").get() as { count: number };
    const correlations = db.query("select count(*) as count from apple_correlation").get() as { count: number };
    const workouts = db.query("select count(*) as count from apple_workout").get() as { count: number };
    const activities = db.query("select count(*) as count from apple_activity_summary").get() as { count: number };
    return {
      records: records.count,
      correlations: correlations.count,
      workouts: workouts.count,
      activities: activities.count
    };
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const records = db
    .query("select count(*) as count from apple_record where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  const correlations = db
    .query("select count(*) as count from apple_correlation where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  const workouts = db
    .query("select count(*) as count from apple_workout where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  const activities = db
    .query("select count(*) as count from apple_activity_summary where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  return {
    records: records.count,
    correlations: correlations.count,
    workouts: workouts.count,
    activities: activities.count
  };
};

export const readDbFiles = (db: ReturnType<typeof openDb>, year?: number) => {
  if (!year) {
    const ecg = db.query("select count(*) as count from apple_ecg_file").get() as { count: number };
    const routes = db.query("select count(*) as count from apple_workout_route").get() as { count: number };
    return { ecg: ecg.count, routes: routes.count };
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const ecg = db
    .query("select count(*) as count from apple_ecg_file where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  const routes = db
    .query("select count(*) as count from apple_workout_route where day between ? and ?")
    .get(yearStart, yearEnd) as { count: number };
  return { ecg: ecg.count, routes: routes.count };
};

export const verifyAppleHealth = async (options: {
  year?: number;
  exportPath?: string;
  ecgDir?: string;
  routesDir?: string;
  dbPath?: string;
}): Promise<VerifyResult> => {
  const exportPath = options.exportPath ?? defaultExportPath;
  const ecgDir = options.ecgDir ?? defaultEcgDir;
  const routesDir = options.routesDir ?? defaultRoutesDir;

  const xmlCounts = await countXml(exportPath, options.year);
  const ecgCount = await countEcgFiles(ecgDir, options.year);
  const routesCount = await countRouteFiles(routesDir, options.year);

  const db = openDb(options.dbPath);
  const dbCounts = readDbCounts(db, options.year);
  const dbFiles = readDbFiles(db, options.year);
  db.close();

  const errors: string[] = [];
  if (xmlCounts.records !== dbCounts.records) {
    errors.push(`record count mismatch: xml=${xmlCounts.records} db=${dbCounts.records}`);
  }
  if (xmlCounts.correlations !== dbCounts.correlations) {
    errors.push(`correlation count mismatch: xml=${xmlCounts.correlations} db=${dbCounts.correlations}`);
  }
  if (xmlCounts.workouts !== dbCounts.workouts) {
    errors.push(`workout count mismatch: xml=${xmlCounts.workouts} db=${dbCounts.workouts}`);
  }
  if (xmlCounts.activities !== dbCounts.activities) {
    errors.push(`activity count mismatch: xml=${xmlCounts.activities} db=${dbCounts.activities}`);
  }
  if (ecgCount !== dbFiles.ecg) {
    errors.push(`ecg count mismatch: files=${ecgCount} db=${dbFiles.ecg}`);
  }
  if (routesCount !== dbFiles.routes) {
    errors.push(`routes count mismatch: files=${routesCount} db=${dbFiles.routes}`);
  }

  const report: VerifyReport = {
    year: options.year,
    exportPath,
    xml: xmlCounts,
    db: dbCounts,
    ecg: { files: ecgCount, dbFiles: dbFiles.ecg },
    routes: { files: routesCount, dbFiles: dbFiles.routes }
  };

  return { ok: errors.length === 0, errors, report };
};

export const runCli = async (
  args: string[],
  io?: { log: (message: string) => void; error: (message: string) => void }
) => {
  const output = io ?? { log: console.log, error: console.error };
  const year = args[0] ? Number(args[0]) : undefined;
  if (args[0] && !Number.isInteger(year)) {
    output.log(usageText);
    return { exitCode: 1, ok: false };
  }

  const exportPath = args[1] && !args[1].startsWith("--") ? args[1] : defaultExportPath;
  const ecgDir = args[2] && !args[2].startsWith("--") ? args[2] : defaultEcgDir;
  const routesDir = args[3] && !args[3].startsWith("--") ? args[3] : defaultRoutesDir;
  const jsonFlag = args.includes("--json");

  const result = await verifyAppleHealth({ year, exportPath, ecgDir, routesDir });

  if (jsonFlag) {
    output.log(JSON.stringify({ ok: result.ok, ...result.report }, null, 2));
  } else {
    if (result.ok) {
      output.log("✅ Verify OK");
    } else {
      output.error("❌ Verify failed:");
      for (const err of result.errors) output.error(`- ${err}`);
    }
    output.log(`year: ${result.report.year ?? "all"}`);
    output.log(`xml: ${result.report.exportPath}`);
    output.log(
      `records: xml=${result.report.xml.records} db=${result.report.db.records}`
    );
    output.log(
      `correlations: xml=${result.report.xml.correlations} db=${result.report.db.correlations}`
    );
    output.log(
      `workouts: xml=${result.report.xml.workouts} db=${result.report.db.workouts}`
    );
    output.log(
      `activities: xml=${result.report.xml.activities} db=${result.report.db.activities}`
    );
    output.log(
      `ecg files: fs=${result.report.ecg.files} db=${result.report.ecg.dbFiles}`
    );
    output.log(
      `routes: fs=${result.report.routes.files} db=${result.report.routes.dbFiles}`
    );
  }

  return { exitCode: result.ok ? 0 : 1, ok: result.ok };
};

if (import.meta.main) {
  const result = await runCli(process.argv.slice(2));
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
