import { afterEach, describe, expect, it, vi } from "vitest";
import {
	PIXIU_COLUMNS,
	PIXIU_DAY_MS,
	PIXIU_MAX_DAY_BYTES,
	PIXIU_OFFSET_MS,
	PIXIU_TIME_ZONE,
	type PixiuRow,
	parsePixiu,
	pixiuDayEvents,
	pixiuMinorUnits,
	validatePixiuDay,
} from "../../../src/models/pixiu";
import { buildDayTimeline, shiftLocalDate } from "../../../src/models/time";

const sourceDate = "2026-09-14";
const utcDay = Date.parse("2026-09-14T00:00:00Z");
const encoder = new TextEncoder();
const originalTimeZone = process.env.TZ;
const columns = [
	"日期",
	"交易分类",
	"交易类型",
	"流入金额",
	"流出金额",
	"币种",
	"资金账户",
	"标签",
	"备注",
];
const row = (changes: Record<number, string> = {}): PixiuRow =>
	Object.assign(
		[sourceDate, "日常支出", "早餐", "0.00", "18.00", "人民币", "合成现金", "测试", "合成备注"],
		changes,
	) as PixiuRow;
const envelope = (rows: unknown = [row()], extra: Record<string, unknown> = {}) => ({
	utcDay,
	data: {
		v: 1,
		precision: "day",
		sourceDate,
		timeZone: "Asia/Shanghai",
		utcOffsetMinutes: 480,
		columns,
		rows,
		...extra,
	},
});
const csv = (rows: readonly (readonly string[])[], header: readonly string[] = columns) =>
	[header, ...rows]
		.map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
		.join("\r\n");

