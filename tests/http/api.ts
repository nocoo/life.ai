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
import type {
	DataOverview,
	FootprintBatchReceipt,
	FootprintDaysResult,
	FootprintImportReceipt,
	FootprintImportSession,
} from "../../src/models/data-management";
import { validateFootprintDay } from "../../src/models/footprint";
import type {
	Connect,
	CreatedConnect,
	EventPage,
	ImportRecord,
	IngestReceipt,
	Session,
	Source,
} from "../../src/models/types";

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
await scenario("remaining event import adapters share the validated D1 endpoint", async () => {
	for (const source of ["apple-health", "pixiu"]) {
		await data(
			await importBatch(source, [
				{ key: `${source}-sample`, occurredAt: "1970-01-01T00:00:00Z", title: source },
			]),
		);
	}
	const sources = await data<Source[]>(await request("/api/sources"));
	assert.equal(
		sources.find((source) => source.id === "pixiu")?.lastEventAt,
		"1970-01-01T00:00:00.000Z",
	);
	assert.equal(sources.find((source) => source.id === "journal")?.recordCount, 6);
});
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
				occurredAt: "2099-01-01T12:00:00Z",
			}));
			await data(await importBatch("pixiu", records));
		}
		const first = await data<EventPage>(await request(eventsQuery("pixiu")));
		assert.equal(first.events.length, 200);
		assert(first.nextCursor);
		const second = await data<EventPage>(await request(eventsQuery("pixiu", first.nextCursor)));
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

await assertMarker(state);
console.log(
	`L2 passed: ${scenarios} scenarios, all 20 method/path API contracts through real HTTP and local D1.`,
);
