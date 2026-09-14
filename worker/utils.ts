import { ApiError } from "./types.js";

export const LIMITS = {
	requestBodyBytes: 1024 * 1024, // 1 MiB
	recordDataBytes: 32 * 1024, // 32 KiB
	nameMaxChars: 80,
	titleMaxChars: 200,
	contentMaxChars: 8000,
	maxWindowDays: 32,
	pageSize: 200,
	maxBatchRecords: 100,
};

/**
 * Validates Content-Type header is application/json (allows charset suffix).
 * Returns 415 unsupported_media_type otherwise.
 */
export function validateContentType(request: Pick<Request, "headers">): void {
	const contentType = request.headers.get("content-type");
	if (!contentType) {
		throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json");
	}
	const mime = contentType.split(";")[0]?.trim().toLowerCase();
	if (mime !== "application/json") {
		throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json");
	}
}

/**
 * Safely parses JSON from Request body while enforcing:
 * - Content-Type: application/json (returns 415 if not)
 * - Maximum byte size limit (returns 413 if exceeded)
 * - Non-empty and valid JSON (returns 400 if malformed)
 */
export async function readJsonBody<T>(
	request: Pick<Request, "headers" | "body">,
	maxBytes = LIMITS.requestBodyBytes,
): Promise<T> {
	validateContentType(request);

	const contentLength = request.headers.get("content-length");
	if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
		throw new ApiError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
	}

	const reader = request.body?.getReader();
	if (!reader) {
		throw new ApiError(400, "invalid_json", "Empty request body");
	}

	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			if (receivedBytes > maxBytes) {
				await reader.cancel();
				throw new ApiError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	if (receivedBytes === 0) {
		throw new ApiError(400, "invalid_json", "Empty request body");
	}

	const total = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		total.set(chunk, offset);
		offset += chunk.byteLength;
	}

	const text = new TextDecoder("utf-8").decode(total);
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new ApiError(400, "invalid_json", "Malformed JSON body");
	}
}

/**
 * Validates string length and prevents unexpected types.
 */
export function validateString(
	val: unknown,
	fieldName: string,
	maxLen: number,
	required = true,
): string {
	if (val === undefined || val === null) {
		if (required) {
			throw new ApiError(400, "validation_error", `${fieldName} is required`);
		}
		return "";
	}
	if (typeof val !== "string") {
		throw new ApiError(400, "validation_error", `${fieldName} must be a string`);
	}
	const trimmed = val.trim();
	if (required && trimmed.length === 0) {
		throw new ApiError(400, "validation_error", `${fieldName} cannot be empty`);
	}
	if (val.length > maxLen) {
		throw new ApiError(
			400,
			"validation_error",
			`${fieldName} exceeds maximum length of ${maxLen} characters`,
		);
	}
	return val;
}

/**
 * Serializes and checks size of data field (<= 32 KiB).
 */
export function validateDataField(data: unknown): string {
	if (data === undefined || data === null) {
		return "{}";
	}
	const jsonStr = JSON.stringify(data);
	const byteLength = new TextEncoder().encode(jsonStr).byteLength;
	if (byteLength > LIMITS.recordDataBytes) {
		throw new ApiError(
			400,
			"validation_error",
			`Data payload exceeds ${LIMITS.recordDataBytes} bytes`,
		);
	}
	return jsonStr;
}

/**
 * Standard JSON response helper.
 */
export function jsonResponse(
	data: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			...headers,
		},
	});
}

/**
 * Standard error response helper. Never exposes tokens or stack traces.
 */
export function errorResponse(err: unknown): Response {
	if (err instanceof ApiError) {
		return jsonResponse(
			{
				error: {
					code: err.code,
					message: err.message,
				},
			},
			err.status,
		);
	}
	return jsonResponse(
		{
			error: {
				code: "internal_error",
				message: "An internal server error occurred",
			},
		},
		500,
	);
}

/**
 * Cursor encoding and decoding for events pagination.
 * Format: base64url(occurredAtMs:id)
 */
export function encodeCursor(occurredAtMs: number, id: string): string {
	const raw = `${occurredAtMs}:${id}`;
	return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): { occurredAtMs: number; id: string } {
	try {
		let b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
		while (b64.length % 4) {
			b64 += "=";
		}
		const decoded = atob(b64);
		const parts = decoded.split(":");
		const part0 = parts[0];
		const part1 = parts[1];
		if (parts.length !== 2 || part0 === undefined || part1 === undefined) {
			throw new Error("Invalid format");
		}
		const occurredAtMs = Number.parseInt(part0, 10);
		if (Number.isNaN(occurredAtMs)) {
			throw new Error("Invalid timestamp in cursor");
		}
		return { occurredAtMs, id: part1 };
	} catch {
		throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
	}
}
