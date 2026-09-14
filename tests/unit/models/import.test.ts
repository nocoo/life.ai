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

describe("dedicated provider imports", () => {
	it.each(["apple-health", "footprint", "pixiu"] as const)(
		"moves %s to Data Management",
		async (source) => {
			await expect(read("<export/>", source)).rejects.toThrow("专用导入页面");
		},
	);
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
	it.each([
		["2026-09-13T09", "hour", "2026-09-13T09:00:00.000Z"],
		["2026-09-13 09:34", "minute", "2026-09-13T09:34:00.000Z"],
	] as const)(
		"infers the precision of an offsetless %s as UTC",
		async (occurredAt, precision, expected) => {
			const { records } = await read(
				JSON.stringify({ ...journal, occurredAt }),
				"journal",
				"a.json",
			);
			expect(records[0]).toMatchObject({ precision, occurredAt: expected });
		},
	);
	it("keeps nested object key ordering irrelevant while preserving array order in stable keys", async () => {
		const first = await read(
			JSON.stringify({ ...journal, data: { place: { z: 1, a: 2 }, notes: [{ b: 2, a: 1 }, 3] } }),
			"journal",
			"first.json",
		);
		const equivalent = await read(
			JSON.stringify({ ...journal, data: { notes: [{ a: 1, b: 2 }, 3], place: { a: 2, z: 1 } } }),
			"journal",
			"copy.json",
		);
		const reordered = await read(
			JSON.stringify({ ...journal, data: { notes: [3, { a: 1, b: 2 }], place: { a: 2, z: 1 } } }),
			"journal",
			"different.json",
		);
		expect(first.records[0]?.key).toBe(equivalent.records[0]?.key);
		expect(first.records[0]?.key).not.toBe(reordered.records[0]?.key);
	});
	it("rejects an interval ending before its normalized start without submitting a batch", async () => {
		const onBatch = vi.fn();
		await expect(
			importFile(
				new File([JSON.stringify({ ...journal, endAt: "2026-09-13T04:00:00Z" })], "bad.json"),
				"journal",
				onBatch,
				vi.fn(),
			),
		).rejects.toThrow("结束时间不能早于开始时间");
		expect(onBatch).not.toHaveBeenCalled();
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
	it("preserves a UTF-8 character split across bounded file reads", async () => {
		const row = JSON.stringify({ date: "2026-09-13", title: "跨块中文" });
		const prefix = row.indexOf("跨");
		const text = `${" ".repeat(64 * 1024 - 1 - prefix)}${row}`;
		const encoded = new TextEncoder().encode(text);
		expect(encoded[64 * 1024 - 1]).toBe(0xe8);
		const { records, progress, wholeFile } = await read(text, "journal", "chunked.jsonl");
		expect(records[0]?.title).toBe("跨块中文");
		expect(wholeFile).not.toHaveBeenCalled();
		expect(progress.map((item) => item.bytesRead)).toContain(64 * 1024);
		expect(progress.at(-1)?.bytesRead).toBe(encoded.length);
	});
	it("submits at most 100 records per batch and ends with complete accepted progress", async () => {
		const rows = Array.from({ length: 205 }, (_, index) => ({ ...journal, key: `row-${index}` }));
		const { batches, result, progress } = await read(JSON.stringify(rows), "journal", "many.json");
		expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
		expect(batches.flat().map((record) => record.key)).toEqual(rows.map((row) => row.key));
		expect(result).toEqual({ processed: 205, accepted: 205 });
		expect(progress[0]).toMatchObject({ bytesRead: 0, processed: 0, accepted: 0 });
		expect(progress.at(-1)).toMatchObject({ processed: 205, accepted: 205 });
		expect(new Set(progress.map((item) => item.accepted))).toEqual(new Set([0, 100, 200, 205]));
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
	it("honors cancellation while a file slice is being read", async () => {
		const controller = new AbortController();
		const reason = new Error("reader cancelled");
		const file = new File([JSON.stringify(journal)], "pending.json");
		const bytes = await file.arrayBuffer();
		let finish: (value: ArrayBuffer) => void = () => {};
		const chunk = new Blob();
		vi.spyOn(chunk, "arrayBuffer").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		vi.spyOn(file, "slice").mockReturnValue(chunk);
		const onBatch = vi.fn();
		const onProgress = vi.fn();
		const pending = importFile(file, "journal", onBatch, onProgress, controller.signal);
		controller.abort(reason);
		finish(bytes);
		await expect(pending).rejects.toBe(reason);
		expect(onBatch).not.toHaveBeenCalled();
		expect(onProgress).toHaveBeenCalledTimes(1);
		expect(onProgress).toHaveBeenCalledWith({
			bytesRead: 0,
			totalBytes: file.size,
			processed: 0,
			accepted: 0,
		});
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
