create table if not exists apple_meta (
  key text primary key,
  value text not null
);

create table if not exists apple_type_dict (
  type text primary key,
  kind text not null,
  unit text,
  sample_count integer not null default 0,
  note text
);

create table if not exists apple_record (
  id integer primary key,
  type text not null,
  unit text,
  value text,
  source_name text,
  source_version text,
  device text,
  creation_date text,
  start_date text not null,
  end_date text not null,
  day text not null,
  timezone text
);

create index if not exists idx_record_day on apple_record (day);
create index if not exists idx_record_type_day on apple_record (type, day);
create index if not exists idx_record_start on apple_record (start_date);

create table if not exists apple_correlation (
  id integer primary key,
  type text not null,
  source_name text,
  device text,
  creation_date text,
  start_date text not null,
  end_date text not null,
  day text not null
);

create index if not exists idx_corr_day on apple_correlation (day);
create index if not exists idx_corr_type_day on apple_correlation (type, day);

create table if not exists apple_correlation_item (
  correlation_id integer not null,
  record_id integer not null,
  primary key (correlation_id, record_id)
);

create table if not exists apple_workout (
  id integer primary key,
  workout_type text not null,
  duration real,
  total_distance real,
  total_energy real,
  source_name text,
  device text,
  creation_date text,
  start_date text not null,
  end_date text not null,
  day text not null
);

create index if not exists idx_workout_day on apple_workout (day);
create index if not exists idx_workout_type_day on apple_workout (workout_type, day);

create table if not exists apple_workout_stat (
  workout_id integer not null,
  type text not null,
  unit text,
  value real,
  primary key (workout_id, type)
);

create table if not exists apple_activity_summary (
  id integer primary key,
  date_components text not null,
  active_energy real,
  exercise_time real,
  stand_hours real,
  movement_energy real,
  day text not null
);

create index if not exists idx_activity_day on apple_activity_summary (day);

create table if not exists apple_ecg_file (
  id integer primary key,
  file_path text not null,
  recorded_at text,
  sampling_rate real,
  sample_count integer,
  day text not null
);

create index if not exists idx_ecg_day on apple_ecg_file (day);

create table if not exists apple_workout_route (
  id integer primary key,
  file_path text not null,
  workout_id integer,
  start_time text,
  end_time text,
  point_count integer,
  day text not null
);

create index if not exists idx_route_day on apple_workout_route (day);
