import { openDb, sourceName } from "./db";

export const aggregate = (
  db: ReturnType<typeof openDb>,
  source: string = sourceName
) => {
  db.exec("begin");

  db.prepare("delete from track_day_agg where source = ?").run(source);
  db.prepare("delete from track_week_agg where source = ?").run(source);
  db.prepare("delete from track_month_agg where source = ?").run(source);
  db.prepare("delete from track_year_agg where source = ?").run(source);

  db.exec(`
  insert into track_day_agg
    (source, day, point_count, min_ts, max_ts, avg_speed, min_lat, max_lat, min_lon, max_lon)
  select
    source,
    track_date as day,
    count(*) as point_count,
    min(ts),
    max(ts),
    avg(speed),
    min(lat),
    max(lat),
    min(lon),
    max(lon)
  from track_point
  where source = '${source}'
  group by source, track_date;
  `);

  db.exec(`
  insert into track_week_agg (source, week_start, point_count)
  select
    source,
    date(ts, '-6 days', 'weekday 1') as week_start,
    count(*)
  from track_point
  where source = '${source}'
  group by source, week_start;
  `);

  db.exec(`
  insert into track_month_agg (source, month, point_count)
  select
    source,
    substr(ts, 1, 7) || '-01' as month,
    count(*)
  from track_point
  where source = '${source}'
  group by source, month;
  `);

  db.exec(`
  insert into track_year_agg (source, year, point_count)
  select
    source,
    cast(substr(ts, 1, 4) as integer) as year,
    count(*)
  from track_point
  where source = '${source}'
  group by source, year;
  `);

  db.exec("commit");
};

export const runAggregateCli = (options?: { force?: boolean }) => {
  if (!options?.force && !import.meta.main) return;
  const db = openDb();
  try {
    aggregate(db);
    console.log("Aggregation complete");
  } finally {
    db.close();
  }
};

runAggregateCli();
