import assert from "node:assert/strict";
import { version } from "../../package.json";
import { assertMarker, executeLocalSql } from "../../scripts/local-db";
import type {
	AiConnectionResult,
	AiSettings,
	AiSettingsInput,
	DaySummaryQuery,
	DaySummaryResult,
} from "../../src/models/ai";
import { decodeHealthSeries } from "../../src/models/apple-health";
import { CACHE_KINDS, type CacheClearResult, type CacheOverview } from "../../src/models/cache";
import type {
	DataOverview,
	FootprintBatchReceipt,
	FootprintDaysResult,
	FootprintImportReceipt,
	FootprintImportSession,
} from "../../src/models/data-management";
import type { DayContextQuery, DaySun, DayWeather } from "../../src/models/day-context";
import type {
	DaySourceConnection,
	DaySourceSettings,
	DaySourcesResult,
} from "../../src/models/day-sources";
import { validateFootprintDay } from "../../src/models/footprint";
import type { GeneralSettings } from "../../src/models/general-settings";
import type { HealthImportReceipt } from "../../src/models/health-types";
import { PIXIU_COLUMNS, parsePixiu } from "../../src/models/pixiu";
import type {
	Connect,
	CreatedConnect,
	EventPage,
	ImportRecord,
	IngestReceipt,
	Session,
	Source,
} from "../../src/models/types";
import { createHealthClient, uploadHealthPlan } from "../../src/services/health-client";
import { fetchHealthAttachment } from "../../src/services/health-evidence";
import { createPixiuClient, uploadPixiuPlan } from "../../src/services/pixiu-client";
import { githubFixtureAccount, githubFixtureKey, githubFixtureQuery } from "../github-fixture";
import { healthFixtureDays, syntheticHealthPlan } from "../health-fixture";

const base = process.env.LIFE_TEST_URL;
const state = process.env.LIFE_TEST_STATE;
const accessToken = process.env.LIFE_TEST_TOKEN;
assert(base && new URL(base).hostname === "127.0.0.1", "Real HTTP tests require loopback");
assert(
	state && accessToken && process.env.RESOURCE_ENV === "test",
	"Missing isolated test environment",
);
await assertMarker(state);
let scenarios = 0;
async function scenario(name: string, run: () => Promise<void>) {
	await run();
	scenarios++;
	console.log(`✓ ${name}`);
}
async function request(
	path: string,
	options: {
		method?: string;
		body?: unknown;
		token?: string | null;
		bearer?: string;
		host?: string;
		origin?: string;
		raw?: string;
		contentType?: string;
	} = {},
) {
	const headers = new Headers();
	const token = options.token === undefined ? accessToken : options.token;
	if (token) headers.set("Cf-Access-Jwt-Assertion", token);
	if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
	if (options.host) headers.set("Host", options.host);
	if (options.origin) headers.set("Origin", options.origin);
	if (options.body !== undefined || options.raw !== undefined)
		headers.set("Content-Type", options.contentType ?? "application/json");
	return fetch(`${base}${path}`, {
		method: options.method ?? "GET",
		headers,
		body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
		redirect: "manual",
	});
}
async function data<T>(response: Response, status = 200): Promise<T> {
	assert.equal(response.status, status, await response.clone().text());
	assert.equal(response.headers.get("Cache-Control"), "no-store");
	const body = (await response.json()) as { data: T };
	assert("data" in body);
	return body.data;
}
async function rejected(response: Response, status: number) {
	assert.equal(response.status, status, await response.clone().text());
	assert.equal(response.headers.get("Cache-Control"), "no-store");
	const body = (await response.json()) as { error: { code: string; message: string } };
	assert.equal(typeof body.error?.code, "string");
	assert.equal(typeof body.error.message, "string");
}
function eventsQuery(
	source?: string,
	cursor?: string,
	start = "2099-01-01T00:00:00Z",
	end = "2099-01-02T00:00:00Z",
) {
	const params = new URLSearchParams({ start, end });
	if (source) params.set("source", source);
	if (cursor) params.set("cursor", cursor);
	return `/api/events?${params}`;
}
async function importBatch(source: string, records: Partial<ImportRecord>[]) {
	if (source === "apple-health") {
		const days = await healthFixtureDays(records as ImportRecord[]);
		const session = await data<{ id: string }>(
			await request("/api/data/apple-health/imports", {
				method: "POST",
				body: {
					fileName: "l2-health.zip",
					target: "test",
					channel: "cli",
					totalDays: days.length,
					totalRecords: days.reduce((sum, day) => sum + day.recordCount, 0),
					files: [],
				},
			}),
			201,
		);
		for (const [index, day] of days.entries())
			await data(
				await request(`/api/data/apple-health/imports/${session.id}/batches/${index + 1}`, {
					method: "PUT",
					body: { days: [day] },
				}),
			);
		return request(`/api/data/apple-health/imports/${session.id}/finish`, {
			method: "POST",
			body: { status: "complete" },
		});
	}
	return request("/api/imports", { method: "POST", body: { source, records }, origin: base });
}

await scenario("public health runs a real D1 query and reports the root version", async () => {
	const response = await request("/api/live", { token: null });
	assert.equal(response.status, 200);
	assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
	const health = (await response.json()) as {
		status: string;
		version: string;
		database: string;
		timestamp: string;
	};
	assert.equal(health.status, "ok");
	assert.equal(health.database, "ok");
	assert.equal(health.version, version);
	assert(Number.isFinite(Date.parse(health.timestamp)));
});
await scenario(
	"Access requires a signed, unexpired JWT with correct issuer/audience/claims",
	async () => {
		await rejected(await request("/api/session", { token: null }), 401);
		for (const invalid of [
			"forged",
			process.env.LIFE_TEST_EXPIRED_TOKEN,
			process.env.LIFE_TEST_WRONG_AUD_TOKEN,
			process.env.LIFE_TEST_NO_EXP_TOKEN,
			process.env.LIFE_TEST_WRONG_ISSUER_TOKEN,
			process.env.LIFE_TEST_FUTURE_TOKEN,
		]) {
			assert(invalid);
			await rejected(await request("/api/session", { token: invalid }), 403);
		}
		const session = await data<Session>(await request("/api/session"));
		assert.deepEqual(session, {
			email: "reader@example.test",
			subject: "life-isolated-reader",
			mode: "access",
			name: null,
			avatar: null,
		});
	},
);
await scenario(
	"an isolated empty database returns honest empty source and Connect lists",
	async () => {
		assert.deepEqual(await data<Source[]>(await request("/api/sources")), []);
		assert.deepEqual(await data<Connect[]>(await request("/api/connects")), []);
	},
);
await scenario("browser write origin and input/body limits are enforced", async () => {
	await rejected(
		await request("/api/connects", {
			method: "POST",
			origin: "https://evil.example.test",
			body: { name: "bad" },
		}),
		403,
	);
	await rejected(
		await request("/api/connects", {
			method: "POST",
			origin: base?.replace("http:", "https:"),
			body: { name: "bad scheme" },
		}),
		403,
	);
	for (const name of ["", " ", "x".repeat(81), 123, null])
		await rejected(await request("/api/connects", { method: "POST", body: { name } }), 400);
	await rejected(await request("/api/connects", { method: "POST", raw: "{broken" }), 400);
	await rejected(
		await request("/api/connects", { method: "POST", raw: "{}", contentType: "text/plain" }),
		415,
	);
	await rejected(
		await request("/api/connects", { method: "POST", raw: "x".repeat(1024 * 1024 + 1) }),
		413,
	);
});

