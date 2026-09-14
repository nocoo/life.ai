import { normalizeTimestamp } from "./time";
import type { LifeEvent } from "./types";

export const FOOTPRINT_DAY_MS = 86_400_000;
export const FOOTPRINT_MAX_DAY_BYTES = 512 * 1024;
const FIELDS = ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"] as const;
const encoder = new TextEncoder();

export type FootprintPoint = [number, number, number, number | null, number | null, number | null];
export interface FootprintPayload {
	v: 1;
	fields: readonly string[];
	points: FootprintPoint[];
	breaks?: number[];
}
export interface FootprintDay {
	utcDay: number;
	data: FootprintPayload;
	recordCount: number;
	firstAt: number;
	lastAt: number;
	payloadBytes: number;
	contentHash: string;
	summary: { hourCounts: number[] };
}
export interface FootprintPlan {
	days: FootprintDay[];
	pointCount: number;
	firstAt: number;
	lastAt: number;
	bytesRead: number;
	payloadBytes: number;
}
export interface FootprintProgress {
	bytesRead: number;
	pointCount: number;
	totalBytes: number;
}

function object(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Footprint 日包必须是 JSON 对象");
	}
	return input as Record<string, unknown>;
}

function comparePoints(a: readonly (number | null)[], b: readonly (number | null)[]): number {
	for (let index = 0; index < FIELDS.length; index++) {
		const left = a[index] as number | null;
		const right = b[index] as number | null;
		if (left !== right) return left === null ? -1 : right === null ? 1 : left - right;
	}
	return 0;
}

function readPoint(input: unknown): FootprintPoint {
	if (!Array.isArray(input) || input.length !== FIELDS.length) {
		throw new Error("Footprint 轨迹点必须包含六列");
	}
	const [offset, latitude, longitude, elevation, speed, course] = input;
	if (
		typeof offset !== "number" ||
		!Number.isFinite(offset) ||
		offset < 0 ||
		offset >= 86400 ||
		Math.round(offset * 1000) / 1000 !== offset
	) {
		throw new Error("Footprint 时间必须属于该 UTC 日，且最多精确到毫秒");
	}
	if (
		typeof latitude !== "number" ||
		!Number.isFinite(latitude) ||
		Math.abs(latitude) > 90 ||
		typeof longitude !== "number" ||
		!Number.isFinite(longitude) ||
		Math.abs(longitude) > 180
	) {
		throw new Error("Footprint 经纬度超出有效范围");
	}
	for (const value of [elevation, speed, course]) {
		if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
			throw new Error("Footprint 海拔、速度和方向必须是有限数值或 null");
		}
	}
	return [offset, latitude, longitude, elevation, speed, course];
}

