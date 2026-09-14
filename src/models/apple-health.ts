import Papa from "papaparse";
import { SaxesParser } from "saxes";
import type { TrackPoint } from "./day-insights";
import {
	HEALTH_DAY_MS,
	HEALTH_LIMITS,
	type HealthDay,
	type HealthDaySummary,
	type HealthFile,
	type HealthFilePart,
	type HealthInputFile,
	type HealthNode,
	type HealthPlan,
	type HealthProgress,
	type HealthSeries,
	type HealthStaging,
} from "./health-types";
import { normalizeTimestamp } from "./time";
import type { JsonValue, LifeEvent, Precision } from "./types";

const encoder = new TextEncoder();
const STEP = 64 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** File inputs are relative paths. A Health XML FileReference is resolved separately. */
export function healthFilePath(path: string): string {
	if (
		!path ||
		path.length > 1024 ||
		/[\\:]/.test(path) ||
		Array.from(path).some(
			(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) ||
		path.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new Error("健康附件路径必须是安全的相对路径");
	}
	return path;
}

function referencePath(path: string): string {
	return healthFilePath(path.replace(/^\//, "").replace(/^\.\//, ""));
}

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("健康数据必须是 JSON 对象");
	}
	return value as Record<string, unknown>;
}

function dayKey(value: unknown): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value % HEALTH_DAY_MS !== 0 ||
		!Number.isFinite(new Date(value).getTime()) ||
		!Number.isFinite(new Date(value + HEALTH_DAY_MS - 1).getTime())
	) {
		throw new Error("健康日键必须是 UTC 零点的毫秒时间戳");
	}
	return value;
}

function node(input: unknown, depth = 0): HealthNode {
	const value = object(input);
	if (
		depth > 64 ||
		typeof value.name !== "string" ||
		!value.name ||
		value.name.length > 512 ||
		Object.keys(value).some((key) => !["name", "attributes", "children", "text"].includes(key))
	) {
		throw new Error("健康 XML 节点名称、深度或结构无效");
	}
	const attributes = object(value.attributes);
	if (Object.values(attributes).some((entry) => typeof entry !== "string")) {
		throw new Error("健康 XML 原始属性必须保留为字符串");
	}
	const result: HealthNode = {
		name: value.name,
		attributes: Object.fromEntries(
			Object.keys(attributes)
				.sort(compare)
				.map((key) => [key, attributes[key] as string]),
		),
	};
	if (value.children !== undefined) {
		if (!Array.isArray(value.children)) throw new Error("健康 XML 子节点必须是数组");
		if (value.children.length)
			result.children = value.children.map((child) => node(child, depth + 1));
	}
	if (value.text !== undefined) {
		if (typeof value.text !== "string") throw new Error("健康 XML 文本必须是字符串");
		result.text = value.text;
	}
	return result;
}

function dimension(value: HealthNode): string {
	const result = value.attributes.type || value.name;
	if (result.length > 256) throw new Error("健康维度名称过长");
	return result;
}