const created = await data<CreatedConnect>(
	await request("/api/connects", { method: "POST", body: { name: "Health sync" }, origin: base }),
	201,
);
const second = await data<CreatedConnect>(
	await request("/api/connects", { method: "POST", body: { name: "Calendar" } }),
	201,
);
await scenario("Connect returns 256 random bits once and stores only its digest", async () => {
	assert.match(created.token, /^life_[a-f0-9]{64}$/);
	assert.notEqual(created.token, second.token);
	assert.equal(created.connect.name, "Health sync");
	assert.equal(created.connect.lastUsedAt, null);
	assert.equal(created.connect.prefix, created.token.slice(0, 12));
	const listResponse = await request("/api/connects");
	const listText = await listResponse.clone().text();
	assert(!listText.includes(created.token));
	assert(!listText.includes("token_hash"));
	assert.equal((await data<Connect[]>(listResponse)).length, 2);
	const sql = (await executeLocalSql(
		state,
		`SELECT token_hash FROM connects WHERE id='${created.connect.id.replaceAll("'", "''")}';`,
	)) as { results: { token_hash: string }[] }[];
	const digest = Array.from(
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(created.token))),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
	assert.equal(sql[0]?.results[0]?.token_hash, digest);
});
await scenario("invalid ingestion cannot update Connect last-used metadata", async () => {
	await rejected(
		await request("/api/ingest", {
			method: "POST",
			token: null,
			bearer: created.token,
			body: { timestamp: "bad", title: "bad" },
		}),
		400,
	);
	const connects = await data<Connect[]>(await request("/api/connects"));
	assert.equal(connects.find((connect) => connect.id === created.connect.id)?.lastUsedAt, null);
	await rejected(
		await request("/api/ingest", {
			method: "POST",
			token: null,
			body: { timestamp: "2099-01-01", title: "missing token" },
		}),
		401,
	);
});

const firstIngest = await data<IngestReceipt>(
	await request("/api/ingest", {
		method: "POST",
		token: null,
		bearer: created.token,
		body: {
			timestamp: "2099-01-01T16:23:45+08:00",
			title: "first",
			content: "old",
			data: { old: true },
		},
	}),
);
await scenario(
	"Connect supports future hours, normalizes offsets, and later snapshots replace all content",
	async () => {
		assert.equal(firstIngest.occurredAt, "2099-01-01T08:00:00.000Z");
		const replaced = await data<IngestReceipt>(
			await request("/api/ingest", {
				method: "POST",
				token: null,
				bearer: created.token,
				body: { timestamp: "2099-01-01T08:59:59", title: "latest", data: { latest: true } },
			}),
		);
		assert.equal(replaced.id, firstIngest.id);
		assert.equal(replaced.precision, "hour");
		const page = await data<EventPage>(await request(eventsQuery(created.connect.id)));
		assert.equal(page.events.length, 1);
		assert.equal(page.events[0]?.title, "latest");
		assert.equal(page.events[0]?.content, "");
		assert.deepEqual(page.events[0]?.data, { latest: true });
	},
);
await scenario(
	"concurrent writes stay idempotent and different tokens own different records",
	async () => {
		await Promise.all(
			Array.from({ length: 8 }, async (_, i) =>
				data<IngestReceipt>(
					await request("/api/ingest", {
						method: "POST",
						token: null,
						bearer: created.token,
						body: { timestamp: "2099-01-01T08:15:00Z", title: `concurrent-${i}` },
					}),
				),
			),
		);
		assert.equal(
			(await data<EventPage>(await request(eventsQuery(created.connect.id)))).events.length,
			1,
		);
		const other = await data<IngestReceipt>(
			await request("/api/ingest", {
				method: "POST",
				token: null,
				bearer: second.token,
				body: { timestamp: "2099-01-01T08:15:00Z", title: "other source" },
			}),
		);
		assert.notEqual(other.id, firstIngest.id);
	},
);
await scenario(
	"machine hostname accepts ingestion/health and denies every dashboard/read/asset path",
	async () => {
		const host = "life.worker.hexly.ai";
		assert.equal((await request("/api/live", { host, token: null })).status, 200);
		await data<IngestReceipt>(
			await request("/api/ingest", {
				host,
				method: "POST",
				token: null,
				bearer: created.token,
				body: { timestamp: "2099-01-01T09:00:00Z", title: "machine endpoint" },
			}),
		);
		for (const path of [
			"/",
			"/connect",
			"/logo-80.png",
			"/api/events",
			"/api/sources",
			"/api/session",
			"/api/connects",
			"/api/imports",
		]) {
			await rejected(await request(path, { host, token: null, bearer: created.token }), 404);
		}
		await rejected(await request("/api/sources", { token: null, bearer: created.token }), 401);
	},
);
await scenario(
	"import keys are idempotent, preserve precision and overlap intervals at UTC boundaries",
	async () => {
		const records: ImportRecord[] = [
			{ key: "day", occurredAt: "2099-01-01", precision: "day", title: "纪念日" },
			{
				key: "minute",
				occurredAt: "2099-01-01T17:32:59+08:00",
				precision: "minute",
				title: "散步",
			},
			{ key: "second", occurredAt: "2099-01-01T10:23:45Z", precision: "second", title: "定位" },
			{
				key: "interval",
				occurredAt: "2098-12-31T23:30:00Z",
				endAt: "2099-01-01T01:30:00Z",
				precision: "minute",
				title: "睡眠",
			},
			{
				key: "zero",
				occurredAt: "2099-01-01T00:00:00Z",
				endAt: "2099-01-01T00:00:00Z",
				title: "零时",
			},
			{ key: "end", occurredAt: "2099-01-02T00:00:00Z", title: "次日" },
		];
		assert.deepEqual(await data(await importBatch("journal", records)), { accepted: 6 });
		const original = await data<EventPage>(await request(eventsQuery("journal")));
		assert.equal(original.events.length, 5);
		assert.equal(
			original.events.find((event) => event.title === "散步")?.occurredAt,
			"2099-01-01T09:32:00.000Z",
		);
		const dayId = original.events.find((event) => event.title === "纪念日")?.id;
		await data(await importBatch("journal", [{ ...records[0], title: "纪念日更新" }]));
		const after = await data<EventPage>(await request(eventsQuery("journal")));
		assert.equal(after.events.length, 5);
		assert.equal(after.events.find((event) => event.title === "纪念日更新")?.id, dayId);
		const otherSubject = await data<EventPage>(
			await request(eventsQuery("journal"), { token: process.env.LIFE_TEST_OTHER_TOKEN }),
		);
		assert.deepEqual(
			otherSubject,
			after,
			"One dataset is shared across authorized Access identities",
		);
	},
);
await scenario(
	"Pixiu stores one complete +8 accounting day, replays unchanged and replaces whole snapshots",
	async () => {
		await rejected(await importBatch("pixiu", []), 410);
		const client = createPixiuClient({
			baseUrl: base,
			getHeaders: async () => ({ "Cf-Access-Jwt-Assertion": accessToken }),
		});
		const csv = `${PIXIU_COLUMNS.join(",")}\n2099-03-20,日常支出,咖啡,0.00,12.30,CNY,现金,,\n2099-03-20,日常支出,咖啡,0.00,12.30,CNY,现金,,\n2099-03-21,余额调整,调整,0.00,0.00,CNY,现金,,`;
		const plan = await parsePixiu([{ name: "fixture.csv", text: csv }]);
		await assert.rejects(
			uploadPixiuPlan(client, plan, { target: "production", channel: "cli" }),
			/目标环境不匹配/,
		);
		const options = { target: "test", channel: "cli" } as const;
		const receipt = await uploadPixiuPlan(client, plan, options);
		assert.equal(receipt.committedDays, 2);
		assert.equal(receipt.committedPoints, 3);
		assert.equal(receipt.insertedDays, 2);
		const range = { start: "2099-03-19T16:00:00Z", end: "2099-03-21T16:00:00Z" };
		const stored = await client.days(range.start, range.end);
		assert.deepEqual(stored.days, plan.days);
		const before = (await executeLocalSql(
			state,
			"SELECT * FROM provider_days WHERE source_id='pixiu' ORDER BY utc_day",
		)) as { results: unknown[] }[];
		const replay = await uploadPixiuPlan(client, plan, options);
		assert.equal(replay.unchangedDays, 2);
		const after = (await executeLocalSql(
			state,
			"SELECT * FROM provider_days WHERE source_id='pixiu' ORDER BY utc_day",
		)) as { results: unknown[] }[];
		assert.deepEqual(after[0]?.results, before[0]?.results);
		const updated = await parsePixiu([
			{
				name: "changed.csv",
				text: `${PIXIU_COLUMNS.join(",")}\n2099-03-20,日常支出,咖啡,0.00,0.10,CNY,现金,,更新`,
			},
		]);
		assert.equal((await uploadPixiuPlan(client, updated, options)).updatedDays, 1);
		assert.equal((await client.days(range.start, range.end)).days.length, 2);
		assert.equal((await uploadPixiuPlan(client, plan, options)).updatedDays, 1);
		const overview = await data<DataOverview>(await request("/api/data/overview"));
		const pixiu = overview.providers.find((row) => row.id === "pixiu");
		assert.equal(pixiu?.recordCount, 3);
		assert.equal(pixiu?.coverageDays, 2);
		assert.equal(pixiu?.dataRows, 2);
		const page = await data<EventPage>(
			await request(eventsQuery("pixiu", undefined, range.start, range.end)),
		);
		assert.equal(page.events.length, 0);
		assert.deepEqual(page.pixiuDays, plan.days);
		for (const path of [
			"/api/data/pixiu/imports",
			"/api/data/pixiu/days",
			"/api/data/pixiu/imports/x/batches/1",
			"/api/data/pixiu/imports/x/finish",
		]) {
			await rejected(await request(path, { method: "DELETE" }), 405);
			await rejected(await request(path, { token: null }), 401);
			await rejected(await request(path, { host: "life.worker.hexly.ai" }), 404);
		}
		await rejected(await request("/api/data/pixiu/days"), 400);
		await rejected(await request("/api/data/pixiu/missing"), 404);
	},
);
await scenario(
	"complete Apple Health archive imports preserve measurements, attachments and lazy reads",
	async () => {
		await rejected(
			await request("/api/imports", {
				method: "POST",
				body: { source: "apple-health", records: [] },
			}),
			410,
		);
		const client = createHealthClient({
			baseUrl: base,
			getHeaders: async () => ({ "Cf-Access-Jwt-Assertion": accessToken }),
		});
		const plan = await syntheticHealthPlan("2099-09-20");
		await assert.rejects(
			uploadHealthPlan(client, plan, {
				fileName: "health.zip",
				target: "production",
				channel: "cli",
			}),
			/目标环境不匹配/,
		);
		const receipt: HealthImportReceipt = await uploadHealthPlan(client, plan, {
			fileName: "health.zip",
			target: "test",
			channel: "cli",
		});
		assert.equal(receipt.committedRecords, plan.recordCount);
		assert.equal(receipt.insertedDays, plan.days.length);
		const start = "2099-09-19T16:00:00Z";
		const end = "2099-09-20T16:00:00Z";
		const full = await client.series(start, end);
		const story = await client.series(start, end, true);
		assert(full.series.some((row) => row.dimension === "HKQuantityTypeIdentifierWalkingSpeed"));
		assert(!story.series.some((row) => row.dimension === "HKQuantityTypeIdentifierWalkingSpeed"));
		const records = (
			await Promise.all(
				full.series.map((row) =>
					decodeHealthSeries(row, row.utcDay, row.updatedAt, {
						start: Date.parse(start),
						end: Date.parse(end),
					}),
				),
			)
		).flat();
		assert(
			records.some(
				(event) =>
					event.data &&
					typeof event.data === "object" &&
					!Array.isArray(event.data) &&
					event.data._healthKind === "Electrocardiogram",
			),
		);
		assert(records.some((event) => event.endAt && event.occurredAt < start));
		const waveform = await fetchHealthAttachment(
			"electrocardiograms/morning.csv",
			"ecg",
			undefined,
			client,
		);
		assert(new TextDecoder().decode(waveform).includes("950"));
		const route = await fetchHealthAttachment(
			"workout-routes/morning.gpx",
			"route",
			undefined,
			client,
		);
		assert(new TextDecoder().decode(route).includes("<trkpt"));
		assert.equal((await client.inventory()).files.length, plan.files.length);
		const again = await uploadHealthPlan(client, plan, {
			fileName: "renamed.zip",
			target: "test",
			channel: "cli",
		});
		assert.equal(again.unchangedDays, plan.days.length);
		assert.deepEqual(await client.series(start, end), full);
		const overview = await data<DataOverview>(await request("/api/data/overview"));
		const health = overview.providers.find((row) => row.id === "apple-health");
		assert.equal(health?.recordCount, plan.recordCount);
		assert.equal(health?.coverageDays, plan.days.length - 1);
		assert.equal(
			health?.dataRows,
			plan.days.length +
				plan.seriesCount +
				plan.files.length +
				plan.files.reduce((count, file) => count + file.parts.length, 0),
		);
		assert(health?.health?.dimensions.some((row) => row.id === "HKDataTypeSleepDurationGoal"));
		const page = await data<EventPage>(
			await request(eventsQuery("apple-health", undefined, start, end)),
		);
		assert((page.healthSeries?.length ?? 0) > 0);
		assert.equal(page.events.length, 0);
		await rejected(await request("/api/data/apple-health/series"), 400);
		await rejected(
			await request(`/api/data/apple-health/series?start=${start}&end=${end}&view=unknown`),
			400,
		);
		await rejected(await request("/api/data/apple-health/file"), 400);
		await rejected(await request("/api/data/apple-health/file?path=missing"), 404);
		await rejected(
			await request("/api/data/apple-health/file?path=electrocardiograms/morning.csv&part=no"),
			400,
		);
		await rejected(
			await request("/api/data/apple-health/file?path=electrocardiograms/morning.csv&part=90"),
			404,
		);
		await rejected(await request("/api/data/apple-health/files", { method: "POST" }), 405);
		await rejected(await request("/api/data/apple-health/unknown"), 404);
		for (const path of [
			"/api/data/apple-health/files",
			`/api/data/apple-health/series?start=${start}&end=${end}`,
			"/api/data/apple-health/file?path=electrocardiograms/morning.csv",
		]) {
			await rejected(await request(path, { token: null }), 401);
			await rejected(await request(path, { host: "life.worker.hexly.ai" }), 404);
		}
	},
);

