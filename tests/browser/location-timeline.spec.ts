import type { ImportRecord } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { expect, test } from "./public-context-fixture";

test("inline GPS maps preserve chronological returns, collapse repetition, and reset on a new day", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1920, height: 1080 });
	await page.clock.install({ time: new Date("2091-01-10T04:00:00Z") });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const records: ImportRecord[] = [
		["00:05", 0],
		["00:15", 0.001],
		["01:05", 0.001],
		["01:15", 0.002],
		["03:05", 0.1],
		["03:06", 0.104],
		["06:05", 0],
		["06:06", 0.02],
	].map(([clock, longitude], index) => ({
		key: `inline-${index}`,
		occurredAt: `2091-01-10T${clock}:00Z`,
		title: "Synthetic position",
		data: { latitude: 0, longitude: Number(longitude) },
	}));
	await importFootprintFixture(page.request, records);
	await page.goto("/?day=2091-01-10");
	const visits = page.locator("[data-visit]");
	await expect(visits).toHaveCount(4);
	await expect(visits.nth(0)).toHaveAttribute("data-state", "open");
	await expect(visits.nth(1)).toHaveAttribute("data-state", "closed");
	await expect(visits.nth(2)).toHaveAttribute("data-state", "open");
	await expect(visits.nth(3)).toHaveAttribute("data-state", "open");
	await expect(page.locator('[data-hour="9"] [data-visit]')).toContainText("2 个点");
	await expect(page.locator('[data-hour="9"] .story-map-canvas')).toHaveCount(0);
	await expect(page.locator('[data-hour="10"] [data-visit]')).toHaveCount(0);
	await expect(page.locator('[data-hour="14"] [data-visit]')).toHaveAttribute("data-state", "open");
	await expect(page.locator('[data-hour="5"] [data-solar="sunrise"] time')).toHaveText("05:30");
	await expect(page.locator('[data-hour="18"] [data-solar="sunset"] time')).toHaveText("18:15");
	const firstMap = visits.first().getByRole("application");
	await firstMap.scrollIntoViewIfNeeded();
	await expect(firstMap).toHaveAttribute("data-map-loaded", "true");
	const marker = firstMap.locator(".story-place-marker").first();
	await expect(marker).toHaveClass(/story-speed-slow/);
	const alignment = await marker.evaluate((element) => {
		const label = element.querySelector("span");
		if (!label) throw new Error("The area marker needs a number label");
		const circle = element.getBoundingClientRect();
		const text = label.getBoundingClientRect();
		return {
			x: Math.abs(circle.x + circle.width / 2 - text.x - text.width / 2),
			y: Math.abs(circle.y + circle.height / 2 - text.y - text.height / 2),
		};
	});
	expect(alignment.x).toBeLessThan(1);
	expect(alignment.y).toBeLessThan(1);
	await marker.click();
	await expect(firstMap.locator(".leaflet-popup-content")).toContainText("估算");
	await page.getByRole("combobox", { name: "时间线地图" }).click();
	await page.getByRole("option", { name: "展开全部地图", exact: true }).click();
	await expect(page.locator('[data-visit][data-state="open"]')).toHaveCount(4);
	await visits.nth(2).getByRole("application").scrollIntoViewIfNeeded();
	await expect(visits.nth(2).locator(".story-place-marker")).toHaveClass(/story-speed-medium/);
	await visits.nth(3).getByRole("application").scrollIntoViewIfNeeded();
	await expect(visits.nth(3).locator(".story-place-marker")).toHaveClass(/story-speed-fast/);
	await page.getByRole("combobox", { name: "时间线地图" }).click();
	await page.getByRole("option", { name: "收起全部地图", exact: true }).click();
	await expect(page.locator("[data-visit] .story-map-canvas")).toHaveCount(0);
	await expect(page.locator("#life-day-map .story-map-canvas")).toHaveCount(1);
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page).toHaveURL(/day=2091-01-11/);
	await expect(page.getByRole("combobox", { name: "时间线地图" })).toHaveText(
		"展开地图 · 合并重复",
	);
	await page.getByRole("button", { name: "前一天", exact: true }).click();
	await expect(page.locator('[data-visit][data-state="open"]')).toHaveCount(3);
	await expect(page.locator('[data-visit][data-state="closed"]')).toHaveCount(1);
	const dataReads: string[] = [];
	page.on("request", (request) => {
		if (/\/api\/(events|data\/footprint\/days)/.test(request.url())) dataReads.push(request.url());
	});
	await page.getByRole("combobox", { name: "位置分组范围" }).click();
	await page.getByRole("option", { name: "区域半径 10 km", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "位置分组范围" })).toHaveText("区域半径 10 km");
	expect(dataReads).toEqual([]);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(visits.first().getByRole("application")).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	expect(errors).toEqual([]);
});
