import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./public-context-fixture";

for (const theme of ["light", "dark"] as const) {
	test(`page content remains keyboard-scrollable during lazy overview loading in ${theme}`, async ({
		page,
	}, testInfo) => {
		await page.addInitScript((mode) => localStorage.setItem("theme", mode), theme);
		await page.setViewportSize({ width: 1280, height: 420 });
		let release = () => {};
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(/\/src\/views\/data-overview-page\.tsx(?:\?.*)?$/, async (route) => {
			await pending;
			await route.continue();
		});
		try {
			await page.goto("/data");
			const loading = page.getByRole("status", { name: "正在读取数据概览", exact: true });
			await expect(loading).toBeVisible();
			await expect(page.getByRole("heading", { name: "数据概览", exact: true })).toBeVisible();
			const content = page.locator("[data-basalt-island]");
			await expect(
				content.locator("a[href], button:not([disabled]), input, [tabindex='0']"),
			).toHaveCount(0);
			const geometry = await content.evaluate((element) => ({
				height: element.clientHeight,
				scrollHeight: element.scrollHeight,
				tabIndex: (element as HTMLElement).tabIndex,
			}));
			expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
			await testInfo.attach("loading-scroll-region", {
				body: JSON.stringify(geometry),
				contentType: "application/json",
			});
			const accessibility = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa"])
				.analyze();
			expect(accessibility.violations).toEqual([]);
			await expect(page.getByRole("region", { name: "页面内容", exact: true })).toBeVisible();
			await content.focus();
			await expect(content).toBeFocused();
			await page.keyboard.press("PageDown");
			await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
			await page.keyboard.press("Tab");
			await expect(content).not.toBeFocused();
		} finally {
			release();
			await page.unrouteAll({ behavior: "wait" });
		}
		await expect(page.getByRole("status", { name: "正在读取数据概览", exact: true })).toBeHidden();
		const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
		expect(accessibility.violations).toEqual([]);
	});
}
