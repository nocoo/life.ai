import type { APIRequestContext } from "@playwright/test";
import type { GeneralSettings, NamedPlace } from "../../src/models/general-settings";
import type { ImportRecord } from "../../src/models/types";
import { importFootprintFixture } from "./footprint-fixture";
import { expect, test } from "./public-context-fixture";

const emptySettings: GeneralSettings = { places: [], routine: null };

async function writeSettings(request: APIRequestContext, body: GeneralSettings) {
	const response = await request.put("/api/settings/general", { data: body });
	expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ request }) => {
	await writeSettings(request, emptySettings);
});

test.afterEach(async ({ request }) => {
	await writeSettings(request, emptySettings);
});

test("named places appear in timeline, collapse repeated visits, show in raw records and map popups with HTML escaping", async ({
	page,
	request,
}) => {
	await page.setViewportSize({ width: 1920, height: 1080 });
	const targetDate = "2091-03-20";
	await page.clock.install({ time: new Date(`${targetDate}T12:00:00Z`) });

	// Two distinct named circles within ~1.1 km (< 5 km)
	// Home center: (31.2300, 121.4700), radius 200m
	// Studio center with raw HTML characters in label: (31.2380, 121.4750), radius 200m
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

	// Sequence across hours: A (01h) -> A (02h) -> B (04h) -> B (05h) -> A (07h)
	// In Shanghai (UTC+8), UTC 01:00 = 09:00 local, 02:00 = 10:00, 04:00 = 12:00, 05:00 = 13:00, 07:00 = 15:00
	const records: ImportRecord[] = [
		// A: Home (hour 01 UTC)
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
		// A: Home again (hour 02 UTC) -> repeated place, should collapse
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
		// B: Studio (hour 04 UTC) -> new arrival, should open
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
		// B: Studio again (hour 05 UTC) -> repeated place, should collapse
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
		// A: Return to Home (hour 07 UTC) -> returning arrival, should expand again
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

	// Initial arrival at Home: expanded
	await expect(visits.nth(0)).toHaveAttribute("data-state", "open");
	await expect(visits.nth(0)).toContainText("家附近");

	// Consecutive stay at Home: collapsed
	await expect(visits.nth(1)).toHaveAttribute("data-state", "closed");
	await expect(visits.nth(1)).toContainText("家附近");

	// First arrival at Studio: expanded
	await expect(visits.nth(2)).toHaveAttribute("data-state", "open");
	await expect(visits.nth(2)).toContainText("<b>工作室</b> & <Studio>附近");

	// Consecutive stay at Studio: collapsed
	await expect(visits.nth(3)).toHaveAttribute("data-state", "closed");
	await expect(visits.nth(3)).toContainText("<b>工作室</b> & <Studio>附近");

	// Return to Home: expanded again
	await expect(visits.nth(4)).toHaveAttribute("data-state", "open");
	await expect(visits.nth(4)).toContainText("家附近");

	// Check map popup on Studio visit: ensure label renders as safe text without HTML injection
	const studioMap = visits.nth(2).getByRole("application");
	await studioMap.scrollIntoViewIfNeeded();
	await expect(studioMap).toHaveAttribute("data-map-loaded", "true");
	const marker = studioMap.locator(".story-place-marker").first();
	await marker.click();

	const popup = studioMap.locator(".leaflet-popup-content");
	await expect(popup).toBeVisible();
	// Text content should contain the verbatim text, and no HTML tags (<b>) should be parsed as elements
	await expect(popup).toContainText("<b>工作室</b> & <Studio>");
	expect(await popup.locator("b").count()).toBe(0);

	// Check locations tab: verifies named place label in table
	await page.getByRole("tab", { name: "位置记录", exact: true }).click();
	const locationsTable = page.locator("table");
	await expect(locationsTable).toBeVisible();

	// Column "地点" contains "家" and "<b>工作室</b> & <Studio>"
	const homeCells = locationsTable.locator('td:has-text("家")');
	await expect(homeCells.first()).toBeVisible();
	const studioCells = locationsTable.locator('td:has-text("<b>工作室</b> & <Studio>")');
	await expect(studioCells.first()).toBeVisible();
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

	// Switch to General Settings page via sidebar, edit Studio's label to "城市工作室"
	await page.getByRole("button", { name: "通用设置", exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/general/);
	await expect(page.getByRole("heading", { name: "通用设置", exact: true })).toBeVisible();

	// Edit studio place
	const studioCard = page.getByRole("listitem").filter({ hasText: studioPlace.label });
	await studioCard.getByRole("button", { name: "编辑", exact: true }).click();
	await page.getByLabel("地点名称").fill("城市工作室");
	await page.getByRole("button", { name: "保存地点", exact: true }).click();
	await expect(page.getByText("地点保存成功", { exact: true })).toBeVisible();
	await expect(page.getByText("城市工作室", { exact: true })).toBeVisible();

	// Navigate back to Timeline page
	await page.getByRole("button", { name: "时间线", exact: true }).click();
	await expect(page.getByRole("heading", { name: "每日实录", exact: true })).toBeVisible();
	// The selected date and tab survive route changes; choose the story to inspect maps again.
	await page.getByRole("tab", { name: "时间线", exact: true }).click();

	// Verify timeline visit title updated with new label
	await expect(visits.nth(2)).toContainText("城市工作室附近");
	await expect(visits.nth(3)).toContainText("城市工作室附近");

	// Switch to locations tab: verify label updated and record count remains 10
	await page.getByRole("tab", { name: "位置记录", exact: true }).click();
	await expect(locationsTable.locator('td:has-text("城市工作室")').first()).toBeVisible();
	await expect(locationsTable.locator('td:has-text("<b>工作室</b> & <Studio>")')).toHaveCount(0);
	await expect(locationsTable.locator("tbody tr")).toHaveCount(10);
	expect(await rawRows()).toEqual(originalRows);
});