afterEach(() => {
	if (originalTimeZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimeZone;
});

describe("Pixiu exact decimal amounts", () => {
	it.each([
		["0.00", 0],
		["0.10", 10],
		["0.29", 29],
		["1.01", 101],
		["00001.05", 105],
		["00000000000000000.00", 0],
		["90071992547409.91", Number.MAX_SAFE_INTEGER],
	])("preserves the exact minor units of %s", (value, expected) => {
		expect(pixiuMinorUnits(value as string)).toBe(expected);
	});
	it.each([
		"",
		"0",
		".29",
		"1.0",
		"1.001",
		"-0.01",
		"+1.00",
		"1e2",
		"1,000.00",
		" 1.00",
		"1.00 ",
		"NaN",
		"Infinity",
		"１.００",
		"000000000000000000.00",
	])("rejects non-original or unsupported decimal syntax: %j", (value) => {
		expect(() => pixiuMinorUnits(value)).toThrow("两位小数");
	});
	it("rejects one minor unit beyond the safe integer boundary", () => {
		expect(() => pixiuMinorUnits("90071992547409.92")).toThrow("精确计算范围");
	});
});

describe("Pixiu complete daily snapshots", () => {
	it("retains all nine original cells, zero amounts and duplicate multiplicity, and recomputes claims", async () => {
		const zero = row({
			2: "",
			3: "000.00",
			4: "0.00",
			6: "  合成账户  ",
			7: "",
			8: "零金额也有意义\n第二行",
		});
		const rows = [zero, [...zero], row({ 8: '逗号, 与"引号"' })];
		const input = {
			...envelope(rows),
			recordCount: 999,
			firstAt: 0,
			lastAt: 0,
			payloadBytes: 1,
			contentHash: "forged",
			summary: { totals: [] },
		};
		const result = await validatePixiuDay(input);
		expect(PIXIU_COLUMNS).toEqual(columns);
		expect(result).toMatchObject({
			utcDay,
			recordCount: 3,
			firstAt: Date.parse("2026-09-13T16:00:00Z"),
			lastAt: Date.parse("2026-09-14T15:59:59.999Z"),
			data: { ...input.data, rows },
			summary: {
				totals: [
					{
						currency: "人民币",
						classification: "日常支出",
						count: 3,
						inflowMinor: 0,
						outflowMinor: 1800,
					},
				],
			},
		});
		expect(result.payloadBytes).toBe(
			encoder.encode(JSON.stringify(result.data)).length +
				encoder.encode(JSON.stringify(result.summary)).length,
		);
		expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
		expect(result.data.rows).not.toBe(rows);
		expect(result.data.rows[0]).not.toBe(zero);
		expect(result.data.columns).not.toBe(columns);
		expect(rows[0]).toEqual(zero);
	});

	it("separates currencies and original classifications without relabelling refunds or netting flows", async () => {
		const result = await validatePixiuDay(
			envelope([
				row({ 5: "USD", 4: "0.33" }),
				row({ 5: "CNY", 4: "0.10" }),
				row({ 5: "JPY", 4: "1.00" }),
				row({ 5: "CNY", 1: "余额调整", 3: "10.01", 4: "5.02" }),
				row({ 5: "EUR", 4: "0.09" }),
				row({ 5: "CNY", 4: "0.20" }),
				row({ 5: "CNY", 3: "0.29", 4: "0.00", 2: "退款" }),
				row({ 5: "CNY", 4: "0.00" }),
			]),
		);
		expect(result.summary.totals).toEqual([
			{
				currency: "CNY",
				classification: "余额调整",
				count: 1,
				inflowMinor: 1001,
				outflowMinor: 502,
			},
			{ currency: "CNY", classification: "日常支出", count: 4, inflowMinor: 29, outflowMinor: 30 },
			{ currency: "EUR", classification: "日常支出", count: 1, inflowMinor: 0, outflowMinor: 9 },
			{ currency: "JPY", classification: "日常支出", count: 1, inflowMinor: 0, outflowMinor: 100 },
			{ currency: "USD", classification: "日常支出", count: 1, inflowMinor: 0, outflowMinor: 33 },
		]);
	});

	it.each([3, 4])(
		"rejects summary overflow in amount column %i without rounding",
		async (column) => {
			await expect(
				validatePixiuDay(
					envelope([row({ [column]: "90071992547409.91" }), row({ [column]: "0.01" })]),
				),
			).rejects.toThrow("汇总金额超出精确计算范围");
		},
	);

	it("hashes the entire row multiset while retaining the first export's original order", async () => {
		const first = row({ 8: "第一笔" });
		const second = row({ 8: "第二笔" });
		const a = await validatePixiuDay(envelope([first, second, first]));
		const reordered = await validatePixiuDay(envelope([second, first, first]));
		const fewerDuplicates = await validatePixiuDay(envelope([first, second]));
		const changedCell = await validatePixiuDay(envelope([first, second, row({ 8: "第一笔 " })]));
		expect(reordered.contentHash).toBe(a.contentHash);
		expect(reordered.data.rows).toEqual([second, first, first]);
		expect(a.data.rows).toEqual([first, second, first]);
		expect(fewerDuplicates.contentHash).not.toBe(a.contentHash);
		expect(changedCell.contentHash).not.toBe(a.contentHash);
		expect((await validatePixiuDay(envelope([first, second, first]))).contentHash).toBe(
			a.contentHash,
		);
	});

	it.each([null, false, 4, "value", []].map((value) => ({ value })))(
		"rejects a non-object envelope or payload: %j",
		async ({ value }) => {
			await expect(validatePixiuDay(value)).rejects.toThrow("JSON 对象");
			await expect(validatePixiuDay({ utcDay, data: value })).rejects.toThrow("JSON 对象");
		},
	);
	it.each([
		undefined,
		20260914,
		"2026-9-14",
		"2026-09-14 ",
		"2026-09-14T00:00:00Z",
		"2026-09-14T00:00:00+08:00",
		"2026-02-29",
		"2026-13-01",
		"2026-04-31",
	])("rejects non-calendar source dates without inventing a clock: %j", async (value) => {
		await expect(validatePixiuDay(envelope([row()], { sourceDate: value }))).rejects.toThrow();
	});
	it.each([undefined, "2026-09-14", utcDay + 1, utcDay - PIXIU_OFFSET_MS])(
		"rejects a mismatched technical UTC date key: %j",
		async (key) => {
			await expect(validatePixiuDay({ ...envelope(), utcDay: key })).rejects.toThrow("日键");
		},
	);
	it.each([
		{ v: 2 },
		{ precision: "hour" },
		{ timeZone: "UTC" },
		{ utcOffsetMinutes: 0 },
		{ columns: null },
		{ columns: columns.slice(1) },
		{ columns: [...columns].reverse() },
	])("rejects unsupported schema or timezone metadata: %j", async (extra) => {
		await expect(validatePixiuDay(envelope([row()], extra))).rejects.toThrow(
			"版本、时区或字段顺序",
		);
	});
	it.each([undefined, null, {}, []].map((rows) => ({ rows })))(
		"rejects empty or absent rows instead of treating absence as deletion: %j",
		async ({ rows }) => {
			await expect(validatePixiuDay(envelope([], { rows }))).rejects.toThrow("完整记录");
		},
	);
	it("bounds row count before materializing the body", async () => {
		await expect(
			validatePixiuDay(envelope(Array.from({ length: 10_001 }, () => row()))),
		).rejects.toThrow("10,000");
	});
	it.each(
		[null, {}, ["date"], [...row(), "extra"], [14, ...row().slice(1)]].map((raw) => ({ raw })),
	)("rejects incomplete or non-text source cells: %j", async ({ raw }) => {
		await expect(validatePixiuDay(envelope([raw]))).rejects.toThrow("九列原始文本");
	});
	it("rejects cross-day records and blank required classifications/currencies", async () => {
		await expect(validatePixiuDay(envelope([row({ 0: "2026-09-15" })]))).rejects.toThrow(
			"其他记账日期",
		);
		for (const column of [1, 5])
			await expect(validatePixiuDay(envelope([row({ [column]: " \t" })]))).rejects.toThrow(
				"不能为空",
			);
	});
	it("enforces the actual UTF-8 day limit, including summary, at the exact boundary", async () => {
		const empty = row({ 8: "" });
		const base = await validatePixiuDay(envelope([empty]));
		const length = PIXIU_MAX_DAY_BYTES - base.payloadBytes;
		const exact = await validatePixiuDay(envelope([row({ 8: "x".repeat(length) })]));
		expect(exact.payloadBytes).toBe(PIXIU_MAX_DAY_BYTES);
		await expect(validatePixiuDay(envelope([row({ 8: "x".repeat(length + 1) })]))).rejects.toThrow(
			"512 KiB",
		);
		const note = "界".repeat(Math.ceil(length / 3));
		expect(note.length).toBeLessThan(length);
		await expect(
			validatePixiuDay({ ...envelope([row({ 8: `${note}界` })]), payloadBytes: 1 }),
		).rejects.toThrow("512 KiB");
	});
});

describe("complete CSV selections", () => {
	it("parses BOM, CRLF, quoted commas/quotes/newlines and empty cells without trimming or deduplicating", async () => {
		const original = row({
			2: "",
			4: "0.00",
			6: "合成,账户",
			7: '标签"甲",标签乙',
			8: " 第一行\r\n第二行 ",
		});
		const text = `\uFEFF${csv([original, original])}\r\n\r\n`;
		const plan = await parsePixiu([{ name: "合成.csv", text }]);
		expect(plan.recordCount).toBe(2);
		expect(plan.days[0]?.data.rows).toEqual([original, original]);
		expect(plan.bytesRead).toBe(encoder.encode(text).length);
		expect(plan.fileNames).toEqual(["合成.csv"]);
		expect(plan.firstDate).toBe(sourceDate);
		expect(plan.lastDate).toBe(sourceDate);
	});
	it("sorts disordered full-day snapshots across files without filling omitted calendar dates", async () => {
		const inputs = [
			{
				name: "later.csv",
				text: csv([
					row({ 0: "2027-01-03" }),
					row({ 0: "2026-12-31" }),
					row({ 0: "2027-01-03", 8: "同日第二笔" }),
				]),
			},
			{ name: "earlier.csv", text: csv([row({ 0: "2024-02-29" })]) },
		];
		const result = await parsePixiu(inputs);
		expect(result.days.map((day) => [day.data.sourceDate, day.recordCount])).toEqual([
			["2024-02-29", 1],
			["2026-12-31", 1],
			["2027-01-03", 2],
		]);
		expect(result).toMatchObject({
			recordCount: 4,
			firstDate: "2024-02-29",
			lastDate: "2027-01-03",
			fileNames: ["later.csv", "earlier.csv"],
		});
		expect(result.bytesRead).toBe(
			inputs.reduce((sum, file) => sum + encoder.encode(file.text).length, 0),
		);
		expect(result.payloadBytes).toBe(result.days.reduce((sum, day) => sum + day.payloadBytes, 0));
	});
	it("reuses an identical overlapping day regardless of filename/order, preserving its original multiplicity", async () => {
		const a = row({ 8: "甲" });
		const b = row({ 8: "乙" });
		const result = await parsePixiu([
			{ name: "first.csv", text: csv([a, b, a]) },
			{ name: "renamed.csv", text: csv([b, a, a]) },
		]);
		expect(result.recordCount).toBe(3);
		expect(result.days).toHaveLength(1);
		expect(result.days[0]?.data.rows).toEqual([a, b, a]);
		const renamed = await parsePixiu([{ name: "another-name.csv", text: csv([b, a, a]) }]);
		expect(renamed.days[0]?.contentHash).toBe(result.days[0]?.contentHash);
	});
	it.each([[row({ 4: "20.00" })], [row(), row()]].map((rows) => ({ rows })))(
		"rejects differing same-day snapshots across files instead of combining them: %j",
		async ({ rows }) => {
			await expect(
				parsePixiu([
					{ name: "a.csv", text: csv([row()]) },
					{ name: "b.csv", text: csv(rows) },
				]),
			).rejects.toThrow("分别导入");
		},
	);
	it("rejects no selection and header-only exports without producing empty day replacements", async () => {
		await expect(parsePixiu([])).rejects.toThrow("请选择");
		await expect(parsePixiu([{ name: "empty.csv", text: csv([]) }])).rejects.toThrow("没有可导入");
	});
	it.each(
		[
			columns.slice(1),
			[...columns, "extra"],
			[...columns].reverse(),
			columns.map((name) => `${name} `),
		].map((header) => ({ header })),
	)("requires exactly the original nine CSV columns: %j", async ({ header }) => {
		await expect(parsePixiu([{ name: "wrong.csv", text: csv([], header) }])).rejects.toThrow(
			"原始九列",
		);
	});
	it.each([row().slice(0, 8), [...row(), "extra"]].map((raw) => ({ raw })))(
		"reports incomplete record fields before returning any plan: %j",
		async ({ raw }) => {
			await expect(
				parsePixiu([{ name: "bad-record.csv", text: csv([row(), raw]) }]),
			).rejects.toThrow("第 3 条记录");
		},
	);
	it("rejects truncated quotes and invalid dates or amounts in later input", async () => {
		await expect(
			parsePixiu([{ name: "truncated.csv", text: `${columns.join(",")}\n"unterminated` }]),
		).rejects.toThrow("CSV 格式不完整");
		for (const invalid of [row({ 0: "2026-02-30" }), row({ 3: "1.234" }), row({ 4: "-1.00" })])
			await expect(
				parsePixiu([
					{ name: "good.csv", text: csv([row()]) },
					{ name: "bad.csv", text: csv([invalid]) },
				]),
			).rejects.toThrow();
	});
	it("caps actual UTF-8 input before parsing an oversized CSV", async () => {
		await expect(
			parsePixiu([{ name: "too-large.csv", text: "x".repeat(32 * 1024 * 1024 + 1) }]),
		).rejects.toThrow("32 MiB");
	});
	it("rejects an already cancelled parse with its original reason", async () => {
		const reason = new Error("Synthetic cancellation");
		await expect(
			parsePixiu([{ name: "a.csv", text: csv([row()]) }], { signal: AbortSignal.abort(reason) }),
		).rejects.toBe(reason);
	});
	it.each([1, 2])(
		"honors cancellation during asynchronous packing of %i input files",
		async (fileCount) => {
			const controller = new AbortController();
			const reason = new Error("Cancelled during hashing");
			const digest = crypto.subtle.digest.bind(crypto.subtle);
			vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(async (...args) => {
				const result = await digest(...args);
				controller.abort(reason);
				return result;
			});
			const inputs = Array.from({ length: fileCount }, (_, index) => ({
				name: `${index}.csv`,
				text: csv([row({ 0: `2026-09-${14 + index}` })]),
			}));
			await expect(parsePixiu(inputs, { signal: controller.signal })).rejects.toBe(reason);
		},
	);
});

describe("date precision and display-day ownership", () => {
	it.each(["1969-12-31", "2000-02-29", "2099-12-31"])(
		"retains past, leap and future source dates: %s",
		async (date) => {
			const result = await validatePixiuDay({
				...envelope([row({ 0: date })], { sourceDate: date }),
				utcDay: Date.parse(`${date}T00:00:00Z`),
			});
			expect(result.lastAt - result.firstAt + 1).toBe(PIXIU_DAY_MS);
			expect(result.firstAt).toBe(result.utcDay - PIXIU_OFFSET_MS);
			expect(result.data.sourceDate).toBe(date);
		},
	);
	it("renders every duplicate with unique stable IDs and original fields, retaining day precision", async () => {
		const raw = row({ 2: "", 8: "全天记账，没有消费时刻" });
		const day = await validatePixiuDay(envelope(Array.from({ length: 12 }, () => raw)));
		const events = pixiuDayEvents(day);
		expect(events).toHaveLength(12);
		expect(new Set(events.map((event) => event.id)).size).toBe(12);
		expect(events.map((event) => event.id).sort()).toEqual(events.map((event) => event.id));
		expect(events[0]).toMatchObject({
			sourceId: "pixiu",
			sourceName: "貔貅记账",
			sourceKind: "import",
			precision: "day",
			occurredAt: "2026-09-13T16:00:00.000Z",
			endAt: "2026-09-14T16:00:00.000Z",
			title: "日常支出",
			content: raw[8],
			updatedAt: "2026-09-13T16:00:00.000Z",
			data: {
				...Object.fromEntries(columns.map((column, index) => [column, raw[index]])),
				sourceDate,
				sourceTimeZone: PIXIU_TIME_ZONE,
			},
		});
		expect(pixiuDayEvents(await validatePixiuDay(envelope()))[0]?.title).toBe("早餐");
	});
	it.each([
		["UTC", "2026-09-13"],
		["Asia/Shanghai", "2026-09-14"],
		["America/Los_Angeles", "2026-09-13"],
	])(
		"assigns the whole source day once in %s, with no midnight/hourly transaction",
		async (zone, owner) => {
			process.env.TZ = zone;
			const day = await validatePixiuDay(envelope());
			const events = pixiuDayEvents(day);
			const timeline = buildDayTimeline(owner, events);
			expect(timeline.allDay).toEqual(events);
			expect(timeline.hours.every((hour) => hour.events.length === 0)).toBe(true);
			expect(buildDayTimeline(shiftLocalDate(owner, -1), events).totalEvents).toBe(0);
			expect(buildDayTimeline(shiftLocalDate(owner, 1), events).totalEvents).toBe(0);
			expect(day.utcDay).toBe(utcDay);
		},
	);
});
