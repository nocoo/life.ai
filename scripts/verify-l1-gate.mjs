import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preCommit = readFileSync(join(repoRoot, ".husky/pre-commit"), "utf8");
const hookCommand = readFileSync(join(repoRoot, "scripts/run-hook-command.mjs"), "utf8");
const unitCoverage = readFileSync(join(repoRoot, "scripts/run-unit-coverage.mjs"), "utf8");
const verifySummary = readFileSync(join(repoRoot, "scripts/verify-coverage-summary.mjs"), "utf8");
const marker = crypto.randomUUID();

function run(cmd, args, { cwd, env, capture = true, timeout = 90_000 } = {}) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, {
			cwd,
			env,
			detached: true,
			stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
		});
		let output = "";
		child.stdout?.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			output += chunk;
		});
		const timer = setTimeout(() => {
			if (child.pid) {
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch {}
			}
			reject(new Error(`timed out: ${[cmd, ...args].join(" ")}`));
		}, timeout);
		const finish = (error) => {
			clearTimeout(timer);
			if (error) reject(error);
			else resolvePromise(output);
		};
		child.once("error", (error) => finish(error));
		child.once("exit", (code, signal) => {
			if (code === 0 && !signal) finish(undefined);
			else finish(new Error(`${[cmd, ...args].join(" ")} failed (${code ?? signal})\n${output}`));
		});
	});
}

function git(repo, args, env) {
	return spawnSync("git", args, { cwd: repo, env, encoding: "utf8", stdio: captureOutput(env) });
}

function captureOutput(env) {
	return env.LIFE_VERIFY_CAPTURE === "1" ? "pipe" : "inherit";
}

async function gitAsync(repo, args, env) {
	const text = await run("git", args, { cwd: repo, env, capture: true });
	return text;
}

async function waitUntil(check, timeoutMs = 5000) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for condition");
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

const source = "export function absolute(value: number) { return value < 0 ? -value : value; }\n";
const tests =
	'import { expect, test } from "vitest"; import { absolute } from "./source"; test("boundaries", () => { expect(absolute(-1)).toBe(1); expect(absolute(0)).toBe(0); expect(absolute(1)).toBe(1); });\n';
const vitestConfig = `import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		allowOnly: false,
		include: ["sample.test.ts"],
		coverage: {
			provider: "v8",
			include: ["source.ts"],
			reporter: ["text", "json-summary", "html"],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
		},
	},
});
`;

function writeFixtureFiles(repo) {
	mkdirSync(join(repo, "scripts"), { recursive: true });
	writeFileSync(join(repo, ".git/hooks/pre-commit"), preCommit);
	chmodSync(join(repo, ".git/hooks/pre-commit"), 0o755);
	writeFileSync(join(repo, "scripts/run-hook-command.mjs"), hookCommand);
	writeFileSync(join(repo, "scripts/run-unit-coverage.mjs"), unitCoverage);
	writeFileSync(join(repo, "scripts/verify-coverage-summary.mjs"), verifySummary);
	writeFileSync(
		join(repo, "package.json"),
		`${JSON.stringify(
			{
				scripts: {
					"test:coverage": "node scripts/run-unit-coverage.mjs",
					typecheck: "tsc --noEmit -p tsconfig.json",
					lint: "biome check --error-on-warnings .",
				},
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(
		join(repo, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "Bundler",
				},
				files: ["source.ts"],
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(
		join(repo, "biome.json"),
		`${JSON.stringify(
			{
				files: { includes: ["source.ts", "sample.test.ts"] },
				formatter: { enabled: false },
				assist: { enabled: false },
				linter: {
					enabled: true,
					rules: { recommended: true, suspicious: { noDebugger: "warn" } },
				},
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(join(repo, "vitest.config.ts"), vitestConfig);
	writeFileSync(join(repo, "source.ts"), source);
	writeFileSync(join(repo, "sample.test.ts"), tests);
	writeFileSync(join(repo, "bun.lock"), readFileSync(join(repoRoot, "bun.lock"), "utf8"));
	writeFileSync(join(repo, ".gitignore"), "node_modules/\ncoverage/\ntest-results/\n");
	try {
		execFileSync("cp", [
			"-R",
			"--reflink=auto",
			join(repoRoot, "node_modules"),
			join(repo, "node_modules"),
		]);
	} catch {
		execFileSync("cp", ["-R", join(repoRoot, "node_modules"), join(repo, "node_modules")]);
	}
}

function bootstrapEnv(root, home, tmp) {
	const env = {
		...process.env,
		HOME: home,
		TMPDIR: tmp,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		LIFE_VERIFY_CAPTURE: "1",
		LIFE_TEST_STAGE_READY: join(root, "stage-ready"),
	};
	for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "HUSKY"]) {
		delete env[key];
	}
	return env;
}

async function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "life-l1-proof-"));
	const home = join(root, "home");
	const tmp = join(root, "tmp");
	const repo = join(root, "repo");
	mkdirSync(home);
	mkdirSync(tmp);
	mkdirSync(repo);
	writeFileSync(join(root, "run-id"), marker);
	const env = bootstrapEnv(root, home, tmp);
	git(repo, ["init", "-b", "main"], env);
	git(repo, ["config", "user.name", "Life L1 Fixture"], env);
	git(repo, ["config", "user.email", "l1-proof@example.test"], env);
	git(repo, ["config", "core.hooksPath", ".git/hooks"], env);
	writeFixtureFiles(repo);
	for (const path of [
		".gitignore",
		"package.json",
		"tsconfig.json",
		"biome.json",
		"vitest.config.ts",
		"source.ts",
		"sample.test.ts",
		"bun.lock",
		"scripts/run-hook-command.mjs",
		"scripts/run-unit-coverage.mjs",
		"scripts/verify-coverage-summary.mjs",
	]) {
		git(repo, ["add", path], env);
	}
	return { root, repo, env, tmp };
}

