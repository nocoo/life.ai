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
	const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
	expect(accessibility.violations).toEqual([]);
	expect(errors).toEqual([]);
});

test("browser imports day/minute/second records and shows UTC data in local hours", async ({
	page,
}) => {
	await page.goto("/imports");
	await expect(page.getByRole("heading", { name: "日记导入", exact: true })).toBeVisible();
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
			]),
		),
	});
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
	await expect(page.locator('[data-hour="10"]')).toContainText("10:23:45");
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
	const body = { timestamp: "2026-09-13T06:45:00Z", title: "下午会议", data: { duration: 30 } };
	const receipt = await page.request.post("/api/ingest", {
		headers: { Authorization: `Bearer ${created.token}` },
		data: body,
	});
	expect(receipt.ok()).toBe(true);
	await page.getByRole("button", { name: "我已保存", exact: true }).click();
	await page.getByRole("button", { name: "时间线", exact: true }).click();
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