await scenario(
	"Footprint complete-day APIs preserve points, replace days and retry idempotently",
	async () => {
		assert.deepEqual(await data(await request("/api/data/target")), { target: "test" });
		await rejected(await importBatch("footprint", []), 410);
		const utcDay = Date.parse("2099-02-01T00:00:00Z");
		const original = await validateFootprintDay({
			utcDay,
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points: [
					[0, 0, 1, -5, -1, -1],
					[86399.125, 1, 2, 12.5, 0.5, 40],
				],
			},
		});
		const nextDay = await validateFootprintDay({ utcDay: utcDay + 86400000, data: original.data });
		const manifest = {
			fileName: "l2.gpx",
			totalDays: 2,
			totalPoints: 4,
			channel: "cli",
			target: "test",
		};
		await rejected(
			await request("/api/data/footprint/imports", {
				method: "POST",
				body: { ...manifest, target: "production" },
			}),
			409,
		);
		const session = await data<FootprintImportSession>(
			await request("/api/data/footprint/imports", { method: "POST", body: manifest }),
			201,
		);
		await rejected(
			await request("/api/data/footprint/imports", {
				method: "POST",
				body: { ...manifest, channel: "web" },
			}),
			409,
		);
		const batchPath = `/api/data/footprint/imports/${session.id}/batches/1`;
		const batch = await data<FootprintBatchReceipt>(
			await request(batchPath, { method: "PUT", body: { days: [original, nextDay] } }),
		);
		assert.equal(batch.insertedDays, 2);
		assert.deepEqual(
			await data(await request(batchPath, { method: "PUT", body: { days: [original, nextDay] } })),
			batch,
		);
		const finishPath = `/api/data/footprint/imports/${session.id}/finish`;
		assert.equal(
			(
				await data<FootprintImportReceipt>(
					await request(finishPath, { method: "POST", body: { status: "complete" } }),
				)
			).committedPoints,
			4,
		);
		const rangePath = "/api/data/footprint/days?start=2099-02-01&end=2099-02-03";
		const initial = await data<FootprintDaysResult>(await request(rangePath));
		assert.equal(initial.days.length, 2);
		assert.deepEqual(initial.days[0]?.data, original.data);
		const eventPage = await data<EventPage>(
			await request(
				eventsQuery("footprint", undefined, "2099-02-01T16:00:00Z", "2099-02-02T16:00:00Z"),
			),
		);
		assert.equal(eventPage.events.length, 0);
		assert.equal(eventPage.footprintDays?.length, 2);
		const repeated = await data<FootprintImportSession>(
			await request("/api/data/footprint/imports", { method: "POST", body: manifest }),
			201,
		);
		assert.equal(
			(
				await data<FootprintBatchReceipt>(
					await request(`/api/data/footprint/imports/${repeated.id}/batches/1`, {
						method: "PUT",
						body: { days: [original, nextDay] },
					}),
				)
			).unchangedDays,
			2,
		);
		await data(
			await request(`/api/data/footprint/imports/${repeated.id}/finish`, {
				method: "POST",
				body: { status: "complete" },
			}),
		);
		assert.deepEqual(await data(await request(rangePath)), initial);
		const replacement = await validateFootprintDay({
			utcDay,
			data: { ...original.data, points: [[3600, 9, 8, 7, 6, 5]] },
		});
		const update = await data<FootprintImportSession>(
			await request("/api/data/footprint/imports", {
				method: "POST",
				body: { ...manifest, totalDays: 1, totalPoints: 1 },
			}),
			201,
		);
		await rejected(
			await request(`/api/data/footprint/imports/${update.id}/finish`, {
				method: "POST",
				body: { status: "complete" },
			}),
			409,
		);
		await data(
			await request(`/api/data/footprint/imports/${update.id}/batches/1`, {
				method: "PUT",
				body: { days: [replacement] },
			}),
		);
		await data(
			await request(`/api/data/footprint/imports/${update.id}/finish`, {
				method: "POST",
				body: { status: "complete" },
			}),
		);
		const after = await data<FootprintDaysResult>(await request(rangePath));
		assert.deepEqual(after.days[0]?.data, replacement.data);
		assert.deepEqual(after.days[1], initial.days[1]);
		const overview = await data<DataOverview>(await request("/api/data/overview"));
		const footprint = overview.providers.find((provider) => provider.id === "footprint");
		assert.equal(footprint?.coverageDays, 2);
		assert.equal(footprint?.dataRows, 2);
		assert.equal(footprint?.recordCount, 3);
		assert.equal(footprint?.lastImportChannel, "cli");
		const cancelled = await data<FootprintImportSession>(
			await request("/api/data/footprint/imports", { method: "POST", body: manifest }),
			201,
		);
		assert.equal(
			(
				await data<FootprintImportReceipt>(
					await request(`/api/data/footprint/imports/${cancelled.id}/finish`, {
						method: "POST",
						body: { status: "cancelled" },
					}),
				)
			).status,
			"cancelled",
		);
		await rejected(
			await request(`/api/data/footprint/imports/${session.id}/batches/1`, {
				method: "PUT",
				body: { days: [original, nextDay] },
			}),
			404,
		);
		for (const path of ["/api/data/target", "/api/data/overview", rangePath]) {
			await rejected(await request(path, { token: null }), 401);
			await rejected(await request(path, { host: "life.worker.hexly.ai" }), 404);
			await rejected(await request(path, { method: "DELETE" }), 405);
		}
		await rejected(await request("/api/data/footprint/days?start=bad&end=2099-02-02"), 400);
	},
);
await scenario(
	"invalid import batches are rejected atomically without inserting records",
	async () => {
		const valid = { key: "should-not-exist", occurredAt: "2099-01-01", title: "invalid batch" };
		for (const records of [
			[valid, null],
			[valid, { ...valid, precision: "decade" }],
			[valid, { ...valid, endAt: "2098-01-01" }],
			[valid, { ...valid, occurredAt: "2099-02-30" }],
			[valid, { ...valid, title: "x".repeat(201) }],
			[valid, { ...valid, content: "x".repeat(8001) }],
			[valid, { ...valid, data: { text: "字".repeat(11000) } }],
		]) {
			await rejected(
				await request("/api/imports", { method: "POST", body: { source: "journal", records } }),
				400,
			);
		}
		await rejected(await importBatch("bad-source", [valid]), 400);
		await rejected(await importBatch("journal", []), 400);
		await rejected(
			await importBatch(
				"journal",
				Array.from({ length: 101 }, () => valid),
			),
			400,
		);
		const events = await data<EventPage>(await request(eventsQuery("journal")));
		assert(!events.events.some((event) => event.title === "invalid batch"));
	},
);
await scenario(
	"cursor pagination covers over 200 simultaneous records without gaps or duplicates",
	async () => {
		for (let offset = 0; offset < 205; offset += 100) {
			const records = Array.from({ length: Math.min(100, 205 - offset) }, (_, i) => ({
				key: `page-${offset + i}`,
				title: `page-${offset + i}`,
				occurredAt: "2099-04-01T12:00:00Z",
			}));
			await data(await importBatch("journal", records));
		}
		const first = await data<EventPage>(
			await request(eventsQuery("journal", undefined, "2099-04-01", "2099-04-02")),
		);
		assert.equal(first.events.length, 200);
		assert(first.nextCursor);
		const second = await data<EventPage>(
			await request(eventsQuery("journal", first.nextCursor, "2099-04-01", "2099-04-02")),
		);
		assert.equal(second.events.length, 5);
		assert.equal(second.nextCursor, null);
		assert.equal(new Set([...first.events, ...second.events].map((event) => event.id)).size, 205);
	},
);
await scenario(
	"query ranges, cursors and methods are bounded and source filters cannot alter SQL",
	async () => {
		for (const path of [
			"/api/events",
			"/api/events?start=bad&end=2099-01-02",
			eventsQuery(undefined, undefined, "2099-01-02", "2099-01-01"),
			eventsQuery(undefined, undefined, "2099-01-01", "2099-03-01"),
			eventsQuery(undefined, "bad-cursor"),
		])
			await rejected(await request(path), 400);
		assert.deepEqual((await data<EventPage>(await request(eventsQuery("' OR 1=1 --")))).events, []);
		for (const path of ["/api/live", "/api/session", "/api/sources", "/api/events"])
			await rejected(await request(path, { method: "POST" }), 405);
		await rejected(await request("/api/imports"), 405);
		await rejected(await request("/api/ingest"), 405);
		await rejected(await request("/api/connects", { method: "PATCH" }), 405);
		await rejected(await request("/api/unknown"), 404);
	},
);
await scenario(
	"revoking a Connect is idempotent, rejects writes and retains its historical records",
	async () => {
		const revoked = await data<Connect>(
			await request(`/api/connects/${created.connect.id}`, { method: "DELETE", origin: base }),
		);
		assert(revoked.revokedAt);
		assert.equal(revoked.recordCount, 2);
		const repeat = await data<Connect>(
			await request(`/api/connects/${created.connect.id}`, { method: "DELETE" }),
		);
		assert.equal(repeat.revokedAt, revoked.revokedAt);
		await rejected(
			await request("/api/ingest", {
				method: "POST",
				token: null,
				bearer: created.token,
				body: { timestamp: "2099-01-01T12:00:00Z", title: "revoked" },
			}),
			403,
		);
		assert.equal(
			(await data<EventPage>(await request(eventsQuery(created.connect.id)))).events.length,
			2,
		);
		await rejected(await request("/api/connects/does-not-exist", { method: "DELETE" }), 404);
	},
);

