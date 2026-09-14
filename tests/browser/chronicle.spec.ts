import AxeBuilder from "@axe-core/playwright";
import manifest from "../../package.json" with { type: "json" };
import type { CreatedConnect, EventPage } from "../../src/models/types";
import { expect, test } from "./public-context-fixture";

const { version } = manifest;

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date("2026-09-13T04:00:00Z") });
});

test("empty timeline keeps all 24 hours and uses Basalt responsive chrome", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(page.getByText("这一天，留待记录", { exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "全天记录", exact: true })).toHaveCount(0);
	await expect(page.getByText(`v${version}`, { exact: true })).toBeVisible();
	await expect(page.locator('[data-hour="0"]')).toContainText("00:00");
	await expect(page.locator('[data-hour="23"]')).toContainText("23:00");
	await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
	await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	expect(errors).toEqual([]);
});

test("browser imports day/minute/second records and shows UTC data in local hours", async ({
	page,
}) => {
	await page.goto("/imports");
	await page.getByRole("radio", { name: "日记", exact: true }).check();
	await page.locator('input[type="file"]').setInputFiles({
		name: "chronicle.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify([
				{ key: "browser-day", date: "2026-09-13", title: "旅行纪念日", precision: "day" },
				{
					key: "browser-minute",
					timestamp: "2026-09-13T09:35:00+08:00",
					title: "晨间阅读",
					precision: "minute",
					data: { pages: 12 },
				},
				{
					key: "browser-second",
					occurredAt: "2026-09-13T10:23:45+08:00",
					title: "GPS 抵达",
					precision: "second",
					data: { latitude: 31.23, longitude: 121.47 },
				},
				{
					key: "browser-escape",
					occurredAt: "2026-09-13T12:00:00+08:00",
					title: "<script>window.lifeInjected=true</script>",
					content: "<img src=x onerror=alert(1)>",
				},
			]),
		),
	});
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	const range = new URLSearchParams({
		start: "2026-09-12T16:00:00Z",
		end: "2026-09-13T16:00:00Z",
		source: "journal",
	});
	const result = await page.request.get(`/api/events?${range}`);
	const { data } = (await result.json()) as { data: EventPage };
	expect(data.events.filter((record) => record.title === "晨间阅读")).toHaveLength(1);
	await page.getByRole("button", { name: "时间线", exact: true }).click();
	await expect(page.getByText("旅行纪念日", { exact: true })).toBeVisible();
	await expect(page.locator('[data-hour="9"]')).toContainText("晨间阅读");
	await expect(page.locator('[data-hour="9"]')).toContainText("09:35");
	await expect(page.locator('[data-hour="10"]')).toContainText("10:23:45");
	await expect(page.locator('[data-hour="12"]')).toContainText(
		"<script>window.lifeInjected=true</script>",
	);
	expect(await page.evaluate(() => Reflect.get(window, "lifeInjected"))).toBeUndefined();
	await page.getByRole("button", { name: "前一天", exact: true }).click();
	await expect(page.getByText("晨间阅读", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "今天", exact: true }).click();
	await expect(page.getByText("晨间阅读", { exact: true })).toBeVisible();
	await page.screenshot({ path: "test-results/l3/timeline-desktop.png", fullPage: true });
});

test("Connect creates a one-time secret, accepts a snapshot, filters it, and revokes writes", async ({
	page,
}) => {
	await page.goto("/connect");
	await page.getByRole("textbox", { name: "名称", exact: true }).fill("Mac 日程");
	const creation = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/connects") && response.request().method() === "POST",
	);
	await page.getByRole("button", { name: "创建令牌", exact: true }).click();
	const { data: created } = (await (await creation).json()) as { data: CreatedConnect };
	await expect(page.getByText("请立即保存令牌", { exact: true })).toBeVisible();
	await expect(page.getByText(created.token, { exact: true })).toBeVisible();
	const body = { timestamp: "2026-09-13T06:45:00Z", title: "下午会议", data: { duration: 30 } };
	const receipt = await page.request.post("/api/ingest", {
		headers: { Authorization: `Bearer ${created.token}` },
		data: body,
	});
	expect(receipt.ok()).toBe(true);
	await page.getByRole("button", { name: "我已保存", exact: true }).click();
	await expect(page.getByText(created.token, { exact: true })).toHaveCount(0);
	await page.reload();
	await expect(page.getByText(created.token, { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "时间线", exact: true }).click();
	await expect(page.locator('[data-hour="14"]')).toContainText("下午会议");
	await page.getByRole("combobox", { name: "按来源筛选" }).click();
	await page.getByRole("option", { name: "Mac 日程", exact: true }).click();
	await expect(page.getByText("晨间阅读", { exact: true })).toHaveCount(0);
	await expect(page.locator('[data-hour="14"]')).toContainText("下午会议");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await page.getByRole("button", { name: "撤销", exact: true }).click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "撤销", exact: true }).click();
	await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
	const denied = await page.request.post("/api/ingest", {
		headers: { Authorization: `Bearer ${created.token}` },
		data: body,
	});
	expect(denied.status()).toBe(403);
});

