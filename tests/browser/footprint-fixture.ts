import { type APIRequestContext, expect } from "@playwright/test";
import type { FootprintImportSession } from "../../src/models/data-management";
import { parseFootprint } from "../../src/models/footprint";
import type { ImportRecord } from "../../src/models/types";

/** Synthetic fixture through the same complete-day API used by browser uploads. */
export async function importFootprintFixture(request: APIRequestContext, records: ImportRecord[]) {
	async function* input() {
		yield new TextEncoder().encode(
			`<gpx><trk><trkseg>${records
				.map((record) => {
					const point = record.data as { latitude: number; longitude: number };
					return `<trkpt lat="${point.latitude}" lon="${point.longitude}"><time>${record.occurredAt}</time></trkpt>`;
				})
				.join("")}</trkseg></trk></gpx>`,
		);
	}
	const plan = await parseFootprint(input());
	const started = await request.post("/api/data/footprint/imports", {
		data: {
			fileName: "synthetic.gpx",
			totalDays: plan.days.length,
			totalPoints: plan.pointCount,
			target: "test",
			channel: "web",
		},
	});
	expect(started.ok()).toBe(true);
	const { data: session } = (await started.json()) as { data: FootprintImportSession };
	const batch = await request.put(`/api/data/footprint/imports/${session.id}/batches/1`, {
		data: { days: plan.days },
	});
	expect(batch.ok()).toBe(true);
	const finished = await request.post(`/api/data/footprint/imports/${session.id}/finish`, {
		data: { status: "complete" },
	});
	expect(finished.ok()).toBe(true);
}
