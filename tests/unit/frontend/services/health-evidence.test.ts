import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { packHealthDay } from "../../../../src/models/apple-health";
import type {
	HealthFileManifest,
	HealthFilePart,
	StoredHealthSeries,
} from "../../../../src/models/health-types";
import { createHealthClient } from "../../../../src/services/health-client";
import {
	fetchEcgWaveform,
	fetchHealthAttachment,
	fetchHealthEvents,
	fetchWorkoutRoute,
} from "../../../../src/services/health-evidence";

const start = "2026-09-13T00:00:00.000Z";
const end = "2026-09-14T00:00:00.000Z";
function archive(path: string, kind: "route" | "ecg", chunks: string[]) {
	const parts: HealthFilePart[] = chunks.map((text, part) => {
		const raw = Buffer.from(text);
		const body = Buffer.from(gzipSync(raw)).toString("base64");
		return {
			part,
			rawBytes: raw.length,
			payloadBytes: body.length,
			body,
			contentHash: createHash("sha256").update(raw).digest("hex"),
		};
	});
	const manifest: HealthFileManifest = {
		path,
		kind,
		firstAt: null,
		lastAt: null,
		recordCount: 1,
		rawBytes: parts.reduce((sum, part) => sum + part.rawBytes, 0),
		contentHash: createHash("sha256")
			.update(JSON.stringify(parts.map((part) => [part.part, part.rawBytes, part.contentHash])))
			.digest("hex"),
		parts: parts.map(({ body: _body, ...part }) => part),
	};
	const api = createHealthClient({ fetchFn: vi.fn() });
	vi.spyOn(api, "file").mockResolvedValue(manifest);
	vi.spyOn(api, "filePart").mockImplementation(async (_path, part) => {
		const found = parts[part];
		if (!found) throw new Error("Missing fixture part");
		return found;
	});
	return { parts, manifest, api };
}

