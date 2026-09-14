import { z } from "zod";
import { normalizeTimestamp, timestampAtPrecision } from "./time";
import type { ImportProgress, ImportRecord, ImportSourceId, Precision } from "./types";

const CHUNK_BYTES = 64 * 1024;
const MAX_PENDING = 1024 * 1024;
const MAX_JSON_FILE = 10 * 1024 * 1024;
const encoder = new TextEncoder();
const recordSchema = z.object({
	key: z.string().min(1).max(200).optional(),
	occurredAt: z.string(),
	endAt: z.string().nullable().optional(),
	precision: z.enum(["day", "hour", "minute", "second"]).optional(),
	title: z.string().trim().min(1).max(200),
	content: z.string().max(8000).default(""),
	data: z.json().default(null),
});
type PendingRecord = z.input<typeof recordSchema>;
type Emit = (record: PendingRecord) => Promise<void>;

function inferPrecision(timestamp: string): Precision {
	if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp.trim())) return "day";
	if (/[T ]\d{2}:\d{2}:\d{2}/.test(timestamp)) return "second";
	if (/[T ]\d{2}:\d{2}/.test(timestamp)) return "minute";
	return "hour";
}

async function stableKey(value: unknown): Promise<string> {
	const serialized = JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
			: item,
	);
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(serialized));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function* chunks(
	file: File,
	progress: ImportProgress,
	report: () => void,
	signal?: AbortSignal,
): AsyncGenerator<string> {
	const decoder = new TextDecoder("utf-8", { fatal: true });
	for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
		signal?.throwIfAborted();
		const bytes = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
		signal?.throwIfAborted();
		progress.bytesRead = Math.min(offset + CHUNK_BYTES, file.size);
		yield decoder.decode(bytes, { stream: progress.bytesRead < file.size });
		report();
	}
}

function journalRecord(value: unknown): PendingRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("每条实录必须是 JSON 对象");
	}
	const record = value as Record<string, unknown>;
	return recordSchema.parse({
		...record,
		key: record.key ?? record.id,
		occurredAt: record.occurredAt ?? record.timestamp ?? record.date,
	});
}

async function importJournal(input: AsyncIterable<string>, ndjson: boolean, emit: Emit) {
	let pending = "";
	for await (const chunk of input) {
		pending += chunk;
		if (!ndjson) continue;
		let boundary = pending.indexOf("\n");
		while (boundary !== -1) {
			const line = pending.slice(0, boundary).trim();
			if (line) await emit(journalRecord(JSON.parse(line)));
			pending = pending.slice(boundary + 1);
			boundary = pending.indexOf("\n");
		}
		if (pending.length > MAX_PENDING) throw new Error("NDJSON 单行超过 1 MiB");
	}
	if (ndjson) {
		if (pending.trim()) await emit(journalRecord(JSON.parse(pending)));
	} else {
		const parsed: unknown = JSON.parse(pending);
		for (const value of Array.isArray(parsed) ? parsed : [parsed]) await emit(journalRecord(value));
	}
}

/** Reads bounded chunks and waits for every API batch; replaying a partial import is safe. */
export async function importFile(
	file: File,
	source: ImportSourceId,
	onBatch: (records: ImportRecord[]) => Promise<void>,
	onProgress: (progress: ImportProgress) => void,
	signal?: AbortSignal,
): Promise<{ processed: number; accepted: number }> {
	signal?.throwIfAborted();
	if (source !== "journal") throw new Error("请使用数据管理中的专用导入页面。");
	const ndjson = /\.(ndjson|jsonl)$/i.test(file.name);
	if (source === "journal" && !ndjson && file.size > MAX_JSON_FILE) {
		throw new Error("JSON 文件最多 10 MiB；更大的文件请使用 NDJSON 格式");
	}
	const progress: ImportProgress = {
		bytesRead: 0,
		totalBytes: file.size,
		processed: 0,
		accepted: 0,
	};
	const report = () => onProgress({ ...progress });
	let batch: ImportRecord[] = [];
	let batchBytes = 0;
	const flush = async () => {
		signal?.throwIfAborted();
		if (!batch.length) return;
		await onBatch(batch);
		progress.accepted += batch.length;
		batch = [];
		batchBytes = 0;
		report();
	};
	const emit: Emit = async (input) => {
		signal?.throwIfAborted();
		const parsed = recordSchema.parse(input);
		const precision = parsed.precision ?? inferPrecision(parsed.occurredAt);
		const occurredAt = timestampAtPrecision(parsed.occurredAt, precision);
		const endAt = parsed.endAt ? normalizeTimestamp(parsed.endAt) : null;
		if (endAt && endAt < occurredAt) throw new Error("结束时间不能早于开始时间");
		if (encoder.encode(JSON.stringify(parsed.data)).length > 32 * 1024) {
			throw new Error("单条记录的 data 超过 32 KiB");
		}
		const record: ImportRecord = {
			...parsed,
			occurredAt,
			endAt,
			precision,
			key: parsed.key ?? (await stableKey({ ...parsed, occurredAt, endAt, precision })),
		};
		const bytes = encoder.encode(JSON.stringify(record)).length;
		if (batch.length >= 100 || batchBytes + bytes > 512 * 1024) await flush();
		batch.push(record);
		batchBytes += bytes;
		progress.processed++;
	};
	report();
	const input = chunks(file, progress, report, signal);
	await importJournal(input, ndjson, emit);
	if (progress.processed === 0) throw new Error("文件中没有可导入的记录");
	await flush();
	report();
	return { processed: progress.processed, accepted: progress.accepted };
}
