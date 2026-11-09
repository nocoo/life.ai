import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const report = join(root, "test-results", "unit.json");
const summaryPath = join(root, "coverage", "coverage-summary.json");
const floors = { statements: 95, branches: 95, functions: 95, lines: 95 };

mkdirSync(join(root, "test-results"), { recursive: true });
rmSync(report, { force: true });
rmSync(summaryPath, { force: true });

const vitest = join(root, "node_modules", "vitest", "vitest.mjs");
const snapshot = /life-index-/.test(root);
const args = [
	vitest,
	"run",
	"--coverage",
	"--reporter=default",
	"--reporter=json",
	`--outputFile.json=${report}`,
];
if (snapshot) {
	args.push("--pool=forks", "--maxWorkers", "2", "--exclude", "scripts/pre-commit-index.test.mjs");
}
const result = spawnSync(process.execPath, args, {
	cwd: root,
	stdio: "inherit",
	env: { ...process.env, CI: "true" },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

if (!readFileSync(summaryPath, "utf8").trim()) {
	console.error("Unit gate: coverage summary is missing or empty");
	process.exit(1);
}

const unit = JSON.parse(readFileSync(report, "utf8"));
if (
	!unit.success ||
	unit.numTotalTests < 1 ||
	unit.numPassedTests !== unit.numTotalTests ||
	unit.numPendingTests ||
	unit.numTodoTests ||
	unit.numFailedTests
) {
	console.error("Unit gate: suite must be nonempty, complete and fully passing");
	process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
for (const [metric, floor] of Object.entries(floors)) {
	const entry = summary.total?.[metric];
	if (!entry || !Number.isFinite(entry.pct) || entry.total === 0 || entry.pct < floor) {
		console.error(`Unit gate: ${metric} coverage ${entry?.pct ?? "missing"} is below ${floor}%`);
		process.exit(1);
	}
}
