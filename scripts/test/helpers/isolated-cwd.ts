import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run an async callback inside a fresh empty cwd so callers that rely on
// default relative paths (e.g. `data/pixiu/2025.csv`) see "file missing"
// regardless of whether real data exists on the developer's machine.
export const withIsolatedCwd = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), "lifeai-isolated-"));
  process.chdir(tmp);
  try {
    return await fn();
  } finally {
    process.chdir(original);
    rmSync(tmp, { recursive: true, force: true });
  }
};
