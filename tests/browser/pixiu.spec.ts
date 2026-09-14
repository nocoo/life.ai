import AxeBuilder from "@axe-core/playwright";
import type { PixiuRow } from "../../src/models/pixiu";
import { pixiuCsv } from "./pixiu-fixture";
import { expect, test } from "./public-context-fixture";

test("multiple accounting CSVs import idempotently and appear as all-day finance with a lazy nine-column ledger", async ({
	page,
}) => {
	await page.clock.install({ time: new Date("2093-03-24T04:00:00Z") });
	await page.setViewportSize({ width: 1920, height: 1080 });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const rows: PixiuRow[] = [
		[
			"2093-03-24",
			"日常支出",
			"咖啡",
			"0.00",
			"12.30",
			"人民币",
			"现金",
			"",
			"河边咖啡,看书\n两页笔记",
		],
		[
			"2093-03-24",
			"日常支出",
			"咖啡",
			"0.00",
			"12.30",
			"人民币",
			"现金",
			"",
			"河边咖啡,看书\n两页笔记",
		],
		["2093-03-24", "信用卡还款", "还款", "0.00", "50.00", "人民币", "信用卡", "", ""],
		["2093-03-24", "日常支出", "订阅", "0.00", "9.99", "美元", "现金", "", ""],
		["2093-03-25", "余额调整", "调整", "0.00", "0.00", "人民币", "现金", "", "保留零金额"],
	];
	const files = [rows.slice(0, 4), rows.slice(4)].map((list, index) => ({
		name: `book-${index}.csv`,
		mimeType: "text/csv",
		buffer: Buffer.from(pixiuCsv(list)),
	}));
	await page.goto("/data/pixiu");
	await expect(page.getByRole("heading", { name: "貔貅记账", exact: true })).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(files);
	await expect(page.getByRole("heading", { name: "本次预览", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText("导入完成", { exact: true })).toBeVisible();
	await expect(page.getByText(/已处理 2 天.*5 条；新增 2/)).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(files);
	await page.getByRole("button", { name: "开始导入", exact: true }).click();
	await expect(page.getByText(/新增 0 天，更新 0 天，未变 2 天/)).toBeVisible();
	await page.screenshot({ path: "test-results/l3/pixiu-import-desktop.png", fullPage: true });
	expect(
		(await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
	).toEqual([]);
	await page.getByRole("link", { name: "查看数据概览", exact: true }).click();
	await expect(page.getByRole("heading", { name: "数据概览", exact: true })).toBeVisible();
	await expect(page.getByText("貔貅记账", { exact: true }).first()).toBeVisible();
	await page.goto("/?day=2093-03-24");
	await expect(page.locator("[data-hour]")).toHaveCount(24);
	await expect(
		page.locator(".finance-day strong").getByText("24.60", { exact: true }),
	).toBeVisible();
	await expect(
		page.locator(".finance-day strong").getByText("9.99", { exact: true }),
	).toBeVisible();
	await expect(page.locator('[data-hour] [data-story-kind="money"]')).toHaveCount(0);
	await expect(page.getByRole("table")).toHaveCount(0);
	let healthReads = 0;
	page.on("request", (request) => {
		if (request.url().includes("/apple-health/series") && request.url().includes("view=all"))
			healthReads++;
	});
	await page.getByRole("button", { name: "查看 4 笔原始账目" }).click();
	await expect(page.getByRole("tab", { name: "账目记录", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	const ledger = page.getByRole("table", { name: "账目记录", exact: true });
	await expect(ledger.locator("tbody tr")).toHaveCount(4);
	await expect(ledger.locator("tbody tr").first()).toContainText("12.30");
	await expect(ledger.getByRole("columnheader", { name: "资金账户" })).toBeVisible();
	await expect(ledger).toContainText("两页笔记");
	await expect(page.locator("[data-hour]")).toHaveCount(0);
	expect(healthReads).toBe(0);
	await ledger.getByRole("button", { name: "查看完整记录：咖啡", exact: true }).first().click();
	await expect(page.getByRole("dialog")).toContainText("Asia/Shanghai");
	await page.keyboard.press("Escape");
	await page.screenshot({ path: "test-results/l3/pixiu-ledger-desktop.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	expect(
		(await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
	).toEqual([]);
	await page.getByRole("tab", { name: "时间线", exact: true }).click();
	await expect(page.locator(".finance-day")).toBeVisible();
	await page.getByRole("button", { name: "后一天", exact: true }).click();
	await expect(page.locator(".finance-day")).toContainText("其他资金往来");
	await expect(page.getByRole("button", { name: "查看 1 笔原始账目" })).toBeVisible();
	expect(errors).toEqual([]);
});