const aiBaseURL = process.env.LIFE_TEST_AI_URL;

await scenario(
	"daily solar and weather APIs cache in D1, reuse concurrent/next requests and enforce Access",
	async () => {
		const fixture = process.env.LIFE_TEST_CONTEXT_URL;
		assert(fixture && new URL(fixture).hostname === "127.0.0.1");
		const query: DayContextQuery = {
			date: "2020-04-12",
			timeZone: "Asia/Shanghai",
			start: "2020-04-11T16:00:00.000Z",
			end: "2020-04-12T16:00:00.000Z",
			latitude: 31.235,
			longitude: 121.471,
		};
		const params = new URLSearchParams(
			Object.entries(query).map(([key, value]) => [key, String(value)]),
		);
		const sunPath = `/api/context/sun?${params}`;
		const weatherPath = `/api/context/weather?${params}`;
		const before = (await (await fetch(`${fixture}/requests`)).json()) as unknown[];
		const solar = await Promise.all(
			[1, 2, 3].map(async () => data<DaySun>(await request(sunPath))),
		);
		assert.equal(solar[0]?.events.length, 2);
		assert.deepEqual(solar[1], solar[0]);
		assert.deepEqual(solar[2], solar[0]);
		const weather = await data<DayWeather>(await request(weatherPath));
		assert.equal(weather.complete, true);
		assert.equal(weather.kind, "historical");
		const stored = (await executeLocalSql(
			state,
			"SELECT kind, cache_key, data_json, created_at, expires_at FROM public_context_cache ORDER BY kind, cache_key",
		)) as { results: unknown[] }[];
		assert.deepEqual(await data<DaySun>(await request(sunPath)), solar[0]);
		assert.deepEqual(await data<DayWeather>(await request(weatherPath)), weather);
		const after = (await (await fetch(`${fixture}/requests`)).json()) as unknown[];
		assert.equal(after.length - before.length, 2, "Only one solar and one weather upstream call");
		const reread = (await executeLocalSql(
			state,
			"SELECT kind, cache_key, data_json, created_at, expires_at FROM public_context_cache ORDER BY kind, cache_key",
		)) as { results: unknown[] }[];
		assert.deepEqual(reread[0]?.results, stored[0]?.results);
		for (const path of [sunPath, weatherPath]) {
			await rejected(await request(path, { token: null }), 401);
			await rejected(await request(path, { host: "life.worker.hexly.ai" }), 404);
			await rejected(await request(path, { method: "POST" }), 405);
		}
		await rejected(await request("/api/context/sun"), 400);
		await rejected(await request("/api/context/missing"), 404);
		params.set("start", "2020-04-12T00:00:00Z");
		await rejected(await request(`/api/context/sun?${params}`), 400);
	},
);

