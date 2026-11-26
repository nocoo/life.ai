import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { syntheticHealthFiles } from "../health-fixture";
import { importFootprintFixture } from "./footprint-fixture";
import { expect, test } from "./public-context-fixture";

const date = "2026-09-20";
const dayQuery =
	"/api/data/apple-health/series?start=2026-09-19T16:00:00Z&end=2026-09-20T16:00:00Z";

test("ZIP and directory imports preserve health, replay unchanged, and tell the waking day's story", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const files = syntheticHealthFiles(date);
	const zip = new ZipWriter(new BlobWriter("application/zip"));
	for (const [path, content] of Object.entries(files))
		await zip.add(path, new BlobReader(new Blob([content])));
	const archive = await zip.close();
	await page.goto("/data/apple-health");
	await expect(page.getByRole("heading", { name: "Apple Health", exact: true })).toBeVisible();
	await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
		name: "synthetic-health.zip",
		mimeType: "application/zip",
		buffer: Buffer.from(await archive.arrayBuffer()),
	});
	await expect(page.getByRole("heading", { name: "本次预览" })).toBeVisible();
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	const before = await (await page.request.get(dayQuery)).json();
	const directory = await mkdtemp(join(tmpdir(), "life-health-browser-"));
	try {
		for (const [path, contents] of Object.entries(files)) {
			const file = join(directory, path);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, contents);
		}
		await page.reload();
		await page
			.getByLabel("选择完整 Apple 健康导出文件夹")
			.setInputFiles(join(directory, "apple_health_export"));
		await expect(page.getByRole("heading", { name: "本次预览" })).toBeVisible();
		await page.getByRole("button", { name: "开始导入", exact: true }).click();
		await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
		await expect(page.getByText(/未变 3 日/)).toBeVisible();
		expect(await (await page.request.get(dayQuery)).json()).toEqual(before);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
	await importFootprintFixture(page.request, [
		{
			title: "GPS 轨迹点",
			key: "health-workout-a",
			occurredAt: "2026-09-19T23:45:00Z",
			data: { latitude: 31, longitude: 121 },
		},
		{
			title: "GPS 轨迹点",
			key: "health-workout-b",
			occurredAt: "2026-09-20T00:15:00Z",
			data: { latitude: 31.02, longitude: 121.02 },
		},
	]);
	await page.goto(`/?day=${date}`);
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.locator('[data-hour="6"] [data-health-kind="sleep"]')).toContainText("23:00");
	await expect(page.locator('[data-health-kind="pressure"]')).toContainText("118");
	await expect(page.locator('[data-health-kind="workout"]')).toContainText("骑行");
	expect(errors).toEqual([]);
});
