import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const floors = { statements: 95, branches: 95, functions: 95, lines: 95 };
const summaryPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"coverage",
	"coverage-summary.json",
);
let summary;
try {
	summary = JSON.parse(readFileSync(summaryPath, "utf8"));
} catch {
	console.error("pre-commit: coverage summary is missing or unreadable");
	process.exit(1);
}
for (const [metric, floor] of Object.entries(floors)) {
	const entry = summary.total?.[metric];
	if (!entry || !Number.isFinite(entry.pct) || entry.total === 0 || entry.pct < floor) {
		console.error(`pre-commit: ${metric} coverage ${entry?.pct ?? "missing"} is below ${floor}%`);
		process.exit(1);
	}
}
