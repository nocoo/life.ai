import AxeBuilder from "@axe-core/playwright";
import { githubFixtureKey, githubFixtureQuery } from "../github-fixture";
import { expect, test } from "./public-context-fixture";

test("daily cache management lists scoped and shared caches, recovers from failures, and clears without silently querying sources", async ({
	page,
	request,
}) => {
	for (const provider of ["gecko", "firefly", "github"])
		expect((await request.delete(`/api/settings/sources/${provider}`)).ok()).toBe(true);
	expect((await request.delete("/api/cache/github?scope=all")).ok()).toBe(true);
	expect(
		(
			await request.put("/api/settings/sources/github", {
				data: { enabled: true, apiKey: githubFixtureKey },
			})
		).ok(),
	).toBe(true);
	try {
		const nextDay = {
			...githubFixtureQuery,
			date: "2026-09-11",
			start: githubFixtureQuery.end,
			end: "2026-09-11T16:00:00.000Z",
		};
		expect((await request.get(`/api/day-sources?${new URLSearchParams(nextDay)}`)).ok()).toBe(true);
		const errors: string[] = [];
		const sourceReads: string[] = [];
		const cacheReads: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("request", (req) => {
			if (req.url().includes("/api/day-sources?")) sourceReads.push(req.url());
			if (req.url().includes("/api/cache?")) cacheReads.push(req.url());
		});
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto("/?day=2026-09-10");
		const cards = page.locator('[data-story-kind="github"]');
		await expect(cards).toHaveCount(5);
		expect(cacheReads).toEqual([]);
		const reads = sourceReads.length;
		const trigger = page.getByRole("button", { name: "管理数据缓存", exact: true });
		await page.route(
			"**/api/cache?**",
			(route) =>
				route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({
						error: { code: "database_unavailable", message: "缓存暂时无法读取" },
					}),
				}),
			{ times: 1 },
		);
		await trigger.click();
		const dialog = page.getByRole("dialog", { name: "数据缓存", exact: true });
		await expect(dialog).toContainText("缓存暂时无法读取");
		await dialog.getByRole("button", { name: "刷新缓存列表", exact: true }).click();
		await expect(dialog.locator("[data-cache-kind]")).toHaveCount(6);
		await expect(dialog.getByRole("combobox", { name: "缓存日期范围" })).toContainText(
			"2026-09-10",
		);
		const github = dialog.locator('[data-cache-kind="github"]');
		await expect(github).toContainText("1 条");
		await expect(dialog.locator('[data-cache-kind="place"]')).toContainText("跨日期共享");
		await dialog.getByRole("combobox", { name: "缓存日期范围" }).click();
		await page.getByRole("option", { name: "所有日期", exact: true }).click();
		await expect(github).toContainText("2 条");
		await dialog.getByRole("combobox", { name: "缓存日期范围" }).click();
		await page.getByRole("option", { name: "所选日期 · 2026-09-10", exact: true }).click();
		await expect(github).toContainText("1 条");
		await page.route(
			"**/api/cache/github?**",
			(route) =>
				route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({
						error: { code: "database_unavailable", message: "清除暂时失败，请重试" },
					}),
				}),
			{ times: 1 },
		);
		await github.getByRole("button", { name: "清除GitHub缓存", exact: true }).click();
		await expect(dialog).toContainText("清除暂时失败，请重试");
		await expect(github).toContainText("1 条");
		await github.getByRole("button", { name: "清除GitHub缓存", exact: true }).click();
		await expect(github).toContainText("0 条");
		await expect(
			github.getByRole("button", { name: "清除GitHub缓存", exact: true }),
		).toBeDisabled();
		await expect(dialog).toContainText("已显示的卡片暂时保留");
		expect(sourceReads).toHaveLength(reads);
		await expect(cards).toHaveCount(5);
		await dialog.getByRole("button", { name: "刷新缓存列表", exact: true }).click();
		await expect(github).toContainText("0 条");
		expect(sourceReads).toHaveLength(reads);
		await dialog.getByRole("combobox", { name: "缓存日期范围" }).click();
		await page.getByRole("option", { name: "所有日期", exact: true }).click();
		await expect(github).toContainText("1 条");
		const settings = (await (await request.get("/api/settings/sources")).json()).data as {
			provider: string;
			hasApiKey: boolean;
		}[];
		expect(settings.find((entry) => entry.provider === "github")?.hasApiKey).toBe(true);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 844 });
			await expect(dialog).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
			expect(
				(await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
			).toEqual([]);
			await page.screenshot({ path: `test-results/l3/cache-${width}.png` });
		}
		await page.keyboard.press("Escape");
		await expect(trigger).toBeFocused();
		await page.getByRole("button", { name: "后一天", exact: true }).click();
		await expect(page.locator("[data-github-empty]")).toBeVisible();
		await page.getByRole("button", { name: "前一天", exact: true }).click();
		await expect(cards).toHaveCount(5);
		expect(errors).toEqual([]);
	} finally {
		await request.delete("/api/settings/sources/github");
	}
});