describe("lossless health evidence reads", () => {
	it("loads all dimensions, retaining nested metadata and clipping each decoded UTC interval", async () => {
		const day = await packHealthDay(Date.parse(start), [
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierHeartRate",
					startDate: "2026-09-13T01:00:00+00:00",
					value: "85",
					unit: "count/min",
					sourceName: "Watch",
				},
				children: [{ name: "MetadataEntry", attributes: { key: "context", value: "rest" } }],
			},
			{
				name: "Record",
				attributes: {
					type: "HKQuantityTypeIdentifierBodyMass",
					startDate: "2026-09-13T03:00:00+00:00",
					value: "70",
					unit: "kg",
				},
			},
		]);
		const series: StoredHealthSeries[] = day.data.series.map((row) => ({
			...row,
			utcDay: day.utcDay,
			updatedAt: day.utcDay,
		}));
		const api = createHealthClient({ fetchFn: vi.fn() });
		vi.spyOn(api, "series").mockResolvedValue({ series });
		const signal = new AbortController().signal;
		const events = await fetchHealthEvents(start, end, signal, api);
		expect(events).toHaveLength(2);
		expect(events.find((event) => event.title === "HeartRate")?.data).toMatchObject({
			sourceName: "Watch",
			_healthChildren: [{ name: "MetadataEntry", attributes: { key: "context", value: "rest" } }],
		});
		expect(api.series).toHaveBeenCalledWith(start, end, false, signal);
		expect(
			await fetchHealthEvents("2026-09-13T02:00:00Z", "2026-09-13T03:00:00Z", undefined, api),
		).toEqual([]);
		await expect(fetchHealthEvents(start, end, AbortSignal.abort(), api)).rejects.toMatchObject({
			name: "AbortError",
		});
	});
	it("supports default transport and empty ranges without inventing records", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { series: [] } })),
		);
		expect(await fetchHealthEvents(start, end)).toEqual([]);
	});
	it("reassembles verified original bytes across compression part boundaries", async () => {
		const file = archive("electrocardiograms/heart.csv", "ecg", [
			"采样速率,512 Hz\n",
			"1\n-3\n9\n",
		]);
		expect(
			new TextDecoder().decode(
				await fetchHealthAttachment(file.manifest.path, "ecg", undefined, file.api),
			),
		).toBe("采样速率,512 Hz\n1\n-3\n9\n");
		expect(file.api.filePart).toHaveBeenCalledTimes(2);
	});
	it.each([
		{ path: "wrong.csv" },
		{ kind: "cda" as const },
		{ rawBytes: 0 },
		{ rawBytes: -1 },
		{ rawBytes: 1.5 },
		{ rawBytes: Number.MAX_SAFE_INTEGER + 1 },
		{ rawBytes: 4 * 1024 * 1024 + 1 },
		{ parts: [] },
	])("rejects invalid or oversized ECG manifests before downloading: %j", async (mutation) => {
		const file = archive("ecg.csv", "ecg", ["1\n"]);
		Object.assign(file.manifest, mutation);
		await expect(fetchHealthAttachment("ecg.csv", "ecg", undefined, file.api)).rejects.toThrow(
			"类型或大小",
		);
		expect(file.api.filePart).not.toHaveBeenCalled();
	});
	it("enforces the separate route limit and ordered complete part manifest", async () => {
		const file = archive("workout-routes/ride.gpx", "route", ["gpx"]);
		file.manifest.rawBytes = 32 * 1024 * 1024 + 1;
		await expect(
			fetchHealthAttachment(file.manifest.path, "route", undefined, file.api),
		).rejects.toThrow("类型或大小");
		file.manifest.rawBytes = 3;
		const first = file.manifest.parts[0];
		if (!first) throw new Error("fixture");
		first.part = 1;
		await expect(
			fetchHealthAttachment(file.manifest.path, "route", undefined, file.api),
		).rejects.toThrow("分块不完整");
		expect(file.api.filePart).not.toHaveBeenCalled();
	});
	it.each([{ part: 1 }, { contentHash: "0".repeat(64) }, { rawBytes: 9 }, { payloadBytes: 8 }])(
		"rejects a concurrent attachment replacement: %j",
		async (mutation) => {
			const file = archive("ecg.csv", "ecg", ["1\n"]);
			Object.assign(file.parts[0] as HealthFilePart, mutation);
			await expect(fetchHealthAttachment("ecg.csv", "ecg", undefined, file.api)).rejects.toThrow(
				"已更新",
			);
		},
	);
	it("validates original hashes even if transport metadata agrees", async () => {
		const file = archive("ecg.csv", "ecg", ["1\n"]);
		const part = file.parts[0];
		const descriptor = file.manifest.parts[0];
		if (!part || !descriptor) throw new Error("fixture");
		part.contentHash = descriptor.contentHash = "0".repeat(64);
		await expect(fetchHealthAttachment("ecg.csv", "ecg", undefined, file.api)).rejects.toThrow(
			"SHA-256",
		);
	});
	it.each([
		[1, "大小不符"],
		[3, "缺少分块"],
	])("rejects an assembled size of %s inconsistent with the file", async (size, message) => {
		const file = archive("ecg.csv", "ecg", ["1\n"]);
		file.manifest.rawBytes = Number(size);
		await expect(fetchHealthAttachment("ecg.csv", "ecg", undefined, file.api)).rejects.toThrow(
			String(message),
		);
	});
	it("checks cancellation before parts and again after the final verified part", async () => {
		const file = archive("ecg.csv", "ecg", ["1\n"]);
		await expect(
			fetchHealthAttachment("ecg.csv", "ecg", AbortSignal.abort(), file.api),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(file.api.filePart).not.toHaveBeenCalled();
		const controller = new AbortController();
		vi.mocked(file.api.filePart).mockImplementation(async () => {
			controller.abort();
			return file.parts[0] as HealthFilePart;
		});
		await expect(
			fetchHealthAttachment("ecg.csv", "ecg", controller.signal, file.api),
		).rejects.toMatchObject({ name: "AbortError" });
	});
	it("deduplicates route paths, preserves native segments and parses full ECG samples", async () => {
		const route = archive("workout-routes/ride.gpx", "route", [
			'<gpx><trk><trkseg><trkpt lat="31" lon="121"><time>2026-09-13T01:00:00.125Z</time></trkpt></trkseg><trkseg><trkpt lat="31.001" lon="121.001"><time>2026-09-13T01:00:01.125Z</time></trkpt></trkseg></trk></gpx>',
		]);
		const ecg = archive("electrocardiograms/heart.csv", "ecg", [
			"Sampling Rate,512 Hz\nUnit,µV\n0\n1\n920\n-10\n",
		]);
		const calls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn<typeof fetch>().mockImplementation(async (input) => {
				const url = new URL(String(input), "https://life.invalid");
				const path = url.searchParams.get("path");
				calls.push(path ?? "");
				const file = path === route.manifest.path ? route : ecg;
				return Response.json({
					data: url.searchParams.has("part")
						? file.parts[Number(url.searchParams.get("part"))]
						: file.manifest,
				});
			}),
		);
		const points = await fetchWorkoutRoute([route.manifest.path, route.manifest.path]);
		expect(points).toHaveLength(2);
		expect(points[1]?.breakBefore).toBe(true);
		expect(points[0]?.occurredAt).toBe("2026-09-13T01:00:00.125Z");
		expect(calls).toEqual([route.manifest.path, route.manifest.path]);
		expect(await fetchEcgWaveform(ecg.manifest.path)).toMatchObject({
			samplingHz: 512,
			samples: [0, 1, 920, -10],
			metadata: { Unit: "µV" },
		});
		expect(await fetchWorkoutRoute([])).toEqual([]);
	});
});
