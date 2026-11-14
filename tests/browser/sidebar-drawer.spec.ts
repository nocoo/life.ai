import { expect, test } from "./public-context-fixture";

for (const theme of ["light", "dark"] as const) {
	test(`sidebar drawer acceptance and stable identity in ${theme}`, async ({ page }, testInfo) => {
		await page.addInitScript((mode) => localStorage.setItem("theme", mode), theme);
		await page.route("**/api/session", async (route) => {
			const response = await route.fetch();
			const body = await response.json();
			await route.fulfill({
				response,
				json: { data: { ...body.data, name: "Sidebar Fixture", avatar: null } },
			});
		});
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/settings/general");
		await expect(page.locator("html")).toHaveClass(new RegExp(theme));
		const sidebar = page.getByRole("complementary", { name: "主导航", exact: true });
		const avatar = sidebar.locator(".h-basalt-9.w-basalt-9");
		const brand = sidebar.locator('[data-slot="sidebar-brand-copy"]');
		const measurements = [];
		for (const width of [1440, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(260);
			await expect(avatar).toBeVisible();
			const expanded = await avatar.boundingBox();
			expect([expanded?.width, expanded?.height]).toEqual([36, 36]);
			await expect(sidebar.getByText("reader@example.test", { exact: true })).toHaveCSS(
				"line-height",
				"16px",
			);
			await expect(brand.getByText("Life.ai", { exact: true })).toBeVisible();
			await expect(brand.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
			await sidebar.getByRole("button", { name: "收起侧栏", exact: true }).click();
			await page.mouse.move(width - 20, 400);
			await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(68);
			const collapsed = await avatar.boundingBox();
			expect([collapsed?.width, collapsed?.height]).toEqual([36, 36]);
			expect(collapsed?.y).toBe(expanded?.y);
			await expect(sidebar).not.toHaveAttribute("data-peeking");
			await expect(brand.getByText("Life.ai", { exact: true })).toBeHidden();
			await expect(brand).toHaveCSS("overflow", "hidden");
			expect((await brand.boundingBox())?.width).toBe(0);
			measurements.push({ viewport: width, expanded, collapsed });
			await sidebar.getByRole("button", { name: "展开侧栏", exact: true }).click();
		}

		for (const width of [390, 640, 767]) {
			await page.setViewportSize({ width, height: 900 });
			const menu = page.getByRole("button", {
				name: "打开导航菜单",
				exact: true,
				includeHidden: true,
			});
			await expect(menu).toHaveAttribute("aria-expanded", "false");
			await menu.click();
			const drawer = page.locator('[data-slot="sidebar-drawer"]');
			await expect(drawer).toBeVisible();
			await expect(menu).toHaveAttribute("aria-controls", (await drawer.getAttribute("id")) ?? "");
			await expect(menu).toHaveAttribute("aria-expanded", "true");
			await expect.poll(async () => (await drawer.boundingBox())?.width).toBe(320);
			const inner = drawer.locator("[data-basalt-sidebar]");
			expect((await inner.boundingBox())?.width).toBe(260);
			await expect(drawer).toHaveCSS("padding-left", "0px");
			await expect(drawer).toHaveCSS("padding-right", "0px");
			await expect(drawer.getByRole("button", { name: "关闭导航菜单", exact: true })).toBeVisible();
			await expect(inner.getByText("Life.ai", { exact: true })).toBeVisible();
			await expect(inner.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
			const mobileAvatar = await inner.locator(".h-basalt-9.w-basalt-9").boundingBox();
			expect([mobileAvatar?.width, mobileAvatar?.height]).toEqual([36, 36]);
			measurements.push({ viewport: width, outer: 320, inner: 260, avatar: mobileAvatar });
			await page.screenshot({ path: `test-results/l3/sidebar-${theme}-${width}.png` });
			await page.keyboard.press("Escape");
			await expect(drawer).toBeHidden();
			await expect(menu).toBeFocused();
			await menu.click();
			await drawer.getByRole("button", { name: "关闭导航菜单", exact: true }).click();
			await expect(drawer).toBeHidden();
			await expect(menu).toBeFocused();
			await menu.click();
			await drawer.getByRole("button", { name: "AI 设置", exact: true }).click();
			await expect(page).toHaveURL(/\/settings\/ai$/);
			await expect(drawer).toBeHidden();
			await expect(menu).toBeFocused();
			await menu.click();
			await drawer.getByRole("button", { name: "通用设置", exact: true }).click();
			await expect(page).toHaveURL(/\/settings\/general$/);
			await expect(drawer).toBeHidden();
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		await sidebar.getByRole("button", { name: "收起侧栏", exact: true }).click();
		await page.mouse.move(1400, 400);
		await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(68);
		await page.setViewportSize({ width: 390, height: 900 });
		await page.getByRole("button", { name: "打开导航菜单", exact: true }).click();
		const mobileSidebar = page.locator('[data-slot="sidebar-drawer"] [data-basalt-sidebar]');
		expect((await mobileSidebar.boundingBox())?.width).toBe(260);
		await expect(mobileSidebar).not.toHaveAttribute("data-collapsed");
		await page.keyboard.press("Escape");
		await expect(page.locator('[data-slot="sidebar-drawer"]')).toBeHidden();
		await expect(page.getByRole("button", { name: "打开导航菜单", exact: true })).toBeFocused();
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(68);
		await expect(sidebar).toHaveAttribute("data-collapsed", "");
		expect(await page.evaluate(() => localStorage.getItem("life.ai:sidebar-collapsed"))).toBe(
			"true",
		);
		await testInfo.attach("sidebar-measurements", {
			body: JSON.stringify({ theme, revision: "outer320-inner260-v1", measurements }, null, 2),
			contentType: "application/json",
		});
	});
}
