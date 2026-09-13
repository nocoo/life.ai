import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

mkdirSync("test-results/security", { recursive: true });
const snapshot = mkdtempSync(join(tmpdir(), "life-secrets-"));
try {
	const listing = Bun.spawn(
		["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ stdout: "pipe", stderr: "inherit" },
	);
	const files = (await new Response(listing.stdout).text()).split("\0").filter(Boolean);
	if (await listing.exited) throw new Error("Cannot enumerate repository files for secret scan");
	for (const file of new Set(files)) {
		if (!existsSync(file) || !lstatSync(file).isFile()) continue;
		const target = join(snapshot, file);
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(file, target);
	}
	// Scan the reviewable working tree, without node_modules, local secrets or generated artifacts.
	const commands = [
		[
			"gitleaks",
			"dir",
			snapshot,
			"--redact",
			"--no-banner",
			"--ignore-gitleaks-allow",
			`--config=${resolve(".gitleaks.toml")}`,
			"--report-format=json",
			`--report-path=${resolve("test-results/security/gitleaks.json")}`,
		],
		[
			"osv-scanner",
			"scan",
			"source",
			"--lockfile=bun.lock",
			"--format=json",
			"--output-file=test-results/security/osv.json",
		],
	];
	const results = await Promise.all(
		commands.map(async (command) => {
			const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit" });
			return { tool: command[0], code: await child.exited };
		}),
	);
	const failures = results.filter((result) => result.code !== 0);
	if (failures.length)
		throw new Error(
			`Security gate failed: ${failures.map((result) => `${result.tool} (${result.code})`).join(", ")}. See test-results/security.`,
		);
	console.log("G2 passed: gitleaks working-tree scan and OSV lockfile scan.");
} finally {
	rmSync(snapshot, { recursive: true });
}
