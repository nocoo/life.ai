import { createHash } from "node:crypto";
import { type APIRequestContext, expect } from "@playwright/test";
import type { ImportRecord } from "../../src/models/types";
import { healthFixtureDays } from "../health-fixture";

export function syntheticLargeHealthAttachment() {
	const bytes = new Uint8Array(512 * 1024);
	// Hashed counters provide reproducible bytes that remain large after gzip.
	for (let offset = 0; offset < bytes.length; offset += 32)
		bytes.set(createHash("sha256").update(`life-health-attachment-${offset}`).digest(), offset);
	return {
		path: "attachments/incompressible.bin",
		bytes,
		xml: '<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_US"><ExportDate value="2026-10-23 00:00:00 +0000"/><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Large attachment fixture" unit="count/min" startDate="2026-10-23 01:02:03 +0000" endDate="2026-10-23 01:02:03 +0000" value="72"/></HealthData>',
	};
}

export async function importHealthFixture(
	request: APIRequestContext,
	records: Pick<ImportRecord, "occurredAt" | "endAt" | "data">[],
) {
	const days = await healthFixtureDays(records);
	const started = await request.post("/api/data/apple-health/imports", {
		data: {
			fileName: "synthetic-health.zip",
			target: "test",
			channel: "web",
			totalDays: days.length,
			totalRecords: days.reduce((sum, day) => sum + day.recordCount, 0),
			files: [],
		},
	});
	expect(started.ok(), await started.text()).toBe(true);
	const { data: session } = (await started.json()) as { data: { id: string } };
	for (const [index, day] of days.entries()) {
		const result = await request.put(
			`/api/data/apple-health/imports/${session.id}/batches/${index + 1}`,
			{ data: { days: [day] } },
		);
		expect(result.ok(), await result.text()).toBe(true);
	}
	const finish = await request.post(`/api/data/apple-health/imports/${session.id}/finish`, {
		data: { status: "complete" },
	});
	expect(finish.ok(), await finish.text()).toBe(true);
}
