import { normalizeTimestamp } from "./time";
import type { LifeEvent } from "./types";

export const PIXIU_TIME_ZONE = "Asia/Shanghai";
export const PIXIU_OFFSET_MS = 8 * 3_600_000;
export const PIXIU_DAY_MS = 86_400_000;
export const PIXIU_MAX_DAY_BYTES = 512 * 1024;
export const PIXIU_COLUMNS = [
	"日期",
	"交易分类",
	"交易类型",
	"流入金额",
	"流出金额",
	"币种",
	"资金账户",
	"标签",
	"备注",
] as const;

export type PixiuRow = [string, string, string, string, string, string, string, string, string];
export interface PixiuTotal {
	currency: string;
	classification: string;
	count: number;
	inflowMinor: number;
	outflowMinor: number;
}
export interface PixiuPayload {
	v: 1;
	precision: "day";
	sourceDate: string;
	timeZone: typeof PIXIU_TIME_ZONE;
	utcOffsetMinutes: 480;
	columns: readonly string[];
	rows: PixiuRow[];
}
export interface PixiuDay {
	/** Date key at UTC midnight, NOT the beginning of the source accounting day. */
	utcDay: number;
	firstAt: number;
	lastAt: number;
	recordCount: number;
	payloadBytes: number;
	contentHash: string;
	summary: { totals: PixiuTotal[] };
	data: PixiuPayload;
}
export interface PixiuPlan {
	days: PixiuDay[];
	recordCount: number;
	bytesRead: number;
	payloadBytes: number;
	firstDate: string;
	lastDate: string;
	fileNames: string[];
}

const encoder = new TextEncoder();

/** Export amounts are decimal strings; never use floating-point multiplication. */
export function pixiuMinorUnits(value: string): number {
	if (!/^\d+\.\d{2}$/.test(value) || value.length > 20)
		throw new Error("貔貅金额必须是非负、保留两位小数的原始金额");
	const minor = BigInt(value.replace(".", ""));
	if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("貔貅金额超出精确计算范围");
	return Number(minor);
}

function exactAdd(left: number, right: number): number {
	const result = left + right;
	if (!Number.isSafeInteger(result)) throw new Error("貔貅汇总金额超出精确计算范围");
	return result;
}

function dateKey(value: unknown): number {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new Error("貔貅日期必须是 YYYY-MM-DD，不包含交易时刻");
	return Date.parse(normalizeTimestamp(value));
}

function object(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new Error("貔貅日包必须是 JSON 对象");
	return input as Record<string, unknown>;
}

export async function validatePixiuDay(input: unknown): Promise<PixiuDay> {
	const incoming = object(input);
	const payload = object(incoming.data);
	const utcDay = dateKey(payload.sourceDate);
	if (incoming.utcDay !== utcDay) throw new Error("貔貅日键与北京时间记账日期不一致");
	if (
		payload.v !== 1 ||
		payload.precision !== "day" ||
		payload.timeZone !== PIXIU_TIME_ZONE ||
		payload.utcOffsetMinutes !== 480 ||
		!Array.isArray(payload.columns) ||
		payload.columns.length !== PIXIU_COLUMNS.length ||
		!PIXIU_COLUMNS.every((column, index) => (payload.columns as unknown[])[index] === column)
	)
		throw new Error("貔貅日包版本、时区或字段顺序不受支持");
	if (!Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 10_000)
		throw new Error("貔貅日包需要 1–10,000 条完整记录；省略日期不会清空数据");
	const totals = new Map<string, PixiuTotal>();
	const rows = payload.rows.map((raw): PixiuRow => {
		if (!Array.isArray(raw) || raw.length !== 9 || raw.some((cell) => typeof cell !== "string"))
			throw new Error("貔貅记录必须保留全部九列原始文本");
		const row = [...raw] as PixiuRow;
		if (row[0] !== payload.sourceDate) throw new Error("貔貅日包混入了其他记账日期");
		if (!row[1].trim() || !row[5].trim()) throw new Error("貔貅交易分类与币种不能为空");
		const inflow = pixiuMinorUnits(row[3]);
		const outflow = pixiuMinorUnits(row[4]);
		const key = JSON.stringify([row[5], row[1]]);
		const total = totals.get(key) ?? {
			currency: row[5],
			classification: row[1],
			count: 0,
			inflowMinor: 0,
			outflowMinor: 0,
		};
		total.count++;
		total.inflowMinor = exactAdd(total.inflowMinor, inflow);
		total.outflowMinor = exactAdd(total.outflowMinor, outflow);
		totals.set(key, total);
		return row;
	});
	const data: PixiuPayload = {
		v: 1,
		precision: "day",
		sourceDate: payload.sourceDate as string,
		timeZone: PIXIU_TIME_ZONE,
		utcOffsetMinutes: 480,
		columns: [...PIXIU_COLUMNS],
		rows,
	};
	const summary = {
		totals: [...totals].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, total]) => total),
	};
	const payloadBytes =
		encoder.encode(JSON.stringify(data)).length + encoder.encode(JSON.stringify(summary)).length;
	if (payloadBytes > PIXIU_MAX_DAY_BYTES)
		throw new Error(`${data.sourceDate} 貔貅日包超过 512 KiB`);
	// Preserve original row order in storage, but ignore export ordering for replay.
	// Sorting an array (not a Set) retains every duplicate occurrence.
	const canonical = JSON.stringify({
		...data,
		rows: rows.map((row) => JSON.stringify(row)).sort(),
	});
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
	return {
		utcDay,
		data,
		summary,
		recordCount: rows.length,
		payloadBytes,
		firstAt: utcDay - PIXIU_OFFSET_MS,
		lastAt: utcDay - PIXIU_OFFSET_MS + PIXIU_DAY_MS - 1,
		contentHash: Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join(""),
	};
}

