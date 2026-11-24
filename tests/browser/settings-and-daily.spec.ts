import AxeBuilder from "@axe-core/playwright";
import type { AiSettingsInput, DaySummaryResult } from "../../src/models/ai";
import type { GeneralSettings, NamedPlace } from "../../src/models/general-settings";
import type { ImportRecord } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { importHealthFixture } from "./health-fixture";
import { importPixiuFixture } from "./pixiu-fixture";
import { expect, test } from "./public-context-fixture";

test.describe.configure({ mode: "serial" });

const emptySettings: GeneralSettings = { places: [], routine: null };
const transparentTile = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
	"base64",
);

test.describe("daily view", () => {
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
		await page.unrouteAll({ behavior: "wait" });
	});

	test("sidebar renders the shared brand row and keeps profile name/avatar with a failed-image fallback", async ({
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
		await page.goto("/settings/general");
		await expect(page.getByText("Li Zheng", { exact: true })).toBeVisible();
		await expect(page.getByRole("img", { name: "Li Zheng", exact: true })).toBeVisible();
		brokenAvatar = true;
		await page.reload();
		await expect(page.getByText("LZ", { exact: true })).toBeVisible();
		await expect(page.getByText("Li Zheng", { exact: true })).toBeVisible();
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
				'<gpx><trk><trkseg><trkpt lat="31.2304" lon="121.4737"><time>2026-09-15T00:05:00Z</time><name>公园起点</name><ele>-5.25</ele><speed>-1</speed><course>-1</course></trkpt><trkpt lat="31.2350" lon="121.4800"><time>2026-09-15T00:15:00Z</time></trkpt><trkpt lat="31.2400" lon="121.4850"><time>2026-09-15T00:25:00Z</time></trkpt></trkseg></trk></gpx>',
			),
		});
		await page.getByRole("button", { name: "开始上传", exact: true }).click();
		await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
		await importHealthFixture(page.request, [
			{
				occurredAt: "2026-09-15T00:00:00Z",
				data: { type: "HKQuantityTypeIdentifierStepCount", value: "900", unit: "count" },
			},
			{
				occurredAt: "2026-09-15T00:05:00Z",
				data: { type: "HKQuantityTypeIdentifierHeartRate", value: "72", unit: "count/min" },
			},
			{
				occurredAt: "2026-09-15T00:00:00Z",
				endAt: "2026-09-15T00:30:00Z",
				data: { workoutActivityType: "HKWorkoutActivityTypeWalking" },
			},
		]);
		await importPixiuFixture(page.request, [
			["2026-09-15", "日常支出", "午餐", "0.00", "35.20", "CNY", "现金", "", ""],
			["2026-09-15", "日常支出", "订阅", "0.00", "9.99", "USD", "现金", "", ""],
		]);
		await page.getByRole("button", { name: "时间线", exact: true }).click();
		await page.getByRole("button", { name: "后一天", exact: true }).click();
		await page.getByRole("button", { name: "后一天", exact: true }).click();
		await expect(
			page.locator('[data-hour="8"]').getByText("900 步", { exact: true }),
		).toBeVisible();
		await expect(
			page.locator(".finance-day strong").getByText("35.20", { exact: true }),
		).toBeVisible();
		await expect(
			page.locator(".finance-day strong").getByText("9.99", { exact: true }),
		).toBeVisible();
		await expect(page.getByText("步行", { exact: true })).toBeVisible();
		const map = page.getByRole("application", { name: "当日足迹地图" });
		await map.scrollIntoViewIfNeeded();
		await expect(map).toBeVisible();
		await expect(map).toHaveClass(/leaflet-container/);
		await expect(page.locator("#life-day-map").getByText(/3 个点/)).toBeVisible();
		await expect(page.getByRole("table", { name: "位置记录", exact: true })).toHaveCount(0);
		await page.getByRole("tab", { name: "位置记录", exact: true }).click();
		const raw = page.getByRole("table", { name: "位置记录", exact: true });
		await expect(raw.locator("tbody tr")).toHaveCount(3);
		await expect(raw).toContainText("GPS 轨迹点");
		await expect(raw.locator("tbody tr").first()).toContainText("08:05:00");
		await expect(raw.locator("tbody tr").first()).toContainText("秒");
		await expect(
			raw.locator("tbody tr").first().getByRole("cell", { name: "-5.25", exact: true }),
		).toBeVisible();
		await expect(
			raw.locator("tbody tr").first().getByRole("cell", { name: "-1", exact: true }),
		).toHaveCount(2);
		await expect(map).toHaveCount(0);
		await page.getByRole("tab", { name: "时间线", exact: true }).click();
		await expect(raw).toHaveCount(0);
		await map.scrollIntoViewIfNeeded();
		await expect(map).toHaveAttribute("data-map-loaded", "true");
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
		await page.getByRole("option", { name: "貔貅记账", exact: true }).click();
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
		await page.goto("/?day=2026-08-10");
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
			key: "browser-summary-story-0810",
			occurredAt: "2026-08-10T03:00:00Z",
			title: "晨间阅读",
			content: "读完一本书",
		};
		expect(
			(
				await page.request.post("/api/imports", { data: { source: "journal", records: [record] } })
			).ok(),
		).toBe(true);
		await page.goto("/?day=2026-08-10");
		await expect(page.getByRole("button", { name: "写日记", exact: true })).toBeEnabled();
		const generated = page.waitForResponse(
			(response) =>
				response.url().endsWith("/api/day-summary") && response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "写日记", exact: true }).click();
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
		await page.getByRole("button", { name: "再写一则", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "再写这一天" })).toBeVisible();
		await page.getByLabel("修改意见（可选）").fill("请多写晨间阅读，不要只罗列统计。");
		await page.getByRole("dialog").getByRole("button", { name: "生成", exact: true }).click();
		await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
		await expect(page.getByText(content, { exact: true })).toBeVisible();
		expect(
			(
				await page.request.put("/api/settings/ai", { data: { ...aiConfig, model: "life-test-ok" } })
			).ok(),
		).toBe(true);
		await page.getByRole("button", { name: "再写一则", exact: true }).click();
		await page.getByLabel("修改意见（可选）").fill("记下阅读后的平静，少写数字。");
		const regenerated = page.waitForResponse(
			(response) =>
				response.url().endsWith("/api/day-summary") && response.request().method() === "POST",
		);
		await page.getByRole("dialog").getByRole("button", { name: "生成", exact: true }).click();
		const second = (await (await regenerated).json()) as { data: DaySummaryResult };
		expect(second.data.summary?.content).toBeTruthy();
		expect(second.data.stale).toBe(false);
		await expect(page.getByRole("dialog")).toHaveCount(0);
		const requests = (await (
			await page.request.get(`${new URL(baseURL).origin}/requests`)
		).json()) as { input: string }[];
		expect(requests.at(-1)?.input).toContain("记下阅读后的平静，少写数字。");
		expect(requests.at(-1)?.input).toContain(content);
		expect(
			(
				await page.request.put("/api/settings/ai", {
					data: { ...aiConfig, model: "life-test-slow" },
				})
			).ok(),
		).toBe(true);
		const started = page.waitForRequest(
			(request) => request.url().endsWith("/api/day-summary") && request.method() === "POST",
		);
		await page.getByRole("button", { name: "再写一则", exact: true }).click();
		await page.getByRole("dialog").getByRole("button", { name: "生成", exact: true }).click();
		await started;
		await page.getByRole("button", { name: "后一天", exact: true }).click();
		await expect(page.getByText("这一天没有记录", { exact: true })).toBeVisible();
		await expect(page.getByText(content, { exact: true })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "写日记", exact: true })).toBeDisabled();
		await page.setViewportSize({ width: 390, height: 844 });
		const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
		expect(accessibility.violations).toEqual([]);
	});
});

