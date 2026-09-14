import { describe, expect, it, vi } from "vitest";
import { importFile } from "../../../src/models/import";
import type { ImportProgress, ImportRecord, ImportSourceId } from "../../../src/models/types";

async function read(text: string, source: ImportSourceId, name = "export.xml") {
	const batches: ImportRecord[][] = [];
	const progress: ImportProgress[] = [];
	const file = new File([text], name);
	const wholeFile = vi.spyOn(file, "arrayBuffer");
	const result = await importFile(
		file,
		source,
		async (batch) => {
			batches.push(batch);
		},
		(value) => {
			progress.push(value);
		},
	);
	return { records: batches.flat(), batches, progress, result, wholeFile };
}

const journal = { title: "阅读", occurredAt: "2026-09-13T12:34:56.789+08:00", data: { pages: 12 } };
const csvHeader = "日期,交易分类,交易类型,流入金额,流出金额,币种,资金账户,标签,备注";

describe("dedicated provider imports", () => {
	it.each(["apple-health", "footprint"] as const)("moves %s to Data Management", async (source) => {
		await expect(read("<export/>", source)).rejects.toThrow("专用导入页面");
	});
});

describe("Pixiu CSV", () => {
	it("preserves duplicate real transactions, quoted commas/newlines/quotes, and replay keys", async () => {
		const csv = `\uFEFF${csvHeader}\r\n2026-09-13,支出,午餐,0,12.50,CNY,现金,,"咖啡,\r\n""午餐"""\r\n2026-09-13,支出,午餐,0,12.50,CNY,现金,,"咖啡,\r\n""午餐"""`;
		const first = await read(csv, "pixiu", "2026.csv");
		const replay = await read(csv, "pixiu", "renamed.csv");
		expect(first.records).toHaveLength(2);
		expect(first.records[0]?.key).not.toBe(first.records[1]?.key);
		expect(first.records.map((record) => record.key)).toEqual(
			replay.records.map((record) => record.key),
		);
		expect(first.records[0]).toMatchObject({
			title: "午餐",
			precision: "day",
			content: '支出 12.50 · CNY · 咖啡,\r\n"午餐"',
		});
	});
	it("supports income, empty optional columns, hour/minute/second input, and blank lines", async () => {
		const { records } = await read(
			`${csvHeader}\n\n2026-09-13T09,收入,,1234,0,CNY,银行卡,,\n2026-09-13 10:01,,,,,,,,\n2026-09-13T11:02:03Z,,,,,,,,`,
			"pixiu",
			"input.csv",
		);
		expect(records.map((record) => record.precision)).toEqual(["hour", "minute", "second"]);
		expect(records[0]?.content).toBe("收入 1234 · CNY");
		expect(records[1]?.title).toBe("记账");
	});
	it("streams CSV across quoted row boundaries and supports CR newlines", async () => {
		const rows = Array.from(
			{ length: 1600 },
			(_, i) => `2026-09-13,支出,交通,0,${i},CNY,现金,,"公交,地铁"`,
		);
		const result = await read(`${csvHeader}\r${rows.join("\r")}\r`, "pixiu", "large.csv");
		expect(result.records).toHaveLength(1600);
		expect(result.wholeFile).not.toHaveBeenCalled();
	});
	it.each([
		"wrong,header\n2026-09-13,a",
		"日期,日期\n2026-09-13,a",
		"日期,备注\n2026-09-13,a,b",
		`日期,流出金额\n2026-09-13,NaN`,
		`日期,流入金额\n2026-09-13,12x`,
		`日期,备注\n2026-09-13,"not closed`,
		`日期,备注\n2026-09-13,"invalid"trailing`,
	])("rejects malformed CSV %s", async (csv) => {
		await expect(read(csv, "pixiu", "bad.csv")).rejects.toThrow();
	});
	it("bounds an incomplete CSV row", async () => {
		await expect(
			read(`日期,备注\n2026-09-13,"${"x".repeat(1100_000)}`, "pixiu", "bad.csv"),
		).rejects.toThrow("1 MiB");
	});
});