const aiKey = process.env.LIFE_TEST_AI_KEY;
assert(aiBaseURL && aiKey && new URL(aiBaseURL).hostname === "127.0.0.1");
const aiConfig: AiSettingsInput = {
	provider: "custom",
	model: "life-test-ok",
	baseURL: aiBaseURL,
	sdkType: "anthropic",
	authType: "apiKey",
};
const summaryDay: DaySummaryQuery = {
	date: "2099-06-15",
	timeZone: "UTC",
	start: "2099-06-15T00:00:00Z",
	end: "2099-06-16T00:00:00Z",
};
const summaryPath = `/api/day-summary?${new URLSearchParams({ ...summaryDay })}`;
async function saveAi(changes: Partial<AiSettingsInput> = {}) {
	return data<AiSettings>(
		await request("/api/settings/ai", { method: "PUT", body: { ...aiConfig, ...changes } }),
	);
}

await scenario(
	"all AI routes enforce Access, browser origin, host and method boundaries",
	async () => {
		for (const [path, method] of [
			["/api/settings/ai", "GET"],
			["/api/settings/ai", "PUT"],
			["/api/settings/ai/test", "POST"],
			[summaryPath, "GET"],
			["/api/day-summary", "POST"],
		]) {
			assert(path && method);
			await rejected(await request(path, { method, token: null }), 401);
			await rejected(await request(path, { method, host: "life.worker.hexly.ai" }), 404);
			if (method !== "GET")
				await rejected(
					await request(path, { method, origin: "https://outside.example.test" }),
					403,
				);
		}
		for (const path of ["/api/settings/ai", "/api/day-summary"])
			await rejected(await request(path, { method: "PATCH" }), 405);
		await rejected(await request("/api/settings/ai/test"), 405);
		const settings = await data<AiSettings>(await request("/api/settings/ai"));
		assert.equal(settings.provider, "workers-ai");
		assert.equal(settings.hasApiKey, false);
		const empty = await data<DaySummaryResult>(await request(summaryPath));
		assert.equal(empty.summary, null);
		assert.equal(empty.eventCount, 0);
	},
);

await scenario(
	"AI settings validate providers and URLs and never return or store a plaintext API key",
	async () => {
		for (const body of [
			null,
			[],
			{ ...aiConfig, provider: "unsupported" },
			{ ...aiConfig, sdkType: "ftp" },
			{ ...aiConfig, authType: "basic" },
			{ ...aiConfig, model: 4 },
			{ ...aiConfig, model: "x".repeat(1000) },
			{ ...aiConfig, baseURL: "https://127.0.0.2/v1" },
			{ ...aiConfig, baseURL: "https://10.0.0.1/v1" },
			{ ...aiConfig, baseURL: "https://a:b@ai.example.test/v1" },
			{ ...aiConfig, baseURL: "https://ai.example.test/v1?token=test" },
		]) {
			await rejected(await request("/api/settings/ai", { method: "PUT", body }), 400);
		}
		const saved = await saveAi({ apiKey: aiKey });
		assert.equal(saved.configured, true);
		assert.equal(saved.hasApiKey, true);
		assert(!JSON.stringify(saved).includes(aiKey));
		assert(!("apiKey" in saved));
		const sql = (await executeLocalSql(state, "SELECT encrypted_api_key FROM ai_settings;")) as {
			results: { encrypted_api_key: string }[];
		}[];
		const encrypted = sql[0]?.results[0]?.encrypted_api_key;
		assert(encrypted && encrypted !== aiKey && !encrypted.includes(aiKey));
		await saveAi({ model: "life-test-ok" });
		const connection = await data<AiConnectionResult>(
			await request("/api/settings/ai/test", { method: "POST" }),
		);
		assert.equal(connection.success, true);
		assert(connection.response.length > 0);
	},
);

await scenario(
	"daily summaries aggregate paginated records, use the selected UTC day, and persist across reads",
	async () => {
		for (let offset = 0; offset < 205; offset += 100) {
			await data(
				await importBatch(
					"journal",
					Array.from({ length: Math.min(100, 205 - offset) }, (_, index) => ({
						key: `ai-journal-${offset + index}`,
						occurredAt:
							offset + index === 23
								? "2099-06-15T23:59:00Z"
								: `2099-06-15T${String((offset + index) % 24).padStart(2, "0")}:30:00Z`,
						precision: "minute",
						title: offset + index === 23 ? "夜间阅读" : `实录 ${offset + index}`,
						content: "已记录的活动",
					})),
				),
			);
		}
		await data(
			await importBatch("apple-health", [
				{
					key: "ai-steps-1",
					occurredAt: "2099-06-15T06:00:00Z",
					title: "步数",
					data: { type: "HKQuantityTypeIdentifierStepCount", value: "1000", unit: "count" },
				},
				{
					key: "ai-steps-2",
					occurredAt: "2099-06-15T16:00:00Z",
					title: "步数",
					data: { type: "HKQuantityTypeIdentifierStepCount", value: "500", unit: "count" },
				},
			]),
		);
		const result = await data<DaySummaryResult>(
			await request("/api/day-summary", { method: "POST", body: summaryDay }),
		);
		assert(result.summary);
		assert.equal(result.eventCount, 207);
		assert.equal(result.summary.eventCount, 207);
		assert.equal(result.stale, false);
		assert.equal(result.summary.provider, "custom");
		assert.match(result.summary.content, /晨间阅读/);
		assert.match(result.summary.generatedAt, /Z$/);
		const reread = await data<DaySummaryResult>(await request(summaryPath));
		assert.deepEqual(reread, result);
		const samples = (await (await fetch(`${new URL(aiBaseURL).origin}/requests`)).json()) as {
			model: string;
			input: string;
		}[];
		const prompt = samples.at(-1)?.input ?? "";
		assert.match(prompt, /1500/);
		assert.match(prompt, /207/);
		assert.match(prompt, /2099-06-15/);
		assert.match(prompt, /夜间阅读/);
	},
);

await scenario(
	"summary freshness notices replacements while failed generation retains the last success",
	async () => {
		const before = await data<DaySummaryResult>(await request(summaryPath));
		await data(
			await importBatch("journal", [
				{ key: "ai-journal-0", occurredAt: "2099-06-15T00:30:00Z", title: "更新后的阅读记录" },
			]),
		);
		const stale = await data<DaySummaryResult>(await request(summaryPath));
		assert.equal(stale.stale, true);
		assert.equal(stale.eventCount, 207);
		assert.deepEqual(stale.summary, before.summary);
		await saveAi({ model: "life-test-failure" });
		const failure = await request("/api/day-summary", { method: "POST", body: summaryDay });
		assert(!(await failure.clone().text()).includes(aiKey));
		await rejected(failure, 502);
		assert.deepEqual(
			(await data<DaySummaryResult>(await request(summaryPath))).summary,
			before.summary,
		);
		await saveAi();
		const refreshed = await data<DaySummaryResult>(
			await request("/api/day-summary", { method: "POST", body: summaryDay }),
		);
		assert.equal(refreshed.stale, false);
		assert.notEqual(refreshed.summary?.inputHash, before.summary?.inputHash);
	},
);

await scenario(
	"concurrent summary generation has one D1 lease and releases it after success or failure",
	async () => {
		await saveAi({ model: "life-test-slow" });
		const concurrent = await Promise.all(
			[1, 2].map(() => request("/api/day-summary", { method: "POST", body: summaryDay })),
		);
		assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
		await saveAi({ model: "life-test-empty" });
		await rejected(await request("/api/day-summary", { method: "POST", body: summaryDay }), 502);
		const leases = (await executeLocalSql(
			state,
			"SELECT COUNT(*) AS count FROM day_summary_leases;",
		)) as { results: { count: number }[] }[];
		assert.equal(leases[0]?.results[0]?.count, 0);
	},
);

