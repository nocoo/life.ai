#!/usr/bin/env node
// Package-manager-agnostic Node runtime check.
//
// Bun's install ignores `.npmrc engine-strict` and (with `ignoreScripts=true`)
// suppresses `preinstall`, so `engines.node` alone does not fail fast on an
// unsupported Node. This script is invoked directly by `node` from every
// entry point (test / lint / build / dev / precommit) and by a dedicated
// CI preflight job, so a Node runtime below the required minimum aborts
// before any downstream tool loads native addons (e.g. better-sqlite3 v13
// requires Node >= 22).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf-8"),
);

const requiredRange = rootPkg.engines?.node;
if (!requiredRange) {
  console.error(
    "[check-node-version] package.json engines.node is missing — refusing to run.",
  );
  process.exit(2);
}

const match = /^\s*>=\s*(\d+)/.exec(requiredRange);
if (!match) {
  console.error(
    `[check-node-version] unsupported engines.node syntax: ${requiredRange}. Only ">=N[.M[.P]]" is understood.`,
  );
  process.exit(2);
}
const requiredMajor = Number(match[1]);

const currentMajor = Number(process.versions.node.split(".")[0]);
if (currentMajor < requiredMajor) {
  console.error(
    `[check-node-version] FAIL: Node ${process.version} is below the required "${requiredRange}". ` +
      `See .node-version and package.json#engines.`,
  );
  process.exit(1);
}
