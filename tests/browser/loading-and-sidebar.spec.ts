import type { Page } from "@playwright/test";
import { expect, test } from "./public-context-fixture";

test("sidebar keeps the same logo and avatar fixed through animation, reversal and short screens", async ({
	page,
}) => {
	await page.route("https://lizheng.blog/fixture-avatar.svg", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#758aa2"/></svg>',
		}),
	);
	await page.route("**/api/session", (route) =>
		route.fulfill({
			json: {
				data: {
					mode: "access",
					subject: "sidebar-fixture",
					name: "Sidebar Fixture",
					email: "sidebar@example.test",
					avatar: "https://lizheng.blog/fixture-avatar.svg",
				},
			},
		}),
	);
	await page.goto("/settings/general");
	const sidebar = page.getByRole("complementary", { name: "主导航" });
	await expect(sidebar.getByRole("img", { name: "Sidebar Fixture" })).toBeVisible();
	const frames = await sidebar.evaluate(async (rail) => {
		const logo = rail.querySelector("[data-sidebar-logo]");
		const avatar = rail.querySelector(".life-sidebar-user img");
		const toggle = rail.querySelector<HTMLButtonElement>(".life-sidebar-toggle");
		if (!logo || !avatar || !toggle) throw new Error("Sidebar identity is missing");
		const box = (element: Element) => {
			const { x, y, width, height } = element.getBoundingClientRect();
			return { x, y, width, height };
		};
		const samples = [];
		for (const duration of [420, 420, 80, 420]) {
			const started = performance.now();
			toggle.click();
			do {
				await new Promise(requestAnimationFrame);
				const icon = rail.querySelector("nav button svg");
				if (!icon) throw new Error("Navigation disappeared");
				samples.push({
					logo: box(logo),
					avatar: box(avatar),
					iconX: box(icon).x,
					width: box(rail).width,
					sameNodes:
						logo === rail.querySelector("[data-sidebar-logo]") &&
						avatar === rail.querySelector(".life-sidebar-user img"),
				});
			} while (performance.now() - started < duration);
		}
		return samples;
	});
	expect(frames.length).toBeGreaterThan(10);
	expect(frames.some((frame) => frame.width > 70 && frame.width < 258)).toBe(true);
	for (const frame of frames) {
		expect(frame.sameNodes).toBe(true);
		expect(frame.logo).toEqual({ x: 24, y: 16, width: 24, height: 24 });
		expect(frame.avatar).toEqual(frames[0]?.avatar);
		expect(frame.iconX).toBeGreaterThanOrEqual(24);
		expect(frame.iconX).toBeLessThanOrEqual(26);
	}
	await page.setViewportSize({ width: 1280, height: 420 });
	const scroll = sidebar.locator(".life-sidebar-scroll");
	expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
		true,
	);
	await sidebar.getByRole("button", { name: "导入", exact: true }).scrollIntoViewIfNeeded();
	await expect(sidebar.getByRole("button", { name: "导入", exact: true })).toBeInViewport();
	await expect(sidebar.locator("[data-sidebar-logo]")).toBeInViewport();
	await expect(sidebar.getByRole("img", { name: "Sidebar Fixture" })).toBeInViewport();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await sidebar.getByRole("button", { name: "收起侧栏", exact: true }).click();
	expect(await sidebar.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
		"0s",
	);
	expect((await sidebar.boundingBox())?.width).toBe(68);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "打开导航" }).click();
	await expect(page.getByRole("dialog").locator("[data-sidebar-logo]")).toBeVisible();
	await expect(
		page.getByRole("dialog").getByRole("img", { name: "Sidebar Fixture" }),
	).toBeVisible();
});

async function holdRequest(page: Page, pattern: string | RegExp) {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(pattern, async (route) => {
		await pending;
		await route.continue();
	});
	return async () => {
		release();
		await page.unrouteAll({ behavior: "wait" });
	};
}

test("slow API reads preserve page-specific cards and do not flash empty or editable settings", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const cases = [
		["/settings/general", "**/api/settings/general", "正在读取常用地点"],
		["/settings/ai", "**/api/settings/ai", "正在读取 AI 设置"],
		["/settings/sources", "**/api/settings/sources", "正在读取数据源"],
		["/data", "**/api/data/overview", "正在读取数据概览"],
		["/connect", "**/api/connects", "正在加载令牌"],
		["/?day=2026-11-08", "**/api/events?**", "正在加载当天记录"],
	] as const;
	for (const [path, pattern, label] of cases) {
		const release = await holdRequest(page, pattern);
		try {
			await page.goto(path);
			const loading = page.getByRole("status", { name: label, exact: true });
			await expect(loading).toBeVisible();
			await expect(loading).toHaveAttribute("aria-busy", "true");
			await expect(loading.locator("input, button, select")).toHaveCount(0);
			if (path === "/settings/general") {
				await expect(page.getByRole("button", { name: "添加地点", exact: true })).toBeDisabled();
				await expect(page.getByText(/还没有常用地点/)).toHaveCount(0);
				await expect(page.getByRole("status", { name: "正在读取惯常作息" })).toBeVisible();
				await expect(page.getByLabel("入睡时间", { exact: true })).toHaveCount(0);
			} else if (path === "/settings/ai") {
				await expect(page.getByRole("combobox", { name: "AI 提供方" })).toHaveCount(0);
			} else if (path === "/data") {
				expect((await loading.locator(".data-overview-history-plot").boundingBox())?.height).toBe(
					280,
				);
				await expect(page.getByText("还没有导入数据", { exact: true })).toHaveCount(0);
			} else if (path === "/settings/sources") {
				await expect(loading.getByRole("heading", { name: "Gecko", exact: true })).toBeVisible();
				await expect(loading.getByRole("heading", { name: "Firefly", exact: true })).toBeVisible();
			} else if (path.startsWith("/?")) {
				await expect(loading.locator(".day-story-column")).toBeVisible();
				await expect(loading.locator(".day-meta")).toBeVisible();
				await page.screenshot({ path: "test-results/l3/loading-timeline-cards.png" });
				await page.getByRole("tab", { name: "位置记录", exact: true }).click();
				await expect(page.getByRole("status", { name: "正在加载位置记录" })).toBeVisible();
			}
			await page.screenshot({
				path: `test-results/l3/loading-${path.split("/").at(-1)?.split("?")[0] || "timeline"}.png`,
			});
		} finally {
			await release();
		}
		await expect(page.getByRole("status", { name: label, exact: true })).toHaveCount(0);
	}
});

test("lazy import pages reserve their upload, progress and destination layouts on mobile", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 390, height: 844 });
	for (const [path, module, label] of [
		["/data/footprint", "footprint", "正在加载导入页面"],
		["/data/apple-health", "apple-health", "正在加载导入页面"],
		["/data/pixiu", "pixiu", "正在加载导入页面"],
		["/imports", "imports", "正在加载日记导入"],
	] as const) {
		const release = await holdRequest(
			page,
			new RegExp(`/src/views/${module}-page\\.tsx(?:\\?.*)?$`),
		);
		try {
			await page.goto(path);
			const loading = page.getByRole("status", { name: label, exact: true });
			await expect(loading).toBeVisible();
			await expect(
				loading.getByRole("heading", { name: module === "imports" ? "进度" : "写入位置" }),
			).toHaveCount(1);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
			await page.screenshot({ path: `test-results/l3/loading-${module}-mobile.png` });
		} finally {
			await release();
		}
		await expect(page.getByRole("status", { name: label, exact: true })).toHaveCount(0);
	}
});
