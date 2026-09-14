import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./public-context-fixture";

const key = `gk_${"a".repeat(64)}`;
test.beforeEach(async ({ request }) => {
	for (const provider of ["gecko", "firefly"])
		expect((await request.delete(`/api/settings/sources/${provider}`)).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
	for (const provider of ["gecko", "firefly"])
		await request.delete(`/api/settings/sources/${provider}`);
	await request.put("/api/settings/general", { data: { places: [], routine: null } });
});

test("settings add both sources, test saved connections and erase Gecko's saved key", async ({
	page,
	request,
}) => {
	await page.goto("/settings/sources");
	const gecko = page.locator('[data-day-source="gecko"]');
	const firefly = page.locator('[data-day-source="firefly"]');
	await expect(gecko.getByRole("button", { name: "添加 Gecko", exact: true })).toBeDisabled();
	await page.getByLabel("Gecko API Key").fill(key);
	await expect(page.getByLabel("Gecko API Key")).toHaveAttribute("type", "password");
	await gecko.getByRole("button", { name: "添加 Gecko", exact: true }).click();
	await expect(page.getByLabel("Gecko API Key")).toHaveValue("");
	await expect(gecko.getByText("已启用", { exact: true })).toBeVisible();
	await gecko.getByRole("button", { name: "测试连接", exact: true }).click();
	await expect(page.getByText("Gecko 连接成功", { exact: true })).toBeVisible();
	await expect(firefly.locator("input")).toHaveCount(0);
	await firefly.getByRole("button", { name: "添加 Firefly", exact: true }).click();
	await firefly.getByRole("button", { name: "测试连接", exact: true }).click();
	await expect(page.getByText("Firefly 连接成功", { exact: true })).toBeVisible();
	await page.reload();
	await expect(gecko.getByText("已启用", { exact: true })).toBeVisible();
	await expect(firefly.getByText("已启用", { exact: true })).toBeVisible();
	const response = await request.get("/api/settings/sources");
	expect(await response.text()).not.toContain(key);
	await gecko.getByRole("button", { name: "停用", exact: true }).click();
	await expect(gecko.getByText("未启用", { exact: true })).toBeVisible();
	await gecko.getByRole("button", { name: "添加 Gecko", exact: true }).click();
	await expect(gecko.getByText("已启用", { exact: true })).toBeVisible();
	await gecko.getByRole("button", { name: "移除 Gecko", exact: true }).click();
	await expect(gecko.getByRole("button", { name: "添加 Gecko", exact: true })).toBeDisabled();
});

test("timeline displays hourly activity, illustrated articles and inferred commutes across hours", async ({
	page,
	request,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const provider of ["gecko", "firefly"])
		expect(
			(
				await request.put(`/api/settings/sources/${provider}`, {
					data: { enabled: true, ...(provider === "gecko" ? { apiKey: key } : {}) },
				})
			).ok(),
		).toBe(true);
	expect(
		(
			await request.put("/api/settings/general", {
				data: {
					places: [
						{ id: "home", label: "家", latitude: 0, longitude: 0, radiusMeters: 100 },
						{ id: "work", label: "公司", latitude: 0, longitude: 0.09, radiusMeters: 100 },
						{ id: "poi", label: "图书馆", latitude: 0, longitude: 0.03, radiusMeters: 100 },
					],
					routine: null,
				},
			})
		).ok(),
	).toBe(true);
	const positions = [0, 0.01, 0.02, 0.03, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09];
	expect(
		(
			await request.post("/api/imports", {
				data: {
					source: "journal",
					records: positions.map((longitude, i) => ({
						key: `source-test-gps-${i}`,
						occurredAt: new Date(Date.parse("2026-09-10T00:55:00Z") + i * 60000).toISOString(),
						precision: "second",
						title: "测试位置采样",
						data: { latitude: 0, longitude },
					})),
				},
			})
		).ok(),
	).toBe(true);
	await page.addInitScript(() => localStorage.setItem("theme", "dark"));
	await page.goto("/?day=2026-09-10");
	await expect(page.locator('[data-story-kind="computer"]')).toHaveCount(2);
	await expect(page.locator('[data-hour="9"] [data-story-kind="computer"]')).toContainText(
		"活动 10 分",
	);
	await expect(page.locator('[data-hour="11"] [data-story-kind="computer"]')).toHaveCount(0);
	const article = page.locator('[data-story-kind="article"]');
	await expect(article.getByRole("heading", { name: "记录一段通勤" })).toBeVisible();
	await expect(article).toContainText("10:23:45");
	await expect(article).toContainText("测试作者");
	await expect(article.getByRole("link")).toHaveAttribute(
		"href",
		"https://lizheng.blog/2026/09/commute-10",
	);
	await article.scrollIntoViewIfNeeded();
	await expect
		.poll(() => article.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
	const commute = page.locator('[data-story-kind="travel"][data-commute="outbound"]');
	await expect(commute).toHaveCount(1);
	await expect(commute).toContainText("可能的通勤 · 去程");
	await expect(commute).toContainText("66.7 km/h");
	await expect(commute).toContainText("2 分 短暂停等");
	await expect(commute).toContainText("图书馆");
	await expect(page.locator('[data-hour="8"] [data-story-kind="travel"]')).toHaveCount(1);
	await expect(
		page.locator('[data-hour="9"]').getByRole("link", { name: "可能的通勤持续，回到开始时段" }),
	).toHaveAttribute("href", "#life-hour-8");
	await commute.scrollIntoViewIfNeeded();
	const accessibility = await new AxeBuilder({ page })
		.include('[data-story-kind="travel"]')
		.include('[data-story-kind="article"]')
		.include('[data-story-kind="computer"]')
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await page.setViewportSize({ width: 390, height: 844 });
	await commute.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expect(commute).toBeVisible();
	expect(errors).toEqual([]);
});

test("an unavailable source leaves the day readable and offers a retry", async ({ page }) => {
	await page.route("**/api/day-sources?**", (route) =>
		route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({
				error: { code: "source_unavailable", message: "Gecko 暂时无法读取" },
			}),
		}),
	);
	await page.goto("/?day=2026-09-09");
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.getByText("Gecko 暂时无法读取", { exact: true })).toBeVisible();
	await expect(page.getByText("无法加载这一天", { exact: true })).toHaveCount(0);
});
