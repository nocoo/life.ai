import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { AiSettingsInput, DaySummaryResult } from "../../src/models/ai";

const transparentTile = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
	"base64",
);

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date("2026-09-13T04:00:00Z") });
	await page.route("**://*.tile.openstreetmap.org/**", (route) =>
		route.fulfill({ contentType: "image/png", body: transparentTile }),
	);
	await page.route("**://tile.openstreetmap.org/**", (route) =>
		route.fulfill({ contentType: "image/png", body: transparentTile }),
	);
});

test.afterEach(async ({ page }) => {
	// Finish profile/API handlers before Playwright closes their request context.
	await page.unrouteAll({ behavior: "wait" });
});

test("sidebar preserves the exact logo anchor and shows profile name/avatar with a failed-image fallback", async ({
	page,
}) => {
	let brokenAvatar = false;
	await page.route("https://avatar.example.test/owner.png", (route) =>
		brokenAvatar
			? route.abort("failed")
			: route.fulfill({
					status: 200,
					contentType: "image/png",
					body: transparentTile,
				}),
	);
	await page.route("**/api/session", async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		await route.fulfill({
			response,
			json: {
				data: { ...body.data, name: "Li Zheng", avatar: "https://avatar.example.test/owner.png" },
			},
		});
	});
	await page.goto("/");
	await expect(page.getByText("Li Zheng", { exact: true })).toBeVisible();
	await expect(page.getByRole("img", { name: "Li Zheng", exact: true })).toBeVisible();
	const logo = page.locator("[data-sidebar-logo]");
	const before = await logo.boundingBox();
	expect(before).not.toBeNull();
	for (let attempt = 0; attempt < 2; attempt++) {
		await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
		await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
		const collapsed = await logo.boundingBox();
		expect(collapsed?.x).toBe(before?.x);
		expect(collapsed?.y).toBe(before?.y);
		expect(collapsed?.width).toBe(24);
		expect(collapsed?.height).toBe(24);
		await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
		const expanded = await logo.boundingBox();
		expect(expanded?.x).toBe(before?.x);
		expect(expanded?.y).toBe(before?.y);
	}
	brokenAvatar = true;
	await page.reload();
	await expect(page.getByText("LZ", { exact: true })).toBeVisible();
	await expect(page.getByText("Li Zheng", { exact: true })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "打开导航" }).click();
	await expect(page.getByRole("dialog").getByText("Li Zheng", { exact: true })).toBeVisible();
	await expect(page.getByRole("dialog").locator("[data-sidebar-logo]")).toBeVisible();
});

