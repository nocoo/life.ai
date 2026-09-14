import AxeBuilder from "@axe-core/playwright";
import type { DaySummaryResult } from "../../src/models/ai";
import { githubFixtureKey, githubFixtureQuery as query } from "../github-fixture";
import { expect, test } from "./public-context-fixture";

test.use({ hasTouch: true });
test.afterEach(async ({ request }) => {
	for (const provider of ["gecko", "firefly", "github"])
		await request.delete(`/api/settings/sources/${provider}`);
});

test("AI summaries contain independent activity sections, compact information controls and safe failed regeneration", async ({
	page,
	request,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1920, height: 1600 });
	const config = {
		provider: "custom",
		model: "life-test-ok",
		baseURL: process.env.LIFE_TEST_AI_URL,
		sdkType: "anthropic",
		authType: "apiKey",
		apiKey: process.env.LIFE_TEST_AI_KEY,
	};
	expect((await request.put("/api/settings/ai", { data: config })).ok()).toBe(true);
	for (const [provider, apiKey] of [
		["gecko", `gk_${"a".repeat(64)}`],
		["firefly", undefined],
		["github", githubFixtureKey],
	])
		expect(
			(
				await request.put(`/api/settings/sources/${provider}`, { data: { enabled: true, apiKey } })
			).ok(),
		).toBe(true);
	expect(
		(
			await request.post("/api/imports", {
				data: {
					source: "journal",
					records: [
						{
							key: "diary-browser-place",
							occurredAt: "2026-09-10T03:00:00Z",
							title: "河畔读书",
							content: "上午在河边读书。",
							data: { latitude: 31.23, longitude: 121.47 },
						},
					],
				},
			})
		).ok(),
	).toBe(true);
	const generated = await request.post("/api/day-summary", { data: query });
	expect(generated.ok()).toBe(true);
	const saved = ((await generated.json()) as { data: DaySummaryResult }).data;
	const summary = saved.summary;
	if (!summary?.sections) throw new Error("Missing structured diary fixture");
	await page.goto(`/?day=${query.date}`);
	const diary = page.locator("#life-day-close");
	const summaryCard = diary.locator("[data-ai-summary]");
	await expect(summaryCard.getByRole("heading", { name: "AI 总结", exact: true })).toBeVisible();
	await expect(summaryCard.locator("[data-diary-section]")).toHaveCount(3);
	await expect(diary.locator(".story-card")).toHaveCount(1);
	const narrative = diary.locator(".story-summary-body");
	await expect(narrative).toHaveText(summary.content);
	await expect(narrative).not.toContainText('"sections"');
	await expect(diary.locator("[data-diary-section]")).toHaveCount(3);
	for (const [key, title, icon] of [
		["development", "电脑活动", "monitor"],
		["writing", "文章创作", "notebook-pen"],
		["github", "GitHub", "git-fork"],
	] as const) {
		const card = diary.locator(`[data-diary-section="${key}"]`);
		const trigger = card.getByRole("button", { name: title, exact: true });
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(card.locator(`.story-card-icon svg.lucide-${icon}`)).toBeVisible();
		await expect(card.locator(".story-summary-highlights")).toBeHidden();
		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		await expect(card.getByRole("listitem")).toHaveText(summary.sections[key]?.highlights ?? []);
	}
	await expect(
		diary.locator('[data-diary-section="development"] button[aria-expanded="true"]'),
	).toHaveCount(1);
	await expect(
		diary.locator('[data-diary-section="writing"] button[aria-expanded="true"]'),
	).toHaveCount(1);
	const info = diary.getByRole("button", { name: "查看AI 总结的来源与说明", exact: true });
	await info.click();
	await expect(page.getByRole("tooltip")).toContainText("life-test-ok");
	await page.keyboard.press("Escape");
	await page.mouse.move(0, 0);
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(diary.getByRole("button", { name: "生成信息", exact: true })).toHaveCount(0);
	await diary.screenshot({ path: "test-results/l3/diary-sections-desktop.png" });

	const weather = page.locator(".day-context-card");
	await expect(weather.locator(".day-weather-current")).toBeVisible();
	await expect(weather).not.toContainText("模型再分析");
	await expect(weather).not.toContainText("连续采样最多");
	await weather.getByRole("button", { name: "查看天气与天光的来源与说明" }).click();
	await expect(page.getByRole("tooltip")).toContainText("连续采样最多");
	await expect(page.getByRole("tooltip").getByRole("link", { name: "Open-Meteo" })).toHaveAttribute(
		"href",
		"https://open-meteo.com/",
	);
	await page.keyboard.press("Escape");
	const overview = page.locator(".story-overview");
	await expect(overview).not.toContainText("汇总当前可见来源");
	await overview.getByRole("button", { name: "查看当天概况的来源与说明" }).focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("tooltip")).toContainText("汇总当前可见来源");
	await page.keyboard.press("Escape");

	expect(
		(
			await request.put("/api/settings/ai", {
				data: { ...config, model: "life-test-invalid-fields" },
			})
		).ok(),
	).toBe(true);
	await diary.getByRole("button", { name: "再写一则", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "生成", exact: true }).click();
	await expect(diary.getByText("生成失败", { exact: true })).toBeVisible();
	await expect(narrative).toHaveText(summary.content);
	await expect(diary.locator("[data-diary-section]")).toHaveCount(3);
	const reread = await request.get(`/api/day-summary?${new URLSearchParams(query)}`);
	expect(((await reread.json()) as { data: DaySummaryResult }).data.summary).toEqual(summary);

	await page.setViewportSize({ width: 390, height: 844 });
	await info.scrollIntoViewIfNeeded();
	await info.tap();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await info.tap();
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await page.screenshot({ path: "test-results/l3/diary-sections-mobile.png" });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const accessibility = await new AxeBuilder({ page })
		.include("#life-day-close")
		.include(".day-context-card")
		.include(".story-overview")
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page).toHaveURL(/day=2026-09-11/);
	await expect(diary.locator("[data-diary-section]")).toHaveCount(0);
	await page.getByRole("button", { name: "前一天", exact: true }).click();
	await expect(diary.locator("[data-diary-section]")).toHaveCount(3);
	await expect(diary.locator(".story-summary-highlights:visible")).toHaveCount(0);
	expect(errors).toEqual([]);
});
