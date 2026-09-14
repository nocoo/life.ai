import { z } from "zod";
import { decodeHealthPart, healthFilePath } from "../src/models/apple-health.js";
import {
	HEALTH_LIMITS,
	type HealthFileManifest,
	type HealthFilePart,
} from "../src/models/health-types.js";
import { sha256 } from "./auth.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { jsonResponse, readJsonBody } from "./utils.js";

const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const partSchema = z
	.object({
		part: integer,
		rawBytes: integer.max(HEALTH_LIMITS.filePartRawBytes),
		payloadBytes: integer.max(HEALTH_LIMITS.filePartBytes),
		contentHash: hashSchema,
	})
	.strict();
const fileSchema = z
	.object({
		path: z
			.string()
			.min(1)
			.max(1024)
			.refine((path) => {
				try {
					return healthFilePath(path) === path;
				} catch {
					return false;
				}
			}),
		kind: z.enum(["route", "ecg", "cda", "metadata"]),
		firstAt: z.number().int().nullable(),
		lastAt: z.number().int().nullable(),
		recordCount: integer,
		rawBytes: integer,
		contentHash: hashSchema,
		parts: z.array(partSchema).min(1).max(20000),
	})
	.strict();

export async function validateHealthFiles(input: unknown): Promise<HealthFileManifest[]> {
	const parsed = z.array(fileSchema).max(10000).safeParse(input);
	if (!parsed.success) throw new ApiError(400, "invalid_files", "Invalid health file manifest");
	const paths = new Set<string>();
	for (const file of parsed.data) {
		if (
			paths.has(file.path) ||
			(file.firstAt !== null && file.lastAt !== null && file.lastAt < file.firstAt)
		)
			throw new ApiError(400, "invalid_files", "Duplicate path or invalid file interval");
		paths.add(file.path);
		let bytes = 0;
		for (const [index, part] of file.parts.entries()) {
			if (part.part !== index)
				throw new ApiError(400, "invalid_files", "File parts must be contiguous");
			bytes += part.rawBytes;
		}
		const hash = await sha256(
			JSON.stringify(file.parts.map((part) => [part.part, part.rawBytes, part.contentHash])),
		);
		if (bytes !== file.rawBytes || hash !== file.contentHash)
			throw new ApiError(400, "invalid_files", "File manifest checksum or length mismatch");
	}
	return parsed.data;
}

export async function ensureHealthFiles(
	db: D1Database,
	files: Pick<HealthFileManifest, "path" | "contentHash">[],
): Promise<void> {
	const { results } = await db
		.prepare("SELECT path, content_hash FROM health_files")
		.all<{ path: string; content_hash: string }>();
	const current = new Map(results.map((row) => [row.path, row.content_hash]));
	if (files.some((file) => current.get(file.path) !== file.contentHash))
		throw new ApiError(
			409,
			"incomplete_files",
			"Not all declared health attachments have been verified",
		);
}

interface ImportFiles {
	files_json: string;
	status: string;
	expires_at: number;
}

async function importFiles(db: D1Database, id: string): Promise<HealthFileManifest[]> {
	const row = await db
		.prepare(
			"SELECT files_json, status, expires_at FROM footprint_imports WHERE source_id = 'apple-health' AND id = ?",
		)
		.bind(id)
		.first<ImportFiles>();
	if (!row) throw new ApiError(404, "import_not_found", "Health import session not found");
	if (row.status !== "running" || row.expires_at <= Date.now())
		throw new ApiError(409, "import_conflict", "Health import session has expired or finished");
	return JSON.parse(row.files_json) as HealthFileManifest[];
}

/** Report hashes only. Exact reimports do not upload or rewrite original attachments. */
export async function healthFileInventory(env: WorkerEnv): Promise<Response> {
	const { results } = await env.DB.prepare(
		"SELECT path, content_hash AS contentHash FROM health_files ORDER BY path",
	).all();
	return jsonResponse({ data: { files: results } });
}

