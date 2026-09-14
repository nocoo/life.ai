import { constants, createReadStream, openSync } from "node:fs";
import { appendFile, lstat, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { healthFilePath } from "../src/models/apple-health";
import {
	HEALTH_DAY_MS,
	type HealthInputFile,
	type HealthNode,
	type HealthStaging,
} from "../src/models/health-types";

export async function createDiskHealthStaging(): Promise<HealthStaging> {
	const directory = await mkdtemp(join(tmpdir(), "life-health-staging-"));
	const days = new Set<number>();
	let cleared = false;
	const file = (utcDay: number) => {
		if (cleared) throw new Error("健康临时分桶已清理");
		if (!Number.isSafeInteger(utcDay) || utcDay % HEALTH_DAY_MS !== 0)
			throw new Error("健康临时分桶日键无效");
		return join(directory, `${utcDay}.jsonl`);
	};
	return {
		async append(groups) {
			for (const [utcDay, nodes] of groups) {
				const path = file(utcDay);
				if (!nodes.length) continue;
				await appendFile(path, `${nodes.map((node) => JSON.stringify(node)).join("\n")}\n`, {
					mode: 0o600,
				});
				days.add(utcDay);
			}
		},
		async days() {
			return [...days].sort((a, b) => a - b);
		},
		async read(utcDay) {
			const text = await readFile(file(utcDay), "utf8");
			return text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as HealthNode);
		},
		async clear() {
			await rm(directory, { recursive: true, force: true });
			cleared = true;
			days.clear();
		},
	};
}

/** Enumerate an extracted export without following symlinks or eagerly reading file bodies. */
export async function openHealthDirectory(path: string): Promise<HealthInputFile[]> {
	const input = resolve(path);
	const info = await lstat(input);
	if (!info.isDirectory()) throw new Error("请选择解压后的健康导出目录");
	const root = await realpath(input);
	const files: HealthInputFile[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isSymbolicLink()) throw new Error("健康导出目录不能包含符号链接");
			if (entry.isDirectory()) await visit(absolute);
			else if (entry.isFile()) {
				const stat = await lstat(absolute);
				const filePath = healthFilePath(relative(root, absolute).split(sep).join("/"));
				files.push({
					path: filePath,
					size: stat.size,
					stream: () =>
						Readable.toWeb(
							createReadStream(absolute, {
								highWaterMark: 64 * 1024,
								fd: openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW),
								autoClose: true,
							}),
						) as unknown as ReadableStream<Uint8Array>,
				});
			} else throw new Error("健康导出目录仅支持普通文件和目录");
		}
	};
	await visit(root);
	return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
