import type { GeneralSettings } from "../../src/models/general-settings";
import { expect, test } from "./public-context-fixture";

const emptySettings: GeneralSettings = { places: [], routine: null };

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
	const logo = sidebar.locator("[data-sidebar-logo]");
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
	const collapsedLogo = await logo.boundingBox();
	expect(collapsedLogo?.x).toBe(logoBox?.x);
	expect(collapsedLogo?.width).toBe(24);
	await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
	await page.setViewportSize({ width: 1440, height: 360 });
	await expect(logo).toBeVisible();
	const shortLogo = await logo.boundingBox();
	expect(shortLogo?.y).toBe(logoBox?.y);
	await settingsItem.scrollIntoViewIfNeeded();
	await expect(settingsItem).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "打开导航", exact: true }).click();
	const drawer = page.getByRole("dialog");
	await expect(drawer.locator("[data-sidebar-logo]")).toBeVisible();
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
	// A saved center must render its circle before any edits or map clicks.
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

test("empty or out-of-range coordinates cannot save, and Enter commits the typed center", async ({
	page,
	request,
}) => {
	await page.goto("/settings/general");
	await page.getByRole("button", { name: "添加地点", exact: true }).click();
	await page.getByLabel("地点名称").fill("只填纬度");
	await page.getByLabel("纬度").fill("31.2");
	await expect(page.getByRole("button", { name: "保存地点", exact: true })).toBeDisabled();
	expect(await readSettings(request)).toEqual(emptySettings);
	await page.getByLabel("经度").fill("121.5");
	await expect(page.getByRole("button", { name: "保存地点", exact: true })).toBeEnabled();
	await page.getByLabel("经度").fill("");
	await page.getByRole("button", { name: "保存地点", exact: true }).click();
	await expect(page.getByRole("heading", { name: "新地点", exact: true })).toBeVisible();
	expect(await readSettings(request)).toEqual(emptySettings);
	await page.getByLabel("纬度").fill("99");
	await page.getByLabel("经度").fill("121");
	await page.getByRole("button", { name: "保存地点", exact: true }).click();
	await expect(page.getByRole("heading", { name: "新地点", exact: true })).toBeVisible();
	expect(await readSettings(request)).toEqual(emptySettings);
	const lat = page.getByLabel("纬度");
	const lng = page.getByLabel("经度");
	await lat.fill("31");
	await lng.fill("121");
	await expect(page.getByRole("button", { name: "保存地点", exact: true })).toBeEnabled();
	await lat.click();
	await lat.fill("");
	await lat.pressSequentially("2", { delay: 40 });
	await expect(lat).toHaveValue("2");
	await lat.pressSequentially(".5", { delay: 40 });
	await expect(lat).toHaveValue("2.5");
	await lng.click();
	await lng.fill("");
	await lng.pressSequentially("-73.78", { delay: 40 });
	await expect(lng).toHaveValue("-73.78");
	await lng.press("Enter");
	await expect(page.getByText("地点保存成功", { exact: true })).toBeVisible();
	const stored = await readSettings(request);
	expect(stored.places).toHaveLength(1);
	expect(stored.places[0]?.label).toBe("只填纬度");
	expect(stored.places[0]?.latitude).toBeCloseTo(2.5, 4);
	expect(stored.places[0]?.longitude).toBeCloseTo(-73.78, 4);
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