export async function putHealthFilePart(
	request: Request,
	env: WorkerEnv,
	id: string,
	fileIndex: number,
	partIndex: number,
): Promise<Response> {
	const files = await importFiles(env.DB, id);
	const file = files[fileIndex];
	const expected = file?.parts[partIndex];
	if (!file || !expected || !Number.isSafeInteger(fileIndex) || !Number.isSafeInteger(partIndex))
		throw new ApiError(400, "invalid_file_part", "File part is not in this import manifest");
	const body = await readJsonBody<unknown>(request, HEALTH_LIMITS.filePartBytes + 4096);
	const parsed = partSchema
		.extend({ body: z.string().max(HEALTH_LIMITS.filePartBytes) })
		.safeParse(body);
	if (!parsed.success) throw new ApiError(400, "invalid_file_part", "Invalid file part");
	const part: HealthFilePart = parsed.data;
	if (
		part.part !== expected.part ||
		part.rawBytes !== expected.rawBytes ||
		part.contentHash !== expected.contentHash ||
		part.payloadBytes !== expected.payloadBytes ||
		part.payloadBytes !== part.body.length
	)
		throw new ApiError(400, "invalid_file_part", "File part does not match the manifest");
	try {
		await decodeHealthPart(part);
	} catch {
		throw new ApiError(
			400,
			"invalid_file_part",
			"File bytes failed length, compression or checksum verification",
		);
	}
	const guard = `EXISTS (SELECT 1 FROM footprint_imports WHERE source_id = 'apple-health' AND id = ? AND status = 'running' AND expires_at > ${NOW})`;
	const now = Date.now();
	const result = await env.DB.batch([
		env.DB.prepare(
			`UPDATE footprint_imports SET expires_at = ${NOW} + ? WHERE source_id = 'apple-health' AND id = ? AND status = 'running' AND expires_at > ${NOW}`,
		).bind(HEALTH_LIMITS.leaseMs, id),
		env.DB.prepare(`INSERT INTO health_file_parts (file_hash, part, raw_bytes, payload_bytes, content_hash, body)
			SELECT ?, ?, ?, ?, ?, ? WHERE ${guard} ON CONFLICT(file_hash, part) DO NOTHING`).bind(
			file.contentHash,
			part.part,
			part.rawBytes,
			part.payloadBytes,
			part.contentHash,
			part.body,
			id,
		),
		env.DB.prepare(`INSERT INTO health_files (path, kind, first_at, last_at, record_count, raw_bytes, content_hash, manifest_json, updated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}
			AND (SELECT COUNT(*) FROM health_file_parts WHERE file_hash = ?) = ?
			ON CONFLICT(path) DO UPDATE SET kind = excluded.kind, first_at = excluded.first_at, last_at = excluded.last_at,
			record_count = excluded.record_count, raw_bytes = excluded.raw_bytes, content_hash = excluded.content_hash,
			manifest_json = excluded.manifest_json, updated_at = excluded.updated_at
			WHERE health_files.content_hash != excluded.content_hash`).bind(
			file.path,
			file.kind,
			file.firstAt,
			file.lastAt,
			file.recordCount,
			file.rawBytes,
			file.contentHash,
			JSON.stringify(file),
			now,
			id,
			file.contentHash,
			file.parts.length,
		),
	]);
	if (result[0]?.meta.changes !== 1)
		throw new ApiError(409, "import_conflict", "Health import changed before file commit");
	return jsonResponse({
		data: { path: file.path, part: part.part, contentHash: part.contentHash },
	});
}

export async function readHealthFile(env: WorkerEnv, url: URL): Promise<Response> {
	const path = url.searchParams.get("path");
	if (!path) throw new ApiError(400, "missing_parameter", "path is required");
	const file = await env.DB.prepare(
		"SELECT manifest_json, content_hash FROM health_files WHERE path = ?",
	)
		.bind(path)
		.first<{ manifest_json: string; content_hash: string }>();
	if (!file) throw new ApiError(404, "file_not_found", "Health attachment not found");
	const index = url.searchParams.get("part");
	if (index === null) {
		const manifest = JSON.parse(file.manifest_json) as HealthFileManifest;
		// Reusing original bytes across runtimes may reuse a different valid gzip representation.
		const { results } = await env.DB.prepare(
			"SELECT part, raw_bytes AS rawBytes, payload_bytes AS payloadBytes, content_hash AS contentHash FROM health_file_parts WHERE file_hash = ? ORDER BY part",
		)
			.bind(file.content_hash)
			.all<HealthFileManifest["parts"][number]>();
		return jsonResponse({ data: { ...manifest, parts: results } });
	}
	if (!/^\d+$/.test(index)) throw new ApiError(400, "invalid_file_part", "Use a valid part number");
	const part =
		await env.DB.prepare(`SELECT part, raw_bytes AS rawBytes, payload_bytes AS payloadBytes,
		content_hash AS contentHash, body FROM health_file_parts WHERE file_hash = ? AND part = ?`)
			.bind(file.content_hash, Number(index))
			.first<HealthFilePart>();
	if (!part) throw new ApiError(404, "file_part_not_found", "Health attachment part not found");
	return jsonResponse({ data: part });
}

/** Only the current import manifest and committed paths can own pending parts. */
export async function collectUnusedHealthParts(db: D1Database): Promise<void> {
	await db
		.prepare(`DELETE FROM health_file_parts
		WHERE file_hash NOT IN (SELECT content_hash FROM health_files)
		AND file_hash NOT IN (SELECT json_extract(value, '$.contentHash') FROM footprint_imports, json_each(files_json)
			WHERE source_id = 'apple-health' AND status = 'running' AND expires_at > ${NOW})`)
		.run();
}
