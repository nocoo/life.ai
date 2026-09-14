import { createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
	decodeHealthPart,
	decodeHealthSeries,
	healthEcg,
	healthFilePath,
	healthRoutePoints,
	packHealthDay,
	parseHealthExport,
	validateHealthDay,
} from "../../../src/models/apple-health";
import {
	HEALTH_DAY_MS,
	HEALTH_LIMITS,
	type HealthDay,
	type HealthFilePart,
	type HealthInputFile,
	type HealthNode,
	type HealthSeries,
	type HealthStaging,
} from "../../../src/models/health-types";

const UTC_DAY = Date.UTC(2026, 0, 2);
const encoder = new TextEncoder();
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const record = (attributes = "", children = "") =>
	`<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-01-02 09:00:00 +0800" endDate="2026-01-02 09:01:00 +0800" value="60.00" unit="count/min" sourceName="watch" ${attributes}>${children}</Record>`;
const document = (body: string) =>
	`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE HealthData [<!ELEMENT HealthData ANY>]><HealthData locale="zh_CN"><ExportDate value="2026-01-03 00:00:00 +0000"/><Me HKCharacteristicTypeIdentifierDateOfBirth="2000-01-01"/>${body}</HealthData>`;
const route = `<gpx><trk><trkseg><trkpt lat="31" lon="121"><ele>2.50</ele><time>2026-01-02T01:00:00.123Z</time><extensions><speed>-1</speed><hAcc>4</hAcc><vAcc>5</vAcc><course>0</course></extensions></trkpt><trkpt lat="31.01" lon="121.01"><time>2026-01-02T01:00:02Z</time></trkpt></trkseg></trk></gpx>`;
const csv =
	"\uFEFF姓名,Example\n记录日期,2026-01-02 09:00:00 +0800\n分类,窦性心律\n设备,Watch6,18\n采样速率,2赫兹\n平均心率,63\n导联,导联I\n单位,µV\n\n1.25\n-2.5\n3\n0\n";

function input(path: string, contents: string | Uint8Array, chunkSize = 32768): HealthInputFile {
	const bytes = typeof contents === "string" ? encoder.encode(contents) : contents;
	return {
		path,
		size: bytes.length,
		stream: () => {
			let offset = 0;
			return new ReadableStream({
				pull(controller) {
					if (offset === bytes.length) controller.close();
					else {
						controller.enqueue(bytes.subarray(offset, offset + chunkSize));
						offset = Math.min(bytes.length, offset + chunkSize);
					}
				},
			});
		},
	};
}

function staging() {
	const rows = new Map<number, HealthNode[]>();
	const io: HealthStaging = {
		append: vi.fn(async (groups) => {
			for (const [day, nodes] of groups)
				rows.set(day, [...(rows.get(day) ?? []), ...structuredClone(nodes)]);
		}),
		days: vi.fn(async () => [...rows.keys()]),
		read: vi.fn(async (day) => rows.get(day) ?? []),
		clear: vi.fn(async () => {
			rows.clear();
		}),
	};
	return io;
}

async function plan(body = record(), files: HealthInputFile[] = []) {
	return parseHealthExport([input("导出.xml", document(body)), ...files], staging());
}

function nodes(series: HealthSeries): HealthNode[] {
	return JSON.parse(Buffer.from(gunzipSync(Buffer.from(series.body, "base64"))).toString("utf8"));
}

function serializedNodes(values: HealthNode[], changes: Partial<HealthSeries> = {}): HealthSeries {
	const raw = JSON.stringify(values);
	const body = Buffer.from(gzipSync(raw)).toString("base64");
	return {
		dimension: "HKQuantityTypeIdentifierHeartRate",
		part: 0,
		recordCount: values.length,
		firstAt: UTC_DAY + 3_600_000,
		lastAt: UTC_DAY + 3_660_000,
		rawBytes: Buffer.byteLength(raw),
		payloadBytes: body.length,
		contentHash: digest(raw),
		body,
		...changes,
	};
}

function part(bytes: Uint8Array): HealthFilePart {
	const body = Buffer.from(gzipSync(bytes)).toString("base64");
	return {
		part: 0,
		rawBytes: bytes.length,
		payloadBytes: body.length,
		contentHash: digest(bytes),
		body,
	};
}

