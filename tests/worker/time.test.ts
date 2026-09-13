import { describe, expect, it } from "vitest";
import { floorToUtcHour, normalizeTimestamp, timestampAtPrecision } from "../../worker/time.js";

describe("worker/time", () => {
	describe("normalizeTimestamp (re-exported shared model)", () => {
		it("normalizes date-only string to UTC midnight", () => {
			expect(normalizeTimestamp("2026-09-13")).toBe("2026-09-13T00:00:00.000Z");
		});

		it("normalizes ISO string ending in Z", () => {
			expect(normalizeTimestamp("2026-09-13T14:30:00Z")).toBe("2026-09-13T14:30:00.000Z");
		});

		it("treats missing offset as UTC", () => {
			expect(normalizeTimestamp("2026-09-13T14:30:00")).toBe("2026-09-13T14:30:00.000Z");
		});

		it("converts positive timezone offset to UTC Z", () => {
			// UTC+8 14:00 is UTC 06:00
			expect(normalizeTimestamp("2026-09-13T14:00:00+08:00")).toBe("2026-09-13T06:00:00.000Z");
		});

		it("converts negative timezone offset to UTC Z", () => {
			// UTC-4 14:00 is UTC 18:00
			expect(normalizeTimestamp("2026-09-13T14:00:00-04:00")).toBe("2026-09-13T18:00:00.000Z");
		});

		it("preserves milliseconds when present", () => {
			expect(normalizeTimestamp("2026-09-13T14:30:00.123Z")).toBe("2026-09-13T14:30:00.123Z");
		});

		it("throws on empty or non-string input", () => {
			expect(() => normalizeTimestamp("")).toThrow();
			// @ts-expect-error test invalid type
			expect(() => normalizeTimestamp(null)).toThrow();
		});

		it("throws on invalid date components", () => {
			expect(() => normalizeTimestamp("2026-13-01T00:00:00Z")).toThrow();
			expect(() => normalizeTimestamp("2026-02-31T00:00:00Z")).toThrow();
			expect(() => normalizeTimestamp("2026-09-13T25:00:00Z")).toThrow();
		});

		it("throws on completely malformed strings", () => {
			expect(() => normalizeTimestamp("not-a-date")).toThrow();
		});
	});

	describe("timestampAtPrecision", () => {
		const base = "2026-09-13T15:35:45.678Z";

		it("floors to day", () => {
			expect(timestampAtPrecision(base, "day")).toBe("2026-09-13T00:00:00.000Z");
		});

		it("floors to hour", () => {
			expect(timestampAtPrecision(base, "hour")).toBe("2026-09-13T15:00:00.000Z");
		});

		it("floors to minute", () => {
			expect(timestampAtPrecision(base, "minute")).toBe("2026-09-13T15:35:00.000Z");
		});

		it("floors to second", () => {
			expect(timestampAtPrecision(base, "second")).toBe("2026-09-13T15:35:45.000Z");
		});
	});

	describe("floorToUtcHour", () => {
		it("floors ISO string to UTC hour and returns epoch ms", () => {
			const res = floorToUtcHour("2026-09-13T15:45:20.123Z");
			expect(res.iso).toBe("2026-09-13T15:00:00.000Z");
			expect(res.ms).toBe(new Date("2026-09-13T15:00:00.000Z").getTime());
		});

		it("floors epoch ms to UTC hour", () => {
			const inputMs = new Date("2026-09-13T15:45:20.123Z").getTime();
			const res = floorToUtcHour(inputMs);
			expect(res.iso).toBe("2026-09-13T15:00:00.000Z");
		});
	});
});