describe("journal JSON and NDJSON", () => {
	it("normalizes JSON arrays, explicit keys, timestamp aliases and optional fields", async () => {
		const { records } = await read(
			JSON.stringify([
				journal,
				{
					id: "manual-1",
					timestamp: "2026-09-13T09:30:58Z",
					precision: "minute",
					title: "工作",
					endAt: "2026-09-13T10:30:00Z",
					content: "完成报告",
					data: [true, null, 1],
				},
				{ key: "manual-2", date: "2026-09-13", title: "纪念日" },
			]),
			"journal",
			"events.json",
		);
		expect(records[0]).toMatchObject({
			precision: "second",
			occurredAt: "2026-09-13T04:34:56.000Z",
			endAt: null,
		});
		expect(records[1]).toMatchObject({
			key: "manual-1",
			precision: "minute",
			occurredAt: "2026-09-13T09:30:00.000Z",
		});
		expect(records[2]).toMatchObject({
			key: "manual-2",
			precision: "day",
			content: "",
			data: null,
		});
	});
	it("supports a single JSON object and equivalent object key order", async () => {
		const a = await read(JSON.stringify(journal), "journal", "a.json");
		const b = await read(
			JSON.stringify({ data: { pages: 12 }, occurredAt: journal.occurredAt, title: journal.title }),
			"journal",
			"b.json",
		);
		expect(a.records[0]?.key).toBe(b.records[0]?.key);
	});
	it("streams NDJSON and flushes under the 1 MiB HTTP limit, even with large data", async () => {
		const rows = Array.from({ length: 60 }, (_, i) =>
			JSON.stringify({ ...journal, key: String(i), data: { note: "中文".repeat(5000) } }),
		);
		const { batches, result } = await read(`\n${rows.join("\n")}\n\n`, "journal", "events.NDJSON");
		expect(result.accepted).toBe(60);
		expect(batches.length).toBeGreaterThan(1);
		for (const batch of batches)
			expect(
				new TextEncoder().encode(JSON.stringify({ source: "journal", records: batch })).length,
			).toBeLessThan(1024 * 1024);
	});
	it("accepts a final NDJSON line without a newline", async () => {
		const { records } = await read(
			`${JSON.stringify(journal)}\n${JSON.stringify(journal)}`,
			"journal",
			"events.jsonl",
		);
		expect(records).toHaveLength(2);
	});
	it.each([
		"[null]",
		"[1]",
		"[[]]",
		'[{"title":"missing date"}]',
		'[{"occurredAt":"2026-09-13","title":""}]',
		"not json",
	])("rejects invalid journal data %s", async (json) => {
		await expect(read(json, "journal", "bad.json")).rejects.toThrow();
	});
	it("limits plain JSON files, NDJSON lines and record data without trusting file extensions", async () => {
		await expect(read(" ".repeat(10 * 1024 * 1024 + 1), "journal", "huge.json")).rejects.toThrow(
			"10 MiB",
		);
		await expect(
			read(`{"text":"${"x".repeat(1100_000)}`, "journal", "huge.ndjson"),
		).rejects.toThrow("1 MiB");
		await expect(
			read(JSON.stringify({ ...journal, data: "字".repeat(11000) }), "journal", "data.json"),
		).rejects.toThrow("32 KiB");
	});
});

describe("import progress, cancellation and failures", () => {
	it.each([
		["日期", "pixiu", "data.csv"],
		["[]", "journal", "data.json"],
		["\n", "journal", "data.ndjson"],
	] as const)("does not report success for empty %s", async (contents, source, name) => {
		await expect(read(contents, source, name)).rejects.toThrow("没有可导入");
	});
	it("does not begin an already cancelled import", async () => {
		const controller = new AbortController();
		controller.abort();
		const batch = vi.fn();
		await expect(
			importFile(
				new File([JSON.stringify(journal)], "data.json"),
				"journal",
				batch,
				vi.fn(),
				controller.signal,
			),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(batch).not.toHaveBeenCalled();
	});
	it("stops after a completed batch and exposes accepted count for safe replay", async () => {
		const controller = new AbortController();
		const progress: ImportProgress[] = [];
		const batch = vi.fn(async () => {
			controller.abort();
		});
		await expect(
			importFile(
				new File(
					[Array.from({ length: 301 }, () => JSON.stringify(journal)).join("\n")],
					"data.ndjson",
				),
				"journal",
				batch,
				(value) => {
					progress.push(value);
				},
				controller.signal,
			),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(batch).toHaveBeenCalledTimes(1);
		expect(progress.at(-1)?.accepted).toBe(100);
	});
	it("propagates read/upload failures without claiming that rejected batches were accepted", async () => {
		const file = new File(
			[Array.from({ length: 101 }, () => JSON.stringify(journal)).join("\n")],
			"data.ndjson",
		);
		const progress: ImportProgress[] = [];
		await expect(
			importFile(
				file,
				"journal",
				async () => {
					throw new Error("offline");
				},
				(value) => {
					progress.push(value);
				},
			),
		).rejects.toThrow("offline");
		expect(progress.at(-1)?.accepted).toBe(0);
		vi.spyOn(file, "slice").mockImplementation(() => {
			throw new Error("disk");
		});
		await expect(importFile(file, "journal", vi.fn(), vi.fn())).rejects.toThrow("disk");
	});
	it("rejects invalid UTF-8 instead of corrupting the source text", async () => {
		await expect(
			importFile(new File([new Uint8Array([0xff])], "data.json"), "journal", vi.fn(), vi.fn()),
		).rejects.toThrow();
	});
});
