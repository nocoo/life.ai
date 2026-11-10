import { describe, expect, it } from "vitest";
import { isNodeVersionSupported, parseNodeVersion } from "./check-node-version.mjs";

const supportedRange = "^26.0.0";

describe("Node runtime compatibility", () => {
	it.each([
		["22.20.0", false],
		["24.0.0", false],
		["25.99.99", false],
		["26.0.0", true],
		["26.12.1", true],
		["26.0.0-rc.1", false],
		["27.0.0", false],
	])("accepts only Node 26.x LTS %s", (version, expected) => {
		expect(isNodeVersionSupported(version, supportedRange)).toBe(expected);
	});

	it("compares minor and patch versions instead of only the major", () => {
		expect(isNodeVersionSupported("26.0.0", "^26.0.1")).toBe(false);
		expect(isNodeVersionSupported("26.0.1", "^26.0.1")).toBe(true);
	});

	it("rejects malformed versions and unsupported range syntax", () => {
		expect(() => parseNodeVersion("26")).toThrow("valid semantic version");
		expect(() => isNodeVersionSupported("26.0.0", ">=26")).toThrow(
			"unsupported engines.node clause",
		);
	});
});
