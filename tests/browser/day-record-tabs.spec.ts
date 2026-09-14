import AxeBuilder from "@axe-core/playwright";
import type { ImportRecord } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { expect, test } from "./public-context-fixture";

test("raw records load only in their tab, paginate, and reuse the selected day's data", async ({
	page,
}) => {
	await page.clock.install({ time: new Date("2092-04-15T04:00:00Z") });
	await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
	await page.setViewportSize({ width: 1920, height: 1080 });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const gps: ImportRecord[] = Array.from({ length: 205 }, (_, index) => ({
		key: `record-tab-${index}`,
		occurredAt: new Date(Date.parse("2092-04-15T00:00:00Z") + index * 60_000).toISOString(),
		title: "Synthetic point",
		data: { latitude: index * 0.00001, longitude: 0 },
	}));
	await importFootprintFixture(page.request, [
		...gps,
		{
			key: "record-tab-next-day",
			occurredAt: "2092-04-16T00:00:00Z",
			title: "Synthetic next day",
			data: { latitude: 0, longitude: 0 },
		},
	]);
	const imported = await page.request.post("/api/imports", {
		data: {
			source: "journal",
			records: [
				{
					key: "record-tab-day",
					occurredAt: "2092-04-15",
					precision: "day",
					title: "只有日期的随记",
				},
				{
					key: "record-tab-interval",
					occurredAt: "2092-04-15T00:30:00Z",
					endAt: "2092-04-15T03:30:00Z",
					precision: "minute",
					title: "跨小时的随记",
					data: { nested: { complete: "保留嵌套内容" } },
				},
				{
					key: "record-tab-hour",
					occurredAt: "2092-04-15T04:00:00Z",
					precision: "hour",
					title: "只有小时的随记",
				},
			],
		},
	});
	expect(imported.ok()).toBe(true);
	const tableModules: string[] = [];
	const dataReads: string[] = [];
	page.on("request", (request) => {
		if (/day-records/.test(request.url())) tableModules.push(request.url());
		if (/\/api\/(events|sources)(?:\?|$)/.test(request.url())) dataReads.push(request.url());
	});
	await page.goto("/?day=2092-04-15");
	await expect(page.getByRole("tab", { name: "时间线", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.getByRole("table")).toHaveCount(0);
	expect(tableModules).toEqual([]);
	const readsAfterLoad = dataReads.length;
	await page.getByRole("tab", { name: "位置记录", exact: true }).click();
	const locations = page.getByRole("table", { name: "位置记录", exact: true });
	await expect(locations.locator("tbody tr")).toHaveCount(50);
	await expect(locations.locator("tbody tr").first()).toContainText("08:00:00");
	await expect(page.getByRole("application")).toHaveCount(0);
	await expect(page.locator("[data-hour]")).toHaveCount(0);
	expect(tableModules.length).toBeGreaterThan(0);
	const pages = page.getByRole("navigation", { name: "Pagination", exact: true });
	await expect(pages.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
	await pages.getByRole("button", { name: "Next page", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(50);
	await expect(locations.locator("tbody tr").first()).toContainText("08:50:00");
	await pages.getByRole("button", { name: "Last page", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(5);
	await expect(locations.locator("tbody tr").last()).toContainText("11:24:00");
	await expect(pages.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
	await pages.getByRole("button", { name: "First page", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(50);
	await locations.getByRole("button", { name: "时间", exact: true }).click();
	await expect(locations.locator("tbody tr").first()).toContainText("11:24:00");
	expect(dataReads).toHaveLength(readsAfterLoad);
	await page.screenshot({ path: "test-results/l3/locations-table-desktop.png" });
	const desktopAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(desktopAxe.violations).toEqual([]);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.getByRole("button", { name: "切换主题" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.evaluate(async () => {
		await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
	});
	const mobileAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(mobileAxe.violations).toEqual([]);
	await page.screenshot({ path: "test-results/l3/locations-table-mobile-dark.png" });
	await page.setViewportSize({ width: 1920, height: 1080 });
	await page.getByRole("tab", { name: "其他记录", exact: true }).click();
	const records = page.getByRole("table", { name: "其他记录", exact: true });
	await expect(locations).toHaveCount(0);
	await expect(records.locator("tbody tr")).toHaveCount(3);
	await expect(records.getByRole("row", { name: /只有日期的随记/ })).toContainText("全天");
	await expect(records.getByRole("row", { name: /跨小时的随记/ })).toHaveCount(1);
	await expect(records.getByRole("row", { name: /只有小时的随记/ })).toContainText("小时");
	await records.getByRole("button", { name: "查看完整记录：跨小时的随记", exact: true }).click();
	await expect(page.getByRole("dialog")).toContainText("保留嵌套内容");
	await expect(page.getByRole("dialog")).toContainText("2092-04-15T00:30:00.000Z");
	await page.keyboard.press("Escape");
	await expect(
		records.getByRole("button", { name: "查看完整记录：跨小时的随记", exact: true }),
	).toBeFocused();
	await page.getByRole("tab", { name: "位置记录", exact: true }).click();
	await expect(locations.locator("tbody tr").first()).toContainText("08:00:00");
	await pages.getByRole("button", { name: "Last page", exact: true }).click();
	await page.getByRole("combobox", { name: "按来源筛选", exact: true }).click();
	await page.getByRole("option", { name: "Journal", exact: true }).click();
	await expect(locations).toContainText("这一天没有位置记录。");
	await page.getByRole("combobox", { name: "按来源筛选", exact: true }).click();
	await page.getByRole("option", { name: "全部来源", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(50);
	await expect(locations.locator("tbody tr").first()).toContainText("08:00:00");
	expect(dataReads).toHaveLength(readsAfterLoad);
	await pages.getByRole("button", { name: "Last page", exact: true }).click();
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(1);
	await expect(pages.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
	await page.getByRole("button", { name: "前一天", exact: true }).click();
	await expect(locations.locator("tbody tr")).toHaveCount(50);
	await page.getByRole("tab", { name: "时间线", exact: true }).click();
	await expect(locations).toHaveCount(0);
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	const map = page.locator("[data-visit]").first().getByRole("application");
	await map.scrollIntoViewIfNeeded();
	await expect(map).toHaveAttribute("data-map-loaded", "true");
	expect(errors).toEqual([]);
});