await scenario(
	"provider changes require a new key and both supported SDK protocols work against a local fixture",
	async () => {
		const switched = await saveAi({ sdkType: "openai", authType: "bearer" });
		assert.equal(switched.hasApiKey, false);
		await rejected(await request("/api/settings/ai/test", { method: "POST" }), 400);
		await saveAi({ sdkType: "openai", authType: "bearer", apiKey: aiKey });
		assert.equal(
			(await data<AiConnectionResult>(await request("/api/settings/ai/test", { method: "POST" })))
				.success,
			true,
		);
		for (const bad of [
			{ ...summaryDay, start: "2099-06-15T01:00:00Z" },
			{ ...summaryDay, timeZone: "Asia/Shanghai" },
			{ ...summaryDay, date: "invalid" },
		]) {
			await rejected(await request("/api/day-summary", { method: "POST", body: bad }), 400);
			await rejected(await request(`/api/day-summary?${new URLSearchParams(bad)}`), 400);
		}
	},
);

await scenario(
	"diary generation receives complete finance, health, GPS place, weather and sun; feedback replaces only on success",
	async () => {
		await saveAi({ apiKey: aiKey });
		const query: DaySummaryQuery = {
			date: "2020-07-20",
			timeZone: "Asia/Shanghai",
			start: "2020-07-19T16:00:00Z",
			end: "2020-07-20T16:00:00Z",
		};
		const gps = await validateFootprintDay({
			utcDay: Date.parse("2020-07-20"),
			data: {
				v: 1,
				fields: ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"],
				points: [
					[7200, 31.23, 121.47, 5, 0, 0],
					[7500, 31.232, 121.471, 5, 0, 0],
				],
			},
		});
		const session = await data<{ id: string }>(
			await request("/api/data/footprint/imports", {
				method: "POST",
				body: {
					fileName: "diary.gpx",
					totalDays: 1,
					totalPoints: 2,
					target: "test",
					channel: "cli",
				},
			}),
			201,
		);
		await data(
			await request(`/api/data/footprint/imports/${session.id}/batches/1`, {
				method: "PUT",
				body: { days: [gps] },
			}),
		);
		await data(
			await request(`/api/data/footprint/imports/${session.id}/finish`, {
				method: "POST",
				body: { status: "complete" },
			}),
		);
		await data(
			await importBatch("apple-health", [
				{
					key: "sleep",
					occurredAt: "2020-07-19T15:30:00Z",
					endAt: "2020-07-20T00:00:00Z",
					data: {
						type: "HKCategoryTypeIdentifierSleepAnalysis",
						value: "HKCategoryValueSleepAnalysisAsleepCore",
					},
				},
				{
					key: "steps",
					occurredAt: "2020-07-20T02:00:00Z",
					data: { type: "HKQuantityTypeIdentifierStepCount", value: "1432", unit: "count" },
				},
				{
					key: "oxygen",
					occurredAt: "2020-07-20T02:00:00Z",
					data: { type: "HKQuantityTypeIdentifierOxygenSaturation", value: "0.98", unit: "%" },
				},
			]),
		);
		const plan = await parsePixiu([
			{
				name: "diary.csv",
				text: `${PIXIU_COLUMNS.join(",")}\n2020-07-20,日常支出,咖啡,0.00,56.78,CNY,现金,,河畔读完一本书\n2020-07-20,信用卡还款,还款,0.00,300.00,CNY,卡,,每月还款`,
			},
		]);
		await uploadPixiuPlan(
			createPixiuClient({
				baseUrl: base,
				getHeaders: async () => ({ "Cf-Access-Jwt-Assertion": accessToken }),
			}),
			plan,
			{ target: "test", channel: "cli" },
		);
		const personal: GeneralSettings = {
			places: [
				{ id: "river", label: "河畔书屋", latitude: 31.23, longitude: 121.47, radiusMeters: 100 },
				{ id: "unused", label: "仅配置的工作室", latitude: 32, longitude: 122, radiusMeters: 100 },
			],
			routine: { bedtime: "03:00", wakeTime: "11:00", timeZone: "Asia/Shanghai" },
		};
		await data(await request("/api/settings/general", { method: "PUT", body: personal }));
		const result = await data<DaySummaryResult>(
			await request("/api/day-summary", { method: "POST", body: query }),
		);
		assert(result.summary?.content);
		const prompts = (await (await fetch(`${new URL(aiBaseURL).origin}/requests`)).json()) as {
			input: string;
		}[];
		const prompt = prompts.at(-1)?.input ?? "";
		for (const evidence of [
			"天气",
			"日出",
			"05:30",
			"测试城市",
			"1432",
			"56.78",
			"信用卡还款",
			"河畔读完一本书",
			"睡眠",
			"在用户命名的「河畔书屋」范围内",
			"通常 03:00 入睡，11:00 起床",
			"不是当天的睡眠记录",
		])
			assert(prompt.includes(evidence), `Missing diary evidence: ${evidence}`);
		assert(!prompt.includes("在用户命名的「仅配置的工作室」"));
		const fixture = process.env.LIFE_TEST_CONTEXT_URL;
		assert(fixture);
		const publicCalls = (await (await fetch(`${fixture}/requests`)).json()) as unknown[];
		const path = `/api/day-summary?${new URLSearchParams({ ...query })}`;
		assert.deepEqual(await data<DaySummaryResult>(await request(path)), result);
		const revision = "多写河边读书的片刻，不用逐项报账。";
		const regenerated = await data<DaySummaryResult>(
			await request("/api/day-summary", { method: "POST", body: { ...query, revision } }),
		);
		assert(regenerated.summary?.content);
		const revisedPrompts = (await (
			await fetch(`${new URL(aiBaseURL).origin}/requests`)
		).json()) as { input: string }[];
		assert(revisedPrompts.at(-1)?.input.includes(revision));
		assert(revisedPrompts.at(-1)?.input.includes(result.summary.content));
		assert.equal(
			((await (await fetch(`${fixture}/requests`)).json()) as unknown[]).length,
			publicCalls.length,
		);
		assert.deepEqual(
			(await data<DaySummaryResult>(await request(path))).summary,
			regenerated.summary,
		);
		await data(
			await request("/api/settings/general", {
				method: "PUT",
				body: { ...personal, routine: { ...personal.routine, bedtime: "02:45" } },
			}),
		);
		const stale = await data<DaySummaryResult>(await request(path));
		assert.equal(stale.stale, true);
		assert.deepEqual(stale.summary, regenerated.summary);
		await executeLocalSql(state, "DELETE FROM general_settings;");
	},
);

