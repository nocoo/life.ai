import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDiskHealthStaging, openHealthDirectory } from "../../../scripts/health-staging";
import { parseHealthExport } from "../../../src/models/apple-health";
import { HEALTH_DAY_MS, type HealthNode } from "../../../src/models/health-types";

const cleanup: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});
async function temporary() {
	const directory = await mkdtemp(join(tmpdir(), "life-health-staging-test-"));
	cleanup.push(directory);
	return directory;
}

describe("health local IO", () => {
	it("appends out-of-order UTC days on disk without merging, trimming or dropping duplicates", async () => {
		const staging = await createDiskHealthStaging();
		const first: HealthNode = {
			name: "Record",
			attributes: { value: "1.000", original: "line\nbreak", custom: "值" },
			children: [{ name: "Unknown", attributes: {}, text: "text" }],
		};
		try {
			await staging.append(
				new Map([
					[HEALTH_DAY_MS, [first]],
					[0, [first]],
					[2 * HEALTH_DAY_MS, []],
				]),
			);
			await staging.append(new Map([[0, [first]]]));
			expect(await staging.days()).toEqual([0, HEALTH_DAY_MS]);
			expect(await staging.read(0)).toEqual([first, first]);
			expect(await staging.read(HEALTH_DAY_MS)).toEqual([first]);
			await expect(staging.read(1)).rejects.toThrow("日键");
			await expect(staging.append(new Map([[NaN, [first]]]))).rejects.toThrow("日键");
			await expect(staging.read(2 * HEALTH_DAY_MS)).rejects.toThrow();
		} finally {
			await staging.clear();
		}
		expect(await staging.days()).toEqual([]);
		await expect(staging.read(0)).rejects.toThrow("清理");
		await staging.clear();
	});

	it("opens nested Unicode paths lazily and imports through the shared stream parser", async () => {
		const directory = await temporary();
		await mkdir(join(directory, "nested"));
		await writeFile(join(directory, "nested", "empty.bin"), "");
		await writeFile(
			join(directory, "导出.xml"),
			'<HealthData><Record startDate="2026-01-02" type="Height" value="1.23"/></HealthData>',
		);
		const files = await openHealthDirectory(directory);
		expect(files.map((file) => file.path)).toEqual(["nested/empty.bin", "导出.xml"]);
		expect(await new Response(files[0]?.stream()).text()).toBe("");
		const result = await parseHealthExport(files, await createDiskHealthStaging());
		expect(result).toMatchObject({ recordCount: 1, xmlRecordCount: 1 });
	});

	it("rejects file and directory symlinks, including a file replaced after enumeration", async () => {
		const directory = await temporary();
		const original = join(directory, "real.xml");
		await writeFile(original, "<HealthData/>");
		await expect(openHealthDirectory(original)).rejects.toThrow("目录");
		const link = join(directory, "link");
		await symlink(directory, link);
		await expect(openHealthDirectory(directory)).rejects.toThrow("符号链接");
		await expect(openHealthDirectory(link)).rejects.toThrow("目录");
		await rm(link);
		const files = await openHealthDirectory(directory);
		await rm(original);
		await symlink("/etc/hosts", original);
		expect(() => files[0]?.stream()).toThrow();
	});

	it("refuses an extracted path with a backslash and propagates missing directories", async () => {
		const directory = await temporary();
		await writeFile(join(directory, "unsafe\\path"), "x");
		await expect(openHealthDirectory(directory)).rejects.toThrow("安全");
		await expect(openHealthDirectory(join(directory, "missing"))).rejects.toThrow();
	});

	it("rejects special files without trying to read from them", async () => {
		const directory = await temporary();
		const server = createServer();
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(join(directory, "socket"), resolve);
		});
		try {
			await expect(openHealthDirectory(directory)).rejects.toThrow("仅支持普通文件和目录");
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
	});
});