function timestampPrecision(value: string): Precision {
	const clock = value.trim().match(/^\d{4}-\d{2}-\d{2}[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?/i);
	return clock?.[3] ? "second" : clock?.[2] ? "minute" : clock?.[1] ? "hour" : "day";
}

function times(value: HealthNode): { start: number; end: number; precision: Precision } | null {
	const raw = value.attributes.startDate ?? value.attributes.dateComponents;
	if (!raw) return null;
	const start = Date.parse(normalizeTimestamp(raw));
	return {
		start,
		end: value.attributes.endDate
			? Date.parse(normalizeTimestamp(value.attributes.endDate))
			: start,
		precision: timestampPrecision(raw),
	};
}

async function hash(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function jsonHash(value: unknown): Promise<string> {
	return hash(encoder.encode(JSON.stringify(value)));
}

function base64(bytes: Uint8Array): string {
	// Keep argument spreads below Chrome Worker's call stack limit.
	const chunkSize = 8 * 1024;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}

async function collect(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			length += value.length;
			if (length > limit) throw new Error("健康数据解压超过硬上限");
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

async function gzip(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([new Uint8Array(bytes)])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	return base64(await collect(stream, bytes.length + STEP));
}

async function unpack(input: unknown, maxBody: number, maxRaw: number): Promise<Uint8Array> {
	const value = object(input);
	if (
		typeof value.body !== "string" ||
		!value.body ||
		value.body.length > maxBody ||
		value.body.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]+={0,2}$/.test(value.body) ||
		value.payloadBytes !== value.body.length ||
		typeof value.rawBytes !== "number" ||
		!Number.isSafeInteger(value.rawBytes) ||
		value.rawBytes < 0 ||
		value.rawBytes > maxRaw ||
		typeof value.contentHash !== "string" ||
		!HASH.test(value.contentHash)
	) {
		throw new Error("健康压缩内容或声明大小无效");
	}
	const binary = atob(value.body);
	const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	if (base64(compressed) !== value.body) throw new Error("健康 base64 编码不规范");
	const raw = await collect(
		new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")),
		Math.min(value.rawBytes, maxRaw),
	);
	if (raw.length !== value.rawBytes || (await hash(raw)) !== value.contentHash) {
		throw new Error("健康压缩内容大小或 SHA-256 校验失败");
	}
	return raw;
}

export async function decodeHealthPart(part: HealthFilePart): Promise<Uint8Array> {
	if (!Number.isSafeInteger(part.part) || part.part < 0) throw new Error("健康附件分块编号无效");
	return unpack(part, HEALTH_LIMITS.filePartBytes, HEALTH_LIMITS.filePartRawBytes);
}

function inspect(nodes: HealthNode[], utcDay: number, expectedDimension: string) {
	let firstAt = Number.POSITIVE_INFINITY;
	let lastAt = Number.NEGATIVE_INFINITY;
	let previousAt = Number.NEGATIVE_INFINITY;
	let previousText = "";
	for (const value of nodes) {
		const stamp = times(value);
		const text = JSON.stringify(value);
		if (
			!stamp ||
			Math.floor(stamp.start / HEALTH_DAY_MS) * HEALTH_DAY_MS !== utcDay ||
			dimension(value) !== expectedDimension ||
			stamp.start < previousAt ||
			(stamp.start === previousAt && compare(text, previousText) < 0)
		) {
			throw new Error("健康序列的日期、维度或记录顺序不符");
		}
		firstAt = Math.min(firstAt, stamp.start);
		lastAt = Math.max(lastAt, stamp.start, stamp.end);
		previousAt = stamp.start;
		previousText = text;
	}
	return { recordCount: nodes.length, firstAt, lastAt };
}

async function readSeries(input: unknown, utcDay: number): Promise<HealthNode[]> {
	const value = object(input);
	if (
		typeof value.dimension !== "string" ||
		!value.dimension ||
		value.dimension.length > 256 ||
		!Number.isSafeInteger(value.part) ||
		(value.part as number) < 0
	) {
		throw new Error("健康序列维度或分块编号无效");
	}
	const raw = await unpack(value, HEALTH_LIMITS.seriesBytes, HEALTH_LIMITS.seriesRawBytes);
	const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw);
	const decoded: unknown = JSON.parse(text);
	if (!Array.isArray(decoded) || decoded.length === 0) throw new Error("健康序列不能为空");
	const nodes = decoded.map((entry) => node(entry));
	if (JSON.stringify(nodes) !== text) throw new Error("健康序列必须使用规范 JSON");
	const actual = inspect(nodes, utcDay, value.dimension);
	if (Object.entries(actual).some(([key, entry]) => value[key] !== entry)) {
		throw new Error("健康序列统计与内容不符");
	}
	return nodes;
}

function summaryCollector() {
	const dimensions: Record<string, number> = Object.create(null);
	const nestedNodes: Record<string, number> = Object.create(null);
	const sources = new Set<string>();
	const routePaths = new Set<string>();
	const visit = (value: HealthNode, nested: boolean) => {
		if (nested && !value.name.startsWith("#")) {
			nestedNodes[value.name] = (nestedNodes[value.name] ?? 0) + 1;
		}
		if (value.attributes.sourceName) sources.add(value.attributes.sourceName);
		if (value.name === "FileReference" && value.attributes.path) {
			routePaths.add(referencePath(value.attributes.path));
		}
		for (const child of value.children ?? []) visit(child, true);
	};
	const sorted = (value: Record<string, number>) =>
		Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)));
	return {
		add: (dimension: string, nodes: HealthNode[]) => {
			dimensions[dimension] = (dimensions[dimension] ?? 0) + nodes.length;
			for (const value of nodes) visit(value, false);
		},
		finish: (): HealthDaySummary => ({
			dimensions: sorted(dimensions),
			sources: [...sources].sort(compare),
			nestedNodes: sorted(nestedNodes),
			routePaths: [...routePaths].sort(compare),
		}),
	};
}

