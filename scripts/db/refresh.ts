import { spawnSync } from "node:child_process";

const run = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("bun", ["run", "scripts/db/init.ts"]);
run("bun", ["run", "scripts/db/cli.ts", "refresh"]);
