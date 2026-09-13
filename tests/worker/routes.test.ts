import { describe, expect, it } from "vitest";
import type { Connect, EventPage, IngestReceipt, Source } from "../../src/models/types.js";
import {
	handleDeleteConnect,
	handleGetConnects,
	handleGetEvents,
	handleGetLive,
	handleGetSession,
	handleGetSources,
	handlePostConnects,
	handlePostImports,
	handlePostIngest,
} from "../../worker/routes.js";
import type { WorkerEnv } from "../../worker/types.js";

function createInMemoryD1() {
	const sources: {
		id: string;
		name: string;
		kind: string;
		provider: string;
		created_at: number;
	}[] = [];
	const connects: {
		id: string;
		name: string;
		token_hash: string;
		prefix: string;
		created_at: number;
		last_used_at: number | null;
		revoked_at: number | null;
	}[] = [];
	const events: {
		id: string;
		source_id: string;
		external_key: string | null;
		occurred_at: number;
		end_at: number | null;
		precision: string;
		title: string;
		content: string;
		data: string;
		updated_at: number;
	}[] = [];

	let failLiveQuery = false;

	const db = {
		_sources: sources,
		_connects: connects,
		_events: events,
		setFailLiveQuery(val: boolean) {
			failLiveQuery = val;
		},
		prepare(sql: string) {
			const prepared = {
				bind(...args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							if (sql.includes("SELECT 1 as alive")) {
								if (failLiveQuery) throw new Error("DB offline");
								return { alive: 1 } as unknown as T;
							}
							if (
								sql.includes(
									"SELECT id, name, prefix, revoked_at FROM connects WHERE token_hash = ?",
								)
							) {
								const hash = args[0] as string;
								const found = connects.find((c) => c.token_hash === hash);
								return (found ? { ...found } : null) as unknown as T;
							}
							if (
								sql.includes(
									"SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM connects WHERE id = ?",
								)
							) {
								const id = args[0] as string;
								const found = connects.find((c) => c.id === id);
								return (found ? { ...found } : null) as unknown as T;
							}
							if (sql.includes("SELECT COUNT(id) as count FROM life_events WHERE source_id = ?")) {
								const id = args[0] as string;
								const count = events.filter((e) => e.source_id === id).length;
								return { count } as unknown as T;
							}
							if (
								sql.includes("INSERT INTO life_events") &&
								sql.includes("SELECT ?, id") &&
								sql.includes("RETURNING")
							) {
								const [id, occurred_at, title, content, data, updated_at, connectId] = args as [
									string,
									number,
									string,
									string,
									string,
									number,
									string,
								];
								// Check if connect exists and is NOT revoked
								const conn = connects.find((c) => c.id === connectId && c.revoked_at === null);
								if (!conn) {
									return null; // Atomic revocation fence: returns null
								}

								const existing = events.find(
									(e) =>
										e.source_id === connectId &&
										e.occurred_at === occurred_at &&
										e.external_key === null,
								);
								if (existing) {
									existing.title = title;
									existing.content = content;
									existing.data = data;
									existing.updated_at = updated_at;
									return {
										id: existing.id,
										occurred_at: existing.occurred_at,
										precision: "hour",
										updated_at: existing.updated_at,
									} as unknown as T;
								}
								const newRecord = {
									id,
									source_id: connectId,
									external_key: null,
									occurred_at,
									end_at: null,
									precision: "hour",
									title,
									content,
									data,
									updated_at,
								};
								events.push(newRecord);
								return {
									id,
									occurred_at,
									precision: "hour",
									updated_at,
								} as unknown as T;
							}
							return null;
						},
						async all<T>(): Promise<{ results: T[] }> {
							if (sql.includes("FROM sources s")) {
								const res = sources.map((s) => {
									const sEvents = events.filter((e) => e.source_id === s.id);
									const lastEventAt =
										sEvents.length > 0 ? Math.max(...sEvents.map((e) => e.occurred_at)) : null;
									return {
										id: s.id,
										name: s.name,
										kind: s.kind,
										provider: s.provider,
										record_count: sEvents.length,
										last_event_at: lastEventAt,
									};
								});
								return { results: res as unknown as T[] };
							}
							if (sql.includes("FROM connects c")) {
								const res = connects.map((c) => {
									const sEvents = events.filter((e) => e.source_id === c.id);
									return {
										id: c.id,
										name: c.name,
										prefix: c.prefix,
										created_at: c.created_at,
										last_used_at: c.last_used_at,
										revoked_at: c.revoked_at,
										record_count: sEvents.length,
									};
								});
								return { results: res as unknown as T[] };
							}
							if (sql.includes("FROM life_events e")) {
								const startMs = args[0] as number;
								const endMs = args[1] as number;
								let filtered = events.filter((e) => {
									if (e.occurred_at >= startMs && e.occurred_at < endMs) {
										return true;
									}
									if (
										e.precision !== "day" &&
										e.end_at !== null &&
										e.end_at > e.occurred_at &&
										e.occurred_at < endMs &&
										e.end_at > startMs
									) {
										return true;
									}
									return false;
								});
								let argIdx = 4;
								if (sql.includes("AND e.source_id = ?")) {
									const src = args[argIdx++] as string;
									filtered = filtered.filter((e) => e.source_id === src);
								}
								if (sql.includes("AND (e.occurred_at > ? OR (e.occurred_at = ? AND e.id > ?))")) {
									const curMs = args[argIdx++] as number;
									argIdx++;
									const curId = args[argIdx++] as string;
									filtered = filtered.filter(
										(e) => e.occurred_at > curMs || (e.occurred_at === curMs && e.id > curId),
									);
								}
								const limit = args[args.length - 1] as number;
								filtered.sort((a, b) => a.occurred_at - b.occurred_at || a.id.localeCompare(b.id));
								const sliced = filtered.slice(0, limit);
								const mapped = sliced.map((e) => {
									const s = sources.find((src) => src.id === e.source_id) || {
										name: "Unknown",
										kind: "import",
									};
									return {
										id: e.id,
										source_id: e.source_id,
										source_name: s.name,
										source_kind: s.kind,
										occurred_at: e.occurred_at,
										end_at: e.end_at,
										precision: e.precision,
										title: e.title,
										content: e.content,
										data: e.data,
										updated_at: e.updated_at,
									};
								});
								return { results: mapped as unknown as T[] };
							}
							return { results: [] };
						},
						async run() {
							if (sql.includes("UPDATE connects SET last_used_at = ?")) {
								const [time, id] = args as [number, string];
								const found = connects.find((c) => c.id === id);
								if (found) found.last_used_at = time;
							}
							if (sql.includes("UPDATE connects SET revoked_at = ?")) {
								const [time, id] = args as [number, string];
								const found = connects.find((c) => c.id === id);
								if (found) found.revoked_at = time;
							}
							if (sql.includes("INSERT INTO sources")) {
								const [id, name, provider, created_at] = args as [string, string, string, number];
								if (!sources.some((s) => s.id === id)) {
									sources.push({ id, name, kind: "import", provider, created_at });
								}
							}
							if (sql.includes("INSERT INTO connects")) {
								const [id, name, token_hash, prefix, created_at] = args as [
									string,
									string,
									string,
									string,
									number,
								];
								connects.push({
									id,
									name,
									token_hash,
									prefix,
									created_at,
									last_used_at: null,
									revoked_at: null,
								});
							}
							if (sql.includes("INSERT INTO life_events") && !sql.includes("RETURNING")) {
								const [
									id,
									source_id,
									external_key,
									occurred_at,
									end_at,
									precision,
									title,
									content,
									data,
									updated_at,
								] = args as [
									string,
									string,
									string,
									number,
									number | null,
									string,
									string,
									string,
									string,
									number,
								];
								const existing = events.find(
									(e) => e.source_id === source_id && e.external_key === external_key,
								);
								if (existing) {
									existing.occurred_at = occurred_at;
									existing.end_at = end_at;
									existing.precision = precision;
									existing.title = title;
									existing.content = content;
									existing.data = data;
									existing.updated_at = updated_at;
								} else {
									events.push({
										id,
										source_id,
										external_key,
										occurred_at,
										end_at,
										precision,
										title,
										content,
										data,
										updated_at,
									});
								}
							}
							return { success: true };
						},
					};
				},
				async first<T>(): Promise<T | null> {
					if (sql.includes("SELECT 1 as alive")) {
						if (failLiveQuery) throw new Error("DB offline");
						return { alive: 1 } as unknown as T;
					}
					return null;
				},
				async all<T>(): Promise<{ results: T[] }> {
					if (sql.includes("FROM sources s")) {
						const res = sources.map((s) => {
							const sEvents = events.filter((e) => e.source_id === s.id);
							const lastEventAt =
								sEvents.length > 0 ? Math.max(...sEvents.map((e) => e.occurred_at)) : null;
							return {
								id: s.id,
								name: s.name,
								kind: s.kind,
								provider: s.provider,
								record_count: sEvents.length,
								last_event_at: lastEventAt,
							};
						});
						return { results: res as unknown as T[] };
					}
					if (sql.includes("FROM connects c")) {
						const res = connects.map((c) => {
							const sEvents = events.filter((e) => e.source_id === c.id);
							return {
								id: c.id,
								name: c.name,
								prefix: c.prefix,
								created_at: c.created_at,
								last_used_at: c.last_used_at,
								revoked_at: c.revoked_at,
								record_count: sEvents.length,
							};
						});
						return { results: res as unknown as T[] };
					}
					return { results: [] };
				},
			};
			return prepared;
		},
		async batch(statements: { run: () => Promise<unknown> }[]) {
			const res = [];
			for (const stmt of statements) {
				res.push(await stmt.run());
			}
			return res;
		},
	};

	return db as unknown as D1Database & {
		_sources: typeof sources;
		_connects: typeof connects;
		_events: typeof events;
		setFailLiveQuery: (val: boolean) => void;
	};
}

