import assert from "node:assert/strict";
import { version } from "../../package.json";
import { assertMarker, executeLocalSql } from "../../scripts/local-db";
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
await scenario("all import source adapters share the same validated D1 endpoint", async () => {
	for (const source of ["apple-health", "footprint", "pixiu"]) {
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
			await data(await importBatch("footprint", records));
		}
		const first = await data<EventPage>(await request(eventsQuery("footprint")));
		assert.equal(first.events.length, 200);
		assert(first.nextCursor);
		const second = await data<EventPage>(await request(eventsQuery("footprint", first.nextCursor)));
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

await assertMarker(state);
console.log(
	`L2 passed: ${scenarios} scenarios, all 9 method/path API contracts through real HTTP and local D1.`,
);
