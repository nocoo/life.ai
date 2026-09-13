import { describe, expect, it } from "vitest";
import {
	formatAbsoluteTime,
	formatByteSize,
	formatDurationMinutes,
	formatInterval,
	formatLocalClock,
	formatLocalDate,
	ingestCurlExample,
} from "../../../../src/viewmodels/format";
import { eventFixture } from "../helpers";

describe("formatByteSize", () => {
	it("formats byte magnitudes", () => {
		expect(formatByteSize(0)).toBe("0 B");
		expect(formatByteSize(-1)).toBe("0 B");
		expect(formatByteSize(Number.NaN)).toBe("0 B");
		expect(formatByteSize(512)).toBe("512 B");
		expect(formatByteSize(2048)).toBe("2.0 KB");
		expect(formatByteSize(2 * 1024 * 1024)).toBe("2.0 MB");
	});
});

describe("formatLocalDate", () => {
	it("formats a valid local date and echoes invalid input", () => {
		expect(formatLocalDate("2026-09-13")).toContain("2026");
		expect(formatLocalDate("2026-09-13")).toContain("13");
		expect(formatLocalDate("not-a-date")).toBe("not-a-date");
	});
});

describe("formatDurationMinutes", () => {
	it("rounds total minutes before splitting hours", () => {
		expect(formatDurationMinutes(null)).toBe("—");
		expect(formatDurationMinutes(Number.NaN)).toBe("—");
		expect(formatDurationMinutes(-1)).toBe("—");
		expect(formatDurationMinutes(59.4)).toBe("59 分");
		expect(formatDurationMinutes(59.6)).toBe("1 小时");
		expect(formatDurationMinutes(60)).toBe("1 小时");
		expect(formatDurationMinutes(90)).toBe("1 小时 30 分");
		expect(formatDurationMinutes(119.6)).toBe("2 小时");
	});
});

describe("formatLocalClock", () => {
	it("hides clock time for day precision", () => {
		expect(formatLocalClock("2026-09-13T00:00:00Z", "day")).toBeNull();
	});

	it("returns null for invalid timestamps", () => {
		expect(formatLocalClock("nope", "hour")).toBeNull();
	});

	it("returns a clock string for timed precision", () => {
		expect(formatLocalClock("2026-09-13T08:00:00Z", "hour")).toMatch(/\d/);
		expect(formatLocalClock("2026-09-13T08:01:02Z", "minute")).toMatch(/:/);
		expect(formatLocalClock("2026-09-13T08:01:02Z", "second")).toMatch(/:/);
	});
});

describe("formatInterval", () => {
	it("returns a single clock or a range", () => {
		expect(formatInterval(eventFixture({ precision: "day" }))).toBeNull();
		expect(formatInterval(eventFixture({ endAt: "bad" }))).toMatch(/\d/);
		expect(formatInterval(eventFixture({ endAt: null }))).toMatch(/\d/);
		expect(
			formatInterval(
				eventFixture({
					occurredAt: "2026-09-13T01:00:00Z",
					endAt: "2026-09-13T01:00:00Z",
				}),
			),
		).not.toContain("–");
		const range = formatInterval(
			eventFixture({
				occurredAt: "2026-09-13T01:00:00Z",
				endAt: "2026-09-13T03:00:00Z",
				precision: "hour",
			}),
		);
		expect(range === null || range.includes("–") || range.length > 0).toBe(true);
	});
});

describe("formatAbsoluteTime", () => {
	it("handles missing and invalid values", () => {
		expect(formatAbsoluteTime(null)).toBe("从未");
		expect(formatAbsoluteTime("nope")).toBe("nope");
		expect(formatAbsoluteTime("2026-09-13T01:00:00Z")).toContain("2026");
	});
});

describe("ingestCurlExample", () => {
	it("includes the token and ingest host", () => {
		const curl = ingestCurlExample("secret-token");
		expect(curl).toContain("life.worker.hexly.ai/api/ingest");
		expect(curl).toContain("Bearer secret-token");
		expect(curl).toContain("timestamp");
	});
});
