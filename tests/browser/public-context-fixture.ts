import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** All browser suites use deterministic public context and never query third parties. */
export const test = base.extend<{ publicContext: undefined }>({
	publicContext: [
		async ({ page }, use) => {
			await page.route(/^https:\/\/(archive-api|api)\.open-meteo\.com\//, async (route) => {
				const url = new URL(route.request().url());
				const start = Date.parse(url.searchParams.get("start_date") ?? "2026-09-13");
				const end = Date.parse(url.searchParams.get("end_date") ?? "2026-09-13") + DAY;
				const time = Array.from(
					{ length: Math.round((end - start) / HOUR) },
					(_, index) => (start + index * HOUR) / 1000,
				);
				await route.fulfill({
					headers: cors,
					json: {
						hourly: {
							time,
							temperature_2m: time.map((_, index) => 15 + (index % 10)),
							weather_code: time.map(() => 1),
							precipitation: time.map(() => 0.1),
							wind_speed_10m: time.map(() => 12),
						},
					},
				});
			});
			await page.route("https://api.sunrise-sunset.org/**", async (route) => {
				const url = new URL(route.request().url());
				const start = Date.parse(url.searchParams.get("date_start") ?? "2026-09-13");
				const end = Date.parse(url.searchParams.get("date_end") ?? "2026-09-13");
				const days = Array.from({ length: Math.round((end - start) / DAY) + 1 }, (_, index) => {
					const instant = start + index * DAY;
					return {
						date: new Date(instant).toISOString().slice(0, 10),
						sunrise: (instant - 2.5 * HOUR) / 1000,
						sunset: (instant + 10.25 * HOUR) / 1000,
						sun_status: "normal",
					};
				});
				await route.fulfill({ headers: cors, json: { days } });
			});
			await page.route("**://tile.openstreetmap.org/**", (route) =>
				route.fulfill({
					contentType: "image/svg+xml",
					body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#e7ebe5" d="M0 0h256v256H0z"/></svg>',
				}),
			);
			await use(undefined);
		},
		{ auto: true },
	],
});