function createWorkerEnv(db: D1Database): WorkerEnv {
	return {
		RESOURCE_ENV: "production",
		APP_ORIGIN: "https://life.hexly.ai",
		INGEST_HOST: "life.worker.hexly.ai",
		ACCESS_TEAM_DOMAIN: "nocoo.cloudflareaccess.com",
		ACCESS_AUD: "test-aud",
		TEST_ACCESS_JWKS: "",
		AI_SETTINGS_KEY: "",
		DB: db,
		ASSETS: {} as Fetcher,
	};
}

describe("worker/routes", () => {
	it("handleGetSession returns session info with author profile if email present", async () => {
		const mockFetch = async () =>
			new Response(
				JSON.stringify({
					name: "Zheng Li",
					avatar: "https://lizheng.blog/avatar.jpg",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);

		const res = await handleGetSession(
			{
				email: "architie@gmail.com",
				subject: "sub-123",
				mode: "access",
			},
			mockFetch,
		);
		const json = (await res.json()) as {
			data: {
				email: string;
				subject: string;
				mode: string;
				name: string | null;
				avatar: string | null;
			};
		};
		expect(json).toEqual({
			data: {
				email: "architie@gmail.com",
				subject: "sub-123",
				mode: "access",
				name: "Zheng Li",
				avatar: "https://lizheng.blog/avatar.jpg",
			},
		});

		// Email is null
		const resNullEmail = await handleGetSession({
			email: null,
			subject: "sub-anon",
			mode: "access",
		});
		const jsonNull = (await resNullEmail.json()) as {
			data: {
				email: string | null;
				subject: string;
				mode: string;
				name: string | null;
				avatar: string | null;
			};
		};
		expect(jsonNull.data.name).toBeNull();
		expect(jsonNull.data.avatar).toBeNull();
	});

	it("handleGetLive returns 200 when DB is ok and 503 when DB fails", async () => {
		const db = createInMemoryD1();
		const env = createWorkerEnv(db);

		const resOk = await handleGetLive(env, "1.0.0");
		expect(resOk.status).toBe(200);
		const jsonOk = (await resOk.json()) as { status: string; version: string; database: string };
		expect(jsonOk.status).toBe("ok");
		expect(jsonOk.version).toBe("1.0.0");
		expect(jsonOk.database).toBe("ok");

		db.setFailLiveQuery(true);
		const resFail = await handleGetLive(env, "1.0.0");
		expect(resFail.status).toBe(503);
		const jsonFail = (await resFail.json()) as { status: string; database: string };
		expect(jsonFail.status).toBe("error");
		expect(jsonFail.database).toBe("error");

		// DB returning null or alive != 1
		const dbNotAlive = {
			prepare() {
				return {
					async first() {
						return { alive: 0 };
					},
				};
			},
		} as unknown as D1Database;
		const resNotAlive = await handleGetLive(createWorkerEnv(dbNotAlive), "1.0.0");
		expect(resNotAlive.status).toBe(503);
	});

	describe("connects lifecycle and race-free ingest", () => {
		it("creates, retrieves, and revokes Connect tokens with race prevention", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			// 1. Create Connect
			const createReq = new Request("https://life.hexly.ai/api/connects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "HealthKit Watch" }),
			});
			const createRes = await handlePostConnects(createReq, env);
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { data: { connect: Connect; token: string } };
			expect(created.data.connect.name).toBe("HealthKit Watch");
			expect(created.data.token.startsWith("life_")).toBe(true);
			const token = created.data.token;
			const connectId = created.data.connect.id;

			// 2. List Connects (exercise non-null lastUsedAt and revokedAt branches)
			const listRes = await handleGetConnects(env);
			const list = (await listRes.json()) as { data: Connect[] };
			expect(list.data.length).toBe(1);
			expect(list.data[0]?.id).toBe(connectId);
			expect(list.data[0]?.recordCount).toBe(0);
			expect(list.data[0]?.lastUsedAt).toBeNull();
			expect(list.data[0]?.revokedAt).toBeNull();

			// 3. Ingest event using token
			const ingestReq = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					timestamp: "2026-09-13T14:25:00Z",
					title: "Hourly Activity",
					content: "Completed 500 steps",
					data: { steps: 500 },
				}),
			});
			const ingestRes = await handlePostIngest(ingestReq, env);
			expect(ingestRes.status).toBe(200);
			const receipt = (await ingestRes.json()) as { data: IngestReceipt };
			expect(receipt.data.occurredAt).toBe("2026-09-13T14:00:00.000Z"); // floored to hour

			// Check that last_used_at was set
			const connRecord = db._connects.find((c) => c.id === connectId);
			expect(connRecord?.last_used_at).not.toBeNull();

			// Ingest again for same hour (idempotent upsert preserves id and replaces content)
			const ingestReq2 = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					timestamp: "2026-09-13T14:45:00Z",
					title: "Hourly Activity Updated",
					content: "Completed 750 steps",
					data: { steps: 750 },
				}),
			});
			const ingestRes2 = await handlePostIngest(ingestReq2, env);
			const receipt2 = (await ingestRes2.json()) as { data: IngestReceipt };
			expect(receipt2.data.id).toBe(receipt.data.id); // preserved id
			expect(db._events.length).toBe(1);
			expect(db._events[0]?.title).toBe("Hourly Activity Updated");

			const lastUsedBeforeRevoke = connRecord?.last_used_at;

			// 4. Revoke Connect
			const revokeRes = await handleDeleteConnect(connectId, env);
			expect(revokeRes.status).toBe(200);
			const revoked = (await revokeRes.json()) as { data: Connect };
			expect(revoked.data.revokedAt).not.toBeNull();

			// Repeated revocation is idempotent
			const revokeRes2 = await handleDeleteConnect(connectId, env);
			expect(revokeRes2.status).toBe(200);

			// List connects again to exercise non-null branches
			const listAfterRevokeRes = await handleGetConnects(env);
			const listAfterRevoke = (await listAfterRevokeRes.json()) as { data: Connect[] };
			expect(listAfterRevoke.data[0]?.lastUsedAt).not.toBeNull();
			expect(listAfterRevoke.data[0]?.revokedAt).not.toBeNull();

			// Ingestion with revoked token now rejected with 403 via atomic SELECT from connects
			await expect(handlePostIngest(ingestReq, env)).rejects.toThrow(
				"Connect token has been revoked",
			);

			// Ensure last_used_at was not updated when rejected
			expect(connRecord?.last_used_at).toBe(lastUsedBeforeRevoke);
		});

		it("throws 404 on deleting non-existent connect", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);
			await expect(handleDeleteConnect("non-existent-id", env)).rejects.toThrow(
				"Connect not found",
			);
		});

		it("validates ingest inputs", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);
			const req = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			await expect(handlePostIngest(req, env)).rejects.toThrow(
				"Missing or invalid Authorization header",
			);
		});

		it("rejects non-object or invalid payloads for connects and ingest", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			// Non-object connect body
			const badConnReq = new Request("https://life.hexly.ai/api/connects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(["not-object"]),
			});
			await expect(handlePostConnects(badConnReq, env)).rejects.toThrow(
				"Expected JSON object body",
			);

			// Valid connect for ingest tests
			const connReq = new Request("https://life.hexly.ai/api/connects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Ingest Test Device" }),
			});
			const connRes = await handlePostConnects(connReq, env);
			const { token } = ((await connRes.json()) as { data: { token: string } }).data;

			// Ingest non-object body
			const badIngestReq1 = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify("string-body"),
			});
			await expect(handlePostIngest(badIngestReq1, env)).rejects.toThrow(
				"Expected JSON object body",
			);

			// Ingest missing timestamp
			const badIngestReq2 = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title: "No timestamp" }),
			});
			await expect(handlePostIngest(badIngestReq2, env)).rejects.toThrow("timestamp is required");

			// Ingest invalid timestamp string
			const badIngestReq3 = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title: "Bad timestamp", timestamp: "not-a-date" }),
			});
			await expect(handlePostIngest(badIngestReq3, env)).rejects.toThrow();
		});
	});

	describe("imports and sources validation & zero-length interval", () => {
		it("imports batches of records idempotently and floors to precision", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const records = [
				{
					key: "record-1",
					occurredAt: "2026-09-13T10:14:32Z",
					title: "Running workout",
					content: "5km morning run",
					precision: "minute" as const,
					data: { distanceKm: 5 },
				},
				{
					key: "record-1b",
					occurredAt: "2026-09-13T10:14:32Z",
					title: "Running workout second",
					precision: "second" as const,
				},
				{
					key: "record-1c",
					occurredAt: "2026-09-13T10:14:32Z",
					title: "Running workout hour",
					precision: "hour" as const,
				},
				{
					key: "record-2",
					occurredAt: "2026-09-13T12:00:00Z",
					endAt: "2026-09-13T13:00:00Z",
					title: "Lunch walk",
					data: { distanceKm: 1.5 },
				},
				{
					key: "record-3",
					occurredAt: "2026-09-13T00:00:00Z",
					endAt: "2026-09-13T00:00:00Z", // zero-length interval at start
					title: "Zero length check",
				},
				{
					key: "record-4",
					occurredAt: "2026-09-13T00:00:00Z",
					precision: "day" as const,
					endAt: "2026-09-14T00:00:00Z", // day record endAt cleared
					title: "Day precision check",
				},
			];

			const importReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records,
				}),
			});

			const res = await handlePostImports(importReq, env);
			expect(res.status).toBe(200);
			const resJson = (await res.json()) as { data: { accepted: number } };
			expect(resJson.data.accepted).toBe(6);

			// Check sources
			const sourcesRes = await handleGetSources(env);
			const sourcesJson = (await sourcesRes.json()) as { data: Source[] };
			expect(sourcesJson.data.length).toBe(1);
			expect(sourcesJson.data[0]?.id).toBe("apple-health");
			expect(sourcesJson.data[0]?.name).toBe("Apple Health");
			expect(sourcesJson.data[0]?.recordCount).toBe(6);

			// Query events - zero length interval at start is retained, day record has endAt: null
			const url = new URL(
				"https://life.hexly.ai/api/events?start=2026-09-13T00:00:00Z&end=2026-09-13T23:59:59Z",
			);
			const eventsRes = await handleGetEvents(env, url);
			const eventsJson = (await eventsRes.json()) as { data: EventPage };
			expect(eventsJson.data.events.length).toBe(6);
			const titles = eventsJson.data.events.map((e) => e.title);
			expect(titles).toContain("Zero length check");
			expect(titles).toContain("Day precision check");
			const dayEvent = eventsJson.data.events.find((e) => e.title === "Day precision check");
			expect(dayEvent?.endAt).toBeNull();
			const runEvent = eventsJson.data.events.find((e) => e.title === "Running workout");
			expect(runEvent?.occurredAt).toBe("2026-09-13T10:14:00.000Z"); // floored to minute
		});

		it("rejects non-object top-level payload or records with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			// Array top-level payload
			const arrayReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([]),
			});
			await expect(handlePostImports(arrayReq, env)).rejects.toThrow("Expected JSON object body");

			// Boolean top-level payload
			const boolReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(true),
			});
			await expect(handlePostImports(boolReq, env)).rejects.toThrow("Expected JSON object body");

			// Missing source or records not array
			const noSourceReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ records: [] }),
			});
			await expect(handlePostImports(noSourceReq, env)).rejects.toThrow("source is required");

			const notArrayReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: "not-array" }),
			});
			await expect(handlePostImports(notArrayReq, env)).rejects.toThrow("records must be an array");

			// Null record item
			const nullReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: [null] }),
			});
			await expect(handlePostImports(nullReq, env)).rejects.toThrow("must be a non-null object");

			// Primitive record item
			const primReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: ["string-record"] }),
			});
			await expect(handlePostImports(primReq, env)).rejects.toThrow("must be a non-null object");
		});

		it("rejects record with empty or non-string occurredAt with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const emptyOccurredReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [{ key: "k1", occurredAt: "", title: "Test" }],
				}),
			});
			await expect(handlePostImports(emptyOccurredReq, env)).rejects.toThrow(
				"occurredAt is required",
			);

			const numOccurredReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [{ key: "k1", occurredAt: 12345, title: "Test" }],
				}),
			});
			await expect(handlePostImports(numOccurredReq, env)).rejects.toThrow(
				"occurredAt is required",
			);
		});

		it("rejects record with malformed occurredAt or endAt format with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const badOccurredReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [{ key: "k1", occurredAt: "invalid-date", title: "Test" }],
				}),
			});
			await expect(handlePostImports(badOccurredReq, env)).rejects.toThrow("records[0].occurredAt");

			const badEndAtReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [
						{ key: "k1", occurredAt: "2026-09-13T10:00:00Z", endAt: "invalid-end", title: "Test" },
					],
				}),
			});
			await expect(handlePostImports(badEndAtReq, env)).rejects.toThrow("records[0].endAt");
		});

		it("rejects invalid precision with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const badPrecReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [
						{ key: "k1", occurredAt: "2026-09-13T10:00:00Z", precision: "invalid", title: "Test" },
					],
				}),
			});
			await expect(handlePostImports(badPrecReq, env)).rejects.toThrow("precision must be one of");
		});

		it("rejects invalid or backward endAt with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const badRangeReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [
						{
							key: "k1",
							occurredAt: "2026-09-13T10:00:00Z",
							endAt: "2026-09-13T09:00:00Z",
							title: "Test",
						},
					],
				}),
			});
			await expect(handlePostImports(badRangeReq, env)).rejects.toThrow(
				"endAt cannot be earlier than occurredAt",
			);

			const badEndAtTypeReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "apple-health",
					records: [
						{
							key: "k1",
							occurredAt: "2026-09-13T10:00:00Z",
							endAt: 12345,
							title: "Test",
						},
					],
				}),
			});
			await expect(handlePostImports(badEndAtTypeReq, env)).rejects.toThrow(
				"endAt must be a valid ISO string",
			);
		});

		it("rejects invalid import sources or empty batches without creating sources", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const badSourceReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: "invalid-source",
					records: [{ key: "k", occurredAt: "2026-01-01", title: "t" }],
				}),
			});
			await expect(handlePostImports(badSourceReq, env)).rejects.toThrow("Unsupported source");
			expect(db._sources.length).toBe(0);

			const emptyBatchReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: [] }),
			});
			await expect(handlePostImports(emptyBatchReq, env)).rejects.toThrow(
				"Records array cannot be empty",
			);
			expect(db._sources.length).toBe(0);
		});

		it("rejects invalid time ranges and windows > 32 days in events query", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const missingUrl = new URL("https://life.hexly.ai/api/events?start=2026-01-01T00:00:00Z");
			await expect(handleGetEvents(env, missingUrl)).rejects.toThrow(
				"start and end query parameters are required",
			);

			const badTimeUrl = new URL(
				"https://life.hexly.ai/api/events?start=bad&end=2026-01-01T00:00:00Z",
			);
			await expect(handleGetEvents(env, badTimeUrl)).rejects.toThrow();

			const invertedUrl = new URL(
				"https://life.hexly.ai/api/events?start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z",
			);
			await expect(handleGetEvents(env, invertedUrl)).rejects.toThrow(
				"start must be strictly before end",
			);

			const tooBigUrl = new URL(
				"https://life.hexly.ai/api/events?start=2026-01-01T00:00:00Z&end=2026-03-01T00:00:00Z",
			);
			await expect(handleGetEvents(env, tooBigUrl)).rejects.toThrow(
				"Time window cannot exceed 32 days",
			);
		});

		it("paginates events when result exceeds page size and filters by source", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			// Populate 205 events
			const records = Array.from({ length: 205 }, (_, i) => ({
				key: `k-${i}`,
				occurredAt: `2026-09-13T10:00:${String(i % 60).padStart(2, "0")}Z`,
				title: `Event ${i}`,
				precision: "second" as const,
			}));

			const importReq = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: records.slice(0, 100) }),
			});
			await handlePostImports(importReq, env);

			const importReq2 = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: records.slice(100, 200) }),
			});
			await handlePostImports(importReq2, env);

			const importReq3 = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: records.slice(200, 205) }),
			});
			await handlePostImports(importReq3, env);

			// Query first page with source filter
			const url1 = new URL(
				"https://life.hexly.ai/api/events?start=2026-09-13T00:00:00Z&end=2026-09-13T23:59:59Z&source=apple-health",
			);
			const page1Res = await handleGetEvents(env, url1);
			const page1 = (await page1Res.json()) as { data: EventPage };
			expect(page1.data.events.length).toBe(200);
			expect(page1.data.nextCursor).not.toBeNull();

			// Query second page using cursor
			const url2 = new URL(
				`https://life.hexly.ai/api/events?start=2026-09-13T00:00:00Z&end=2026-09-13T23:59:59Z&source=apple-health&cursor=${page1.data.nextCursor}`,
			);
			const page2Res = await handleGetEvents(env, url2);
			const page2 = (await page2Res.json()) as { data: EventPage };
			expect(page2.data.events.length).toBe(5);
			expect(page2.data.nextCursor).toBeNull();
		});

		it("rejects batches with more than 100 records with 400", async () => {
			const db = createInMemoryD1();
			const env = createWorkerEnv(db);

			const bigList = Array.from({ length: 101 }, (_, i) => ({
				key: `k-${i}`,
				occurredAt: "2026-09-13T10:00:00Z",
				title: `Title ${i}`,
			}));

			const req = new Request("https://life.hexly.ai/api/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "apple-health", records: bigList }),
			});

			await expect(handlePostImports(req, env)).rejects.toThrow(
				"Batch size cannot exceed 100 records",
			);
		});

		it("handles database insertion error on ingest", async () => {
			const brokenDb = {
				prepare(sql: string) {
					return {
						bind() {
							return {
								async first() {
									if (sql.includes("FROM connects WHERE token_hash")) {
										return { id: "c1", name: "dev", prefix: "life_123", revoked_at: null };
									}
									return null; // INSERT returns null when revoked or DB fails
								},
							};
						},
					};
				},
			} as unknown as D1Database;

			const brokenEnv = createWorkerEnv(brokenDb);
			const token = `life_${"a".repeat(64)}`;
			const req = new Request("https://life.worker.hexly.ai/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title: "T", timestamp: "2026-09-13T10:00:00Z" }),
			});

			await expect(handlePostIngest(req, brokenEnv)).rejects.toThrow(
				"Connect token has been revoked",
			);
		});
	});
});
