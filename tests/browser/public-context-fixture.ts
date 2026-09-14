import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/** Solar/weather/GIS requests go through the real Worker to an isolated loopback fixture. Map tiles remain deterministic. */
export const test = base.extend<{ publicContext: undefined }>({
	publicContext: [
		async ({ page }, use) => {
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
