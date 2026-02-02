import { openDb } from "./db";
import { loadGpx, defaultGpxPath } from "./load-gpx";
import { aggregate } from "./aggregate";

const args = process.argv.slice(2);
const command = args[0];

const usage = () => {
  console.log("Usage: bun run scripts/db/cli.ts <load|agg|refresh> [gpxPath]");
};

if (!command) {
  usage();
  process.exit(1);
}

const db = openDb();

try {
  if (command === "load") {
    const gpxPath = args[1] ?? defaultGpxPath;
    const count = await loadGpx(db, gpxPath);
    console.log(`Inserted ${count} track points`);
  } else if (command === "agg") {
    aggregate(db);
    console.log("Aggregation complete");
  } else if (command === "refresh") {
    const gpxPath = args[1] ?? defaultGpxPath;
    const count = await loadGpx(db, gpxPath);
    aggregate(db);
    console.log(`Refresh complete, loaded ${count} points`);
  } else {
    usage();
    process.exit(1);
  }
} finally {
  db.close();
}
