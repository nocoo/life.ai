import { openDb } from "./db";
import { loadCsv, defaultCsvPath } from "./load-csv";
import { aggregate } from "./aggregate";

const args = process.argv.slice(2);
const command = args[0];

const usage = () => {
  console.log(
    "Usage: bun run scripts/import/pixiu/cli.ts <load|agg|refresh> <year> [csvPath]"
  );
};

if (!command) {
  usage();
  process.exit(1);
}

const db = openDb();

try {
  if (command === "load") {
    const year = Number(args[1]);
    if (!Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const csvPath = args[2] ?? defaultCsvPath;
    const count = await loadCsv(db, year, csvPath);
    console.log(`✅ Inserted ${count} transactions`);
  } else if (command === "agg") {
    aggregate(db);
    console.log("📊 Aggregation complete");
  } else if (command === "refresh") {
    const year = Number(args[1]);
    if (!Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const csvPath = args[2] ?? defaultCsvPath;
    const count = await loadCsv(db, year, csvPath);
    aggregate(db);
    console.log(`✅ Refresh complete, loaded ${count} rows`);
  } else {
    usage();
    process.exit(1);
  }
} finally {
  db.close();
}
