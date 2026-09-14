import AxeBuilder from "@axe-core/playwright";
import { importHealthFixture } from "./health-fixture";
import { expect, test } from "./public-context-fixture";

test("sleep stages show a proportional cross-midnight chart with keyboard details in both themes", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1440, height: 1100 });
	const stages = [
		["AsleepCore", "23:00", "23:30"],
		["AsleepDeep", "23:30", "00:15"],
		["AsleepCore", "00:15", "00:45"],
		["AsleepREM", "00:45", "01:00"],
		["Awake", "01:00", "01:02"],
		["AsleepCore", "01:02", "02:15"],
		["AsleepDeep", "02:15", "02:45"],
		["AsleepCore", "02:45", "03:30"],
		["AsleepREM", "03:30", "04:30"],
		["AsleepCore", "04:30", "05:10"],
		["Awake", "05:10", "05:11"],
		["AsleepREM", "05:11", "05:40"],
	] as const;
	const at = (clock: string) =>
		`${clock.startsWith("23:") ? "2026-11-07" : "2026-11-08"}T${clock}:00+08:00`;
	await importHealthFixture(
		page.request,
		stages.map(([stage, start, end]) => ({
			occurredAt: at(start),
			endAt: at(end),
			data: {
				type: "HKCategoryTypeIdentifierSleepAnalysis",
				value: `HKCategoryValueSleepAnalysis${stage}`,
			},
		})),
	);
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/?day=2026-11-08");
	const sleep = page.locator('[data-health-kind="sleep"] .health-story-card');
	const chart = sleep.locator(".health-sleep-chart");
	await expect(chart.getByRole("img", { name: "睡眠阶段", exact: true })).toBeVisible();
	await expect(sleep.locator(".health-sleep-duration")).toContainText("6 小时 37 分");
	await expect(chart.locator(".health-sleep-row")).toHaveText([
		"清醒",
		"快速动眼睡眠",
		"核心睡眠",
		"深度睡眠",
	]);
	await expect(chart.locator("[data-sleep-stage]")).toHaveCount(stages.length);
	await expect(chart.locator(".health-sleep-axis")).toContainText("00:00");
	const rows = await chart
		.locator(".health-sleep-segment")
		.evaluateAll((segments) =>
			Object.fromEntries(
				segments.map((segment) => [
					segment.getAttribute("data-sleep-stage"),
					segment.getBoundingClientRect().y,
				]),
			),
		);
	expect(rows.awake).toBeLessThan(rows.rem ?? 0);
	expect(rows.rem).toBeLessThan(rows.core ?? 0);
	expect(rows.core).toBeLessThan(rows.deep ?? 0);
	const core = chart.locator('[data-sleep-stage="core"]').first();
	await core.click();
	await expect(chart.locator("figcaption")).toContainText("23:00");
	await expect(chart.locator("figcaption")).toContainText("23:30");
	await expect(chart.locator("figcaption")).toContainText("30 分");
	const rem = chart.locator('[data-sleep-stage="rem"]').first();
	await rem.focus();
	await page.keyboard.press("Enter");
	await expect(rem).toHaveAttribute("aria-pressed", "true");
	await expect(chart.locator("figcaption")).toContainText("快速动眼睡眠");
	await sleep.screenshot({ path: "test-results/l3/sleep-stages-light.png" });
	await page.setViewportSize({ width: 390, height: 1100 });
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(page.locator("html")).toHaveClass(/dark/);
	await sleep.scrollIntoViewIfNeeded();
	await page.mouse.move(0, 0);
	await page.keyboard.press("Escape");
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	for (const tick of await chart.locator(".health-sleep-axis span").all())
		expect((await tick.boundingBox())?.height).toBeLessThan(20);
	const bounds = await chart.boundingBox();
	for (const segment of await chart.locator(".health-sleep-segment").all()) {
		const box = await segment.boundingBox();
		expect(box?.x).toBeGreaterThanOrEqual((bounds?.x ?? 0) - 1);
		expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
			(bounds?.x ?? 0) + (bounds?.width ?? 0) + 2,
		);
	}
	const accessibility = await new AxeBuilder({ page })
		.include(".health-story-card")
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await sleep.screenshot({ path: "test-results/l3/sleep-stages-mobile-dark.png" });
	expect(errors).toEqual([]);
});