describe("lossless HealthData import", () => {
	it("cleans caller-created staging after input rejection or a pre-aborted import", async () => {
		for (const files of [[input("../unsafe", "")], [{ ...input("a.xml", ""), size: -1 }]]) {
			const io = staging();
			await expect(parseHealthExport(files, io)).rejects.toThrow();
			expect(io.clear).toHaveBeenCalledOnce();
		}
		const controller = new AbortController();
		controller.abort();
		const io = staging();
		await expect(parseHealthExport([], io, { signal: controller.signal })).rejects.toThrow();
		expect(io.clear).toHaveBeenCalledOnce();
	});

	it("packs fixture nodes with full dimensions, stable hashes and original clock precision", async () => {
		const values: HealthNode[] = [
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierHeartRate",
					startDate: "2026-01-02T09+08:00",
					value: "60.00",
				},
			},
			{ name: "Workout", attributes: { startDate: "2026-01-02T02:30Z" } },
		];
		const day = await packHealthDay(UTC_DAY, values);
		expect(day.data.series.map((series) => series.dimension)).toEqual([
			"HKQuantityTypeIdentifierHeartRate",
			"Workout",
		]);
		expect(await validateHealthDay(day)).toEqual(day);
		expect(await packHealthDay(UTC_DAY, [...values].reverse())).toEqual(day);
		expect(
			(await decodeHealthSeries(day.data.series[0] as HealthSeries, UTC_DAY, UTC_DAY))[0],
		).toMatchObject({ precision: "hour", occurredAt: "2026-01-02T01:00:00.000Z" });
		await expect(packHealthDay(UTC_DAY, [])).rejects.toThrow("不能为空");
		await expect(packHealthDay(UTC_DAY + HEALTH_DAY_MS, values)).rejects.toThrow("日期");
	});

	it("preserves every attribute, nested HRV beat, correlation member and coincident record", async () => {
		const nested =
			'<MetadataEntry key="HKMetadataKeySyncIdentifier" value="uuid-keep"/><HeartRateVariabilityMetadataList><InstantaneousBeatsPerMinute bpm="60.123" time="00:00:00.001"/></HeartRateVariabilityMetadataList><Unknown x="&amp;">before<Child a="1"/>after<![CDATA[尾]]><!-- comment --><?keep data?></Unknown>';
		const correlation = `<Correlation type="HKCorrelationTypeIdentifierBloodPressure" startDate="2026-01-02">${record()}</Correlation>`;
		const body = record('custom="原样" creationDate="2026-01-03"', nested);
		const result = await plan(
			`${body}${body}${correlation}<ActivitySummary dateComponents="2026-01-02" activeEnergyBurned="123.40"/>`,
		);
		expect(result).toMatchObject({
			recordCount: 4,
			xmlRecordCount: 2,
			dimensionCount: 3,
			seriesCount: 3,
		});
		const day = result.days[0] as HealthDay;
		expect(day.utcDay).toBe(UTC_DAY);
		expect(day.summary.nestedNodes).toMatchObject({
			Record: 1,
			MetadataEntry: 2,
			InstantaneousBeatsPerMinute: 2,
			Unknown: 2,
			Child: 2,
		});
		const series = day.data.series.find(
			(entry) => entry.dimension === "HKQuantityTypeIdentifierHeartRate",
		) as HealthSeries;
		const values = nodes(series);
		expect(values).toHaveLength(2);
		expect(values[0]).toEqual(values[1]);
		expect(values[0]?.attributes).toMatchObject({
			value: "60.00",
			custom: "原样",
			creationDate: "2026-01-03",
		});
		expect(values[0]?.children?.[0]?.attributes.value).toBe("uuid-keep");
		expect(values[0]?.children?.[2]?.children?.map((entry) => entry.name)).toEqual([
			"#text",
			"Child",
			"#text",
			"#text",
			"#comment",
			"#processingInstruction",
		]);
		expect(await validateHealthDay(day)).toEqual(day);
		const events = await decodeHealthSeries(series, UTC_DAY, UTC_DAY);
		expect(events).toHaveLength(2);
		expect(new Set(events.map((event) => event.id)).size).toBe(2);
		expect(events[0]).toMatchObject({
			sourceId: "apple-health",
			occurredAt: "2026-01-02T01:00:00.000Z",
			data: { value: "60.00", _healthKind: "Record" },
		});
		expect(
			(await decodeHealthSeries(series, UTC_DAY, UTC_DAY + 1)).map((event) => event.id),
		).toEqual(events.map((event) => event.id));
	});

	it("keeps XML metadata, malformed CDA and all route/ECG bytes as verified original attachments", async () => {
		const workout =
			'<Workout workoutActivityType="HKWorkoutActivityTypeCycling" startDate="2026-01-02 09:00:00 +0800" endDate="2026-01-02 10:00:00 +0800"><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="5.01"/><WorkoutEvent date="2026-01-02 09:01:00 +0800" type="HKWorkoutEventTypePause"/><WorkoutRoute><FileReference path="/workout-routes/one.gpx"/></WorkoutRoute></Workout>';
		const cda = "<ClinicalDocument><observation/></ClinicalDocument><observation/>";
		const source = [
			input("apple_health_export/garbled-name.data", document(workout), 3),
			input("apple_health_export/workout-routes/one.gpx", route, 7),
			input("apple_health_export/electrocardiograms/one.csv", csv, 1),
			input("apple_health_export/export_cda.xml", cda),
			input("apple_health_export/unknown.bin", new Uint8Array([255, 254, 0, 5])),
		];
		const io = staging();
		const onProgress = vi.fn();
		const result = await parseHealthExport(source, io, { onProgress });
		expect(result).toMatchObject({
			recordCount: 2,
			xmlRecordCount: 0,
			routePointCount: 2,
			ecgSampleCount: 4,
		});
		expect(result.days[0]?.summary.routePaths).toEqual(["workout-routes/one.gpx"]);
		for (const [path, expected] of [
			["workout-routes/one.gpx", route],
			["electrocardiograms/one.csv", csv],
			["export_cda.xml", cda],
		]) {
			const file = result.files.find((file) => file.path === path);
			const raw = Buffer.concat(
				await Promise.all((file?.parts ?? []).map((value) => decodeHealthPart(value))),
			);
			expect(raw.equals(Buffer.from(expected as string))).toBe(true);
			expect(file?.contentHash).toBe(
				digest(
					JSON.stringify(file?.parts.map((part) => [part.part, part.rawBytes, part.contentHash])),
				),
			);
		}
		const metaFile = result.files.find((file) => file.path.endsWith(".metadata.json"));
		const metadata = JSON.parse(
			Buffer.from(await decodeHealthPart(metaFile?.parts[0] as HealthFilePart)).toString(),
		);
		expect(metadata.root.attributes).toEqual({ locale: "zh_CN" });
		expect(metadata.root.children.map((entry: HealthNode) => entry.name)).toEqual([
			"ExportDate",
			"Me",
		]);
		expect(metadata.prolog.map((entry: HealthNode) => entry.name)).toEqual(["#xml", "#doctype"]);
		const ecg = result.days[0]?.data.series.find(
			(series) => series.dimension === "Electrocardiogram",
		) as HealthSeries;
		expect(nodes(ecg)[0]?.attributes).toMatchObject({
			startDate: "2026-01-02 09:00:00 +0800",
			samplingHz: "2",
			classification: "窦性心律",
			averageHeartRate: "63",
			durationSeconds: "2",
			sampleCount: "4",
			unit: "µV",
			filePath: "electrocardiograms/one.csv",
		});
		expect(
			nodes(ecg)[0]?.children?.find((entry) => entry.attributes.key === "设备")?.attributes.value,
		).toBe("Watch6,18");
		expect(io.clear).toHaveBeenCalledOnce();
		expect(onProgress).toHaveBeenLastCalledWith(
			expect.objectContaining({
				phase: "complete",
				bytesRead: source.reduce((sum, file) => sum + file.size, 0),
				recordCount: 2,
			}),
		);
	});

	it("returns the same canonical hashes for reordered input and XML attributes", async () => {
		const a = record('version="1"', '<MetadataEntry value="x" key="sync"/>');
		const b = record('version="2"');
		const first = await plan(a + b);
		const second = await plan(
			b +
				a
					.replace('version="1"', "")
					.replace("<Record ", '<Record version="1" ')
					.replace('value="x" key="sync"', 'key="sync" value="x"'),
		);
		expect(first.days).toEqual(second.days);
		expect((await plan(b)).days[0]?.contentHash).not.toBe(first.days[0]?.contentHash);
		expect((await plan(a + b)).days).toEqual(first.days);
	});

	it("keeps UTC bucket boundaries, date precision, unusual dates and undated metadata", async () => {
		const result = await plan(
			'<Record type="Height" startDate="1970-01-01 08:24:32 +0800" value="x"/>' +
				'<Record type="X" startDate="2026-01-02T00:30:00+0800" endDate="2026-01-01T23:00:00+0800"/>' +
				'<UnknownMeta key="keep">raw</UnknownMeta>' +
				'<Record startDate="2026-01-02T02"/><Record startDate="2026-01-02T02:30"/><ActivitySummary dateComponents="2026-01-02"/>' +
				'<Unknown startDate="2026-01-02T03:00:00">raw text</Unknown>',
		);
		expect(result.days.map((day) => day.utcDay)).toEqual([0, UTC_DAY - HEALTH_DAY_MS, UTC_DAY]);
		expect(result.warnings).toHaveLength(3);
		const day = result.days[2] as HealthDay;
		const all = (
			await Promise.all(
				day.data.series.map((series) => decodeHealthSeries(series, day.utcDay, UTC_DAY)),
			)
		).flat();
		expect(all.map((event) => event.precision).sort()).toEqual(["day", "hour", "minute", "second"]);
		expect(all.find((event) => event.title === "Unknown")?.data).toMatchObject({
			_healthText: "raw text",
		});
		expect(
			(
				await decodeHealthSeries(
					day.data.series.find((series) => series.dimension === "Record") as HealthSeries,
					UTC_DAY,
					UTC_DAY,
					{ start: UTC_DAY + 2.25 * 3600000, end: UTC_DAY + 3 * 3600000 },
				)
			).map((event) => event.precision),
		).toEqual(["minute"]);
	});

	it("stages bounded record batches and deterministically splits oversized dimensions", async () => {
		const rows = Array.from({ length: 2200 }, (_, i) =>
			record(`sequence="${i}" payload="${Buffer.from(randomBytes(220)).toString("hex")}"`),
		).join("");
		const io = staging();
		const first = await parseHealthExport([input("export.xml", document(rows), 150000)], io);
		const second = await plan(rows);
		expect(vi.mocked(io.append).mock.calls.length).toBeGreaterThan(1);
		expect(first.seriesCount).toBeGreaterThan(1);
		expect(first.days).toEqual(second.days);
		expect(first.days[0]?.data.series.map((series) => series.part)).toEqual(
			Array.from({ length: first.seriesCount }, (_, i) => i),
		);
		expect(
			first.days[0]?.data.series.every(
				(series) => series.payloadBytes <= HEALTH_LIMITS.seriesBytes,
			),
		).toBe(true);
		expect(await validateHealthDay(first.days[0])).toEqual(first.days[0]);
	}, 30000);

	it("splits by decoded limits even when repetitive content compresses well", async () => {
		const text = record(`value2="${"x".repeat(10000)}"`);
		const result = await plan(text.repeat(850));
		expect(result.seriesCount).toBe(2);
		expect(result.days[0]?.recordCount).toBe(850);
		expect(await validateHealthDay(result.days[0])).toEqual(result.days[0]);
	}, 30000);

	it("partitions original attachments at exactly 512 KiB without changing bytes", async () => {
		const raw = randomBytes(HEALTH_LIMITS.filePartRawBytes + 37);
		const result = await plan(record(), [
			input("original.bin", raw),
			input("empty.bin", new Uint8Array()),
		]);
		const file = result.files.find((entry) => entry.path === "original.bin");
		expect(file?.parts.map((entry) => entry.rawBytes)).toEqual([
			HEALTH_LIMITS.filePartRawBytes,
			37,
		]);
		expect(
			Buffer.concat(await Promise.all((file?.parts ?? []).map(decodeHealthPart))).equals(raw),
		).toBe(true);
		expect(
			(
				await decodeHealthPart(
					result.files.find((entry) => entry.path === "empty.bin")?.parts[0] as HealthFilePart,
				)
			).length,
		).toBe(0);
	});

	it("preserves unknown ECG metadata without inventing a sampling rate, mean rate or duration", async () => {
		const result = await plan(record(), [
			input(
				"one.csv",
				'Recorded Date,2026-01-02T01:00:00Z\nClassification,unclassified\nUnknown,"a,b"\n1\n2\n',
			),
		]);
		const ecg = result.days[0]?.data.series.find(
			(entry) => entry.dimension === "Electrocardiogram",
		) as HealthSeries;
		expect(nodes(ecg)[0]?.attributes).toMatchObject({
			samplingHz: "",
			averageHeartRate: "",
			durationSeconds: "",
			unit: "",
			classification: "unclassified",
		});
		expect(result.warnings).toHaveLength(1);
		expect(result.files.find((file) => file.kind === "ecg")).toMatchObject({
			firstAt: UTC_DAY + 3600000,
			lastAt: UTC_DAY + 3600000,
		});
	});

	it.each([
		[
			"missing reference",
			`<Workout startDate="2026-01-02"><FileReference path="/missing.gpx"/></Workout>`,
		],
		[
			"unsafe reference",
			`<Workout startDate="2026-01-02"><FileReference path="../escape.gpx"/></Workout>`,
		],
		["invalid date", `<Record startDate="2026-02-30"/>`],
		[
			"too deep",
			`<Record startDate="2026-01-02">${"<Nested>".repeat(66)}${"</Nested>".repeat(66)}</Record>`,
		],
		["truncated XML", record().replace("</Record>", "")],
		["no dated nodes", "<Unknown>kept</Unknown>"],
	])("fails before a plan for %s and cleans private staging", async (_case, body) => {
		const io = staging();
		await expect(parseHealthExport([input("export.xml", document(body))], io)).rejects.toThrow();
		expect(io.clear).toHaveBeenCalledOnce();
	});

	it.each([
		["empty export", []],
		["wrong XML root", [input("export.xml", "<Other/>")]],
		[
			"multiple main documents",
			[input("a.xml", document(record())), input("b.xml", document(record()))],
		],
		["duplicate paths", [input("a", "a"), input("a", "b")]],
		["invalid size", [{ ...input("a", "a"), size: -1 }]],
		["size overrun", [{ ...input("a", document(record())), size: 3 }]],
		["size underrun", [{ ...input("a", document(record())), size: 100000 }]],
		["unsafe input path", [input("../a.xml", document(record()))]],
		["invalid UTF-8", [input("a.xml", new Uint8Array([255, 255]))]],
		["oversized XML header", [input("a.xml", `${" ".repeat(1024 * 1024 + 1)}<HealthData/>`)]],
		["truncated XML header", [input("a.xml", '<?xml version="1.0"?><HealthData')]],
		[
			"custom entity",
			[input("a.xml", '<!DOCTYPE HealthData [<!ENTITY danger "bad">]><HealthData/>')],
		],
	])("rejects %s", async (_case, files) => {
		await expect(parseHealthExport(files as HealthInputFile[], staging())).rejects.toThrow();
	});

	it("rejects metadata-path collisions and invalid ECG attachments", async () => {
		await expect(plan(record(), [input("导出.xml.metadata.json", "x")])).rejects.toThrow(
			"路径重复",
		);
		await expect(plan(record(), [input("ecg.csv", "Classification,Unknown\n1\n")])).rejects.toThrow(
			"真实记录时间",
		);
		await expect(plan(record(), [input("ecg.csv", "记录日期,2026-01-02\n")])).rejects.toThrow(
			"真实记录时间",
		);
		const io = staging();
		await io.append(new Map([[UTC_DAY, []]]));
		await expect(parseHealthExport([input("a.xml", document(record()))], io)).rejects.toThrow(
			"空的临时",
		);
	});

	it("propagates stream failures and aborts without returning a partial plan", async () => {
		const file: HealthInputFile = {
			path: "a.xml",
			size: 10,
			stream: () =>
				new ReadableStream({
					start(controller) {
						controller.error(new Error("CRC failed"));
					},
				}),
		};
		const io = staging();
		await expect(parseHealthExport([file], io)).rejects.toThrow("CRC failed");
		expect(io.clear).toHaveBeenCalledOnce();
		const controller = new AbortController();
		controller.abort(new Error("stop"));
		await expect(parseHealthExport([], staging(), { signal: controller.signal })).rejects.toThrow(
			"stop",
		);
		const midway = new AbortController();
		await expect(
			parseHealthExport([input("a.xml", document(record().repeat(50)), 128)], staging(), {
				signal: midway.signal,
				onProgress: (progress) => {
					if (progress.bytesRead > 1000) midway.abort(new Error("midway"));
				},
			}),
		).rejects.toThrow("midway");
	});
});

