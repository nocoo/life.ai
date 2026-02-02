import { spawnSync } from "node:child_process";

const run = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const args = process.argv.slice(2);
const year = args[0];
if (!year) {
  console.error("Usage: bun run scripts/import/footprint/refresh.ts <year> [gpxPath]");
  process.exit(1);
}

const gpxPath = args[1];

run("bun", ["run", "scripts/import/footprint/init.ts"]);
run("bun", ["run", "scripts/import/footprint/cli.ts", "refresh", year, ...(gpxPath ? [gpxPath] : [])]);