test("daily GPX map, health, workouts and currency totals follow the same selected local day", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/data/footprint");
	await page.locator('input[type="file"]').setInputFiles({
		name: "daily-route.gpx",
		mimeType: "application/gpx+xml",
		buffer: Buffer.from(
			'<gpx><trk><trkseg><trkpt lat="31.2304" lon="121.4737"><time>2026-09-15T00:05:00Z</time><name>公园起点</name></trkpt><trkpt lat="31.2350" lon="121.4800"><time>2026-09-15T00:15:00Z</time></trkpt><trkpt lat="31.2400" lon="121.4850"><time>2026-09-15T00:25:00Z</time></trkpt></trkseg></trk></gpx>',
		),
	});
	await page.getByRole("button", { name: "开始上传", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	const health = await page.request.post("/api/imports", {
		data: {
			source: "apple-health",
			records: [
				{
					key: "daily-steps",
					occurredAt: "2026-09-15T00:00:00Z",
					title: "每日步数",
					data: { type: "HKQuantityTypeIdentifierStepCount", value: "900", unit: "count" },
				},
				{
					key: "daily-heart",
					occurredAt: "2026-09-15T00:05:00Z",
					title: "每日心率",
					data: { type: "HKQuantityTypeIdentifierHeartRate", value: "72", unit: "count/min" },
				},
				{
					key: "daily-workout",
					occurredAt: "2026-09-15T00:00:00Z",
					endAt: "2026-09-15T00:30:00Z",
					title: "每日运动",
					data: { workoutActivityType: "HKWorkoutActivityTypeWalking" },
				},
			],
		},
	});
	expect(health.ok()).toBe(true);
	const finance = await page.request.post("/api/imports", {
		data: {
			source: "pixiu",
			records: [
				{
					key: "daily-cny",
					occurredAt: "2026-09-15",
					precision: "day",
					title: "午餐",
					data: { 币种: "CNY", 交易类型: "支出", 流出金额: "35.20" },
				},
				{
					key: "daily-usd",
					occurredAt: "2026-09-15",
					precision: "day",
					title: "订阅",
					data: { 币种: "USD", 交易类型: "支出", 流出金额: "9.99" },
				},
			],
		},
	});
	expect(finance.ok()).toBe(true);
	await page.getByRole("button", { name: "时间线", exact: true }).click();
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page.locator('[data-hour="8"]').getByText("900 步", { exact: true })).toBeVisible();
	await expect(page.locator(".story-all-day").getByText("35.20", { exact: true })).toBeVisible();
	await expect(page.locator(".story-all-day").getByText("9.99", { exact: true })).toBeVisible();
	await expect(page.getByText("步行", { exact: true })).toBeVisible();
	const map = page.getByRole("application", { name: "当日足迹地图" });
	await expect(map).toBeVisible();
	await expect(map).toHaveClass(/leaflet-container/);
	await expect(page.locator(".story-map").getByText(/3 个点/)).toBeVisible();
	const journey = page.locator('[data-hour="8"] [data-story-kind="journey"]');
	await journey.getByRole("button", { name: "查看 3 条原始记录", exact: true }).click();
	await expect(journey.locator(".story-record-list .story-event")).toHaveCount(3);
	await expect(journey).toContainText("GPS 轨迹点");
	await journey.getByRole("button", { name: "查看 3 条原始记录", exact: true }).click();
	await map.getByRole("button", { name: "Zoom in" }).click();
	await map.focus();
	await page.keyboard.press("ArrowRight");
	await expect(map.getByRole("link", { name: /OpenStreetMap/ })).toBeVisible();
	const mapWidth = (await map.boundingBox())?.width ?? 0;
	await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
	await expect.poll(async () => (await map.boundingBox())?.width ?? 0).toBeGreaterThan(mapWidth);
	await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	await page.screenshot({ path: "test-results/l3/daily-map-overview.png", fullPage: true });
	await page.getByRole("combobox", { name: "按来源筛选" }).click();
	await page.getByRole("option", { name: "Pixiu", exact: true }).click();
	await expect(map).toHaveCount(0);
	await expect(page.locator('[data-story-kind="journey"]')).toHaveCount(0);
	await expect(page.getByText("900 步", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.getByText("35.20", { exact: true })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("AI settings, persisted summaries, stale regeneration and date-switch races work end to end", async ({
	page,
}) => {
	const apiKey = process.env.LIFE_TEST_AI_KEY;
	const baseURL = process.env.LIFE_TEST_AI_URL;
	expect(apiKey && baseURL).toBeTruthy();
	if (!apiKey || !baseURL) throw new Error("Missing isolated model fixture");
	await page.goto("/");
	await expect(page.getByText("尚未配置 AI", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "打开 AI 设置", exact: true }).click();
	await page.getByRole("combobox", { name: "AI 提供方" }).click();
	await page.getByRole("option", { name: "自定义", exact: true }).click();
	await page.getByLabel("模型", { exact: true }).fill("life-test-ok");
	await page.getByLabel("Base URL", { exact: true }).fill(baseURL);
	await page.getByRole("combobox", { name: "SDK", exact: true }).click();
	await page.getByRole("option", { name: "Anthropic", exact: true }).click();
	await page.getByLabel("API Key", { exact: true }).fill(apiKey);
	const saved = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/settings/ai") && response.request().method() === "PUT",
	);
	await page.getByRole("button", { name: "保存", exact: true }).click();
	expect((await saved).ok()).toBe(true);
	await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
	await page.getByRole("button", { name: "测试已保存的配置", exact: true }).click();
	await expect(page.getByText("连接成功", { exact: true })).toBeVisible();
	const record = {
		key: "browser-summary-story",
		occurredAt: "2026-09-13T03:00:00Z",
		title: "晨间阅读",
		content: "读完一本书",
	};
	expect(
		(
			await page.request.post("/api/imports", { data: { source: "journal", records: [record] } })
		).ok(),
	).toBe(true);
	await page.getByRole("button", { name: "时间线", exact: true }).click();
	await expect(page.getByRole("button", { name: "生成摘要", exact: true })).toBeEnabled();
	const generated = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/day-summary") && response.request().method() === "POST",
	);
	await page.getByRole("button", { name: "生成摘要", exact: true }).click();
	const result = (await (await generated).json()) as { data: DaySummaryResult };
	const content = result.data.summary?.content;
	expect(content).toBeTruthy();
	if (!content) throw new Error("No generated summary");
	await expect(page.getByText(content, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(content, { exact: true })).toBeVisible();
	expect(
		(
			await page.request.post("/api/imports", {
				data: { source: "journal", records: [{ ...record, content: "读完两本书" }] },
			})
		).ok(),
	).toBe(true);
	await page.reload();
	await expect(page.getByText("摘要可能过时", { exact: true })).toBeVisible();
	const aiConfig: AiSettingsInput = {
		provider: "custom",
		model: "life-test-failure",
		baseURL,
		sdkType: "anthropic",
		authType: "apiKey",
	};
	expect((await page.request.put("/api/settings/ai", { data: aiConfig })).ok()).toBe(true);
	await page.getByRole("button", { name: "重新生成", exact: true }).click();
	await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
	await expect(page.getByText(content, { exact: true })).toBeVisible();
	expect(
		(
			await page.request.put("/api/settings/ai", { data: { ...aiConfig, model: "life-test-slow" } })
		).ok(),
	).toBe(true);
	const started = page.waitForRequest(
		(request) => request.url().endsWith("/api/day-summary") && request.method() === "POST",
	);
	await page.getByRole("button", { name: "重新生成", exact: true }).click();
	await started;
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page.getByText("这一天没有记录", { exact: true })).toBeVisible();
	await expect(page.getByText(content, { exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "生成摘要", exact: true })).toBeDisabled();
	await page.setViewportSize({ width: 390, height: 844 });
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
});
