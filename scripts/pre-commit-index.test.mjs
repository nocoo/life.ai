import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preCommit = readFileSync(join(repoRoot, ".husky/pre-commit"), "utf8");
const hookCommand = readFileSync(join(repoRoot, "scripts/run-hook-command.mjs"), "utf8");
const fixtures = [];
const children = [];

afterEach(async () => {
	for (const { child, exited } of children.splice(0)) {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (error) {
			if (error.code !== "ESRCH") throw error;
		}
		await exited;
	}
	for (const directory of fixtures.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function git(repo, args, env) {
	return execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
}

async function waitUntil(check, timeoutMs) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > timeoutMs) throw new Error("timed out");
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

function snapshots(tmp) {
	return readdirSync(tmp).filter((name) => name.startsWith("life-index-"));
}

function createFixture({ commit = true, coverage = 'node -e "process.exit(0)"' } = {}) {
	const root = mkdtempSync(join(tmpdir(), "life-precommit-"));
	fixtures.push(root);
	const home = join(root, "home");
	const tmp = join(root, "tmp");
	const repo = join(root, "repo");
	mkdirSync(home);
	mkdirSync(tmp);
	mkdirSync(repo);
	writeFileSync(
		join(home, ".gitconfig"),
		"[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n",
	);
	const env = {
		...process.env,
		HOME: home,
		TMPDIR: tmp,
		GIT_CONFIG_NOSYSTEM: "1",
		LIFE_TEST_STAGE_READY: join(root, "stage-ready"),
	};
	for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "HUSKY"]) {
		delete env[key];
	}
	git(repo, ["init", "-b", "main"], env);
	git(repo, ["config", "core.hooksPath", ".git/hooks"], env);
	writeFileSync(join(repo, ".git/hooks/pre-commit"), preCommit);
	chmodSync(join(repo, ".git/hooks/pre-commit"), 0o755);
	mkdirSync(join(repo, "scripts"));
	writeFileSync(join(repo, "scripts/run-hook-command.mjs"), hookCommand);
	writeFileSync(
		join(repo, "package.json"),
		`${JSON.stringify(
			{
				scripts: {
					"test:coverage": coverage,
					typecheck: "tsc --noEmit -p tsconfig.json",
					lint: 'node -e "process.exit(0)"',
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
				},
				files: ["main.ts"],
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(join(repo, "bun.lock"), "dummy-lock\n");
	writeFileSync(join(repo, "main.ts"), "const value: number = 1;\n");
	symlinkSync(join(repoRoot, "node_modules"), join(repo, "node_modules"));
	git(
		repo,
		["add", "package.json", "tsconfig.json", "bun.lock", "main.ts", "scripts/run-hook-command.mjs"],
		env,
	);
	if (commit) git(repo, ["commit", "-m", "seed"], env);
	return { repo, env, tmp };
}

describe("pre-commit index snapshot", () => {
	it("rejects a staged type error when the worktree copy is fixed", () => {
		const { repo, env } = createFixture();
		const seed = git(repo, ["rev-parse", "HEAD"], env).trim();
		writeFileSync(join(repo, "scratch.txt"), "untracked\n");
		writeFileSync(join(repo, "main.ts"), 'const value: number = "staged-bad";\n');
		git(repo, ["add", "main.ts"], env);
		writeFileSync(join(repo, "main.ts"), "const value: number = 1;\n");
		const result = spawnSync("git", ["commit", "-m", "should-reject"], {
			cwd: repo,
			env,
			encoding: "utf8",
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr + result.stdout).toContain("TS2322");
		expect(git(repo, ["rev-parse", "HEAD"], env).trim()).toBe(seed);
		expect(git(repo, ["show", ":main.ts"], env)).toContain("staged-bad");
		expect(readFileSync(join(repo, "main.ts"), "utf8")).toBe("const value: number = 1;\n");
		expect(readFileSync(join(repo, "scratch.txt"), "utf8")).toBe("untracked\n");
	}, 30000);

	it("commits a healthy index when the worktree copy is broken", () => {
		const { repo, env } = createFixture();
		writeFileSync(join(repo, "main.ts"), "const value: number = 2;\n");
		git(repo, ["add", "main.ts"], env);
		writeFileSync(join(repo, "main.ts"), 'const value: number = "worktree-bad";\n');
		const result = spawnSync("git", ["commit", "-m", "should-accept"], {
			cwd: repo,
			env,
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		expect(git(repo, ["show", "HEAD:main.ts"], env)).toBe("const value: number = 2;\n");
		expect(readFileSync(join(repo, "main.ts"), "utf8")).toBe(
			'const value: number = "worktree-bad";\n',
		);
	}, 30000);

	it("exits nonzero on interruption and removes the snapshot", async () => {
		for (const [signal, code, resistTermination] of [
			["SIGTERM", 143],
			["SIGINT", 130],
			["SIGHUP", 129],
			["SIGTERM", 143, true],
		]) {
			const resist = resistTermination ? "process.on('SIGTERM', () => {}); " : "";
			const { repo, env, tmp } = createFixture({
				commit: false,
				coverage: `node -e "${resist}require('node:fs').writeFileSync(process.env.LIFE_TEST_STAGE_READY, String(process.pid)); setTimeout(() => {}, 30000)"`,
			});
			const child = spawn("sh", [join(repo, ".git/hooks/pre-commit")], {
				cwd: repo,
				env,
				stdio: "ignore",
				detached: true,
			});
			const exited = new Promise((resolve) => {
				child.once("exit", (exitCode) => resolve(exitCode));
			});
			children.push({ child, exited });
			await waitUntil(() => existsSync(env.LIFE_TEST_STAGE_READY), 5000);
			const stagePid = Number(readFileSync(env.LIFE_TEST_STAGE_READY, "utf8"));
			expect(snapshots(tmp), signal).toHaveLength(1);
			child.kill(signal);
			let timer;
			let status;
			try {
				status = await Promise.race([
					exited,
					new Promise((_, reject) => {
						timer = setTimeout(() => reject(new Error("interrupted hook did not exit")), 5000);
					}),
				]);
			} finally {
				clearTimeout(timer);
			}
			expect(status, signal).toBe(code);
			expect(snapshots(tmp), signal).toEqual([]);
			await waitUntil(() => {
				try {
					process.kill(stagePid, 0);
					return false;
				} catch (error) {
					if (error.code !== "ESRCH") throw error;
					return true;
				}
			}, 5000);
		}
	}, 30000);
});
