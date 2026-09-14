import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
	DataOverview,
	FootprintBatchReceipt,
	FootprintImportReceipt,
} from "../../src/models/data-management";
import { PIXIU_COLUMNS, type PixiuDay, parsePixiu } from "../../src/models/pixiu";
import type { EventPage } from "../../src/models/types";
import { handleDataRequest } from "../../worker/data-routes";
import { handleGetEvents } from "../../worker/events";
import { handleRequest } from "../../worker/index";
import { readPixiuDays } from "../../worker/pixiu-read";
import { handlePostImports } from "../../worker/routes";
import { errorResponse } from "../../worker/utils";
import { sqliteD1 } from "../helpers/sqlite-d1";

let fixture: ReturnType<typeof sqliteD1>;
beforeEach(() => {
	fixture = sqliteD1();
});
afterEach(() => {
	fixture.sqlite.close();
});
const date = "2026-09-13";
const start = Date.parse(`${date}T00:00:00+08:00`);
const end = start + 86_400_000;
const prefix = "/api/data/pixiu";
const range = `start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
async function req(path: string, method = "GET", body?: unknown) {
	const url = new URL(`http://localhost:17011${path}`);
	const request = new Request(url, {
		method,
		...(body === undefined
			? {}
			: { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
	});
	try {
		if (url.pathname === "/api/events") return await handleGetEvents(fixture.env, url);
		if (url.pathname === "/api/imports") return await handlePostImports(request, fixture.env);
		return await handleDataRequest(request, fixture.env, url);
	} catch (error) {
		return errorResponse(error);
	}
}
async function json<T>(response: Response): Promise<T> {
	expect(response.ok).toBe(true);
	return ((await response.json()) as { data: T }).data;
}
async function days(amount = "12.30", extra = true) {
	return (
		await parsePixiu([
			{
				name: "book.csv",
				text: `${PIXIU_COLUMNS.join(",")}\n${date},日常支出,午餐,0.00,${amount},人民币,现金,,一起吃饭\n${date},日常支出,午餐,0.00,${amount},人民币,现金,,一起吃饭${extra ? "\n2026-09-14,余额调整,调整,0.00,0.00,人民币,现金,," : ""}`,
			},
		])
	).days;
}
async function begin(values: PixiuDay[]) {
	return json<{ id: string }>(
		await req(`${prefix}/imports`, "POST", {
			fileName: "book.csv",
			totalDays: values.length,
			totalRecords: values.reduce((sum, day) => sum + day.recordCount, 0),
			channel: "cli",
			target: "test",
		}),
	);
}
async function batch(id: string, values: PixiuDay[], number = 1) {
	return req(`${prefix}/imports/${id}/batches/${number}`, "PUT", { days: values });
}
async function imported(values: PixiuDay[]) {
	const { id } = await begin(values);
	const receipt = await json<FootprintBatchReceipt>(await batch(id, values));
	await json<FootprintImportReceipt>(
		await req(`${prefix}/imports/${id}/finish`, "POST", { status: "complete" }),
	);
	return receipt;
}
function rows() {
	return fixture.sqlite
		.prepare("SELECT * FROM provider_days WHERE source_id='pixiu' ORDER BY utc_day")
		.all();
}

describe("Pixiu compact accounting days", () => {
	it("stores complete +8 day snapshots, all duplicates and zero records, with accurate overview", async () => {
		const values = await days();
		expect(await imported(values)).toMatchObject({ insertedDays: 2, committedPoints: 3 });
		expect(rows()).toHaveLength(2);
		expect(await readPixiuDays(fixture.env.DB, start, end)).toEqual([values[0]]);
		expect(await readPixiuDays(fixture.env.DB, start - 86_400_000, start)).toEqual([]);
		const overview = await json<DataOverview>(await req("/api/data/overview"));
		expect(overview.providers.find((provider) => provider.id === "pixiu")).toMatchObject({
			name: "貔貅记账",
			storage: "daily-json",
			coverageDays: 2,
			recordCount: 3,
			dataRows: 2,
			lastImportChannel: "cli",
			payloadBytes: values.reduce((sum, day) => sum + day.payloadBytes, 0),
		});
		const query = await json<{ days: PixiuDay[] }>(await req(`${prefix}/days?${range}`));
		expect(query.days).toEqual([values[0]]);
	});
	it("keeps current hashes/timestamps on replay and replaces whole days on A → B → A", async () => {
		const original = await days();
		await imported(original);
		const before = rows();
		expect(await imported(original)).toMatchObject({ unchangedDays: 2, updatedDays: 0 });
		expect(rows()).toEqual(before);
		const changed = await days("0.10", false);
		(changed[0] as PixiuDay).data.rows.pop();
		const { validatePixiuDay } = await import("../../src/models/pixiu");
		changed[0] = await validatePixiuDay(changed[0]);
		expect(await imported(changed)).toMatchObject({ updatedDays: 1, committedPoints: 1 });
		expect(rows()[1]).toEqual(before[1]);
		expect(await imported([original[0] as PixiuDay])).toMatchObject({
			updatedDays: 1,
			committedPoints: 2,
		});
		expect(await readPixiuDays(fixture.env.DB, start, end)).toEqual([original[0]]);
	});
	it("replays batch receipts, protects leases and never trusts claimed totals or hashes", async () => {
		const values = await days();
		const { id } = await begin(values);
		expect(
			(
				await req(`${prefix}/imports`, "POST", {
					fileName: "b.csv",
					totalDays: 1,
					totalRecords: 1,
					channel: "web",
					target: "test",
				})
			).status,
		).toBe(409);
		const reply = await json<FootprintBatchReceipt>(await batch(id, values));
		expect(await json(await batch(id, values))).toEqual(reply);
		expect((await batch(id, values, 3)).status).toBe(409);
		expect(
			(await req(`${prefix}/imports/${id}/finish`, "POST", { status: "complete" })).status,
		).toBe(200);
		const bad = structuredClone(values);
		(bad[0] as PixiuDay).data.timeZone = "UTC" as "Asia/Shanghai";
		const next = await begin(values);
		expect((await batch(next.id, bad)).status).toBe(400);
		(values[0] as PixiuDay).recordCount = 999;
		(values[0] as PixiuDay).contentHash = "claimed";
		const checked = await json<FootprintBatchReceipt>(await batch(next.id, values));
		expect(checked.committedPoints).toBe(3);
		expect(checked.unchangedDays).toBe(2);
	});
	it("removes only legacy rows for replaced source dates and prevents duplicate reads", async () => {
		fixture.sqlite.prepare("INSERT INTO sources VALUES ('pixiu','Pixiu','import','pixiu',0)").run();
		const insert = fixture.sqlite.prepare(
			"INSERT INTO life_events (id,source_id,external_key,occurred_at,precision,title,content,data,updated_at) VALUES (?,'pixiu',?,?,'day','午餐','',?,0)",
		);
		insert.run(
			"old-utc",
			"old-utc",
			Date.parse(`${date}T00:00:00Z`),
			JSON.stringify({ 日期: date }),
		);
		insert.run("old-offset", "old-offset", start, JSON.stringify({ 日期: date }));
		insert.run("keep", "keep", start - 86_400_000, JSON.stringify({ 日期: "2026-09-12" }));
		await imported(await days("12.30", false));
		expect(fixture.sqlite.prepare("SELECT id FROM life_events").all()).toEqual([{ id: "keep" }]);
		const page = await json<EventPage>(await req(`/api/events?${range}`));
		expect(page.events).toEqual([]);
		expect(page.pixiuDays?.[0]?.recordCount).toBe(2);
		const filtered = await json<EventPage>(await req(`/api/events?${range}&source=journal`));
		expect(filtered.pixiuDays).toBeUndefined();
	});
	it("assigns a date-only source day to just one display window even outside Asia/Shanghai", async () => {
		await imported(await days("12.30", false));
		const utcStart = Date.parse("2026-09-12T00:00:00Z");
		expect(await readPixiuDays(fixture.env.DB, utcStart, utcStart + 86_400_000)).toHaveLength(1);
		expect(
			await readPixiuDays(fixture.env.DB, utcStart + 86_400_000, utcStart + 2 * 86_400_000),
		).toHaveLength(0);
	});
	it("rejects legacy imports, wrong methods/ranges and keeps imports off the ingest hostname", async () => {
		expect((await req("/api/imports", "POST", { source: "pixiu", records: [] })).status).toBe(410);
		for (const path of [
			`${prefix}/imports`,
			`${prefix}/days`,
			`${prefix}/imports/a/batches/1`,
			`${prefix}/imports/a/finish`,
		])
			expect((await req(path, "DELETE")).status).toBe(405);
		expect((await req(`${prefix}/missing`)).status).toBe(404);
		expect((await req(`${prefix}/days`)).status).toBe(400);
		expect((await req(`${prefix}/days?start=bad&end=bad`)).status).toBe(400);
		expect((await req(`${prefix}/days?start=2026-01-01&end=2026-05-01`)).status).toBe(400);
		const response = await handleRequest(
			new Request(`https://life.worker.hexly.ai${prefix}/days?${range}`),
			fixture.env,
		);
		expect(response.status).toBe(404);
	});
});