/** Metadata comes from the canonical content, never from the upload's claims. */
export async function validateFootprintDay(input: unknown): Promise<FootprintDay> {
	const incoming = object(input);
	const utcDay = incoming.utcDay;
	if (
		typeof utcDay !== "number" ||
		!Number.isSafeInteger(utcDay) ||
		utcDay % FOOTPRINT_DAY_MS !== 0 ||
		!Number.isFinite(new Date(utcDay).getTime()) ||
		!Number.isFinite(new Date(utcDay + FOOTPRINT_DAY_MS - 1).getTime())
	) {
		throw new Error("Footprint 日键必须是有效 UTC 零点的毫秒时间戳");
	}
	const payload = object(incoming.data);
	if (
		payload.v !== 1 ||
		!Array.isArray(payload.fields) ||
		payload.fields.length !== FIELDS.length ||
		!FIELDS.every((field, index) => (payload.fields as unknown[])[index] === field)
	) {
		throw new Error("Footprint 日包版本或字段顺序不受支持");
	}
	if (!Array.isArray(payload.points) || payload.points.length === 0) {
		throw new Error("Footprint 日包必须包含轨迹点；空日不能用于清空数据");
	}
	const points = payload.points.map(readPoint);
	const hourCounts = Array<number>(24).fill(0);
	for (let index = 0; index < points.length; index++) {
		const point = points[index] as FootprintPoint;
		if (index > 0 && comparePoints(points[index - 1] as FootprintPoint, point) > 0) {
			throw new Error("Footprint 轨迹点必须按时间和六列数值排序");
		}
		const hour = Math.floor(point[0] / 3600);
		hourCounts[hour] = (hourCounts[hour] as number) + 1;
	}
	const breaks = payload.breaks === undefined ? [] : payload.breaks;
	if (!Array.isArray(breaks)) throw new Error("Footprint 分段索引必须是数组");
	for (let index = 0; index < breaks.length; index++) {
		const boundary = breaks[index];
		if (
			!Number.isInteger(boundary) ||
			boundary < 0 ||
			boundary >= points.length ||
			(index > 0 && boundary <= breaks[index - 1])
		) {
			throw new Error("Footprint 分段索引必须递增且属于当前日包");
		}
	}
	const data: FootprintPayload = {
		v: 1,
		fields: [...FIELDS],
		points,
		...(breaks.length ? { breaks: [...breaks] } : {}),
	};
	const serialized = JSON.stringify(data);
	const payloadBytes = encoder.encode(serialized).length;
	const tooLarge = () =>
		new Error(`${new Date(utcDay).toISOString().slice(0, 10)} 日包超过 512 KiB`);
	if (payloadBytes > FOOTPRINT_MAX_DAY_BYTES) throw tooLarge();
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${utcDay}:${serialized}`));
	const day: FootprintDay = {
		utcDay,
		data,
		recordCount: points.length,
		firstAt: utcDay + Math.round((points[0] as FootprintPoint)[0] * 1000),
		lastAt: utcDay + Math.round((points[points.length - 1] as FootprintPoint)[0] * 1000),
		payloadBytes,
		contentHash: Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join(""),
		summary: { hourCounts },
	};
	if (encoder.encode(JSON.stringify(day)).length > FOOTPRINT_MAX_DAY_BYTES) throw tooLarge();
	return day;
}

// The first column is the absolute millisecond instant until the final day projection.
type TaggedPoint = [...FootprintPoint, segment: number];
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function numericField(value: string | undefined, name: string, optional = false): number | null {
	if (value === undefined && optional) return null;
	if (value === undefined || !NUMBER.test(value.trim()) || !Number.isFinite(Number(value))) {
		throw new Error(`GPX ${name} 必须是有限数值`);
	}
	return Number(value);
}

/** The XML is streamed; numeric points stay in memory until the entire file is validated. */
export async function parseFootprint(
	input: AsyncIterable<Uint8Array>,
	options: {
		totalBytes?: number;
		signal?: AbortSignal;
		onProgress?: (progress: FootprintProgress) => void;
	} = {},
): Promise<FootprintPlan> {
	options.signal?.throwIfAborted();
	// Keep the XML parser outside Worker read/validation bundles which only need the codec.
	const { SaxesParser } = await import("saxes");
	const parser = new SaxesParser({ xmlns: false });
	const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
	const grouped = new Map<number, TaggedPoint[]>();
	const stack: string[] = [];
	let segment = 0;
	let point: Record<string, string> | undefined;
	let field = "";
	let fieldDepth = 0;
	let lastBoundary = 0;
	let bytesRead = 0;
	let pointCount = 0;
	const report = () =>
		options.onProgress?.({ bytesRead, pointCount, totalBytes: options.totalBytes ?? 0 });
	parser.on("doctype", () => {
		throw new Error("GPX 不支持 DTD 或自定义实体");
	});
	parser.on("opentag", (tag) => {
		lastBoundary = parser.position;
		const name = tag.name.split(":").at(-1) as string;
		const parent = stack.at(-1);
		stack.push(name);
		if (stack.length === 1 && name !== "gpx") throw new Error("请选择 GPX 文件");
		if (stack.length > 64) throw new Error("GPX XML 嵌套层级超过 64 层");
		if (field) throw new Error(`GPX ${field} 字段不能包含嵌套元素`);
		if (
			(name === "trkseg" && parent === "trk" && stack.length === 3) ||
			(name === "rte" && stack.length === 2)
		) {
			segment++;
		}
		if (["trkpt", "rtept", "wpt"].includes(name)) {
			if (
				point ||
				!(
					(name === "trkpt" && parent === "trkseg" && stack[1] === "trk" && stack.length === 4) ||
					(name === "rtept" && parent === "rte" && stack.length === 3) ||
					(name === "wpt" && parent === "gpx" && stack.length === 2)
				)
			) {
				throw new Error("GPX 轨迹点必须属于有效轨迹段、路线或独立航点");
			}
			if (name === "wpt") segment++;
			point = { lat: tag.attributes.lat as string, lon: tag.attributes.lon as string };
		} else if (point && ["time", "ele", "speed", "course"].includes(name)) {
			if (point[name] !== undefined) throw new Error(`GPX ${name} 字段重复`);
			field = name;
			fieldDepth = stack.length;
			point[name] = "";
		}
	});
	const text = (value: string) => {
		lastBoundary = parser.position;
		if (!point || !field) return;
		point[field] = (point[field] as string) + value;
		if ((point[field] as string).length > 256) throw new Error("GPX 数值或时间字段过长");
	};
	parser.on("text", text);
	parser.on("cdata", text);
	parser.on("closetag", (tag) => {
		lastBoundary = parser.position;
		const name = tag.name.split(":").at(-1) as string;
		if (point && ["trkpt", "rtept", "wpt"].includes(name)) {
			const time = point.time?.trim();
			const match = time?.match(
				/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/i,
			);
			if (!time || !match) throw new Error("GPX 轨迹点需要包含秒的有效 time");
			if (/[1-9]/.test((match[1] ?? "").slice(3))) {
				throw new Error("GPX 时间超过毫秒精度；不能无损导入");
			}
			const instant = Date.parse(normalizeTimestamp(time));
			const utcDay = Math.floor(instant / FOOTPRINT_DAY_MS) * FOOTPRINT_DAY_MS;
			const values = readPoint([
				(instant - utcDay) / 1000,
				numericField(point.lat, "latitude"),
				numericField(point.lon, "longitude"),
				numericField(point.ele, "elevation", true),
				numericField(point.speed, "speed", true),
				numericField(point.course, "course", true),
			]);
			const points = grouped.get(utcDay) ?? [];
			points.push([instant, values[1], values[2], values[3], values[4], values[5], segment]);
			grouped.set(utcDay, points);
			pointCount++;
			point = undefined;
		}
		if (stack.length === fieldDepth) field = "";
		stack.pop();
	});
	report();
	for await (const chunk of input) {
		for (let offset = 0; offset < chunk.length; offset += 64 * 1024) {
			options.signal?.throwIfAborted();
			const bytes = chunk.subarray(offset, offset + 64 * 1024);
			parser.write(decoder.decode(bytes, { stream: true }));
			bytesRead += bytes.length;
			if (parser.position - lastBoundary > 1024 * 1024) {
				throw new Error("GPX XML 节点超过 1 MiB");
			}
			report();
		}
	}
	options.signal?.throwIfAborted();
	parser.write(decoder.decode()).close();
	if (options.totalBytes !== undefined && options.totalBytes !== bytesRead) {
		throw new Error("GPX 实际读取大小与文件大小不符");
	}
	if (pointCount === 0) throw new Error("GPX 文件中没有可导入的轨迹点");
	// Content-based segment order also makes coincident points stable when whole segments move in a file.
	const segmentRanks = new Map<number, number>();
	if (segment > 1) {
		const segments = new Map<number, TaggedPoint[]>();
		for (const points of grouped.values()) {
			for (const entry of points) {
				const entries = segments.get(entry[6]) ?? [];
				entries.push(entry);
				segments.set(entry[6], entries);
			}
		}
		for (const entries of segments.values()) entries.sort(comparePoints);
		[...segments.entries()]
			.sort(([, a], [, b]) => {
				for (let index = 0; index < Math.min(a.length, b.length); index++) {
					const difference = comparePoints(a[index] as TaggedPoint, b[index] as TaggedPoint);
					if (difference) return difference;
				}
				return a.length - b.length;
			})
			.forEach(([id], index) => {
				segmentRanks.set(id, index);
			});
	}
	const days: FootprintDay[] = [];
	let previousSegment: number | undefined;
	for (const utcDay of [...grouped.keys()].sort((a, b) => a - b)) {
		const tagged = grouped.get(utcDay) as TaggedPoint[];
		tagged.sort(
			(a, b) =>
				comparePoints(a, b) || (segmentRanks.get(a[6]) ?? 0) - (segmentRanks.get(b[6]) ?? 0),
		);
		const breaks: number[] = [];
		const points = tagged.map((entry, index) => {
			if (previousSegment !== undefined && previousSegment !== entry[6]) breaks.push(index);
			previousSegment = entry[6];
			return [(entry[0] - utcDay) / 1000, ...entry.slice(1, 6)] as FootprintPoint;
		});
		days.push(
			await validateFootprintDay({ utcDay, data: { v: 1, fields: FIELDS, points, breaks } }),
		);
		grouped.delete(utcDay);
		options.signal?.throwIfAborted();
	}
	report();
	return {
		days,
		pointCount,
		firstAt: (days[0] as FootprintDay).firstAt,
		lastAt: (days[days.length - 1] as FootprintDay).lastAt,
		bytesRead,
		payloadBytes: days.reduce((total, day) => total + day.payloadBytes, 0),
	};
}

/** Expand once per fetched day. Stable virtual IDs retain every point, including equal timestamps. */
export function footprintDayEvents(
	day: FootprintDay,
	window?: { start: number; end: number },
): LifeEvent[] {
	const events: LifeEvent[] = [];
	const breaks = new Set(day.data.breaks);
	day.data.points.forEach(([offset, latitude, longitude, elevation, speed, course], index) => {
		const instant = day.utcDay + Math.round(offset * 1000);
		if (window && (instant < window.start || instant >= window.end)) return;
		const occurredAt = new Date(instant).toISOString();
		events.push({
			id: `footprint:${day.utcDay}:${String(index).padStart(6, "0")}`,
			sourceId: "footprint",
			sourceName: "Footprint",
			sourceKind: "import",
			occurredAt,
			endAt: null,
			precision: "second",
			title: "GPS 轨迹点",
			content: "",
			data: {
				time: occurredAt,
				latitude,
				longitude,
				elevation,
				speed,
				course,
				...(breaks.has(index) ? { breakBefore: true } : {}),
			},
			updatedAt: occurredAt,
		});
	});
	return events;
}
