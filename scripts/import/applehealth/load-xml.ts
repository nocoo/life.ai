import { openDb, sourceName } from "./db";

export const defaultExportPath = "data/apple-health/导出.xml";

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

const clearYear = (db: ReturnType<typeof openDb>, year?: number) => {
  if (!year) {
    db.exec("delete from apple_record");
    db.exec("delete from apple_correlation_item");
    db.exec("delete from apple_correlation");
    db.exec("delete from apple_workout_stat");
    db.exec("delete from apple_workout");
    db.exec("delete from apple_activity_summary");
    return;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  db.prepare("delete from apple_record where day between ? and ?").run(
    yearStart,
    yearEnd
  );
  db.prepare("delete from apple_correlation_item where correlation_id in (select id from apple_correlation where day between ? and ?)").run(
    yearStart,
    yearEnd
  );
  db.prepare("delete from apple_correlation where day between ? and ?").run(
    yearStart,
    yearEnd
  );
  db.prepare("delete from apple_workout_stat where workout_id in (select id from apple_workout where day between ? and ?)").run(
    yearStart,
    yearEnd
  );
  db.prepare("delete from apple_workout where day between ? and ?").run(
    yearStart,
    yearEnd
  );
  db.prepare("delete from apple_activity_summary where day between ? and ?").run(
    yearStart,
    yearEnd
  );
};

const rebuildTypeDict = (db: ReturnType<typeof openDb>) => {
  db.exec("delete from apple_type_dict");
  db.exec(`
    insert into apple_type_dict (type, kind, unit, sample_count)
    select type, 'record', unit, count(*)
    from apple_record
    group by type, unit;
  `);
  db.exec(`
    insert into apple_type_dict (type, kind, unit, sample_count)
    select type, 'correlation', null, count(*)
    from apple_correlation
    group by type;
  `);
  db.exec(`
    insert into apple_type_dict (type, kind, unit, sample_count)
    select workout_type, 'workout', null, count(*)
    from apple_workout
    group by workout_type;
  `);
  db.exec(`
    insert into apple_type_dict (type, kind, unit, sample_count)
    select 'activity_summary', 'activity', null, count(*)
    from apple_activity_summary;
  `);
};

const workoutStatValue = (attrs: Map<string, string>) => {
  const candidates = ["sum", "average", "maximum", "minimum"];
  for (const key of candidates) {
    const value = attrs.get(key);
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const loadXml = async (
  db: ReturnType<typeof openDb>,
  year?: number,
  xmlPath: string = defaultExportPath,
  source: string = sourceName
) => {
  const file = Bun.file(xmlPath);
  if (!(await file.exists())) {
    throw new Error(`XML file not found: ${xmlPath}`);
  }

  const xml = await file.text();
  const recordRegex = /<Record\b[^>]*>/g;
  const correlationRegex = /<Correlation\b[^>]*>[\s\S]*?<\/Correlation>/g;
  const workoutRegex = /<Workout\b[^>]*>[\s\S]*?<\/Workout>/g;
  const activityRegex = /<ActivitySummary\b[^>]*>/g;

  const recordInsert = db.prepare(
    `insert into apple_record
      (type, unit, value, source_name, source_version, device, creation_date, start_date, end_date, day, timezone)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const correlationInsert = db.prepare(
    `insert into apple_correlation
      (type, source_name, device, creation_date, start_date, end_date, day)
     values (?, ?, ?, ?, ?, ?, ?)`
  );
  const workoutInsert = db.prepare(
    `insert into apple_workout
      (workout_type, duration, total_distance, total_energy, source_name, device, creation_date, start_date, end_date, day)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const workoutStatInsert = db.prepare(
    `insert into apple_workout_stat
      (workout_id, type, unit, value)
     values (?, ?, ?, ?)`
  );
  const activityInsert = db.prepare(
    `insert into apple_activity_summary
      (date_components, active_energy, exercise_time, stand_hours, movement_energy, day)
     values (?, ?, ?, ?, ?, ?)`
  );

  db.exec("begin");
  clearYear(db, year);

  const xmlNoCorr = xml.replace(correlationRegex, "");
  let match: RegExpExecArray | null;
  let recordCount = 0;
  while ((match = recordRegex.exec(xmlNoCorr))) {
    const attrs = parseAttributes(match[0]);
    const startDate = attrs.get("startDate");
    const day = extractDay(startDate);
    if (!withinYear(day, year)) continue;

    recordInsert.run(
      attrs.get("type") ?? "",
      attrs.get("unit") ?? null,
      attrs.get("value") ?? null,
      attrs.get("sourceName") ?? null,
      attrs.get("sourceVersion") ?? null,
      attrs.get("device") ?? null,
      attrs.get("creationDate") ?? null,
      startDate ?? "",
      attrs.get("endDate") ?? "",
      day,
      startDate ? startDate.split(" ").pop() ?? null : null
    );
    recordCount += 1;
  }

  let correlationCount = 0;
  let correlationMatch: RegExpExecArray | null;
  while ((correlationMatch = correlationRegex.exec(xml))) {
    const tag = correlationMatch[0].match(/<Correlation\b[^>]*>/);
    if (!tag) continue;
    const attrs = parseAttributes(tag[0]);
    const startDate = attrs.get("startDate");
    const day = extractDay(startDate);
    if (!withinYear(day, year)) continue;

    correlationInsert.run(
      attrs.get("type") ?? "",
      attrs.get("sourceName") ?? null,
      attrs.get("device") ?? null,
      attrs.get("creationDate") ?? null,
      startDate ?? "",
      attrs.get("endDate") ?? "",
      day
    );
    correlationCount += 1;
  }

  let workoutCount = 0;
  let workoutMatch: RegExpExecArray | null;
  while ((workoutMatch = workoutRegex.exec(xml))) {
    const tag = workoutMatch[0].match(/<Workout\b[^>]*>/);
    if (!tag) continue;
    const attrs = parseAttributes(tag[0]);
    const startDate = attrs.get("startDate");
    const day = extractDay(startDate);
    if (!withinYear(day, year)) continue;

    const info = workoutInsert.run(
      attrs.get("workoutActivityType") ?? "",
      attrs.get("duration") ? Number(attrs.get("duration")) : null,
      attrs.get("totalDistance") ? Number(attrs.get("totalDistance")) : null,
      attrs.get("totalEnergyBurned")
        ? Number(attrs.get("totalEnergyBurned"))
        : null,
      attrs.get("sourceName") ?? null,
      attrs.get("device") ?? null,
      attrs.get("creationDate") ?? null,
      startDate ?? "",
      attrs.get("endDate") ?? "",
      day
    );
    const workoutId = Number(info.lastInsertRowid);

    const statRegex = /<WorkoutStatistics\b[^>]*\/>/g;
    let statMatch: RegExpExecArray | null;
    while ((statMatch = statRegex.exec(workoutMatch[0]))) {
      const statAttrs = parseAttributes(statMatch[0]);
      const value = workoutStatValue(statAttrs);
      if (value === null) continue;
      workoutStatInsert.run(
        workoutId,
        statAttrs.get("type") ?? "",
        statAttrs.get("unit") ?? null,
        value
      );
    }

    workoutCount += 1;
  }

  let activityCount = 0;
  let activityMatch: RegExpExecArray | null;
  while ((activityMatch = activityRegex.exec(xml))) {
    const attrs = parseAttributes(activityMatch[0]);
    const day = attrs.get("dateComponents") ?? "";
    if (!withinYear(day, year)) continue;
    activityInsert.run(
      attrs.get("dateComponents") ?? "",
      attrs.get("activeEnergyBurned")
        ? Number(attrs.get("activeEnergyBurned"))
        : null,
      attrs.get("appleExerciseTime")
        ? Number(attrs.get("appleExerciseTime"))
        : null,
      attrs.get("appleStandHours")
        ? Number(attrs.get("appleStandHours"))
        : null,
      attrs.get("appleMoveTime") ? Number(attrs.get("appleMoveTime")) : null,
      day
    );
    activityCount += 1;
  }

  rebuildTypeDict(db);
  db.exec("commit");

  return {
    records: recordCount,
    correlations: correlationCount,
    workouts: workoutCount,
    activities: activityCount,
    source
  };
};
