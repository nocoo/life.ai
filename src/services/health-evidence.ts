import {
	decodeHealthPart,
	decodeHealthSeries,
	healthEcg,
	healthRoutePoints,
} from "../models/apple-health";
import type { LifeEvent } from "../models/types";
import { createHealthClient, type HealthClient } from "./health-client";

export async function fetchHealthEvents(
	start: string,
	end: string,
	signal?: AbortSignal,
	client = createHealthClient(),
): Promise<LifeEvent[]> {
	const { series } = await client.series(start, end, false, signal);
	const events: LifeEvent[] = [];
	for (const row of series) {
		signal?.throwIfAborted();
		events.push(
			...(await decodeHealthSeries(row, row.utcDay, row.updatedAt, {
				start: Date.parse(start),
				end: Date.parse(end),
			})),
		);
	}
	return events;
}

/** Only small narrative attachments are materialized. CDA remains an archived original. */
export async function fetchHealthAttachment(
	path: string,
	kind: "route" | "ecg",
	signal?: AbortSignal,
	client: HealthClient = createHealthClient(),
): Promise<Uint8Array> {
	const file = await client.file(path, signal);
	const limit = kind === "route" ? 32 * 1024 * 1024 : 4 * 1024 * 1024;
	if (
		file.path !== path ||
		file.kind !== kind ||
		!Number.isSafeInteger(file.rawBytes) ||
		file.rawBytes < 1 ||
		file.rawBytes > limit ||
		!file.parts.length
	)
		throw new Error("健康附件的类型或大小不符合读取要求。");
	const bytes = new Uint8Array(file.rawBytes);
	let offset = 0;
	for (const [index, expected] of file.parts.entries()) {
		signal?.throwIfAborted();
		if (expected.part !== index) throw new Error("健康附件分块不完整。");
		const part = await client.filePart(path, index, signal);
		if (
			part.part !== expected.part ||
			part.contentHash !== expected.contentHash ||
			part.rawBytes !== expected.rawBytes ||
			part.payloadBytes !== expected.payloadBytes
		)
			throw new Error("健康附件已更新，请重新载入。");
		const decoded = await decodeHealthPart(part);
		if (offset + decoded.length > bytes.length) throw new Error("健康附件大小不符。");
		bytes.set(decoded, offset);
		offset += decoded.length;
	}
	if (offset !== bytes.length) throw new Error("健康附件缺少分块。");
	signal?.throwIfAborted();
	return bytes;
}

export async function fetchWorkoutRoute(paths: string[], signal?: AbortSignal) {
	const points = [] as ReturnType<typeof healthRoutePoints>;
	for (const path of [...new Set(paths)])
		points.push(...healthRoutePoints(await fetchHealthAttachment(path, "route", signal)));
	return points;
}

export async function fetchEcgWaveform(path: string, signal?: AbortSignal) {
	return healthEcg(await fetchHealthAttachment(path, "ecg", signal));
}