describe("health trust boundary", () => {
	it.each([
		null,
		[],
		{},
		{ utcDay: 1 },
		{ utcDay: Infinity },
		{ utcDay: 8640000000000000 },
		{ utcDay: UTC_DAY, data: {} },
		{ utcDay: UTC_DAY, data: { v: 2, series: [] } },
	])("rejects invalid day structure %j", async (value) => {
		await expect(validateHealthDay(value)).rejects.toThrow();
	});

	it("verifies day metadata, series metadata, canonical content and dimension ordering", async () => {
		const original = (await plan()).days[0] as HealthDay;
		for (const key of [
			"recordCount",
			"firstAt",
			"lastAt",
			"payloadBytes",
			"contentHash",
		] as const) {
			await expect(
				validateHealthDay({ ...original, [key]: key === "contentHash" ? "f".repeat(64) : 0 }),
			).rejects.toThrow("统计或内容哈希");
		}
		await expect(
			validateHealthDay({ ...original, summary: { ...original.summary, sources: ["fake"] } }),
		).rejects.toThrow("摘要");
		for (const patch of [
			{ recordCount: 9 },
			{ firstAt: 0 },
			{ lastAt: 0 },
			{ dimension: "Other" },
			{ dimension: "" },
			{ dimension: "x".repeat(257) },
			{ part: -1 },
			{ part: 1.5 },
			{ part: 1 },
		]) {
			const bad = structuredClone(original);
			Object.assign(bad.data.series[0] as HealthSeries, patch);
			await expect(validateHealthDay(bad)).rejects.toThrow();
		}
		const bad = structuredClone(original);
		bad.data.series.push({ ...(bad.data.series[0] as HealthSeries) });
		await expect(validateHealthDay(bad)).rejects.toThrow("连续递增");
		const multiple = (await plan(`${record()}<ActivitySummary dateComponents="2026-01-02"/>`))
			.days[0] as HealthDay;
		multiple.data.series.reverse();
		await expect(validateHealthDay(multiple)).rejects.toThrow("必须排序");
	});

	it("bounds gzip expansion and rejects invalid, truncated, tampered and noncanonical base64", async () => {
		const original = part(encoder.encode("private original"));
		for (const change of [
			{ part: -1 },
			{ body: "!" },
			{ body: "a===", payloadBytes: 4 },
			{ body: "abc", payloadBytes: 3 },
			{ payloadBytes: 0 },
			{ rawBytes: -1 },
			{ rawBytes: 1.5 },
			{ rawBytes: HEALTH_LIMITS.filePartRawBytes + 1 },
			{ contentHash: "invalid" },
			{ contentHash: "0".repeat(64) },
			{ rawBytes: original.rawBytes + 1 },
			{ rawBytes: 1 },
			{ body: "ab==", payloadBytes: 4 },
			{ body: Buffer.from("not gzip").toString("base64"), payloadBytes: 12 },
		]) {
			await expect(decodeHealthPart({ ...original, ...change })).rejects.toThrow();
		}
		const truncated = original.body.slice(0, -8);
		await expect(
			decodeHealthPart({ ...original, body: truncated, payloadBytes: truncated.length }),
		).rejects.toThrow();
		const bomb = part(new Uint8Array(HEALTH_LIMITS.filePartRawBytes + 100));
		await expect(
			decodeHealthPart({ ...bomb, rawBytes: HEALTH_LIMITS.filePartRawBytes }),
		).rejects.toThrow("硬上限");
	});

	it("recomputes canonical node structure instead of trusting a valid outer hash", async () => {
		const original = (await plan()).days[0]?.data.series[0] as HealthSeries;
		const [valid] = nodes(original);
		const badNodes: unknown[] = [
			null,
			[],
			{ ...valid, name: "" },
			{ ...valid, name: "x".repeat(513) },
			{ ...valid, extra: 1 },
			{ ...valid, attributes: [] },
			{ ...valid, attributes: { startDate: 42 } },
			{ ...valid, children: 42 },
			{ ...valid, text: 42 },
			{ ...valid, attributes: {} },
			{ ...valid, attributes: { ...(valid as HealthNode).attributes, startDate: "2026-01-03" } },
		];
		for (const value of badNodes) {
			await expect(
				decodeHealthSeries(serializedNodes([value as HealthNode]), UTC_DAY, UTC_DAY),
			).rejects.toThrow();
		}
		await expect(decodeHealthSeries(serializedNodes([]), UTC_DAY, UTC_DAY)).rejects.toThrow(
			"不能为空",
		);
		const extraWhitespace = JSON.stringify([valid], null, 2);
		const body = Buffer.from(gzipSync(extraWhitespace)).toString("base64");
		await expect(
			decodeHealthSeries(
				{
					...original,
					body,
					rawBytes: Buffer.byteLength(extraWhitespace),
					payloadBytes: body.length,
					contentHash: digest(extraWhitespace),
				},
				UTC_DAY,
				UTC_DAY,
			),
		).rejects.toThrow("规范 JSON");
		const invalidJson = "invalid JSON";
		const encoded = Buffer.from(gzipSync(invalidJson)).toString("base64");
		await expect(
			decodeHealthSeries(
				{
					...original,
					body: encoded,
					rawBytes: invalidJson.length,
					payloadBytes: encoded.length,
					contentHash: digest(invalidJson),
				},
				UTC_DAY,
				UTC_DAY,
			),
		).rejects.toThrow();
	});

	it("rejects invalid read windows and keeps a spanning record on both sides of midnight", async () => {
		const result = await plan(
			'<Record type="Sleep" startDate="2026-01-02T23:30:00Z" endDate="2026-01-03T01:00:00Z"/>',
		);
		const series = result.days[0]?.data.series[0] as HealthSeries;
		expect(
			await decodeHealthSeries(series, UTC_DAY, UTC_DAY, {
				start: UTC_DAY + HEALTH_DAY_MS,
				end: UTC_DAY + 2 * HEALTH_DAY_MS,
			}),
		).toHaveLength(1);
		expect(
			await decodeHealthSeries(series, UTC_DAY, UTC_DAY, {
				start: UTC_DAY,
				end: UTC_DAY + 3600000,
			}),
		).toHaveLength(0);
		for (const window of [
			{ start: 1, end: 1 },
			{ start: NaN, end: 1 },
			{ start: 0, end: Infinity },
		])
			await expect(decodeHealthSeries(series, UTC_DAY, UTC_DAY, window)).rejects.toThrow();
		await expect(decodeHealthSeries(series, UTC_DAY, NaN)).rejects.toThrow();
	});
});

