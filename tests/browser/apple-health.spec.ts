import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import type { HealthFileManifest, HealthFilePart } from "../../src/models/health-types";
import { syntheticHealthFiles } from "../health-fixture";
import { importFootprintFixture } from "./footprint-fixture";
import { syntheticLargeHealthAttachment } from "./health-fixture";
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
	await page.getByRole("link", { name: "查看数据概览", exact: true }).click();
	await expect(page.getByRole("region", { name: "健康维度与附件完整性" })).toContainText(
		"5,120 个心电波形样本",
	);
	await expect(page.getByText(/睡眠目标等系统设置完整保留在原始记录中/)).toBeVisible();
	await page.getByRole("button", { name: /查看全部 .* 个维度/ }).click();
	await expect(page.getByRole("table", { name: "健康数据各维度统计" })).toContainText("步行速度");

	await importFootprintFixture(page.request, [
		{
			title: "GPS 轨迹点",
			key: "health-sleep-a",
			occurredAt: "2026-09-19T14:50:00Z",
			data: { latitude: 31, longitude: 121 },
		},
		{
			title: "GPS 轨迹点",
			key: "health-sleep-b",
			occurredAt: "2026-09-19T22:40:00Z",
			data: { latitude: 31.0001, longitude: 121.0001 },
		},
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
	let rawRequests = 0;
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.pathname === "/api/data/apple-health/series" && url.searchParams.get("view") === "all")
			rawRequests++;
	});
	await page.goto(`/?day=${date}`);
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	const sleep = page.locator('[data-hour="6"] [data-health-kind="sleep"]');
	await expect(sleep).toContainText("23:00");
	await expect(sleep).toContainText("06:40");
	await expect(sleep).toContainText(/7\s*小时\s*40\s*分/);
	await expect(sleep.getByRole("img", { name: "睡眠阶段", exact: true })).toBeVisible();
	await expect(page.locator('[data-hour="0"] [data-health-kind="sleep"]')).toHaveCount(0);
	await expect(page.locator('[data-hour="0"] .story-continuation')).toContainText("睡眠中");
	const pressure = page.locator('[data-health-kind="pressure"]');
	await expect(pressure).toHaveCount(1);
	await expect(pressure).toContainText("118");
	await expect(pressure).toContainText("76");
	await expect(pressure).toContainText("08:45");
	const workout = page.locator('[data-health-kind="workout"]');
	await expect(workout).toContainText("骑行");
	await expect(workout).toContainText(/45\s*分/);
	await expect(workout.getByRole("application", { name: "锻炼与足迹合并地图" })).toHaveCount(1);
	await expect(
		page.locator('[data-hour="7"] [data-visit], [data-hour="8"] [data-visit]'),
	).toHaveCount(0);
	const ecg = page.locator('[data-health-kind="ecg"]');
	await ecg.scrollIntoViewIfNeeded();
	await expect(ecg.getByRole("img", { name: /心电图 0 到 5 秒/ })).toBeVisible();
	await expect(ecg).toContainText("64 bpm");
	await ecg.getByRole("button", { name: "下一段", exact: true }).click();
	await expect(ecg.getByRole("img", { name: /心电图 5 到 10 秒/ })).toBeVisible();
	await expect(ecg.getByRole("button", { name: "下一段", exact: true })).toBeDisabled();
	expect(rawRequests).toBe(0);
	await page.getByRole("tab", { name: "其他记录", exact: true }).click();
	const raw = page.getByRole("table", { name: "其他记录", exact: true });
	await expect(raw).toContainText("步行速度");
	await expect(raw).toContainText("Fixture Apple Watch");
	expect(rawRequests).toBe(1);
	await raw.getByRole("button", { name: "查看完整记录：血压组合", exact: true }).click();
	await expect(page.getByRole("dialog")).toContainText("Synthetic measurement");
	await page.keyboard.press("Escape");
	await page.getByRole("tab", { name: "时间线", exact: true }).click();
	await expect(raw).toHaveCount(0);
	await page.getByRole("tab", { name: "其他记录", exact: true }).click();
	await expect(raw).toBeVisible();
	expect(rawRequests).toBe(1);
	await page.getByRole("tab", { name: "时间线", exact: true }).click();
	await page.screenshot({ path: "test-results/l3/apple-health-desktop.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await ecg.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	for (
		let attempt = 0;
		attempt < 3 &&
		!(await page.evaluate(() => document.documentElement.classList.contains("dark")));
		attempt++
	)
		await page.getByRole("button", { name: "切换主题", exact: true }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.evaluate(async () => {
		await Promise.allSettled(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
				.map((animation) => animation.finished),
		);
	});
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	await page.screenshot({ path: "test-results/l3/apple-health-mobile-dark.png", fullPage: true });
	expect(errors).toEqual([]);
});

