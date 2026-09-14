import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { CreatedConnect } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { STORY_DAY, storyImports, storySnapshots } from "./story-fixture";

test("a whole day reads along one trunk with grouped evidence, contextual maps and a closing summary", async ({
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
	await expect(page.locator('[data-story-kind="sleep"]')).toHaveCount(1);
	await expect(page.getByText("延续自前一天", { exact: true })).toBeVisible();
	await expect(page.locator('[data-hour="3"] .story-continuation')).toContainText("睡眠持续");
	const allDay = page.getByRole("region", { name: "全天记录", exact: true });
	await expect(allDay).toContainText("九月的一个普通星期四");
	await expect(allDay).not.toContainText("00:00");
	const seven = page.locator('[data-hour="7"]');
	await expect(seven.locator('[data-story-kind="health"]')).toHaveCount(1);
	await expect(seven.locator('[data-story-kind="workout"]')).toHaveCount(1);
	const body = await seven.locator('[data-story-kind="health"]').boundingBox();
	const moment = await seven.locator('[data-story-kind="workout"]').boundingBox();
	const clock = await seven.locator(".story-clock").boundingBox();
	expect(body && moment && clock).toBeTruthy();
	if (!body || !moment || !clock) throw new Error("Missing story branches");
	expect(body.x + body.width).toBeLessThan(clock.x);
	expect(moment.x).toBeGreaterThan(clock.x + clock.width);
	await seven
		.locator('[data-story-kind="health"]')
		.getByRole("button", { name: "查看 47 条原始记录" })
		.click();
	await expect(seven.locator(".story-record-list .story-event")).toHaveCount(47);
	await seven
		.locator('[data-story-kind="health"]')
		.getByRole("button", { name: "查看 47 条原始记录" })
		.click();
	const eight = page.locator('[data-hour="8"]');
	await expect(eight.getByRole("application", { name: "当日足迹地图", exact: true })).toHaveClass(
		/leaflet-container/,
	);
	await eight.getByRole("button", { name: /查看08:20.*的足迹/ }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("这一段足迹");
	await expect(
		dialog.getByRole("application", { name: "所选时段足迹地图", exact: true }),
	).toBeVisible();
	await expect(dialog).toContainText("20 个点");
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await page.getByRole("link", { name: "跳转至下午", exact: true }).click();
	await expect(page).toHaveURL(/#life-hour-12$/);
	await expect(page.locator('[data-hour="12"] .story-clock')).toBeInViewport();
	const closing = page.getByRole("region", { name: "日终回看", exact: true });
	await expect(closing.getByRole("heading", { name: "一日累计", exact: true })).toBeVisible();
	await expect(closing.getByRole("heading", { name: "当日摘要", exact: true })).toBeVisible();
	const closingBox = await closing.boundingBox();
	const lastHourBox = await page.locator('[data-hour="23"]').boundingBox();
	expect(closingBox?.y ?? 0).toBeGreaterThan(lastHourBox?.y ?? Infinity);
	await page.getByRole("link", { name: "跳转至上午", exact: true }).click();
	await page.screenshot({ path: "test-results/l3/story-desktop-morning.png", fullPage: true });
	const desktopAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(desktopAxe.violations).toEqual([]);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(eight.locator(".story-lane-both")).toHaveCount(1);
	expect(
		await eight
			.locator("[data-story-kind]")
			.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-story-kind"))),
	).toEqual(["money", "journey", "health"]);
	await expect(eight.locator('[data-story-kind="journey"] + .story-map-branch')).toHaveCount(1);
	await eight.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: "test-results/l3/story-mobile.png", fullPage: true });
	await page.getByRole("button", { name: "切换主题" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.evaluate(async () => {
		await Promise.all(document.getAnimations().map((animation) => animation.finished));
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
	await expect(page.getByRole("heading", { name: "当日摘要", exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});
