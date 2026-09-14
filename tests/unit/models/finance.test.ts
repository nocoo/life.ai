import { describe, expect, it } from "vitest";
import { buildFinanceDay, createFinanceCollector, formatMinor } from "../../../src/models/finance";
import {
	PIXIU_COLUMNS,
	type PixiuDay,
	parsePixiu,
	pixiuDayEvents,
} from "../../../src/models/pixiu";
import { buildDayTimeline, localDateKey, shiftLocalDate } from "../../../src/models/time";
import type { LifeEvent } from "../../../src/models/types";

async function events() {
	const rows = [
		"2026-09-13,日常支出,咖啡,0.00,0.10,人民币,现金,,咖啡与阅读",
		"2026-09-13,日常支出,咖啡,0.00,0.20,人民币,现金,,咖啡与阅读",
		"2026-09-13,日常支出,咖啡,0.05,0.00,人民币,现金,,",
		"2026-09-13,日常收入,工资,100.00,0.00,人民币,卡,,",
		"2026-09-13,信用卡还款,还款,0.00,80.00,人民币,卡,,",
		"2026-09-13,基金赎回,基金,200.00,0.00,人民币,卡,,",
		"2026-09-13,余额调整,调整,0.00,0.00,人民币,卡,,",
		"2026-09-13,转账,转出,0.00,50.00,人民币,卡,,",
		"2026-09-13,日常支出,午餐,0.00,9.50,美元,现金,,",
	];
	return pixiuDayEvents(
		(
			await parsePixiu([
				{ name: "test.csv", text: `${PIXIU_COLUMNS.join(",")}\n${rows.join("\n")}` },
			])
		).days[0] as PixiuDay,
	);
}

describe("date-only financial story", () => {
	it("uses exact cents, preserves classification, separates currencies and does not call transfers consumption", async () => {
		const original = await events();
		const result = buildFinanceDay([...original, original[0] as LifeEvent]);
		expect(result.recordCount).toBe(9);
		expect(result.sourceDates).toEqual(["2026-09-13"]);
		expect(result.notes).toEqual(["咖啡与阅读"]);
		expect(result.accounts).toHaveLength(2);
		expect(result.currencies.find((item) => item.currency === "人民币")).toMatchObject({
			count: 8,
			expenseMinor: 30,
			incomeMinor: 10000,
			transfersMinor: 5000,
			expenseInflowMinor: 5,
			otherInflowMinor: 20000,
			otherOutflowMinor: 8000,
			categories: [{ name: "咖啡", count: 3, amountMinor: 30 }],
		});
		expect(result.currencies.find((item) => item.currency === "美元")?.expenseMinor).toBe(950);
		expect(formatMinor(30)).toBe("0.30");
		expect(formatMinor(-100001)).toBe("-1,000.01");
		expect(formatMinor(Number.MAX_SAFE_INTEGER)).toBe("90,071,992,547,409.91");
	});
	it("keeps transactions out of the midnight hour and preserves all raw fields", async () => {
		const original = await events();
		// A UTC+8 accounting day belongs to the viewer's local date containing its UTC start.
		expect(original[0]?.occurredAt).toBe("2026-09-12T16:00:00.000Z");
		const displayDay = localDateKey(new Date("2026-09-12T16:00:00.000Z"));
		const timeline = buildDayTimeline(displayDay, original);
		expect(timeline.allDay).toHaveLength(9);
		expect(timeline.hours.flatMap((hour) => hour.events)).toEqual([]);
		for (const offset of [-1, 1])
			expect(buildDayTimeline(shiftLocalDate(displayDay, offset), original).allDay).toEqual([]);
		expect(original[0]?.data).toMatchObject({
			备注: "咖啡与阅读",
			资金账户: "现金",
			sourceTimeZone: "Asia/Shanghai",
		});
	});
	it("handles missing legacy metadata, exact negative flows and only uses the transfer heuristic when classification is absent", async () => {
		const base = (await events())[0] as LifeEvent;
		const collector = createFinanceCollector();
		collector.add({ ...base, sourceId: "journal" });
		collector.add({ ...base, data: null });
		collector.add({ ...base, data: [] });
		collector.add({
			...base,
			data: { 交易类型: "退款", 流出金额: "-20.10", 流入金额: 100, 币种: " cny " },
		});
		collector.add({ ...base, data: { 交易类型: "转账", 流出金额: 50, 流入金额: 50, 币种: "CNY" } });
		collector.add({ ...base, data: { 流出金额: "bad", 流入金额: true } });
		collector.add({ ...base, data: { 流出金额: "99999999999999999999999.00" } });
		const result = collector.finish();
		expect(result.currencies.find((item) => item.currency === "CNY")).toMatchObject({
			incomeMinor: 10000,
			expenseMinor: -2010,
			transfersMinor: 5000,
		});
		expect(result.currencies.find((item) => item.currency === "未注明币种")?.count).toBe(4);
	});
	it("bounds story notes while retaining all classified totals", async () => {
		const base = (await events())[0] as LifeEvent;
		const list: LifeEvent[] = Array.from({ length: 12 }, (_, index) => ({
			...base,
			id: String(index),
			data: {
				...(base.data as object),
				备注: `note-${index}`,
				交易类型: index % 2 ? "午餐" : "早餐",
			},
		}));
		const result = buildFinanceDay(list);
		expect(result.recordCount).toBe(12);
		expect(result.notes).toHaveLength(6);
		expect(result.currencies[0]?.categories).toHaveLength(2);
		expect(result.currencies[0]?.expenseMinor).toBe(120);
	});
});
