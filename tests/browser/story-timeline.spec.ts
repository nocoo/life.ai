import AxeBuilder from "@axe-core/playwright";
import type { CreatedConnect } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { importHealthFixture } from "./health-fixture";
import { importPixiuFixture } from "./pixiu-fixture";
import { expect, test } from "./public-context-fixture";
import { STORY_DAY, storyImports, storyPixiuRows, storySnapshots } from "./story-fixture";

test("a whole day reads along one trunk with grouped evidence, record tabs and contextual maps", async ({
	page,
}) => {
	await page.clock.install({ time: new Date(`${STORY_DAY}T04:00:00Z`) });
	await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	// A neutral tile keeps the real Leaflet map deterministic and avoids external requests in L3.
	await page.route("**://tile.openstreetmap.org/**", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#e7ebe5" d="M0 0h256v256H0z"/></svg>',
		}),
	);
	for (const [source, records] of Object.entries(storyImports)) {
		if (source === "apple-health") {
			await importHealthFixture(page.request, records);
			continue;
		}
		if (source === "footprint") {
			await importFootprintFixture(page.request, records);
			continue;
		}
		for (let offset = 0; offset < records.length; offset += 100) {
			const response = await page.request.post("/api/imports", {
				data: { source, records: records.slice(offset, offset + 100) },
			});
			expect(response.ok()).toBe(true);
		}
	}
	await importPixiuFixture(page.request, storyPixiuRows);
	const creation = await page.request.post("/api/connects", { data: { name: "实录日历" } });
	expect(creation.ok()).toBe(true);
	const { data: created } = (await creation.json()) as { data: CreatedConnect };
	for (const snapshot of storySnapshots) {
		const response = await page.request.post("/api/ingest", {
			headers: { Authorization: `Bearer ${created.token}` },
			data: snapshot,
		});
		expect(response.ok()).toBe(true);
	}
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.locator("[data-clock-mark]")).toHaveCount(24);
	await expect(page.locator('[data-health-kind="sleep"]')).toHaveCount(1);
	await expect(page.locator('[data-hour="6"] [data-health-kind="sleep"]')).toContainText("23:10");
	await expect(page.locator('[data-hour="6"] [data-health-kind="sleep"]')).toContainText("06:40");
	await expect(page.locator('[data-hour="3"] .story-continuation')).toContainText("睡眠中");
	const allDay = page.getByRole("region", { name: "全天记录", exact: true });
	await expect(allDay).toContainText("九月的一个普通星期四");
	await expect(allDay).not.toContainText("00:00");
	const seven = page.locator('[data-hour="7"]');
	await expect(seven.locator('[data-health-kind="moment"]').first()).toBeVisible();
	await expect(seven.locator('[data-health-kind="workout"] .story-workout')).toHaveCount(1);
	const body = await seven
		.locator('[data-health-kind="moment"] .story-branch')
		.first()
		.boundingBox();
	const moment = await seven.locator('[data-health-kind="workout"] .story-workout').boundingBox();
	const clock = await seven.locator(".story-clock").boundingBox();
	expect(body && moment && clock).toBeTruthy();
	if (!body || !moment || !clock) throw new Error("Missing story branches");
	expect(body.x + body.width).toBeLessThan(clock.x);
	expect(moment.x).toBeGreaterThan(clock.x + clock.width);
	await expect(seven).toContainText("6840 步");
	await expect(page.getByRole("table", { name: "其他记录", exact: true })).toHaveCount(0);
	await page.getByRole("tab", { name: "其他记录", exact: true }).click();
	const records = page.getByRole("table", { name: "其他记录", exact: true });
	await expect(records).toBeVisible();
	await expect(page.locator("[data-hour]")).toHaveCount(0);
	await records.getByRole("button", { name: "查看完整记录：睡眠", exact: true }).click();
	await expect(page.getByRole("dialog")).toContainText("HKCategoryValueSleepAnalysisAsleepCore");
	await page.keyboard.press("Escape");
	await page.getByRole("tab", { name: "时间线", exact: true }).click();
	await expect(records).toHaveCount(0);
	const eight = page.locator('[data-hour="8"]');
	const inlineMap = eight.getByRole("application", { name: /08:20.*的足迹地图/ });
	await inlineMap.scrollIntoViewIfNeeded();
	await expect(inlineMap).toHaveClass(/leaflet-container/);
	await expect(eight.locator(".story-map")).toContainText("20 个点");
	await eight.getByRole("button", { name: /收起08:20.*的地图/ }).click();
	await expect(inlineMap).toHaveCount(0);
	await eight.getByRole("button", { name: /展开08:20.*的地图/ }).click();
	await expect(inlineMap).toBeVisible();
	await expect(page.locator('[data-hour="5"] [data-solar="sunrise"]')).toContainText("05:30");
	await expect(page.locator('[data-hour="18"] [data-solar="sunset"]')).toContainText("18:15");
	await page.getByRole("link", { name: "跳转至下午", exact: true }).click();
	await expect(page).toHaveURL(/#life-hour-12$/);
	await expect(page.locator('[data-hour="12"] .story-clock')).toBeInViewport();
	const closing = page.getByRole("region", { name: "日终回看", exact: true });
	await expect(
		page.locator(".day-meta").getByRole("heading", { name: "一日累计", exact: true }),
	).toBeVisible();
	await expect(closing.getByRole("heading", { name: "当日日记", exact: true })).toBeVisible();
	const metaBox = await page.locator(".day-meta").boundingBox();
	const treeBox = await page.locator(".day-story-column").boundingBox();
	expect(metaBox && treeBox && metaBox.x > treeBox.x + treeBox.width).toBe(true);
	expect(await allDay.locator("xpath=ancestor::aside").count()).toBe(1);
	await page.getByRole("link", { name: "跳转至上午", exact: true }).click();
	await page.screenshot({ path: "test-results/l3/story-desktop-morning.png", fullPage: true });
	const desktopAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(desktopAxe.violations).toEqual([]);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(eight.locator(".story-visit").first()).toBeVisible();
	expect(
		await eight
			.locator("[data-story-kind]")
			.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-story-kind"))),
	).toEqual(["journey"]);
	await expect(eight.locator(".story-visit-map")).toHaveCount(1);
	await eight.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: "test-results/l3/story-mobile.png", fullPage: true });
	await page.getByRole("button", { name: "切换主题" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.evaluate(async () => {
		await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
	});
	const mobileAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(mobileAxe.violations).toEqual([]);
	await page.screenshot({ path: "test-results/l3/story-mobile-dark.png", fullPage: true });
	await page.getByRole("combobox", { name: "按来源筛选", exact: true }).click();
	await page.getByRole("option", { name: "实录日历", exact: true }).click();
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.locator('[data-story-kind="connect"]')).toHaveCount(2);
	await expect(page.locator('[data-story-kind="health"]')).toHaveCount(0);
	await expect(page.getByRole("application", { name: "当日足迹地图", exact: true })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "当日日记", exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});
