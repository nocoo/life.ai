import { describe, expect, it, vi } from "vitest";
import {
	FOOTPRINT_DAY_MS,
	FOOTPRINT_MAX_DAY_BYTES,
	type FootprintPoint,
	footprintDayEvents,
	parseFootprint,
	validateFootprintDay,
} from "../../../src/models/footprint";

const day = Date.parse("2026-09-13T00:00:00Z");
const fields = ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"];
const encoder = new TextEncoder();
const point = (offset = 0): FootprintPoint => [offset, 0, 0, null, null, null];
const envelope = (points: unknown = [point()], extra: Record<string, unknown> = {}) => ({
	utcDay: day,
	data: { v: 1, fields, points, ...extra },
});

async function* chunks(xml: string, size = 47) {
	const bytes = encoder.encode(xml);
	for (let offset = 0; offset < bytes.length; offset += size) {
		yield bytes.subarray(offset, offset + size);
	}
}

function trkpt(time: string, attributes = 'lat="0" lon="0"', rest = "") {
	return `<trkpt ${attributes}><time>${time}</time>${rest}</trkpt>`;
}
const gpx = (points: string) => `<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`;
const timestamp = "2026-09-13T01:02:03Z";

describe("Footprint daily storage validation", () => {
	it("recomputes every claim, preserves all fields, and copies canonical content", async () => {
		const input = {
			...envelope([
				[0.001, -90, -180, -12.25, -1, -1],
				[3661.999, 90, 180, null, 0, 360],
			]),
			recordCount: 999,
			firstAt: 0,
			lastAt: 0,
			payloadBytes: 0,
			contentHash: "forged",
			summary: { hourCounts: [999] },
		};
		const result = await validateFootprintDay(input);
		expect(result).toMatchObject({
			utcDay: day,
			recordCount: 2,
			firstAt: day + 1,
			lastAt: day + 3_661_999,
			data: { v: 1, fields, points: input.data.points },
		});
		expect(result.payloadBytes).toBe(encoder.encode(JSON.stringify(result.data)).length);
		expect(result.contentHash).toMatch(/^[\da-f]{64}$/);
		expect(result.summary.hourCounts).toEqual([1, 1, ...Array(22).fill(0)]);
		expect(result.data.points).not.toBe(input.data.points);
		expect(result.data.points[0]).not.toBe((input.data.points as unknown[])[0]);
		expect(result.data.fields).not.toBe(fields);
		const changedDay = await validateFootprintDay({ ...input, utcDay: day + FOOTPRINT_DAY_MS });
		expect(changedDay.contentHash).not.toBe(result.contentHash);
		const emptyBreaks = await validateFootprintDay(envelope(input.data.points, { breaks: [] }));
		expect(emptyBreaks.contentHash).toBe(result.contentHash);
	});

	it("retains duplicate points and uses all six values to order equal timestamps", async () => {
		const points: FootprintPoint[] = [
			[0, 0, 0, null, null, null],
			[0, 0, 0, null, null, null],
			[0, 0, 0, -1, null, null],
			[0, 0, 0, 0, null, null],
			[0, 0, 0, 0, -1, null],
			[0, 0, 0, 0, 0, null],
			[0, 0, 0, 0, 0, -1],
			[0, 0, 0, 0, 0, 0],
			[0, 0, 1, null, null, null],
			[0, 1, 0, null, null, null],
		];
		const result = await validateFootprintDay(envelope(points, { breaks: [0, 2] }));
		expect(result.recordCount).toBe(points.length);
		expect(result.data.breaks).toEqual([0, 2]);
		await expect(validateFootprintDay(envelope([...points].reverse()))).rejects.toThrow("排序");
		await expect(validateFootprintDay(envelope([points[2], points[1]]))).rejects.toThrow("排序");
	});

	it.each([null, false, 3, [], "value"])("rejects a non-object envelope: %j", async (value) => {
		await expect(validateFootprintDay(value)).rejects.toThrow("JSON 对象");
	});
	it.each([
		undefined,
		"2026-09-13",
		day + 1,
		day + 0.1,
		NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		8_640_000_000_000_000,
		8_640_000_086_400_000,
	])("rejects invalid UTC midnight: %s", async (utcDay) => {
		await expect(validateFootprintDay({ ...envelope(), utcDay })).rejects.toThrow("UTC 零点");
	});
	it("allows past dates before the epoch and future dates without local-time assumptions", async () => {
		for (const utcDay of [-FOOTPRINT_DAY_MS, Date.parse("2100-01-01T00:00:00Z")]) {
			expect((await validateFootprintDay({ ...envelope(), utcDay })).firstAt).toBe(utcDay);
		}
	});
	it.each([{ v: 2 }, { fields: null }, { fields: [] }, { fields: [...fields].reverse() }])(
		"rejects unknown schemas: %j",
		async (extra) => {
			await expect(validateFootprintDay(envelope([point()], extra))).rejects.toThrow("版本或字段");
		},
	);
	it("rejects missing payloads and empty days instead of treating them as deletion", async () => {
		await expect(validateFootprintDay({ utcDay: day })).rejects.toThrow("JSON 对象");
		await expect(validateFootprintDay(envelope([]))).rejects.toThrow("空日");
		await expect(validateFootprintDay(envelope(null))).rejects.toThrow("空日");
	});
	it.each([null, {}, [0, 0, 0], [0, 0, 0, null, null, null, 1]])(
		"rejects malformed point columns: %j",
		async (value) => {
			await expect(validateFootprintDay(envelope([value]))).rejects.toThrow("六列");
		},
	);
	it.each(["0", null, NaN, Infinity, -0.001, 86400, 0.0001, 86399.9999])(
		"rejects a point outside the UTC day or millisecond precision: %s",
		async (offset) => {
			await expect(
				validateFootprintDay(envelope([[offset, 0, 0, null, null, null]])),
			).rejects.toThrow("属于该 UTC 日");
		},
	);
	it.each([
		["0", 0],
		[null, 0],
		[NaN, 0],
		[Infinity, 0],
		[-90.1, 0],
		[0, "0"],
		[0, null],
		[0, NaN],
		[0, Infinity],
		[0, 180.1],
	])("rejects invalid latitude/longitude: %s, %s", async (latitude, longitude) => {
		await expect(
			validateFootprintDay(envelope([[0, latitude, longitude, null, null, null]])),
		).rejects.toThrow("经纬度");
	});
	it.each([
		["1", null, null],
		[null, undefined, null],
		[null, null, false],
		[Infinity, null, null],
		[null, NaN, null],
	])("rejects invalid optional numeric columns: %j", async (elevation, speed, course) => {
		await expect(
			validateFootprintDay(envelope([[0, 0, 0, elevation, speed, course]])),
		).rejects.toThrow("有限数值或 null");
	});
	it.each([null, false, "1", [0.1], [-1], [2], ["0"], [0, 0], [1, 0]])(
		"rejects invalid segment boundaries: %j",
		async (breaks) => {
			await expect(validateFootprintDay(envelope([point(), point(1)], { breaks }))).rejects.toThrow(
				"分段索引",
			);
		},
	);
	it("checks real UTF-8 size including metadata, rather than a claimed payloadBytes", async () => {
		const tupleBytes = encoder.encode(JSON.stringify(point())).length + 1;
		const headerBytes = encoder.encode(JSON.stringify(envelope([]).data)).length;
		const count = Math.floor((FOOTPRINT_MAX_DAY_BYTES - headerBytes - 80) / tupleBytes);
		const input = envelope(Array.from({ length: count }, () => point()));
		expect(encoder.encode(JSON.stringify(input.data)).length).toBeLessThan(FOOTPRINT_MAX_DAY_BYTES);
		await expect(validateFootprintDay({ ...input, payloadBytes: 1 })).rejects.toThrow("512 KiB");
		await expect(
			validateFootprintDay(envelope(Array.from({ length: count + 100 }, () => point()))),
		).rejects.toThrow("512 KiB");
	});
});