async function assembleDay(
	utcDay: number,
	series: HealthSeries[],
	summary: HealthDaySummary,
): Promise<HealthDay> {
	const day: HealthDay = {
		utcDay,
		recordCount: series.reduce((sum, item) => sum + item.recordCount, 0),
		firstAt: Math.min(...series.map((item) => item.firstAt)),
		lastAt: Math.max(...series.map((item) => item.lastAt)),
		payloadBytes: series.reduce((sum, item) => sum + item.payloadBytes, 0),
		contentHash: await jsonHash([
			utcDay,
			series.map((item) => [item.dimension, item.part, item.contentHash]),
		]),
		summary,
		data: { v: 1, series },
	};
	if (
		series.length > HEALTH_LIMITS.seriesPerDay ||
		encoder.encode(JSON.stringify(day)).length > HEALTH_LIMITS.dayBytes
	) {
		throw new Error("健康日包超过大小或序列数量上限");
	}
	return day;
}

/** Validate every declaration against bounded, canonical decoded contents at the trust boundary. */
export async function validateHealthDay(input: unknown): Promise<HealthDay> {
	const value = object(input);
	const utcDay = dayKey(value.utcDay);
	const data = object(value.data);
	if (
		data.v !== 1 ||
		!Array.isArray(data.series) ||
		!data.series.length ||
		data.series.length > HEALTH_LIMITS.seriesPerDay ||
		encoder.encode(JSON.stringify(value)).length > HEALTH_LIMITS.dayBytes
	) {
		throw new Error("健康日包版本、大小或序列数量无效");
	}
	const summary = summaryCollector();
	let previous: HealthSeries | undefined;
	let previousNode: HealthNode | undefined;
	for (const entry of data.series) {
		const nodes = await readSeries(entry, utcDay);
		const series = entry as HealthSeries;
		if (
			(!previous && series.part !== 0) ||
			(previous &&
				(compare(previous.dimension, series.dimension) > 0 ||
					(series.dimension === previous.dimension
						? series.part !== previous.part + 1
						: series.part !== 0)))
		) {
			throw new Error("健康维度必须排序，分块编号必须从零连续递增");
		}
		if (previousNode && previous?.dimension === series.dimension) {
			inspect([previousNode, nodes[0] as HealthNode], utcDay, series.dimension);
		}
		summary.add(series.dimension, nodes);
		previousNode = nodes.at(-1);
		previous = series;
	}
	const actual = await assembleDay(utcDay, data.series as HealthSeries[], summary.finish());
	for (const key of ["recordCount", "firstAt", "lastAt", "payloadBytes", "contentHash"] as const) {
		if (value[key] !== actual[key]) throw new Error("健康日包统计或内容哈希不符");
	}
	if (JSON.stringify(value.summary) !== JSON.stringify(actual.summary)) {
		throw new Error("健康日包摘要与原始内容不符");
	}
	return actual;
}

export async function decodeHealthSeries(
	series: HealthSeries,
	utcDay: number,
	updatedAt: number,
	window?: { start: number; end: number },
): Promise<LifeEvent[]> {
	dayKey(utcDay);
	if (
		!Number.isFinite(new Date(updatedAt).getTime()) ||
		(window &&
			(!Number.isFinite(window.start) ||
				!Number.isFinite(window.end) ||
				window.start >= window.end))
	) {
		throw new Error("健康记录读取窗口或更新时间无效");
	}
	const nodes = await readSeries(series, utcDay);
	const events: LifeEvent[] = [];
	for (const [index, value] of nodes.entries()) {
		const stamp = times(value) as NonNullable<ReturnType<typeof times>>;
		if (
			window &&
			(stamp.start >= window.end || Math.max(stamp.end, stamp.start + 1) <= window.start)
		) {
			continue;
		}
		events.push({
			id: `apple-health:${utcDay}:${encodeURIComponent(series.dimension)}:${series.part}:${index}`,
			sourceId: "apple-health",
			sourceName: "Apple 健康",
			sourceKind: "import",
			occurredAt: new Date(stamp.start).toISOString(),
			endAt: value.attributes.endDate ? new Date(stamp.end).toISOString() : null,
			precision: stamp.precision,
			title:
				value.attributes.workoutActivityType?.replace(/^HKWorkoutActivityType/, "") ||
				dimension(value).replace(/^HK(?:Quantity|Category|Correlation)TypeIdentifier/, ""),
			content: "",
			data: {
				...value.attributes,
				_healthKind: value.name,
				_healthChildren: (value.children ?? []) as unknown as JsonValue,
				...(value.text !== undefined ? { _healthText: value.text } : {}),
			},
			updatedAt: new Date(updatedAt).toISOString(),
		});
	}
	return events;
}