async function rejectCommit(repo, env, label, requiredOutput) {
	const before = (await gitAsync(repo, ["rev-parse", "HEAD"], env)).trim();
	let output = "";
	try {
		await gitAsync(repo, ["commit", "-m", `test: reject ${label}`], env);
		throw new Error(`Probe ${label} should have been rejected`);
	} catch (error) {
		output = String(error);
	}
	if (requiredOutput && !output.includes(requiredOutput)) {
		throw new Error(`Probe ${label} missing expected output (${requiredOutput}): ${output}`);
	}
	if ((await gitAsync(repo, ["rev-parse", "HEAD"], env)).trim() !== before) {
		throw new Error(`Probe ${label} advanced HEAD`);
	}
	await gitAsync(repo, ["reset", "--hard", "HEAD"], env);
	console.log(`已证实拒绝：${label}`);
}

const { root, repo, env } = await createFixture();
try {
	await gitAsync(repo, ["commit", "-m", "test: healthy seed"], env);
	console.log("已证实：Husky 健康输入提交成功");

	writeFileSync(join(repo, "sample.test.ts"), tests.replace("toBe(1)", "toBe(9)"));
	await gitAsync(repo, ["add", "sample.test.ts"], env);
	await rejectCommit(repo, env, "unit failure", "FAIL");

	for (const metric of ["statements", "branches", "functions", "lines"]) {
		writeFileSync(
			join(repo, "vitest.config.ts"),
			vitestConfig.replace(`${metric}: 95`, `${metric}: 101`),
		);
		await gitAsync(repo, ["add", "vitest.config.ts"], env);
		await rejectCommit(repo, env, `${metric} coverage`, metric);
		writeFileSync(join(repo, "vitest.config.ts"), vitestConfig);
		await gitAsync(repo, ["add", "vitest.config.ts"], env);
	}

	for (const severity of ["warn", "error"]) {
		writeFileSync(join(repo, "source.ts"), `${source}debugger;\n`);
		if (severity === "error") {
			writeFileSync(
				join(repo, "biome.json"),
				readFileSync(join(repo, "biome.json"), "utf8").replace('"warn"', '"error"'),
			);
		}
		await gitAsync(repo, ["add", "source.ts", "biome.json"], env);
		await rejectCommit(repo, env, `lint ${severity}`, "noDebugger");
	}
	writeFileSync(join(repo, "source.ts"), source);
	writeFileSync(
		join(repo, "biome.json"),
		`${JSON.stringify(
			{
				files: { includes: ["source.ts", "sample.test.ts"] },
				formatter: { enabled: false },
				assist: { enabled: false },
				linter: { enabled: true, rules: { recommended: true, suspicious: { noDebugger: "warn" } } },
			},
			null,
			"\t",
		)}\n`,
	);
	await gitAsync(repo, ["add", "source.ts", "biome.json"], env);

	writeFileSync(join(repo, "source.ts"), `${source}const invalid: string = 1;\n`);
	await gitAsync(repo, ["add", "source.ts"], env);
	await rejectCommit(repo, env, "type error", "TS2322");

	writeFileSync(
		join(repo, "sample.test.ts"),
		tests.replace('test("boundaries"', 'test.only("boundaries"'),
	);
	await gitAsync(repo, ["add", "sample.test.ts"], env);
	await rejectCommit(repo, env, "focused test", ".only");

	writeFileSync(
		join(repo, "sample.test.ts"),
		tests.replace('test("boundaries"', 'test.skip("boundaries"'),
	);
	await gitAsync(repo, ["add", "sample.test.ts"], env);
	await rejectCommit(repo, env, "skipped suite", "threshold");
	writeFileSync(join(repo, "sample.test.ts"), tests);
	await gitAsync(repo, ["add", "sample.test.ts"], env);

	writeFileSync(join(repo, "source.ts"), source.replace("-value", "value"));
	await gitAsync(repo, ["add", "source.ts"], env);
	await rejectCommit(repo, env, "staged logic bug", "FAIL");

	writeFileSync(join(repo, "source.ts"), source.replace("-value", "value"));
	await gitAsync(repo, ["add", "source.ts"], env);
	writeFileSync(join(repo, "source.ts"), source);
	await rejectCommit(repo, env, "staged bug with unstaged fix", "FAIL");

	const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
	manifest.scripts.typecheck = "definitely-missing-life-tool";
	writeFileSync(join(repo, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	await gitAsync(repo, ["add", "package.json"], env);
	await rejectCommit(repo, env, "missing tool");

	writeFileSync(join(repo, "scripts/run-unit-coverage.mjs"), "process.exit(0);\n");
	await gitAsync(repo, ["add", "scripts/run-unit-coverage.mjs"], env);
	await rejectCommit(repo, env, "missing coverage report", "coverage summary is missing");
	writeFileSync(join(repo, "scripts/run-unit-coverage.mjs"), unitCoverage);
	await gitAsync(repo, ["add", "scripts/run-unit-coverage.mjs"], env);

	writeFileSync(
		join(repo, "scripts/run-unit-coverage.mjs"),
		'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.LIFE_TEST_STAGE_READY, String(process.pid));\nawait new Promise(() => {});\n',
	);
	await gitAsync(repo, ["add", "scripts/run-unit-coverage.mjs"], env);
	const child = spawn("sh", [join(repo, ".git/hooks/pre-commit")], {
		cwd: repo,
		env,
		stdio: "ignore",
		detached: true,
	});
	const exited = new Promise((resolvePromise) => {
		child.once("exit", (code) => resolvePromise(code));
	});
	await waitUntil(() => existsSync(env.LIFE_TEST_STAGE_READY), 15_000);
	child.kill("SIGTERM");
	const interruptStatus = await Promise.race([
		exited,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("hook interrupt did not exit")), 8000),
		),
	]);
	if (interruptStatus !== 143 && interruptStatus !== 130) {
		throw new Error(`interrupt probe exited with ${interruptStatus}, expected 143 or 130`);
	}
	console.log("已证实拒绝：信号中断");
	writeFileSync(join(repo, "scripts/run-unit-coverage.mjs"), unitCoverage);
	await gitAsync(repo, ["add", "scripts/run-unit-coverage.mjs"], env);

	rmSync(join(repo, "node_modules"), { recursive: true, force: true });
	await rejectCommit(repo, env, "missing node_modules", "node_modules is required");
	try {
		execFileSync("cp", [
			"-R",
			"--reflink=auto",
			join(repoRoot, "node_modules"),
			join(repo, "node_modules"),
		]);
	} catch {
		execFileSync("cp", ["-R", join(repoRoot, "node_modules"), join(repo, "node_modules")]);
	}

	console.log("L1 门禁负向与正向探针全部完成。");
} finally {
	if (existsSync(join(root, "run-id")) && readFileSync(join(root, "run-id"), "utf8") === marker) {
		rmSync(root, { recursive: true, force: true });
		console.log(`已清理探针目录 ${root}`);
	} else {
		console.error(`拒绝清理：标记不一致 ${root}`);
		process.exit(1);
	}
}
