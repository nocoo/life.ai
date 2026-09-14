import { describe, expect, it } from "vitest";
import {
	MAX_SUMMARY_REVISION,
	validateSummaryGenerateInput,
	validateSummaryQuery,
	validateSummaryRevision,
} from "../../../src/models/ai";

const query = {
	date: "2026-09-13",
	timeZone: "Asia/Shanghai",
	start: "2026-09-12T16:00:00Z",
	end: "2026-09-13T16:00:00Z",
};

describe("daily summary UTC window validation", () => {
	it("normalizes a browser day range and timezone without trusting the Worker timezone", () => {
		expect(validateSummaryQuery({ ...query, start: "2026-09-13T00:00+08:00" })).toEqual({
			...query,
			start: "2026-09-12T16:00:00.000Z",
			end: "2026-09-13T16:00:00.000Z",
		});
	});
	it.each([
		["2026-03-08", "America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
		["2026-11-01", "America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
		["2026-10-04", "Australia/Lord_Howe", "2026-10-03T13:30:00Z", "2026-10-04T13:00:00Z"],
		["2026-09-13", "UTC", "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z"],
	])("accepts the full local day %s in %s", (date, timeZone, start, end) => {
		expect(validateSummaryQuery({ date, timeZone, start, end }).date).toBe(date);
	});
	it.each([
		null,
		false,
		[],
		{},
		{ ...query, date: "2026-9-13" },
		{ ...query, date: "2026-02-30" },
		{ ...query, timeZone: "invalid/zone" },
		{ ...query, timeZone: 1 },
		{ ...query, timeZone: "A".repeat(101) },
		{ ...query, start: null },
		{ ...query, end: 4 },
		{ ...query, start: "tomorrow" },
		{ ...query, start: query.end },
		{ ...query, end: query.start },
		{ ...query, end: "2026-09-16T16:00:00Z" },
		{ ...query, start: "2026-09-12T15:00:00Z" },
		{ ...query, start: "2026-09-12T16:00:00.001Z" },
		{ ...query, end: "2026-09-13T15:59:59.999Z" },
		{ ...query, end: "2026-09-13T16:00:00.001Z" },
	])("rejects a malformed or forged day window %#", (input) => {
		expect(() => validateSummaryQuery(input)).toThrow();
	});
});

describe("diary revision notes", () => {
	it("accepts optional notes and rejects oversized or non-text input", () => {
		expect(validateSummaryRevision(undefined)).toBeUndefined();
		expect(validateSummaryRevision("  ")).toBeUndefined();
		expect(validateSummaryRevision("少写步数")).toBe("少写步数");
		expect(() => validateSummaryRevision(1)).toThrow("修改意见必须是文字");
		expect(() => validateSummaryRevision("x".repeat(MAX_SUMMARY_REVISION + 1))).toThrow(
			"修改意见过长",
		);
		expect(validateSummaryGenerateInput({ ...query, revision: " 更克制 " }).revision).toBe(
			"更克制",
		);
	});
});
