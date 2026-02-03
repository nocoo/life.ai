create table if not exists pixiu_transaction (
  id integer primary key,
  source text not null,
  tx_date text not null,
  category_l1 text not null,
  category_l2 text not null,
  inflow real not null default 0,
  outflow real not null default 0,
  currency text not null,
  account text not null,
  tags text,
  note text,
  year integer not null,
  check (
    (inflow = 0 and outflow > 0)
    or (outflow = 0 and inflow > 0)
    or (inflow = 0 and outflow = 0)
  )
);

create index if not exists idx_pixiu_tx_date on pixiu_transaction (tx_date);
create index if not exists idx_pixiu_year on pixiu_transaction (year);
create index if not exists idx_pixiu_category_l1 on pixiu_transaction (category_l1);
create index if not exists idx_pixiu_category_l2 on pixiu_transaction (category_l2);
create index if not exists idx_pixiu_account on pixiu_transaction (account);

create table if not exists pixiu_day_agg (
  source text not null,
  day text not null,
  income real not null,
  expense real not null,
  net real not null,
  tx_count integer not null,
  primary key (source, day)
);

create table if not exists pixiu_month_agg (
  source text not null,
  month text not null,
  income real not null,
  expense real not null,
  net real not null,
  tx_count integer not null,
  primary key (source, month)
);

create table if not exists pixiu_year_agg (
  source text not null,
  year integer not null,
  income real not null,
  expense real not null,
  net real not null,
  tx_count integer not null,
  primary key (source, year)
);