test("a large incompressible attachment previews in a Chrome Worker and preserves every stored byte", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const fixture = syntheticLargeHealthAttachment();
	const sourceHash = createHash("sha256").update(fixture.bytes).digest("hex");
	const zip = new ZipWriter(new BlobWriter("application/zip"));
	await zip.add("apple_health_export/export.xml", new BlobReader(new Blob([fixture.xml])));
	await zip.add(`apple_health_export/${fixture.path}`, new BlobReader(new Blob([fixture.bytes])));
	const archive = await zip.close();
	await page.goto("/data/apple-health");
	await expect(page.getByText("当前使用的是隔离测试数据。", { exact: true })).toBeVisible();
	const worker = page.waitForEvent("worker");
	await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
		name: "large-synthetic-health.zip",
		mimeType: "application/zip",
		buffer: Buffer.from(await archive.arrayBuffer()),
	});
	expect((await worker).url()).toContain("health-import.worker");
	await expect(page.getByRole("heading", { name: "本次预览" })).toBeVisible();
	await expect(page.getByText("解析失败", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	const fileUrl = `/api/data/apple-health/file?path=${encodeURIComponent(fixture.path)}`;
	const response = await page.request.get(fileUrl);
	expect(response.ok(), await response.text()).toBe(true);
	const { data: manifest } = (await response.json()) as { data: HealthFileManifest };
	expect(manifest).toMatchObject({ path: fixture.path, rawBytes: fixture.bytes.length });
	expect(manifest.parts).toHaveLength(1);
	const partResponse = await page.request.get(`${fileUrl}&part=0`);
	expect(partResponse.ok(), await partResponse.text()).toBe(true);
	const { data: part } = (await partResponse.json()) as { data: HealthFilePart };
	expect(part).toMatchObject(manifest.parts[0] as HealthFileManifest["parts"][number]);
	const compressed = Buffer.from(part.body, "base64");
	// The previous 64 KiB argument spread overflowed Chrome's Worker stack here.
	expect(compressed.length).toBeGreaterThan(64 * 1024);
	const decoded = gunzipSync(compressed);
	expect(decoded.byteLength).toBe(fixture.bytes.length);
	expect(decoded.equals(Buffer.from(fixture.bytes))).toBe(true);
	expect(createHash("sha256").update(decoded).digest("hex")).toBe(sourceHash);
	expect(part.contentHash).toBe(sourceHash);
	expect(errors).toEqual([]);
});

test("a corrupt archive stays local and the old import page has no Health entry", async ({
	page,
}) => {
	const writes: string[] = [];
	page.on("request", (request) => {
		if (request.method() !== "GET" && request.url().includes("/api/data/"))
			writes.push(request.url());
	});
	await page.goto("/data/apple-health");
	await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
		name: "broken.zip",
		mimeType: "application/zip",
		buffer: Buffer.from("invalid archive"),
	});
	await expect(page.getByText("解析失败", { exact: true })).toBeVisible();
	expect(writes).toEqual([]);
	await page.goto("/imports");
	await expect(page.getByRole("radio", { name: /Apple|健康/ })).toHaveCount(0);
});
