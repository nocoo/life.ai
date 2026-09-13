import { describe, expect, it } from "vitest";
import { ApiError } from "../../worker/types.js";
import {
	decodeCursor,
	encodeCursor,
	errorResponse,
	jsonResponse,
	readJsonBody,
	validateContentType,
	validateDataField,
	validateString,
} from "../../worker/utils.js";

describe("worker/utils", () => {
	describe("validateContentType", () => {
		it("accepts application/json with and without charset", () => {
			const req1 = new Request("https://life.hexly.ai", {
				headers: { "Content-Type": "application/json" },
			});
			expect(() => validateContentType(req1)).not.toThrow();

			const req2 = new Request("https://life.hexly.ai", {
				headers: { "Content-Type": "application/json; charset=utf-8" },
			});
			expect(() => validateContentType(req2)).not.toThrow();
		});

		it("throws 415 when Content-Type is missing or not application/json", () => {
			const reqNoHeader = new Request("https://life.hexly.ai");
			expect(() => validateContentType(reqNoHeader)).toThrowError(
				expect.objectContaining({ status: 415, code: "unsupported_media_type" }),
			);

			const reqText = new Request("https://life.hexly.ai", {
				headers: { "Content-Type": "text/plain" },
			});
			expect(() => validateContentType(reqText)).toThrowError(
				expect.objectContaining({ status: 415, code: "unsupported_media_type" }),
			);

			const reqForm = new Request("https://life.hexly.ai", {
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			});
			expect(() => validateContentType(reqForm)).toThrowError(
				expect.objectContaining({ status: 415, code: "unsupported_media_type" }),
			);
		});
	});

	describe("validateString", () => {
		it("validates valid string", () => {
			expect(validateString("hello", "field", 10)).toBe("hello");
		});

		it("throws when required string is missing or empty", () => {
			expect(() => validateString(null, "field", 10, true)).toThrow("field is required");
			expect(() => validateString("", "field", 10, true)).toThrow("field cannot be empty");
			expect(() => validateString("   ", "field", 10, true)).toThrow("field cannot be empty");
			expect(() => validateString(123, "field", 10, true)).toThrow("field must be a string");
		});

		it("allows optional missing string", () => {
			expect(validateString(null, "field", 10, false)).toBe("");
			expect(validateString(undefined, "field", 10, false)).toBe("");
		});

		it("throws when string exceeds max length", () => {
			expect(() => validateString("123456", "field", 5)).toThrow(
				"field exceeds maximum length of 5 characters",
			);
		});
	});

	describe("validateDataField", () => {
		it("returns '{}' for empty data", () => {
			expect(validateDataField(null)).toBe("{}");
			expect(validateDataField(undefined)).toBe("{}");
		});

		it("serializes valid data object", () => {
			expect(validateDataField({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
		});

		it("throws when payload exceeds 32 KiB", () => {
			const huge = { str: "a".repeat(33 * 1024) };
			expect(() => validateDataField(huge)).toThrow("Data payload exceeds 32768 bytes");
		});
	});

	describe("cursor encoding / decoding", () => {
		it("encodes and decodes correctly", () => {
			const ms = 1773417600000;
			const id = "event-uuid-1234";
			const cursor = encodeCursor(ms, id);
			expect(typeof cursor).toBe("string");
			const decoded = decodeCursor(cursor);
			expect(decoded.occurredAtMs).toBe(ms);
			expect(decoded.id).toBe(id);
		});

		it("throws on invalid cursor", () => {
			expect(() => decodeCursor("invalid-base64-cursor!!!")).toThrow("Invalid pagination cursor");
			expect(() => decodeCursor(btoa("invalid"))).toThrow("Invalid pagination cursor");
			expect(() => decodeCursor(btoa("abc:123"))).toThrow("Invalid pagination cursor");
		});
	});

	describe("jsonResponse and errorResponse", () => {
		it("formats JSON response with no-store header", async () => {
			const res = jsonResponse({ data: "ok" }, 201);
			expect(res.status).toBe(201);
			expect(res.headers.get("Cache-Control")).toBe("no-store");
			expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
			expect(await res.json()).toEqual({ data: "ok" });
		});

		it("formats ApiError response", async () => {
			const res = errorResponse(new ApiError(404, "not_found", "Item missing"));
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual({
				error: { code: "not_found", message: "Item missing" },
			});
		});

		it("formats unexpected error as 500 without leaking details", async () => {
			const res = errorResponse(new Error("Database password leaked in trace"));
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({
				error: { code: "internal_error", message: "An internal server error occurred" },
			});
		});
	});

	describe("readJsonBody", () => {
		it("reads valid JSON body with application/json header", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				body: JSON.stringify({ key: "val" }),
				headers: { "Content-Type": "application/json" },
			});
			const body = await readJsonBody<{ key: string }>(req);
			expect(body).toEqual({ key: "val" });
		});

		it("throws 415 on missing or invalid content-type", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				body: JSON.stringify({ key: "val" }),
			});
			await expect(readJsonBody(req)).rejects.toThrowError(
				expect.objectContaining({ status: 415, code: "unsupported_media_type" }),
			);
		});

		it("throws on empty body", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			await expect(readJsonBody(req)).rejects.toThrow("Empty request body");
		});

		it("throws on malformed JSON", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				body: "{ bad json }",
				headers: { "Content-Type": "application/json" },
			});
			await expect(readJsonBody(req)).rejects.toThrow("Malformed JSON body");
		});

		it("throws when Content-Length exceeds limit", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				body: "{}",
				headers: { "Content-Length": "2000000", "Content-Type": "application/json" },
			});
			await expect(readJsonBody(req, 1000)).rejects.toThrow("Request body exceeds 1000 bytes");
		});

		it("throws when streamed body exceeds limit", async () => {
			const req = new Request("https://life.hexly.ai", {
				method: "POST",
				body: "a".repeat(2000),
				headers: { "Content-Type": "application/json" },
			});
			await expect(readJsonBody(req, 1000)).rejects.toThrow("Request body exceeds 1000 bytes");
		});
	});
});