function finite(value: string | undefined, field: string): number {
	if (value === undefined || !NUMBER.test(value.trim()) || !Number.isFinite(Number(value))) {
		throw new Error(`健康 GPX ${field} 必须是有限数值`);
	}
	return Number(value);
}

function routeParser(onPoint: (point: TrackPoint) => void) {
	const parser = new SaxesParser({ xmlns: false });
	const stack: string[] = [];
	let point: Record<string, string> | undefined;
	let field = "";
	let fieldDepth = 0;
	let breakBefore = true;
	parser.on("doctype", () => {
		throw new Error("健康 GPX 不支持 DTD");
	});
	parser.on("opentag", (tag) => {
		const name = tag.name.split(":").at(-1) as string;
		stack.push(name);
		if (stack.length > 64) throw new Error("健康 GPX 嵌套过深");
		if (stack.length === 1 && name !== "gpx") throw new Error("健康路线必须是 GPX");
		if (["trk", "trkseg", "rte", "wpt"].includes(name)) breakBefore = true;
		if (["trkpt", "rtept", "wpt"].includes(name)) {
			if (point) throw new Error("健康 GPX 轨迹点不能嵌套");
			point = { lat: tag.attributes.lat as string, lon: tag.attributes.lon as string };
		} else if (point && ["time", "ele", "speed"].includes(name)) {
			if (point[name] !== undefined || field) throw new Error("健康 GPX 字段重复或嵌套");
			point[name] = "";
			field = name;
			fieldDepth = stack.length;
		}
	});
	const text = (value: string) => {
		if (point && field) {
			point[field] = (point[field] as string) + value;
			if ((point[field] as string).length > 256) throw new Error("健康 GPX 字段过长");
		}
	};
	parser.on("text", text);
	parser.on("cdata", text);
	parser.on("closetag", () => {
		const name = stack.at(-1) as string;
		if (point && ["trkpt", "rtept", "wpt"].includes(name)) {
			const latitude = finite(point.lat, "latitude");
			const longitude = finite(point.lon, "longitude");
			if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
				throw new Error("健康 GPX 经纬度超出范围");
			}
			if (!point.time) throw new Error("健康 GPX 缺少采样时间");
			onPoint({
				latitude,
				longitude,
				occurredAt: normalizeTimestamp(point.time),
				precision: timestampPrecision(point.time),
				breakBefore,
				sourceId: "apple-health",
				sourceName: "Apple 健康",
				elevation: point.ele === undefined ? null : finite(point.ele, "elevation"),
				speed: point.speed === undefined ? null : finite(point.speed, "speed"),
			});
			point = undefined;
			breakBefore = false;
		}
		if (["trk", "trkseg", "rte", "wpt"].includes(name)) breakBefore = true;
		if (stack.length === fieldDepth) field = "";
		stack.pop();
	});
	return parser;
}

/** Rendering projection only. The complete GPX, including accuracy and segments, is an attachment. */
export function healthRoutePoints(bytes: Uint8Array): TrackPoint[] {
	const points: TrackPoint[] = [];
	routeParser((point) => points.push(point))
		.write(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes))
		.close();
	return points;
}

function ecgRows(text: string) {
	const parsed = Papa.parse<string[]>(text, { delimiter: ",", skipEmptyLines: "greedy" });
	if (parsed.errors.length) throw new Error("心电图 CSV 结构无效");
	const metadata: Record<string, string> = Object.create(null);
	const entries: [string, string][] = [];
	const samples: number[] = [];
	for (const row of parsed.data) {
		if (row.length === 1 && NUMBER.test((row[0] as string).trim())) {
			const sample = Number(row[0]);
			if (!Number.isFinite(sample)) throw new Error("心电图采样必须是有限数值");
			samples.push(sample);
		} else if (row.length >= 2 && samples.length === 0 && row[0]) {
			const pair: [string, string] = [row[0], row.slice(1).join(",")];
			entries.push(pair);
			metadata[pair[0]] = pair[1];
		} else {
			throw new Error("心电图 CSV 含无法识别的采样行");
		}
	}
	const rawRate = metadata.采样速率 ?? metadata["Sampling Rate"] ?? metadata["Sampling rate"];
	const match = rawRate?.trim().match(/^([\d.]+)\s*(?:Hz|赫兹)?$/i);
	const samplingHz =
		match && Number(match[1]) > 0 && Number.isFinite(Number(match[1])) ? Number(match[1]) : null;
	return { metadata, entries, samples, samplingHz };
}

