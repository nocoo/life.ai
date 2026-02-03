import { spawnSync } from "node:child_process";

const run = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const args = process.argv.slice(2);
const year = args[0];
if (!year) {
  console.error(
    "Usage: bun run scripts/import/pixiu/refresh.ts <year> [csvPath]"
  );
  process.exit(1);
}

const csvPath = args[1];

run("bun", ["run", "scripts/import/pixiu/init.ts"]);
run("bun", [
  "run",
  "scripts/import/pixiu/cli.ts",
  "refresh",
  year,
  ...(csvPath ? [csvPath] : [])
]);