test.describe("general settings and named places", () => {
	async function readSettings(request: {
		get: (url: string) => Promise<{ json: () => Promise<{ data: GeneralSettings }> }>;
	}) {
		return (await (await request.get("/api/settings/general")).json()).data;
	}

	async function writeSettings(
		request: {
			put: (url: string, options: { data: GeneralSettings }) => Promise<{ ok: () => boolean }>;
		},
		body: GeneralSettings,
	) {
		expect((await request.put("/api/settings/general", { data: body })).ok()).toBe(true);
	}

	test.beforeEach(async ({ request }) => {
		await writeSettings(request, emptySettings);
	});

	test.afterEach(async ({ request }) => {
		await writeSettings(request, emptySettings);
	});

	test("settings sit at the bottom of the sidebar and remain reachable when the rail is short", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/settings/general");
		await expect(page.getByRole("heading", { name: "通用设置", exact: true })).toBeVisible();
		const sidebar = page.getByLabel("主导航", { exact: true });
		const logo = sidebar.locator('[data-slot="sidebar-brand-logo"] img');
		const settingsItem = sidebar.getByRole("button", { name: "通用设置", exact: true });
		await expect(settingsItem).toBeVisible();
		const logoBox = await logo.boundingBox();
		const settingsBox = await settingsItem.boundingBox();
		const timelineBox = await sidebar
			.getByRole("button", { name: "时间线", exact: true })
			.boundingBox();
		expect(logoBox && settingsBox && timelineBox).toBeTruthy();
		expect(settingsBox?.y ?? 0).toBeGreaterThan(timelineBox?.y ?? 0);
		expect(logoBox?.y ?? 0).toBeLessThan(timelineBox?.y ?? 0);
		await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
		await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
		await expect(sidebar.getByRole("button", { name: "通用设置", exact: true })).toBeVisible();
		await expect
			.poll(async () => {
				const box = await logo.boundingBox();
				const rail = await sidebar.boundingBox();
				return box && rail ? Math.round(box.x - rail.x) : -1;
			})
			.toBe(22);
		const collapsedLogo = await logo.boundingBox();
		expect(collapsedLogo?.width).toBe(24);
		await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
		await page.setViewportSize({ width: 1440, height: 360 });
		await expect(logo).toBeVisible();
		const shortLogo = await logo.boundingBox();
		expect(shortLogo?.y).toBe(logoBox?.y);
		await settingsItem.scrollIntoViewIfNeeded();
		await expect(settingsItem).toBeVisible();
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("button", { name: "打开导航菜单", exact: true }).click();
		const drawer = page.getByRole("dialog");
		await expect(drawer.locator('[data-slot="sidebar-brand-logo"] img')).toBeVisible();
		await expect(drawer.getByRole("button", { name: "通用设置", exact: true })).toBeVisible();
		await expect(drawer.getByRole("button", { name: "导入", exact: true })).toBeVisible();
	});

	test("named places can be drawn, resized on the same map, saved, edited and deleted", async ({
		page,
		request,
	}) => {
		await page.goto("/settings/general");
		await expect(page.getByRole("heading", { name: "常用地点", exact: true })).toBeVisible();
		await expect(page.getByText("这些名称会出现在时间线与日记里。")).toBeVisible();
		await page.getByRole("button", { name: "添加地点", exact: true }).click();
		const map = page.getByRole("application", { name: "地点范围地图，点击选择中心" });
		await expect(map).toBeVisible();
		await expect(map).toHaveClass(/leaflet-container/);
		await map.click();
		const leafletId = await map.evaluate(
			(node) => (node as HTMLElement & { _leaflet_id?: number })._leaflet_id,
		);
		expect(leafletId).toBeTruthy();
		await page.getByLabel("地点名称").fill("家");
		await page.getByLabel("纬度").fill("31.2304");
		await page.getByLabel("经度").fill("121.4737");
		await page.getByLabel("地点范围（米）").fill("800");
		await expect
			.poll(async () =>
				map.evaluate((node) => (node as HTMLElement & { _leaflet_id?: number })._leaflet_id),
			)
			.toBe(leafletId);
		await page.getByRole("button", { name: "保存地点", exact: true }).click();
		await expect(page.getByText("地点保存成功", { exact: true })).toBeVisible();
		await expect(page.getByText("家", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "添加地点", exact: true }).click();
		await page.getByLabel("地点名称").fill("工作室");
		await page.getByLabel("纬度").fill("31.22");
		await page.getByLabel("经度").fill("121.48");
		await page.getByLabel("地点范围（米）").fill("400");
		await page.getByRole("button", { name: "保存地点", exact: true }).click();
		await expect(page.getByText("工作室", { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText("家", { exact: true })).toBeVisible();
		await expect(page.getByText("工作室", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "编辑", exact: true }).first().click();
		await expect(map).toBeVisible();
		await expect(map.locator("canvas")).toBeVisible();
		const editedMapId = await map.evaluate(
			(node) => (node as HTMLElement & { _leaflet_id?: number })._leaflet_id,
		);
		await page.getByLabel("地点名称").fill("河边的家");
		await page.getByLabel("地点范围（米）").fill("1200");
		await expect(map.locator("canvas")).toBeVisible();
		expect(
			await map.evaluate((node) => (node as HTMLElement & { _leaflet_id?: number })._leaflet_id),
		).toBe(editedMapId);
		await page.getByRole("button", { name: "保存地点", exact: true }).click();
		await expect(page.getByText("河边的家", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "删除", exact: true }).first().click();
		await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
		await expect(page.getByText("地点已删除", { exact: true })).toBeVisible();
		const stored = await readSettings(request);
		expect(stored.places).toHaveLength(1);
		expect(stored.places[0]?.label).toBe("工作室");
	});

	test("sleep routine and place drafts stay on their own sections across saves and timeline", async ({
		page,
		request,
	}) => {
		await page.goto("/settings/general");
		await page.getByRole("switch", { name: "记录惯常作息", exact: true }).click();
		await page.getByLabel("入睡时间").fill("02:30");
		await page.getByLabel("起床时间").fill("11:05");
		await page.getByLabel("时区").fill("Pacific/Auckland");
		await page.getByRole("button", { name: "添加地点", exact: true }).click();
		await page.getByLabel("地点名称").fill("机场");
		await page.getByLabel("纬度").fill("40.64");
		await page.getByLabel("经度").fill("-73.78");
		await page.getByRole("button", { name: "保存作息", exact: true }).click();
		await expect(page.getByText("作息设置保存成功", { exact: true })).toBeVisible();
		await expect(page.getByLabel("地点名称")).toHaveValue("机场");
		await expect(page.getByLabel("时区")).toHaveValue("Pacific/Auckland");
		await page.getByRole("button", { name: "保存地点", exact: true }).click();
		await expect(page.getByText("地点保存成功", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "时间线", exact: true }).click();
		await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "通用设置", exact: true }).click();
		await expect(page.getByText("机场", { exact: true })).toBeVisible();
		await expect(page.getByLabel("入睡时间")).toHaveValue("02:30");
		await expect(page.getByLabel("时区")).toHaveValue("Pacific/Auckland");
		await page.getByRole("switch", { name: "记录惯常作息", exact: true }).click();
		await page.getByRole("button", { name: "保存作息", exact: true }).click();
		await expect(page.getByText("作息设置保存成功", { exact: true })).toBeVisible();
		const stored = await readSettings(request);
		expect(stored.routine).toBeNull();
		expect(stored.places[0]?.label).toBe("机场");
	});

	test("failed settings reload can retry, and leaving the editor tears the map down", async ({
		page,
	}) => {
		let failLoad = true;
		await page.route("**/api/settings/general", async (route) => {
			if (route.request().method() === "GET" && failLoad) {
				await route.fulfill({
					status: 500,
					contentType: "application/json",
					body: JSON.stringify({ error: { message: "暂时无法读取" } }),
				});
				return;
			}
			await route.continue();
		});
		await page.goto("/settings/general");
		await expect(page.getByText("无法读取设置", { exact: true })).toBeVisible();
		failLoad = false;
		await page.getByRole("button", { name: "重试", exact: true }).click();
		await expect(page.getByRole("heading", { name: "常用地点", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "添加地点", exact: true }).click();
		const map = page.getByRole("application", { name: "地点范围地图，点击选择中心" });
		await expect(map).toHaveClass(/leaflet-container/);
		await page.getByRole("button", { name: "取消", exact: true }).click();
		await expect(map).toHaveCount(0);
		await page.getByRole("button", { name: "添加地点", exact: true }).click();
		await expect(map).toBeVisible();
		await page.getByRole("button", { name: "时间线", exact: true }).click();
		await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
		await expect(page.getByRole("application", { name: "地点范围地图，点击选择中心" })).toHaveCount(
			0,
		);
	});

	test("named places appear in timeline, collapse repeated visits, show in raw records and map popups with HTML escaping", async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		const targetDate = "2091-03-20";
		await page.clock.install({ time: new Date(`${targetDate}T12:00:00Z`) });

		const homePlace: NamedPlace = {
			id: "home-loc",
			label: "家",
			latitude: 31.23,
			longitude: 121.47,
			radiusMeters: 200,
		};
		const studioPlace: NamedPlace = {
			id: "studio-loc",
			label: "<b>工作室</b> & <Studio>",
			latitude: 31.238,
			longitude: 121.475,
			radiusMeters: 200,
		};

		await writeSettings(request, {
			places: [homePlace, studioPlace],
			routine: null,
		});

		const records: ImportRecord[] = [
			{
				key: "np-0",
				occurredAt: `${targetDate}T01:05:00Z`,
				title: "GPS point",
				data: { latitude: 31.2301, longitude: 121.4701 },
			},
			{
				key: "np-1",
				occurredAt: `${targetDate}T01:25:00Z`,
				title: "GPS point",
				data: { latitude: 31.2302, longitude: 121.4702 },
			},
			{
				key: "np-2",
				occurredAt: `${targetDate}T02:05:00Z`,
				title: "GPS point",
				data: { latitude: 31.2301, longitude: 121.4701 },
			},
			{
				key: "np-3",
				occurredAt: `${targetDate}T02:25:00Z`,
				title: "GPS point",
				data: { latitude: 31.2303, longitude: 121.4702 },
			},
			{
				key: "np-4",
				occurredAt: `${targetDate}T04:10:00Z`,
				title: "GPS point",
				data: { latitude: 31.2381, longitude: 121.4751 },
			},
			{
				key: "np-5",
				occurredAt: `${targetDate}T04:30:00Z`,
				title: "GPS point",
				data: { latitude: 31.2382, longitude: 121.4752 },
			},
			{
				key: "np-6",
				occurredAt: `${targetDate}T05:10:00Z`,
				title: "GPS point",
				data: { latitude: 31.2381, longitude: 121.4751 },
			},
			{
				key: "np-7",
				occurredAt: `${targetDate}T05:30:00Z`,
				title: "GPS point",
				data: { latitude: 31.2383, longitude: 121.4752 },
			},
			{
				key: "np-8",
				occurredAt: `${targetDate}T07:15:00Z`,
				title: "GPS point",
				data: { latitude: 31.2302, longitude: 121.4701 },
			},
			{
				key: "np-9",
				occurredAt: `${targetDate}T07:35:00Z`,
				title: "GPS point",
				data: { latitude: 31.2301, longitude: 121.4702 },
			},
		];

		await importFootprintFixture(page.request, records);
		await page.goto(`/?day=${targetDate}`);

		const visits = page.locator("[data-visit]");
		await expect(visits).toHaveCount(5);
		await expect(visits.nth(0)).toHaveAttribute("data-state", "open");
		await expect(visits.nth(0)).toContainText("家附近");
		await expect(visits.nth(1)).toHaveAttribute("data-state", "closed");
		await expect(visits.nth(1)).toContainText("家附近");
		await expect(visits.nth(2)).toHaveAttribute("data-state", "open");
		await expect(visits.nth(2)).toContainText("<b>工作室</b> & <Studio>附近");
		await expect(visits.nth(3)).toHaveAttribute("data-state", "closed");
		await expect(visits.nth(3)).toContainText("<b>工作室</b> & <Studio>附近");
		await expect(visits.nth(4)).toHaveAttribute("data-state", "open");
		await expect(visits.nth(4)).toContainText("家附近");

		const studioMap = visits.nth(2).getByRole("application");
		await studioMap.scrollIntoViewIfNeeded();
		await expect(studioMap).toHaveAttribute("data-map-loaded", "true");
		const marker = studioMap.locator(".story-place-marker").first();
		await marker.click();

		const popup = studioMap.locator(".leaflet-popup-content");
		await expect(popup).toBeVisible();
		await expect(popup).toContainText("<b>工作室</b> & <Studio>");
		expect(await popup.locator("b").count()).toBe(0);

		await page.getByRole("tab", { name: "位置记录", exact: true }).click();
		const locationsTable = page.locator("table");
		await expect(locationsTable).toBeVisible();
		await expect(locationsTable.locator('td:has-text("家")').first()).toBeVisible();
		await expect(
			locationsTable.locator('td:has-text("<b>工作室</b> & <Studio>")').first(),
		).toBeVisible();
		const headers = await locationsTable.locator("thead th").allTextContents();
		const labelColumn = headers.findIndex((header) => header.trim().startsWith("地点"));
		expect(labelColumn).toBeGreaterThanOrEqual(0);
		const rawRows = () =>
			locationsTable.locator("tbody tr").evaluateAll(
				(rows, omittedColumn) =>
					rows.map((row) =>
						Array.from(row.querySelectorAll("td"))
							.filter((_, index) => index !== omittedColumn)
							.map((cell) => cell.textContent),
					),
				labelColumn,
			);
		const originalRows = await rawRows();

		await page.getByRole("button", { name: "通用设置", exact: true }).click();
		await expect(page).toHaveURL(/\/settings\/general/);
		await expect(page.getByRole("heading", { name: "通用设置", exact: true })).toBeVisible();

		const studioCard = page.getByRole("listitem").filter({ hasText: studioPlace.label });
		await studioCard.getByRole("button", { name: "编辑", exact: true }).click();
		await page.getByLabel("地点名称").fill("城市工作室");
		await page.getByRole("button", { name: "保存地点", exact: true }).click();
		await expect(page.getByText("地点保存成功", { exact: true })).toBeVisible();
		await expect(page.getByText("城市工作室", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "时间线", exact: true }).click();
		await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
		await page.getByRole("tab", { name: "时间线", exact: true }).click();

		await expect(visits.nth(2)).toContainText("城市工作室附近");
		await expect(visits.nth(3)).toContainText("城市工作室附近");

		await page.getByRole("tab", { name: "位置记录", exact: true }).click();
		await expect(locationsTable.locator('td:has-text("城市工作室")').first()).toBeVisible();
		await expect(locationsTable.locator('td:has-text("<b>工作室</b> & <Studio>")')).toHaveCount(0);
		await expect(locationsTable.locator("tbody tr")).toHaveCount(10);
		expect(await rawRows()).toEqual(originalRows);
	});
});