/** Parse the entire selection before any network write. Each file contains full-day snapshots. */
export async function parsePixiu(
	files: readonly { name: string; text: string }[],
	options: { signal?: AbortSignal } = {},
): Promise<PixiuPlan> {
	options.signal?.throwIfAborted();
	if (!files.length) throw new Error("请选择貔貅导出的 CSV 文件");
	const { default: Papa } = await import("papaparse");
	const days = new Map<number, PixiuDay>();
	let bytesRead = 0;
	for (const file of files) {
		options.signal?.throwIfAborted();
		bytesRead += encoder.encode(file.text).length;
		if (bytesRead > 32 * 1024 * 1024)
			throw new Error("每次貔貅导入最多 32 MiB，请分次导入完整日期");
		const parsed = Papa.parse<string[]>(file.text, { skipEmptyLines: true });
		if (parsed.errors.length) throw new Error(`${file.name} 的 CSV 格式不完整，请重新导出`);
		const [header, ...records] = parsed.data;
		if (header?.length !== 9 || !PIXIU_COLUMNS.every((column, index) => header[index] === column))
			throw new Error(`${file.name} 必须包含貔貅导出的原始九列`);
		const grouped = new Map<string, string[][]>();
		for (const [index, row] of records.entries()) {
			if (row.length !== 9) throw new Error(`${file.name} 第 ${index + 2} 条记录的字段数不完整`);
			const date = row[0] as string;
			dateKey(date);
			const list = grouped.get(date) ?? [];
			list.push(row);
			grouped.set(date, list);
		}
		for (const [sourceDate, rows] of grouped) {
			options.signal?.throwIfAborted();
			const day = await validatePixiuDay({
				utcDay: dateKey(sourceDate),
				data: {
					v: 1,
					precision: "day",
					sourceDate,
					timeZone: PIXIU_TIME_ZONE,
					utcOffsetMinutes: 480,
					columns: PIXIU_COLUMNS,
					rows,
				},
			});
			const previous = days.get(day.utcDay);
			if (previous && previous.contentHash !== day.contentHash)
				throw new Error(`${sourceDate} 在多个文件中内容不同，请按期望的覆盖顺序分别导入`);
			if (!previous) days.set(day.utcDay, day);
		}
	}
	const ordered = [...days.values()].sort((a, b) => a.utcDay - b.utcDay);
	options.signal?.throwIfAborted();
	const first = ordered[0];
	const last = ordered.at(-1);
	if (!first || !last) throw new Error("CSV 中没有可导入的记账记录");
	return {
		days: ordered,
		fileNames: files.map((file) => file.name),
		bytesRead,
		recordCount: ordered.reduce((sum, day) => sum + day.recordCount, 0),
		payloadBytes: ordered.reduce((sum, day) => sum + day.payloadBytes, 0),
		firstDate: first.data.sourceDate,
		lastDate: last.data.sourceDate,
	};
}

/** Accounting-period start assigns a source day to exactly one display day; no transaction time is claimed. */
export function pixiuDayEvents(day: PixiuDay): LifeEvent[] {
	const occurredAt = new Date(day.firstAt).toISOString();
	return day.data.rows.map((row, index) => ({
		id: `pixiu:${day.utcDay}:${String(index).padStart(6, "0")}`,
		sourceId: "pixiu",
		sourceName: "貔貅记账",
		sourceKind: "import",
		occurredAt,
		endAt: new Date(day.lastAt + 1).toISOString(),
		precision: "day",
		title: row[2] || row[1],
		content: row[8],
		data: {
			...Object.fromEntries(PIXIU_COLUMNS.map((column, col) => [column, row[col] as string])),
			sourceDate: day.data.sourceDate,
			sourceTimeZone: PIXIU_TIME_ZONE,
		},
		updatedAt: occurredAt,
	}));
}