await scenario(
	"general settings enforce Access, host, origin, method, schemas, normalization and singleton row",
	async () => {
		const path = "/api/settings/general";

		// 1. Boundary enforcement: Access, host, origin, unsupported method
		await rejected(await request(path, { method: "GET", token: null }), 401);
		await rejected(
			await request(path, { method: "PUT", token: null, body: { places: [], routine: null } }),
			401,
		);
		await rejected(await request(path, { method: "GET", host: "life.worker.hexly.ai" }), 404);
		await rejected(
			await request(path, {
				method: "PUT",
				host: "life.worker.hexly.ai",
				body: { places: [], routine: null },
			}),
			404,
		);
		await rejected(
			await request(path, {
				method: "PUT",
				origin: "https://outside.example.test",
				body: { places: [], routine: null },
			}),
			403,
		);
		await rejected(await request(path, { method: "DELETE" }), 405);
		await rejected(await request(path, { method: "PATCH" }), 405);
		await rejected(await request(path, { method: "POST" }), 405);

		// 2. GET returns empty settings initially and does NOT insert a DB row
		const initial = await data<GeneralSettings>(await request(path));
		assert.deepEqual(initial, { places: [], routine: null });
		const initialRows = (await executeLocalSql(
			state,
			"SELECT COUNT(*) AS count FROM general_settings;",
		)) as { results: { count: number }[] }[];
		assert.equal(initialRows[0]?.results[0]?.count, 0);

		// 3. Schema validation rejections (radius, coordinates, duplicate IDs, clock, timezone, body size, content-type)
		const validPlace = {
			id: "home",
			label: "家",
			latitude: 31.23,
			longitude: 121.47,
			radiusMeters: 300,
		};
		const validRoutine = {
			bedtime: "23:00",
			wakeTime: "07:00",
			timeZone: "Asia/Shanghai",
		};

		// 3a. Invalid Content-Type
		await rejected(
			await request(path, {
				method: "PUT",
				raw: JSON.stringify({ places: [], routine: null }),
				contentType: "text/plain",
			}),
			415,
		);

		// 3b. Oversized body (> 64 KiB limit)
		const oversizedLabel = "x".repeat(70 * 1024);
		await rejected(
			await request(path, {
				method: "PUT",
				raw: JSON.stringify({ places: [{ ...validPlace, label: oversizedLabel }], routine: null }),
			}),
			413,
		);

		// 3c. Invalid JSON structure & fields
		for (const invalidBody of [
			null,
			[],
			"not-json-object",
			{ places: "not-array", routine: null },
			{ places: [], routine: "not-object" },
			// Invalid radius (< 50 or > 50000 or non-integer)
			{ places: [{ ...validPlace, radiusMeters: 49 }], routine: null },
			{ places: [{ ...validPlace, radiusMeters: 50001 }], routine: null },
			{ places: [{ ...validPlace, radiusMeters: 300.5 }], routine: null },
			// Invalid coordinates
			{ places: [{ ...validPlace, latitude: 91 }], routine: null },
			{ places: [{ ...validPlace, latitude: -91 }], routine: null },
			{ places: [{ ...validPlace, longitude: 181 }], routine: null },
			{ places: [{ ...validPlace, longitude: -181 }], routine: null },
			// Invalid label (empty, > 80 chars, control chars)
			{ places: [{ ...validPlace, label: "" }], routine: null },
			{ places: [{ ...validPlace, label: "   " }], routine: null },
			{ places: [{ ...validPlace, label: "a".repeat(81) }], routine: null },
			{ places: [{ ...validPlace, label: "line\nbreak" }], routine: null },
			// Invalid ID format
			{ places: [{ ...validPlace, id: "" }], routine: null },
			{ places: [{ ...validPlace, id: "bad id with space" }], routine: null },
			{ places: [{ ...validPlace, id: "a".repeat(65) }], routine: null },
			// Duplicate place IDs
			{ places: [validPlace, { ...validPlace, label: "分店" }], routine: null },
			// Invalid routine clocks
			{ places: [], routine: { ...validRoutine, bedtime: "24:00" } },
			{ places: [], routine: { ...validRoutine, wakeTime: "07:60" } },
			{ places: [], routine: { ...validRoutine, bedtime: "invalid" } },
			{ places: [], routine: { ...validRoutine, bedtime: "07:00", wakeTime: "07:00" } }, // identical bedtime & wakeTime
			// Invalid routine timezone
			{ places: [], routine: { ...validRoutine, timeZone: "Invalid/Not_A_Timezone_123" } },
		]) {
			await rejected(await request(path, { method: "PUT", body: invalidBody }), 400);
		}

		// 4. PUT multiple places and non-standard sleep routine
		const multiSettings: GeneralSettings = {
			places: [
				validPlace,
				{
					id: "office-1",
					label: "办公楼",
					latitude: 31.24,
					longitude: 121.49,
					radiusMeters: 1000,
				},
				{
					id: "gym_crossfit",
					label: "训练馆",
					latitude: -12.05,
					longitude: 77.04,
					radiusMeters: 50,
				},
			],
			routine: {
				bedtime: "03:15",
				wakeTime: "11:45",
				timeZone: "America/New_York",
			},
		};

		const saved = await data<GeneralSettings>(
			await request(path, { method: "PUT", body: multiSettings }),
		);
		assert.deepEqual(saved, multiSettings);

		// Exactly one singleton row in general_settings table
		const afterPutRows = (await executeLocalSql(
			state,
			"SELECT id, data_json, updated_at FROM general_settings;",
		)) as { results: { id: string; data_json: string; updated_at: number }[] }[];
		assert.equal(afterPutRows[0]?.results.length, 1);
		assert.equal(afterPutRows[0]?.results[0]?.id, "default");
		const firstUpdatedAt = afterPutRows[0]?.results[0]?.updated_at;
		assert(firstUpdatedAt && firstUpdatedAt > 0);

		// 5. Re-put identical content (even with trimmed whitespace / canonical timezone representation)
		// normalized content does NOT update updated_at
		const normalizedRePut = {
			places: [
				{ ...validPlace, label: "  家  " }, // whitespace trims to "家"
				multiSettings.places[1],
				multiSettings.places[2],
			],
			routine: {
				...multiSettings.routine,
				timeZone: "US/Eastern", // IANA resolves to "America/New_York"
			},
		};

		const rePutSaved = await data<GeneralSettings>(
			await request(path, { method: "PUT", body: normalizedRePut }),
		);
		assert.deepEqual(rePutSaved, multiSettings);

		const afterRePutRows = (await executeLocalSql(
			state,
			"SELECT id, updated_at FROM general_settings;",
		)) as { results: { id: string; updated_at: number }[] }[];
		assert.equal(afterRePutRows[0]?.results.length, 1);
		assert.equal(afterRePutRows[0]?.results[0]?.updated_at, firstUpdatedAt);

		// 6. Clearing settings (empty places and null routine)
		const clearedSettings: GeneralSettings = { places: [], routine: null };
		const cleared = await data<GeneralSettings>(
			await request(path, { method: "PUT", body: clearedSettings }),
		);
		assert.deepEqual(cleared, clearedSettings);

		// Verify GET returns cleared settings
		const getCleared = await data<GeneralSettings>(await request(path));
		assert.deepEqual(getCleared, clearedSettings);

		// 7. Cleanup D1 row completely so subsequent test suites start with clean state
		await executeLocalSql(state, "DELETE FROM general_settings;");
		const finalRows = (await executeLocalSql(
			state,
			"SELECT COUNT(*) AS count FROM general_settings;",
		)) as { results: { count: number }[] }[];
		assert.equal(finalRows[0]?.results[0]?.count, 0);
	},
);

await scenario(
	"Gecko/Firefly settings and daily reads authenticate, aggregate, cache and erase connections",
	async () => {
		const root = "/api/settings/sources";
		const query = {
			date: "2026-09-10",
			timeZone: "Asia/Shanghai",
			start: "2026-09-09T16:00:00.000Z",
			end: "2026-09-10T16:00:00.000Z",
		};
		const path = `/api/day-sources?${new URLSearchParams(query)}`;
		for (const [endpoint, method] of [
			[root, "GET"],
			[`${root}/gecko`, "PUT"],
			[`${root}/firefly`, "DELETE"],
			[`${root}/gecko/test`, "POST"],
			[path, "GET"],
		]) {
			await rejected(await request(endpoint as string, { method, token: null }), 401);
			await rejected(
				await request(endpoint as string, { method, host: "life.worker.hexly.ai" }),
				404,
			);
		}
		await rejected(
			await request(`${root}/firefly`, {
				method: "PUT",
				origin: "https://foreign.test",
				body: { enabled: true },
			}),
			403,
		);
		await rejected(await request(`${root}/gecko`, { method: "PUT", body: { enabled: true } }), 400);
		await rejected(await request(`${root}/gecko/test`), 405);
		await rejected(await request(`${root}/firefly/test`, { method: "POST", body: query }), 400);
		await rejected(await request("/api/day-sources?date=invalid"), 400);
		const fixtureKey = `gk_${"a".repeat(64)}`;
		const saved = await data<DaySourceSettings[]>(
			await request(`${root}/gecko`, {
				method: "PUT",
				body: { enabled: true, apiKey: fixtureKey },
			}),
		);
		assert(saved.find((source) => source.provider === "gecko")?.hasApiKey);
		assert(!JSON.stringify(saved).includes(fixtureKey));
		await data(await request(`${root}/firefly`, { method: "PUT", body: { enabled: true } }));
		assert.equal(
			(await data<DaySourceSettings[]>(await request(root))).filter((source) => source.enabled)
				.length,
			2,
		);
		for (const provider of ["gecko", "firefly"]) {
			const test = await data<DaySourceConnection>(
				await request(`${root}/${provider}/test`, { method: "POST", body: query }),
			);
			assert(test.success);
			assert.equal(test.eventCount, provider === "gecko" ? 2 : 1);
		}
		const result = await data<DaySourcesResult>(await request(path));
		assert.equal(result.events.filter((event) => event.sourceId === "gecko").length, 2);
		assert(!JSON.stringify(result).includes("loginwindow"));
		const article = result.events.find((event) => event.sourceId === "firefly");
		assert.equal(article?.occurredAt, "2026-09-10T02:23:45.000Z");
		assert.match(JSON.stringify(article?.data), /fixture-cover|测试作者/);
		assert.deepEqual(await data(await request(path)), result);
		await data(await request(`${root}/gecko`, { method: "PUT", body: { enabled: false } }));
		assert.equal((await data<DaySourcesResult>(await request(path))).events.length, 1);
		for (const provider of ["gecko", "firefly"])
			await data(await request(`${root}/${provider}`, { method: "DELETE" }));
		assert.equal(
			(await data<DaySourceSettings[]>(await request(root))).filter(
				(source) => source.enabled || source.hasApiKey,
			).length,
			0,
		);
		const rows = (await executeLocalSql(state, "SELECT COUNT(*) AS n FROM day_source_cache;")) as {
			results: { n: number }[];
		}[];
		assert.equal(rows[0]?.results[0]?.n, 0);
	},
);