describe("Footprint shared GPX stream", () => {
	it("groups the whole disordered file by UTC, preserves precision and publishes byte progress", async () => {
		const xml = gpx(
			`<name>虚构轨迹</name>${trkpt("2026-09-14T00:00:00Z")}${trkpt(
				"2026-09-13T08:00:00.001+0800",
				'lat="1.12345678" lon="2.12345678"',
				"<ele>-15.25</ele><speed>-1</speed><course>-1</course>",
			)}${trkpt("2026-09-12T23:59:59.999")}${trkpt("2026-09-13T23:59:59Z")}`,
		);
		const onProgress = vi.fn();
		const totalBytes = encoder.encode(xml).length;
		const result = await parseFootprint(chunks(xml, 1), { totalBytes, onProgress });
		expect(result.pointCount).toBe(4);
		expect(result.days.map((entry) => [entry.utcDay, entry.recordCount])).toEqual([
			[day - FOOTPRINT_DAY_MS, 1],
			[day, 2],
			[day + FOOTPRINT_DAY_MS, 1],
		]);
		expect(result.days[1]?.data.points[0]).toEqual([0.001, 1.12345678, 2.12345678, -15.25, -1, -1]);
		expect(result.days.every((entry) => !entry.data.breaks)).toBe(true);
		expect(result.firstAt).toBe(day - 1);
		expect(result.lastAt).toBe(day + FOOTPRINT_DAY_MS);
		expect(result.bytesRead).toBe(totalBytes);
		expect(result.payloadBytes).toBe(
			result.days.reduce((sum, entry) => sum + entry.payloadBytes, 0),
		);
		expect(onProgress.mock.calls[0]?.[0]).toEqual({ bytesRead: 0, pointCount: 0, totalBytes });
		expect(onProgress.mock.lastCall?.[0]).toEqual({
			bytesRead: totalBytes,
			pointCount: 4,
			totalBytes,
		});
	});

	it("canonicalizes file/attribute order, retaining coincident and distinct points at the same time", async () => {
		const first = trkpt(timestamp, 'lat="1" lon="2"');
		const second = trkpt(timestamp, 'lat="1" lon="3"', "<speed>1e-2</speed>");
		const third = trkpt(timestamp, 'lat="1" lon="2"', "<speed>-1</speed>");
		const a = await parseFootprint(chunks(gpx(first + second + third + first)));
		const b = await parseFootprint(
			chunks(gpx(third + second + first.replace('lat="1" lon="2"', 'lon="2" lat="1"') + first)),
		);
		expect(a.days).toEqual(b.days);
		expect(a.pointCount).toBe(4);
		expect(a.days[0]?.data.points).toEqual([
			[3723, 1, 2, null, null, null],
			[3723, 1, 2, null, null, null],
			[3723, 1, 2, null, -1, null],
			[3723, 1, 3, null, 0.01, null],
		]);
	});

	it("keeps native segment breaks after sorting, including a new segment at the next UTC midnight", async () => {
		const segment1 = `<trkseg>${trkpt("2026-09-13T23:59:00Z")}${trkpt("2026-09-13T23:57:00Z")}</trkseg>`;
		const segment2 = `<trkseg>${trkpt("2026-09-14T00:01:00Z")}</trkseg>`;
		const xml = `<gpx><trk>${segment1}${segment2}</trk></gpx>`;
		const result = await parseFootprint(chunks(xml));
		expect(result.days[0]?.data.breaks).toBeUndefined();
		expect(result.days[1]?.data.breaks).toEqual([0]);
		const reordered = await parseFootprint(chunks(`<gpx><trk>${segment2}${segment1}</trk></gpx>`));
		expect(reordered.days).toEqual(result.days);
	});

	it("splits overlapping segments whenever chronological ordering switches the original segment", async () => {
		const xml = `<gpx><trk><trkseg>${trkpt("2026-09-13T00:00:00Z")}${trkpt("2026-09-13T00:02:00Z")}</trkseg><trkseg>${trkpt("2026-09-13T00:01:00Z")}</trkseg></trk></gpx>`;
		const result = await parseFootprint(chunks(xml));
		expect(result.days[0]?.data.breaks).toEqual([1, 2]);
	});

	it("keeps hashes stable when reordered segments share identical points or one is a prefix", async () => {
		const shared = trkpt("2026-09-13T00:00:00Z");
		const segment1 = `<trkseg>${shared}${trkpt("2026-09-13T00:01:00Z")}</trkseg>`;
		const segment2 = `<trkseg>${shared}${trkpt("2026-09-13T00:02:00Z")}</trkseg>`;
		const segment3 = `<trkseg>${shared}</trkseg>`;
		const first = await parseFootprint(
			chunks(`<gpx><trk>${segment1}${segment2}${segment3}${segment1}</trk></gpx>`),
		);
		const second = await parseFootprint(
			chunks(`<gpx><trk>${segment2}${segment1}${segment1}${segment3}</trk></gpx>`),
		);
		expect(first.days).toEqual(second.days);
		expect(first.pointCount).toBe(7);
	});

	it("reads GPX namespaces, extension values, CDATA, routes and separate waypoints", async () => {
		const xml = `<?xml version="1.0"?><g:gpx xmlns:g="http://www.topografix.com/GPX/1/1" xmlns:x="https://example.test/gpx"><g:trk><g:trkseg><g:trkpt lat="-90" lon="180"><g:time><![CDATA[2026-09-13T00:00:00.123000000Z]]></g:time><extensions><x:speed>1.5</x:speed><x:other>ignored</x:other></extensions></g:trkpt></g:trkseg></g:trk><g:rte><g:rtept lat="0" lon="0"><g:time>2026-09-13T00:01:00Z</g:time></g:rtept></g:rte><g:wpt lat="90" lon="-180"><g:time>2026-09-13T00:02:00Z</g:time></g:wpt><g:wpt lat="0" lon="0"><g:time>2026-09-13T00:03:00Z</g:time></g:wpt></g:gpx>`;
		const result = await parseFootprint(chunks(xml));
		expect(result.pointCount).toBe(4);
		expect(result.days[0]?.data.points[0]).toEqual([0.123, -90, 180, null, 1.5, null]);
		expect(result.days[0]?.data.breaks).toEqual([1, 2, 3]);
	});

	it.each([
		["empty", "<gpx/>"],
		["wrong root", "<not-gpx/>"],
		["malformed XML", gpx(trkpt(timestamp)).replace("</gpx>", "<unfinished")],
		["incomplete after valid point", gpx(trkpt(timestamp)).replace("</trkseg>", "<trkpt>")],
		["invalid point parent", `<gpx>${trkpt(timestamp)}</gpx>`],
		["invalid track ancestor", `<gpx><other><trkseg>${trkpt(timestamp)}</trkseg></other></gpx>`],
		["nested point", gpx(trkpt(timestamp, 'lat="0" lon="0"', trkpt(timestamp)))],
		["missing latitude", gpx(trkpt(timestamp, 'lon="0"'))],
		["missing longitude", gpx(trkpt(timestamp, 'lat="0"'))],
		["invalid latitude", gpx(trkpt(timestamp, 'lat="91" lon="0"'))],
		["invalid longitude", gpx(trkpt(timestamp, 'lat="0" lon="181"'))],
		["hexadecimal coordinate", gpx(trkpt(timestamp, 'lat="0x10" lon="0"'))],
		["non-finite coordinate", gpx(trkpt(timestamp, 'lat="1e999" lon="0"'))],
		["missing time", gpx('<trkpt lat="0" lon="0"/>')],
		["empty time", gpx(trkpt(""))],
		["day-only time", gpx(trkpt("2026-09-13"))],
		["invalid calendar date", gpx(trkpt("2026-02-30T00:00:00Z"))],
		["submillisecond time", gpx(trkpt("2026-09-13T00:00:00.1234Z"))],
		["empty optional value", gpx(trkpt(timestamp, 'lat="0" lon="0"', "<ele/>"))],
		["invalid optional value", gpx(trkpt(timestamp, 'lat="0" lon="0"', "<speed>NaN</speed>"))],
		["duplicate field", gpx(trkpt(timestamp, 'lat="0" lon="0"', `<time>${timestamp}</time>`))],
		["nested field", gpx(trkpt(`<part>${timestamp}</part>`))],
		["custom entity", `<!DOCTYPE gpx [<!ENTITY t "${timestamp}">]>${gpx(trkpt("&t;"))}`],
		["undeclared entity", gpx(trkpt("&unknown;"))],
	])("rejects %s before returning an import plan", async (_name, xml) => {
		await expect(parseFootprint(chunks(xml))).rejects.toThrow();
	});

	it("bounds giant XML nodes, field content and nesting even when the source yields a huge chunk", async () => {
		await expect(
			parseFootprint(chunks(`<gpx><trk name="${"x".repeat(1_200_000)}`, 1_300_000)),
		).rejects.toThrow("1 MiB");
		await expect(parseFootprint(chunks(gpx(trkpt("1".repeat(257)))))).rejects.toThrow("字段过长");
		await expect(parseFootprint(chunks(`<gpx>${"<extension>".repeat(64)}`))).rejects.toThrow(
			"64 层",
		);
	});

	it("rejects oversized days before any plan is returned", async () => {
		await expect(parseFootprint(chunks(gpx(trkpt(timestamp).repeat(25_000))))).rejects.toThrow(
			"512 KiB",
		);
	});

	it("rejects invalid UTF-8, truncated multibyte tails and a mismatched declared file size", async () => {
		async function* invalid() {
			yield new Uint8Array([0xc3, 0x28]);
		}
		async function* incomplete() {
			yield encoder.encode(gpx(trkpt(timestamp)));
			yield new Uint8Array([0xe2]);
		}
		await expect(parseFootprint(invalid())).rejects.toThrow();
		await expect(parseFootprint(incomplete())).rejects.toThrow();
		await expect(parseFootprint(chunks(gpx(trkpt(timestamp))), { totalBytes: 1 })).rejects.toThrow(
			"读取大小",
		);
	});

	it("cancels before reading, during streaming, or during final day validation", async () => {
		const alreadyAborted = AbortSignal.abort(new Error("cancelled before read"));
		await expect(parseFootprint(chunks(""), { signal: alreadyAborted })).rejects.toThrow(
			"cancelled before read",
		);
		const controller = new AbortController();
		await expect(
			parseFootprint(chunks(gpx(trkpt(timestamp)), 10), {
				signal: controller.signal,
				onProgress: ({ bytesRead }) => {
					if (bytesRead > 0) controller.abort(new Error("cancelled while reading"));
				},
			}),
		).rejects.toThrow("cancelled while reading");
		const duringHash = new AbortController();
		const digest = crypto.subtle.digest.bind(crypto.subtle);
		vi.spyOn(crypto.subtle, "digest").mockImplementationOnce((algorithm, data) => {
			duringHash.abort(new Error("cancelled during validation"));
			return digest(algorithm, data);
		});
		await expect(
			parseFootprint(chunks(gpx(trkpt(timestamp))), { signal: duringHash.signal }),
		).rejects.toThrow("cancelled during validation");
	});

	it("propagates stream errors and checks cancellation when the last chunk has arrived", async () => {
		async function* broken() {
			yield encoder.encode(gpx(trkpt(timestamp)));
			throw new Error("disk read failed");
		}
		await expect(parseFootprint(broken())).rejects.toThrow("disk read failed");
		const controller = new AbortController();
		async function* cancelledAtEnd() {
			yield encoder.encode(gpx(trkpt(timestamp)));
			controller.abort(new Error("cancelled at end"));
		}
		await expect(parseFootprint(cancelledAtEnd(), { signal: controller.signal })).rejects.toThrow(
			"cancelled at end",
		);
	});
});

