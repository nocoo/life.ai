import { openDb, sourceName } from "./db";

export const aggregate = (
  db: ReturnType<typeof openDb>,
  source: string = sourceName
) => {
  db.exec("begin");

  db.prepare("delete from pixiu_day_agg where source = ?").run(source);
  db.prepare("delete from pixiu_month_agg where source = ?").run(source);
  db.prepare("delete from pixiu_year_agg where source = ?").run(source);

  db.exec(`
    insert into pixiu_day_agg (source, day, income, expense, net, tx_count)
    select
      source,
      tx_date as day,
      sum(inflow) as income,
      sum(outflow) as expense,
      sum(inflow) - sum(outflow) as net,
      count(*) as tx_count
    from pixiu_transaction
    where source = '${source}'
    group by source, tx_date;
  `);

  db.exec(`
    insert into pixiu_month_agg (source, month, income, expense, net, tx_count)
    select
      source,
      substr(tx_date, 1, 7) || '-01' as month,
      sum(inflow) as income,
      sum(outflow) as expense,
      sum(inflow) - sum(outflow) as net,
      count(*) as tx_count
    from pixiu_transaction
    where source = '${source}'
    group by source, month;
  `);

  db.exec(`
    insert into pixiu_year_agg (source, year, income, expense, net, tx_count)
    select
      source,
      year,
      sum(inflow) as income,
      sum(outflow) as expense,
      sum(inflow) - sum(outflow) as net,
      count(*) as tx_count
    from pixiu_transaction
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
