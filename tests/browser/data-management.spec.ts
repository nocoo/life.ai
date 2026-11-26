import AxeBuilder from "@axe-core/playwright";
import type { DataOverview, FootprintDaysResult } from "../../src/models/data-management";
import { expect, test } from "./public-context-fixture";

const range = "/api/data/footprint/days?start=2088-01-09&end=2088-01-11";

test("Footprint uploads are whole-day replacements, overview dates open real daily maps", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("**://tile.openstreetmap.org/**", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#e7ebe5" d="M0 0h256v256H0z"/></svg>',
		}),
	);
	const points = [
		'<trkpt lat="0" lon="1"><time>2088-01-09T23:55:00Z</time><ele>-5</ele><speed>-1</speed><course>-1</course></trkpt>',
		'<trkpt lat="0.001" lon="1.001"><time>2088-01-10T00:05:00Z</time></trkpt>',
		'<trkpt lat="0.002" lon="1.002"><time>2088-01-10T00:15:00Z</time></trkpt>',
		'<trkpt lat="0.003" lon="1.003"><time>2088-01-10T00:25:00Z</time></trkpt>',
	];
	const upload = async (body: string[]) => {
		await page.goto("/data/footprint");
		await expect(page.getByText("当前使用的是隔离测试数据。", { exact: true })).toBeVisible();
		await page.locator('input[type="file"]').setInputFiles({
			name: "synthetic-footprint.gpx",
			mimeType: "application/gpx+xml",
			buffer: Buffer.from(`<gpx><trk><trkseg>${body.join("")}</trkseg></trk></gpx>`),
		});
		await expect(page.getByRole("heading", { name: "本次预览" })).toBeVisible();
		await page.getByRole("button", { name: "开始上传", exact: true }).click();
		await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	};
	await upload(points);
	const before = (await (await page.request.get(range)).json()) as { data: FootprintDaysResult };
	expect(before.data.days.map((day) => day.recordCount)).toEqual([1, 3]);

	await page.getByRole("button", { name: "数据概览", exact: true }).click();
	await expect(page.getByRole("heading", { name: "数据概览", exact: true })).toBeVisible();
	const overview = (await (await page.request.get("/api/data/overview")).json()) as {
		data: DataOverview;
	};
	const footprint = overview.data.providers.find((provider) => provider.id === "footprint");
	expect(footprint?.coverage.some((day) => day.utcDay === Date.parse("2088-01-10"))).toBe(true);
	const provider = page
		.locator(".data-provider-card")
		.filter({ has: page.getByRole("heading", { name: "Footprint", exact: true }) });
	await provider.getByRole("button", { name: /查看 Footprint 的 .* UTC 覆盖日/ }).click();
	const dateLink = provider.locator('a[href="/?day=2088-01-10"]');
	await dateLink.click();
	await expect(page).toHaveURL(/\?day=2088-01-10/);
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.getByRole("application", { name: "当日足迹地图" }).first()).toBeVisible();
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	expect(errors).toEqual([]);
});