test("invalid import reports an error and can be replaced with a valid file", async ({ page }) => {
	await page.goto("/imports");
	await page.getByRole("radio", { name: "日记", exact: true }).check();
	await page.locator('input[type="file"]').setInputFiles({
		name: "bad.json",
		mimeType: "application/json",
		buffer: Buffer.from('[{"title":"missing date"}]'),
	});
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入失败", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "清除", exact: true }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: "fixed.json",
		mimeType: "application/json",
		buffer: Buffer.from('[{"key":"fixed","title":"恢复导入","date":"2026-09-13"}]'),
	});
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
});

test("mobile navigation, theme controls and wide data stay usable", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
	await page.goto("/");
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await page.getByRole("button", { name: "打开导航", exact: true }).click();
	const navigation = page.getByRole("dialog", { name: "导航", exact: true });
	await expect(navigation).toBeVisible();
	await navigation.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(navigation).toBeHidden();
	await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
	await expect(page.locator("html")).toHaveClass(/light/);
	await page.getByRole("button", { name: "切换主题", exact: true }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.evaluate(() =>
		Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
	);
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
	await page.screenshot({ path: "test-results/l3/connect-mobile.png", fullPage: true });
});

test("unauthorized and forged browser requests are rejected by the real API", async ({
	playwright,
}) => {
	const anonymous = await playwright.request.newContext({
		baseURL: process.env.LIFE_TEST_URL,
		extraHTTPHeaders: {},
	});
	expect((await anonymous.get("/api/session")).status()).toBe(401);
	expect((await anonymous.get("/api/events?start=2026-09-13&end=2026-09-14")).status()).toBe(401);
	expect(
		(
			await anonymous.get("/api/session", {
				headers: {
					"Cf-Access-Jwt-Assertion": "forged",
					"Cf-Access-Authenticated-User-Email": "reader@example.test",
				},
			})
		).status(),
	).toBe(403);
	await anonymous.dispose();
});

test("Access login redirects offer reauthentication and a full reload recovers", async ({
	page,
}) => {
	await page.route("**/api/session", (route) =>
		route.fulfill({ status: 302, headers: { location: "https://login.example.test/" } }),
	);
	await page.goto("/");
	await expect(page.getByText("会话已过期", { exact: true })).toBeVisible();
	const reauthenticate = page.getByRole("button", { name: "重新登录", exact: true });
	await expect(reauthenticate).toBeVisible();
	await page.unroute("**/api/session");
	await reauthenticate.click();
	await expect(page.locator("[data-hour]")).toHaveCount(24);
});

test("DST keeps repeated hours together and shows records in a partially missing hour", async ({
	browser,
	request,
}) => {
	const response = await request.post("/api/imports", {
		data: {
			source: "journal",
			records: [
				{
					key: "dst-early",
					occurredAt: "2026-11-01T05:30:00Z",
					precision: "minute",
					title: "回拨前",
				},
				{
					key: "dst-late",
					occurredAt: "2026-11-01T06:30:00Z",
					precision: "minute",
					title: "回拨后",
				},
				{
					key: "dst-partial",
					occurredAt: "2026-10-03T15:45:00Z",
					precision: "minute",
					title: "半小时跳转后",
				},
			],
		},
	});
	expect(response.ok()).toBe(true);
	for (const item of [
		{
			timezoneId: "America/New_York",
			time: "2026-11-01T12:00:00Z",
			hour: 1,
			titles: ["回拨前", "回拨后"],
		},
		{
			timezoneId: "Australia/Lord_Howe",
			time: "2026-10-04T04:00:00Z",
			hour: 2,
			titles: ["半小时跳转后"],
		},
	]) {
		const context = await browser.newContext({
			baseURL: process.env.LIFE_TEST_URL,
			timezoneId: item.timezoneId,
			extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": process.env.LIFE_TEST_TOKEN as string },
		});
		const page = await context.newPage();
		await page.clock.install({ time: new Date(item.time) });
		await page.goto("/");
		await expect(page.locator("[data-hour]")).toHaveCount(24);
		for (const title of item.titles)
			await expect(page.locator(`[data-hour="${item.hour}"]`)).toContainText(title);
		await context.close();
	}
});
