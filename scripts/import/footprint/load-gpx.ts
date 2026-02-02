import { openDb, sourceName } from "./db";

export const defaultGpxPath = "data/footprint/20260202.gpx";

const trkptRegex = /<trkpt\b[^>]*>[\s\S]*?<\/trkpt>/g;
const attrRegex = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;
const tagValue = (block: string, tag: string) => {
  const re = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`);
  const match = block.match(re);
  return match ? match[1].trim() : null;
};

export const loadGpx = async (
  db: ReturnType<typeof openDb>,
  year: number,
  gpxPath: string = defaultGpxPath,
  source: string = sourceName
) => {
  const file = Bun.file(gpxPath);
  if (!(await file.exists())) {
    throw new Error(`GPX file not found: ${gpxPath}`);
  }

  const xml = await file.text();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearPrefix = `${year}-`;

  const insert = db.prepare(
    `insert into track_point
      (source, track_date, ts, lat, lon, ele, speed, course)
     values (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const deleteParams = [source, yearStart, yearEnd] as const;
  const deleteYearData = () => {
    db
      .prepare(
        "delete from track_point where source = ? and track_date between ? and ?"
      )
      .run(...deleteParams);
    db
      .prepare(
        "delete from track_day_agg where source = ? and day between ? and ?"
      )
      .run(...deleteParams);
    db
      .prepare(
        "delete from track_week_agg where source = ? and week_start between ? and ?"
      )
      .run(...deleteParams);
    db
      .prepare(
        "delete from track_month_agg where source = ? and month between ? and ?"
      )
      .run(...deleteParams);
    db
      .prepare("delete from track_year_agg where source = ? and year = ?")
      .run(source, year);
  };

  db.exec("begin");
  deleteYearData();

  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = trkptRegex.exec(xml))) {
    const block = match[0];
    const attrs = new Map<string, string>();
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(block))) {
      attrs.set(attrMatch[1], attrMatch[2]);
    }
    const lat = Number(attrs.get("lat"));
    const lon = Number(attrs.get("lon"));
    const ele = tagValue(block, "ele");
    const time = tagValue(block, "time");
    const speed = tagValue(block, "speed");
    const course = tagValue(block, "course");

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !time) continue;
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) continue;
    const trackDate = date.toISOString().slice(0, 10);
    if (!trackDate.startsWith(yearPrefix)) continue;

    insert.run(
      source,
      trackDate,
      time,
      lat,
      lon,
      ele ? Number(ele) : null,
      speed ? Number(speed) : null,
      course ? Number(course) : null
    );
    count += 1;
  }

  db.exec("commit");
  return count;
};
