import { openDb } from "./db";
import { loadXml, defaultExportPath } from "./load-xml";
import { loadEcg, defaultEcgDir } from "./load-ecg";
import { loadRoutes, defaultRoutesDir } from "./load-routes";

const args = process.argv.slice(2);
const command = args[0];

const usage = () => {
  console.log(
    "Usage: bun run scripts/import/applehealth/cli.ts <load|ecg|routes|refresh> [year] [path]"
  );
};

if (!command) {
  usage();
  process.exit(1);
}

const db = openDb();

try {
  if (command === "load") {
    const year = args[1] ? Number(args[1]) : undefined;
    if (args[1] && !Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const xmlPath = args[2] ?? defaultExportPath;
    const summary = await loadXml(db, year, xmlPath);
    console.log(
      `✅ Loaded records=${summary.records}, correlations=${summary.correlations}, workouts=${summary.workouts}, activities=${summary.activities}`
    );
  } else if (command === "ecg") {
    const year = args[1] ? Number(args[1]) : undefined;
    if (args[1] && !Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const dirPath = args[2] ?? defaultEcgDir;
    const count = await loadEcg(db, year, dirPath);
    console.log(`✅ Loaded ${count} ECG files`);
  } else if (command === "routes") {
    const year = args[1] ? Number(args[1]) : undefined;
    if (args[1] && !Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const dirPath = args[2] ?? defaultRoutesDir;
    const count = await loadRoutes(db, year, dirPath);
    console.log(`✅ Loaded ${count} routes`);
  } else if (command === "refresh") {
    const year = args[1] ? Number(args[1]) : undefined;
    if (args[1] && !Number.isInteger(year)) {
      usage();
      process.exit(1);
    }
    const xmlPath = args[2] ?? defaultExportPath;
    const ecgDir = args[3] ?? defaultEcgDir;
    const routesDir = args[4] ?? defaultRoutesDir;
    const summary = await loadXml(db, year, xmlPath);
    const ecgCount = await loadEcg(db, year, ecgDir);
    const routeCount = await loadRoutes(db, year, routesDir);
    console.log(
      `✅ Refresh complete: records=${summary.records}, correlations=${summary.correlations}, workouts=${summary.workouts}, activities=${summary.activities}, ecg=${ecgCount}, routes=${routeCount}`
    );
  } else {
    usage();
    process.exit(1);
  }
} finally {
  db.close();
}
