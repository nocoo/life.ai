create table if not exists track_point (
  id integer primary key,
  source text not null,
  track_date text not null,
  ts text not null,
  lat real not null,
  lon real not null,
  ele real,
  speed real,
  course real
);

create index if not exists idx_track_point_date on track_point (track_date);
create index if not exists idx_track_point_ts on track_point (ts);

create table if not exists track_day_agg (
  source text not null,
  day text not null,
  point_count integer not null,
  min_ts text,
  max_ts text,
  avg_speed real,
  min_lat real,
  max_lat real,
  min_lon real,
  max_lon real,
  primary key (source, day)
);

create table if not exists track_week_agg (
  source text not null,
  week_start text not null,
  point_count integer not null,
  primary key (source, week_start)
);

create table if not exists track_month_agg (
  source text not null,
  month text not null,
  point_count integer not null,
  primary key (source, month)
);

create table if not exists track_year_agg (
  source text not null,
  year integer not null,
  point_count integer not null,
  primary key (source, year)
);