await scenario(
	"GitHub authenticates PAT settings and persists complete account/day snapshots without repeat upstream requests",
	async () => {
		const root = "/api/settings/sources/github";
		const fixture = process.env.LIFE_TEST_CONTEXT_URL;
		assert(fixture && new URL(fixture).hostname === "127.0.0.1");
		const upstreamCalls = async () =>
			((await (await fetch(`${fixture}/requests`)).json()) as { path: string }[]).filter((item) =>
				item.path.startsWith("/github/"),
			).length;
		for (const [endpoint, method] of [
			[root, "PUT"],
			[root, "DELETE"],
			[`${root}/test`, "POST"],
		] as const) {
			await rejected(await request(endpoint, { method, token: null }), 401);
			await rejected(await request(endpoint, { method, host: "life.worker.hexly.ai" }), 404);
		}
		await rejected(
			await request(root, {
				method: "PUT",
				origin: "https://foreign.test",
				body: { enabled: true, apiKey: githubFixtureKey },
			}),
			403,
		);
		await rejected(await request(root, { method: "PUT", body: { enabled: true } }), 400);
		const saved = await data<DaySourceSettings[]>(
			await request(root, { method: "PUT", body: { enabled: true, apiKey: githubFixtureKey } }),
		);
		assert.deepEqual(
			saved.find((item) => item.provider === "github")?.account,
			githubFixtureAccount,
		);
		assert(!JSON.stringify(saved).includes(githubFixtureKey));
		const path = `/api/day-sources?${new URLSearchParams(githubFixtureQuery)}`;
		const before = await upstreamCalls();
		const [first, second] = await Promise.all(
			[1, 2].map(async () => data<DaySourcesResult>(await request(path))),
		);
		assert(first && second);
		assert.equal(first.events.length, 5);
		assert.deepEqual(second, first);
		assert.equal((await upstreamCalls()) - before, 3);
		const cachedCalls = await upstreamCalls();
		const connection = await data<DaySourceConnection>(
			await request(`${root}/test`, { method: "POST", body: githubFixtureQuery }),
		);
		assert(connection.success);
		assert.equal(connection.eventCount, 5);
		assert.deepEqual(await data(await request(path)), first);
		assert.equal(await upstreamCalls(), cachedCalls);
		await data(await request(root, { method: "PUT", body: { enabled: false } }));
		await data(await request(root, { method: "PUT", body: { enabled: true } }));
		assert.deepEqual(await data(await request(path)), first);
		assert.equal(await upstreamCalls(), cachedCalls);
		const emptyQuery = {
			...githubFixtureQuery,
			date: "2026-09-11",
			start: githubFixtureQuery.end,
			end: "2026-09-11T16:00:00.000Z",
		};
		const emptyPath = `/api/day-sources?${new URLSearchParams(emptyQuery)}`;
		const empty = await data<DaySourcesResult>(await request(emptyPath));
		assert.equal(empty.events.length, 0);
		assert.equal(empty.sources[0]?.state, "ready");
		const afterEmpty = await upstreamCalls();
		assert.deepEqual(await data(await request(emptyPath)), empty);
		assert.equal(await upstreamCalls(), afterEmpty);
		await data(await request(root, { method: "DELETE" }));
		assert(
			!(await data<DaySourceSettings[]>(await request("/api/settings/sources"))).find(
				(item) => item.provider === "github",
			)?.hasApiKey,
		);
		const cache = (await executeLocalSql(
			state,
			"SELECT COUNT(*) AS n FROM github_day_cache WHERE data_json IS NOT NULL;",
		)) as { results: { n: number }[] }[];
		assert.equal(cache[0]?.results[0]?.n, 2);
	},
);

await scenario(
	"cache management authenticates, scopes deletion, preserves settings and refetches GitHub only after explicit invalidation",
	async () => {
		const listPath = "/api/cache?scope=day&date=2026-09-10";
		const clearPath = "/api/cache/github?scope=day&date=2026-09-10";
		for (const [endpoint, method] of [
			[listPath, "GET"],
			[clearPath, "DELETE"],
		]) {
			await rejected(await request(endpoint as string, { method, token: null }), 401);
			await rejected(
				await request(endpoint as string, { method, host: "life.worker.hexly.ai" }),
				404,
			);
		}
		await rejected(
			await request(clearPath, { method: "DELETE", origin: "https://foreign.test" }),
			403,
		);
		await rejected(await request("/api/cache/github", { method: "DELETE" }), 400);
		await rejected(await request("/api/cache/day_summaries?scope=all", { method: "DELETE" }), 404);
		await rejected(await request("/api/cache?scope=day&date=2026-02-30"), 400);
		await rejected(await request("/api/cache?scope=all", { method: "DELETE" }), 405);
		const fixture = process.env.LIFE_TEST_CONTEXT_URL;
		assert(fixture && new URL(fixture).hostname === "127.0.0.1");
		const upstreamCalls = async () =>
			((await (await fetch(`${fixture}/requests`)).json()) as unknown[]).length;
		const settings = await data<DaySourceSettings[]>(
			await request("/api/settings/sources/github", {
				method: "PUT",
				body: { enabled: true, apiKey: githubFixtureKey },
			}),
		);
		const beforeCalls = await upstreamCalls();
		const daily = await data<CacheOverview>(await request(listPath));
		assert.equal(daily.entries.find((entry) => entry.kind === "github")?.count, 1);
		assert(!JSON.stringify(daily).includes(githubFixtureKey));
		const cleared = await data<CacheClearResult>(await request(clearPath, { method: "DELETE" }));
		assert.equal(cleared.cleared, 1);
		assert.equal(cleared.overview.entries.find((entry) => entry.kind === "github")?.count, 0);
		assert.equal(
			(await data<CacheOverview>(await request("/api/cache?scope=all"))).entries.find(
				(entry) => entry.kind === "github",
			)?.count,
			1,
		);
		assert.equal(await upstreamCalls(), beforeCalls);
		assert.deepEqual(await data(await request("/api/settings/sources")), settings);
		const dayPath = `/api/day-sources?${new URLSearchParams(githubFixtureQuery)}`;
		assert.equal((await data<DaySourcesResult>(await request(dayPath))).events.length, 5);
		assert.equal(await upstreamCalls(), beforeCalls + 3);
		await data(await request(dayPath));
		assert.equal(await upstreamCalls(), beforeCalls + 3);
		const preservedSql =
			"SELECT (SELECT COUNT(*) FROM life_events) AS events, (SELECT COUNT(*) FROM provider_days) AS provider_days, (SELECT COUNT(*) FROM health_series) AS health_series, (SELECT COUNT(*) FROM day_summaries) AS diaries, (SELECT data_json FROM general_settings LIMIT 1) AS settings";
		const preserved = (await executeLocalSql(state, preservedSql)) as { results: unknown[] }[];
		for (const kind of CACHE_KINDS)
			await data(await request(`/api/cache/${kind}?scope=all`, { method: "DELETE" }));
		assert(
			(await data<CacheOverview>(await request("/api/cache?scope=all"))).entries.every(
				(entry) => entry.count === 0,
			),
		);
		assert.deepEqual(
			((await executeLocalSql(state, preservedSql)) as { results: unknown[] }[])[0]?.results,
			preserved[0]?.results,
		);
		assert.deepEqual(await data(await request("/api/settings/sources")), settings);
	},
);

await assertMarker(state);
console.log(
	`L2 passed: ${scenarios} scenarios, all method/path API contracts through real HTTP and local D1.`,
);
