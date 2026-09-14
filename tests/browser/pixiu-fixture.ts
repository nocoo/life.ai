import { type APIRequestContext, expect } from "@playwright/test";
import Papa from "papaparse";
import { PIXIU_COLUMNS, type PixiuRow, parsePixiu } from "../../src/models/pixiu";

export function pixiuCsv(rows: PixiuRow[]) {
	return Papa.unparse({ fields: [...PIXIU_COLUMNS], data: rows });
}

export async function importPixiuFixture(request: APIRequestContext, rows: PixiuRow[]) {
	const plan = await parsePixiu([{ name: "synthetic.csv", text: pixiuCsv(rows) }]);
	const start = await request.post("/api/data/pixiu/imports", {
		data: {
			fileName: "synthetic.csv",
			target: "test",
			channel: "web",
			totalDays: plan.days.length,
			totalRecords: plan.recordCount,
		},
	});
	expect(start.ok(), await start.text()).toBe(true);
	const { data: session } = (await start.json()) as { data: { id: string } };
	const batch = await request.put(`/api/data/pixiu/imports/${session.id}/batches/1`, {
		data: { days: plan.days },
	});
	expect(batch.ok(), await batch.text()).toBe(true);
	const finished = await request.post(`/api/data/pixiu/imports/${session.id}/finish`, {
		data: { status: "complete" },
	});
	expect(finished.ok(), await finished.text()).toBe(true);
}
