import { spawnSync } from "node:child_process";

const run = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const args = process.argv.slice(2);
const year = args[0];
const xmlPath = args[1];
const ecgDir = args[2];
const routesDir = args[3];

run("bun", ["run", "scripts/import/applehealth/init.ts"]);
run("bun", [
  "run",
  "scripts/import/applehealth/cli.ts",
  "refresh",
  ...(year ? [year] : []),
  ...(xmlPath ? [xmlPath] : []),
  ...(ecgDir ? [ecgDir] : []),
  ...(routesDir ? [routesDir] : [])
]);
