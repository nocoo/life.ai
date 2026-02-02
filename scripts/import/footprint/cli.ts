import { openDb } from "./db";
import { loadGpx, defaultGpxPath } from "./load-gpx";
import { aggregate } from "./aggregate";

const args = process.argv.slice(2);
const command = args[0];

const usage = () => {
  console.log(
    "Usage: bun run scripts/import/footprint/cli.ts <load|agg|refresh> [year] [gpxPath]"
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
    const gpxPath = args[2] ?? defaultGpxPath;
    const count = await loadGpx(db, year, gpxPath);
    console.log(`Inserted ${count} track points`);
  } else if (command === "agg") {
    aggregate(db);
    console.log("Aggregation complete");
  } else if (command === "refresh") {
    const year = Number(args[1]);
    if (!Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const gpxPath = args[2] ?? defaultGpxPath;
    const count = await loadGpx(db, year, gpxPath);
    aggregate(db);
    console.log(`Refresh complete, loaded ${count} points`);
  } else {
    usage();
    process.exit(1);
  }
} finally {
  db.close();
}