describe("Footprint daily projection", () => {
	it("decodes all raw values to stable second-precision records without losing milliseconds", async () => {
		const stored = await validateFootprintDay(
			envelope([
				[0.001, -1, 2, -0.25, -1, -1],
				[0.001, 1, 2, null, null, null],
			]),
		);
		const events = footprintDayEvents(stored);
		expect(events).toHaveLength(2);
		expect(events[0]).toEqual({
			id: `footprint:${day}:000000`,
			sourceId: "footprint",
			sourceName: "Footprint",
			sourceKind: "import",
			occurredAt: "2026-09-13T00:00:00.001Z",
			endAt: null,
			precision: "second",
			title: "GPS 轨迹点",
			content: "",
			data: {
				time: "2026-09-13T00:00:00.001Z",
				latitude: -1,
				longitude: 2,
				elevation: -0.25,
				speed: -1,
				course: -1,
			},
			updatedAt: "2026-09-13T00:00:00.001Z",
		});
		expect(events[1]?.id).not.toBe(events[0]?.id);
		expect(footprintDayEvents(await validateFootprintDay(stored))).toEqual(events);
	});

	it("clips a half-open UTC window with original IDs and explicit segment boundaries", async () => {
		const stored = await validateFootprintDay(
			envelope([point(), point(1), point(2), point(3)], { breaks: [1, 3] }),
		);
		const all = footprintDayEvents(stored);
		const result = footprintDayEvents(stored, { start: day + 1000, end: day + 3000 });
		expect(result).toEqual(all.slice(1, 3));
		expect(result[0]?.data).toMatchObject({ breakBefore: true });
		expect(result[1]?.data).not.toHaveProperty("breakBefore");
		expect(footprintDayEvents(stored, { start: day + 5000, end: day + 6000 })).toEqual([]);
	});
});