export function healthEcg(bytes: Uint8Array): {
	metadata: Record<string, string>;
	samples: number[];
	samplingHz: number | null;
} {
	const { metadata, samples, samplingHz } = ecgRows(
		new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
	);
	return { metadata, samples, samplingHz };
}

type ParseOptions = {
	signal?: AbortSignal;
	onProgress?: (progress: HealthProgress) => void;
};

async function* chunks(
	file: HealthInputFile,
	signal?: AbortSignal,
	onBytes?: (count: number) => void,
): AsyncGenerator<Uint8Array> {
	signal?.throwIfAborted();
	const reader = file.stream().getReader();
	const abort = () => {
		void reader.cancel(signal?.reason).catch(() => {});
	};
	signal?.addEventListener("abort", abort, { once: true });
	let count = 0;
	try {
		for (;;) {
			signal?.throwIfAborted();
			const next = await reader.read();
			signal?.throwIfAborted();
			if (next.done) break;
			count += next.value.length;
			if (count > file.size) throw new Error("健康附件实际大小超过声明大小");
			for (let offset = 0; offset < next.value.length; offset += STEP) {
				const bytes = next.value.subarray(offset, offset + STEP);
				onBytes?.(bytes.length);
				yield bytes;
			}
		}
		if (count !== file.size) throw new Error("健康附件实际大小与声明大小不符");
	} finally {
		signal?.removeEventListener("abort", abort);
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

/** Identify XML by its root, including localized or incorrectly flagged ZIP filenames. */
async function xmlRoot(file: HealthInputFile, signal?: AbortSignal): Promise<string | null> {
	const parser = new SaxesParser({ xmlns: false });
	const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
	const found = new Error("root found");
	let root: string | null = null;
	let prefix = "";
	let started = false;
	let size = 0;
	parser.on("opentag", (tag) => {
		root = tag.name;
		throw found;
	});
	try {
		for await (const bytes of chunks(file, signal)) {
			size += bytes.length;
			if (size > 1024 * 1024) throw new Error("健康 XML 文件头超过 1 MiB");
			let text: string;
			try {
				text = decoder.decode(bytes, { stream: true });
			} catch {
				return null;
			}
			if (!started) {
				prefix += text;
				if (!prefix.trim()) continue;
				if (!prefix.trimStart().startsWith("<")) return null;
				started = true;
				text = prefix;
			}
			parser.write(text);
		}
		if (started) parser.write(decoder.decode()).close();
	} catch (error) {
		if (error !== found) throw error;
	}
	return root;
}

function xmlParser(onNode: (value: HealthNode) => void) {
	const parser = new SaxesParser({ xmlns: false });
	const stack: HealthNode[] = [];
	const metadata: HealthNode = { name: "HealthData", attributes: {}, children: [] };
	const prolog: HealthNode[] = [];
	let topStart = 0;
	const append = (parent: HealthNode, child: HealthNode) => {
		parent.children ??= [];
		if (parent.text !== undefined) {
			parent.children.push({ name: "#text", attributes: {}, text: parent.text });
			delete parent.text;
		}
		parent.children.push(child);
	};
	parser.on("xmldecl", (declaration) => {
		prolog.push({
			name: "#xml",
			attributes: Object.fromEntries(
				Object.entries(declaration).filter(([, value]) => value !== undefined),
			) as Record<string, string>,
		});
	});
	parser.on("doctype", (text) => {
		if (/<!ENTITY\s|\b(?:SYSTEM|PUBLIC)\s+["']/i.test(text)) {
			throw new Error("健康 XML 不支持自定义或外部实体");
		}
		prolog.push({ name: "#doctype", attributes: {}, text });
	});
	parser.on("opentag", (tag) => {
		if (stack.length > 64) throw new Error("健康 XML 嵌套超过 64 层");
		const value: HealthNode = { name: tag.name, attributes: { ...tag.attributes } };
		if (!stack.length) {
			if (tag.name !== "HealthData") throw new Error("健康主文件必须包含 HealthData 根节点");
			metadata.attributes = value.attributes;
		} else if (stack.length > 1) {
			append(stack.at(-1) as HealthNode, value);
		} else {
			topStart = parser.position;
		}
		stack.push(value);
	});
	const text = (value: string) => {
		const current = stack.at(-1);
		if (stack.length < 2 || !current || !value.trim()) return;
		if (current.children?.length) append(current, { name: "#text", attributes: {}, text: value });
		else current.text = (current.text ?? "") + value;
	};
	parser.on("text", text);
	parser.on("cdata", text);
	const special = (value: HealthNode) => {
		if (stack.length > 1) append(stack.at(-1) as HealthNode, value);
		else prolog.push(value);
	};
	parser.on("comment", (text) => special({ name: "#comment", attributes: {}, text }));
	parser.on("processinginstruction", ({ target, body }) =>
		special({ name: "#processingInstruction", attributes: { target }, text: body }),
	);
	parser.on("closetag", () => {
		const value = stack.pop() as HealthNode;
		if (stack.length === 1) onNode(value);
	});
	return {
		parser,
		metadata,
		prolog,
		check: () => {
			if (stack.length > 1 && parser.position - topStart > HEALTH_LIMITS.seriesRawBytes) {
				throw new Error("健康 XML 单条记录超过可存储上限");
			}
		},
	};
}

/** Canonical day constructor, also used by integration fixtures without a complete archive. */
export async function packHealthDay(utcDay: number, values: HealthNode[]): Promise<HealthDay> {
	dayKey(utcDay);
	if (!values.length) throw new Error("健康日包不能为空");
	const groups = new Map<string, HealthNode[]>();
	for (const entry of values) {
		const value = node(entry);
		const key = dimension(value);
		const nodes = groups.get(key) ?? [];
		nodes.push(value);
		groups.set(key, nodes);
	}
	const series: HealthSeries[] = [];
	const summary = summaryCollector();
	for (const key of [...groups.keys()].sort(compare)) {
		const entries = (groups.get(key) as HealthNode[]).map((value) => ({
			value,
			text: JSON.stringify(value),
			at: times(value)?.start,
		}));
		entries.sort((a, b) => (a.at as number) - (b.at as number) || compare(a.text, b.text));
		const nodes = entries.map((entry) => entry.value);
		summary.add(key, nodes);
		let part = 0;
		const pack = async (nodes: HealthNode[]): Promise<void> => {
			const raw = encoder.encode(JSON.stringify(nodes));
			const body = raw.length <= HEALTH_LIMITS.seriesRawBytes ? await gzip(raw) : "";
			if (!body || body.length > HEALTH_LIMITS.seriesBytes) {
				if (nodes.length === 1) throw new Error("健康单条记录超过序列上限，不能无损拆分");
				const middle = Math.floor(nodes.length / 2);
				await pack(nodes.slice(0, middle));
				await pack(nodes.slice(middle));
				return;
			}
			series.push({
				dimension: key,
				part: part++,
				...inspect(nodes, utcDay, key),
				rawBytes: raw.length,
				payloadBytes: body.length,
				contentHash: await hash(raw),
				body,
			});
		};
		await pack(nodes);
	}
	return assembleDay(utcDay, series, summary.finish());
}

async function packFile(
	file: HealthInputFile,
	kind: HealthFile["kind"],
	signal?: AbortSignal,
	onBytes?: (count: number) => void,
	consume?: (bytes: Uint8Array) => void,
): Promise<HealthFile> {
	const parts: HealthFilePart[] = [];
	let buffer = new Uint8Array(HEALTH_LIMITS.filePartRawBytes);
	let used = 0;
	const finish = async () => {
		const raw = buffer.subarray(0, used);
		const body = await gzip(raw);
		parts.push({
			part: parts.length,
			rawBytes: used,
			payloadBytes: body.length,
			contentHash: await hash(raw),
			body,
		});
		buffer = new Uint8Array(HEALTH_LIMITS.filePartRawBytes);
		used = 0;
	};
	for await (const bytes of chunks(file, signal, onBytes)) {
		consume?.(bytes);
		let offset = 0;
		while (offset < bytes.length) {
			const length = Math.min(buffer.length - used, bytes.length - offset);
			buffer.set(bytes.subarray(offset, offset + length), used);
			used += length;
			offset += length;
			if (used === buffer.length) await finish();
		}
	}
	if (used || !parts.length) await finish();
	return {
		path: file.path,
		kind,
		firstAt: null,
		lastAt: null,
		recordCount: 0,
		rawBytes: file.size,
		contentHash: await jsonHash(parts.map((part) => [part.part, part.rawBytes, part.contentHash])),
		parts,
	};
}

/** The entire archive, including CRC-checked attachments and references, precedes a returned plan. */
export async function parseHealthExport(
	inputs: HealthInputFile[],
	staging: HealthStaging,
	options: ParseOptions = {},
): Promise<HealthPlan> {
	try {
		options.signal?.throwIfAborted();
		const seen = new Set<string>();
		for (const file of inputs) {
			healthFilePath(file.path);
			if (seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0) {
				throw new Error("健康导出含重复路径或无效文件大小");
			}
			seen.add(file.path);
		}
		const totalBytes = inputs.reduce((sum, file) => sum + file.size, 0);
		if (!Number.isSafeInteger(totalBytes)) throw new Error("健康导出总大小无效");
		const progress: HealthProgress = {
			phase: "analyzing",
			bytesRead: 0,
			totalBytes,
			recordCount: 0,
			completed: 0,
			total: inputs.length,
		};
		const report = () => options.onProgress?.({ ...progress });
		const onBytes = (count: number) => {
			progress.bytesRead += count;
			report();
		};
		const warnings = new Set<string>();
		let pending = new Map<number, HealthNode[]>();
		let pendingCount = 0;
		const append = (value: HealthNode) => {
			const stamp = times(value);
			if (!stamp) return false;
			const utcDay = Math.floor(stamp.start / HEALTH_DAY_MS) * HEALTH_DAY_MS;
			const group = pending.get(utcDay) ?? [];
			group.push(value);
			pending.set(utcDay, group);
			pendingCount++;
			progress.recordCount++;
			if (stamp.start < Date.UTC(1980, 0, 1))
				warnings.add(
					"保留了 1980 年之前的原始日期；可能是设备配置或异常时间，请勿作为真实活动推断。",
				);
			if (stamp.end < stamp.start) warnings.add("保留了结束时间早于开始时间的原始记录。");
			return true;
		};
		const flush = async () => {
			if (pendingCount) await staging.append(pending);
			pending = new Map();
			pendingCount = 0;
		};
		if ((await staging.days()).length) throw new Error("健康导入需要空的临时分桶空间");
		report();
		const roots = new Map<string, string | null>();
		for (const file of inputs) roots.set(file.path, await xmlRoot(file, options.signal));
		const mainFiles = inputs.filter((file) => roots.get(file.path) === "HealthData");
		if (mainFiles.length !== 1) throw new Error("健康导出必须恰好包含一个 HealthData 主文件");
		const main = mainFiles[0] as HealthInputFile;
		const rootPath = main.path.slice(0, main.path.lastIndexOf("/") + 1);
		const relative = (path: string) =>
			healthFilePath(rootPath && path.startsWith(rootPath) ? path.slice(rootPath.length) : path);
		let xmlRecordCount = 0;
		const xml = xmlParser((value) => {
			if (value.name === "Record") xmlRecordCount++;
			if (!append(value)) {
				(xml.metadata.children as HealthNode[]).push(value);
				if (!["ExportDate", "Me"].includes(value.name))
					warnings.add("无日期节点已完整保留在导出元数据附件中，不生成虚构时间。");
			}
		});
		const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
		for await (const bytes of chunks(main, options.signal, onBytes)) {
			xml.parser.write(decoder.decode(bytes, { stream: true }));
			xml.check();
			if (pendingCount >= 2048) await flush();
		}
		xml.parser.write(decoder.decode()).close();
		await flush();
		progress.completed++;
		const files: HealthFile[] = [];
		let routePointCount = 0;
		let ecgSampleCount = 0;
		for (const input of inputs
			.filter((file) => file !== main)
			.sort((a, b) => compare(a.path, b.path))) {
			const file = { ...input, path: relative(input.path), stream: () => input.stream() };
			const root = roots.get(input.path);
			const kind =
				root === "gpx"
					? "route"
					: root === "ClinicalDocument"
						? "cda"
						: /\.csv$/i.test(file.path)
							? "ecg"
							: "metadata";
			let firstAt: number | null = null;
			let lastAt: number | null = null;
			let count = 0;
			const route =
				kind === "route"
					? routeParser((point) => {
							const at = Date.parse(point.occurredAt);
							firstAt = firstAt === null ? at : Math.min(firstAt, at);
							lastAt = lastAt === null ? at : Math.max(lastAt, at);
							count++;
						})
					: null;
			const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
			let csv = "";
			const packed = await packFile(file, kind, options.signal, onBytes, (bytes) => {
				if (route) route.write(textDecoder.decode(bytes, { stream: true }));
				if (kind === "ecg") {
					csv += textDecoder.decode(bytes, { stream: true });
					if (csv.length > 32 * 1024 * 1024) throw new Error("单个心电图 CSV 超过 32 MiB 解析上限");
				}
			});
			if (route) {
				route.write(textDecoder.decode()).close();
				packed.firstAt = firstAt;
				packed.lastAt = lastAt;
				packed.recordCount = count;
				routePointCount += count;
			}
			if (kind === "ecg") {
				const ecg = ecgRows(csv + textDecoder.decode());
				const metadata = ecg.metadata;
				const startDate =
					metadata.记录日期 ?? metadata["Recorded Date"] ?? metadata["Date Recorded"];
				if (!startDate || !ecg.samples.length)
					throw new Error("心电图 CSV 缺少真实记录时间或波形采样");
				const start = Date.parse(normalizeTimestamp(startDate));
				const duration = ecg.samplingHz === null ? null : ecg.samples.length / ecg.samplingHz;
				const attributes: Record<string, string> = {
					startDate,
					filePath: file.path,
					samplingHz: ecg.samplingHz === null ? "" : String(ecg.samplingHz),
					classification: metadata.分类 ?? metadata.Classification ?? "",
					averageHeartRate: metadata.平均心率 ?? metadata["Average Heart Rate"] ?? "",
					unit: metadata.单位 ?? metadata.Unit ?? "",
					durationSeconds: duration === null ? "" : String(duration),
					sampleCount: String(ecg.samples.length),
				};
				if (duration !== null) attributes.endDate = new Date(start + duration * 1000).toISOString();
				else warnings.add("心电图缺少可识别的采样率，保留波形但不推算时长。");
				append({
					name: "Electrocardiogram",
					attributes,
					children: ecg.entries.map(([key, value]) => ({
						name: "MetadataEntry",
						attributes: { key, value },
					})),
				});
				packed.firstAt = start;
				packed.lastAt = duration === null ? start : start + duration * 1000;
				packed.recordCount = ecg.samples.length;
				ecgSampleCount += ecg.samples.length;
			}
			files.push(packed);
			progress.completed++;
			report();
		}
		await flush();
		const metadataBytes = encoder.encode(
			JSON.stringify({
				source: { path: relative(main.path), bytes: main.size },
				prolog: xml.prolog.map((value) => node(value)),
				root: node(xml.metadata),
			}),
		);
		files.push(
			await packFile(
				{
					path: `${relative(main.path)}.metadata.json`,
					size: metadataBytes.length,
					stream: () => new Blob([metadataBytes]).stream(),
				},
				"metadata",
				options.signal,
			),
		);
		files.sort((a, b) => compare(a.path, b.path));
		const paths = new Set<string>();
		for (const file of files) {
			if (paths.has(file.path)) throw new Error("健康附件在解析导出根目录后路径重复");
			paths.add(file.path);
		}
		const days: HealthDay[] = [];
		const dimensions = new Set<string>();
		const dates = (await staging.days()).sort((a, b) => a - b);
		progress.phase = "packing";
		progress.completed = 0;
		progress.total = dates.length;
		report();
		for (const utcDay of dates) {
			options.signal?.throwIfAborted();
			const day = await packHealthDay(utcDay, await staging.read(utcDay));
			for (const path of day.summary.routePaths) {
				if (!paths.has(path)) throw new Error("健康导出缺少 FileReference 引用的附件");
			}
			for (const series of day.data.series) dimensions.add(series.dimension);
			days.push(day);
			progress.completed++;
			report();
		}
		if (!days.length) throw new Error("健康导出没有带日期的可导入记录");
		progress.phase = "complete";
		report();
		return {
			days,
			files,
			recordCount: days.reduce((sum, day) => sum + day.recordCount, 0),
			xmlRecordCount,
			dimensionCount: dimensions.size,
			seriesCount: days.reduce((sum, day) => sum + day.data.series.length, 0),
			routePointCount,
			ecgSampleCount,
			payloadBytes:
				days.reduce((sum, day) => sum + day.payloadBytes, 0) +
				files.reduce(
					(sum, file) => sum + file.parts.reduce((total, part) => total + part.payloadBytes, 0),
					0,
				),
			warnings: [...warnings],
		};
	} finally {
		await staging.clear();
	}
}
