import { openDb } from "./db";

export const defaultRoutesDir = "data/apple-health/workout-routes";

const extractDay = (dateValue: string | undefined) =>
  dateValue ? dateValue.split("T")[0] : "";

export const loadRoutes = async (
  db: ReturnType<typeof openDb>,
  year?: number,
  dirPath: string = defaultRoutesDir
) => {
  const files = await Array.fromAsync(
    new Bun.Glob(`${dirPath}/*.gpx`).scan({ absolute: true })
  );
  if (files.length === 0) {
    throw new Error(`Routes dir not found: ${dirPath}`);
  }

  const insert = db.prepare(
    `insert into apple_workout_route
      (file_path, workout_id, start_time, end_time, point_count, day)
     values (?, ?, ?, ?, ?, ?)`
  );

  db.exec("begin");
  if (year) {
    db.prepare("delete from apple_workout_route where day between ? and ?").run(
      `${year}-01-01`,
      `${year}-12-31`
    );
  } else {
    db.exec("delete from apple_workout_route");
  }

  let count = 0;
  for (const filePath of files) {
    const file = Bun.file(filePath);
    const text = await file.text();
    const trkptRegex = /<trkpt\b[^>]*>[\s\S]*?<\/trkpt>/g;
    const timeRegex = /<time>([^<]+)<\/time>/;

    let match: RegExpExecArray | null;
    let pointCount = 0;
    let startTime: string | null = null;
    let endTime: string | null = null;
    while ((match = trkptRegex.exec(text))) {
      pointCount += 1;
      const timeMatch = match[0].match(timeRegex);
      if (!timeMatch) continue;
      if (!startTime) startTime = timeMatch[1];
      endTime = timeMatch[1];
    }

    const day = extractDay(startTime ?? "");
    if (year && !day.startsWith(`${year}-`)) continue;

    insert.run(filePath, null, startTime, endTime, pointCount, day);
    count += 1;
  }

  db.exec("commit");
  return count;
};