describe("health attachment projections", () => {
	it("preserves native segment breaks even when samples are only seconds apart", () => {
		const point = (time: string, tag = "trkpt") =>
			`<${tag} lat="31" lon="121"><time>${time}</time></${tag}>`;
		const xml = `<gpx><trk><trkseg>${point("2026-01-02T01:00:00Z")}${point("2026-01-02T01:00:01Z")}</trkseg><trkseg>${point("2026-01-02T01:00:02Z")}${point("2026-01-02T01:00:03Z")}</trkseg></trk><rte>${point("2026-01-02T01:00:04Z", "rtept")}${point("2026-01-02T01:00:05Z", "rtept")}</rte>${point("2026-01-02T01:00:06Z", "wpt")}${point("2026-01-02T01:00:07Z", "wpt")}</gpx>`;
		const points = healthRoutePoints(encoder.encode(xml));
		expect(points.map((point) => point.breakBefore)).toEqual([
			true,
			false,
			true,
			false,
			true,
			false,
			true,
			true,
		]);
		expect(points.every((point) => point.precision === "second")).toBe(true);
	});

	it("infers route precision from the original clock and excludes offset colons", () => {
		const points = healthRoutePoints(
			encoder.encode(
				`<gpx>${["2026-01-02", "2026-01-02T09+08:00", "2026-01-02t09:30+08:00", "2026-01-02T09:30:00.123+08:00"].map((time) => `<wpt lat="0" lon="0"><time>${time}</time></wpt>`).join("")}</gpx>`,
			),
		);
		expect(points.map((point) => point.precision)).toEqual(["day", "hour", "minute", "second"]);
		expect(points.map((point) => point.occurredAt)).toEqual([
			"2026-01-02T00:00:00.000Z",
			"2026-01-02T01:00:00.000Z",
			"2026-01-02T01:30:00.000Z",
			"2026-01-02T01:30:00.123Z",
		]);
	});

	it("decodes geographic fields and retains negative/missing raw speed", () => {
		const points = healthRoutePoints(encoder.encode(route));
		expect(points).toHaveLength(2);
		expect(points[0]).toMatchObject({
			occurredAt: "2026-01-02T01:00:00.123Z",
			elevation: 2.5,
			speed: -1,
		});
		expect(points[1]).toMatchObject({ speed: null, elevation: null });
		expect(
			healthRoutePoints(
				encoder.encode(
					'<gpx><rte><rtept lat="0" lon="0"><time><![CDATA[2026-01-02T01:00:00Z]]></time></rtept></rte><wpt lat="1" lon="2"><time>2026-01-02T02:00:00</time></wpt></gpx>',
				),
			),
		).toHaveLength(2);
	});

	it.each([
		"<bad/>",
		"<!DOCTYPE gpx><gpx/>",
		'<gpx><wpt lat="NaN" lon="0"><time>2026-01-02</time></wpt></gpx>',
		'<gpx><wpt lat="91" lon="0"><time>2026-01-02</time></wpt></gpx>',
		'<gpx><wpt lat="0" lon="181"><time>2026-01-02</time></wpt></gpx>',
		'<gpx><wpt lat="0" lon="0"/></gpx>',
		'<gpx><wpt lat="0" lon="0"><time>2026-01-02</time><time>2026-01-02</time></wpt></gpx>',
		'<gpx><wpt lat="0" lon="0"><wpt lat="0" lon="0"/></wpt></gpx>',
		`<gpx><wpt lat="0" lon="0"><time>${"x".repeat(257)}</time></wpt></gpx>`,
		`<gpx>${"<nested>".repeat(65)}${"</nested>".repeat(65)}</gpx>`,
	])("rejects an invalid route projection", (xml) => {
		expect(() => healthRoutePoints(encoder.encode(xml))).toThrow();
	});

	it("reads Chinese and English ECG headers without rounding samples", () => {
		expect(healthEcg(encoder.encode(csv))).toMatchObject({
			samplingHz: 2,
			samples: [1.25, -2.5, 3, 0],
			metadata: { 设备: "Watch6,18", 单位: "µV" },
		});
		expect(healthEcg(encoder.encode('Sampling Rate,512 Hz\nLabel,"a,b"\n1e-9\n'))).toMatchObject({
			samplingHz: 512,
			samples: [1e-9],
			metadata: { Label: "a,b" },
		});
		expect(healthEcg(encoder.encode("Sampling rate,100\n0\n")).samplingHz).toBe(100);
		for (const rate of ["0", "unknown", "1.2.3", "1".repeat(500)])
			expect(healthEcg(encoder.encode(`采样速率,${rate}\n1\n`)).samplingHz).toBeNull();
		for (const text of [
			'Label,"unterminated\n',
			"Sampling Rate,2\nNaN\n",
			"1e999\n",
			"1\nLabel,value\n",
		])
			expect(() => healthEcg(encoder.encode(text))).toThrow();
	});

	it.each([
		"",
		"/absolute",
		"../up",
		"a/./b",
		"a//b",
		"a/../b",
		"C:/x",
		"a\\b",
		"a\0b",
		"a\u007fb",
		"a".repeat(2049),
	])("rejects unsafe paths", (path) => {
		expect(() => healthFilePath(path)).toThrow();
	});
});
