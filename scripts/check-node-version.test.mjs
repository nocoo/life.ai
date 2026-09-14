import { describe, expect, it } from "vitest";
import { isNodeVersionSupported, parseNodeVersion } from "./check-node-version.mjs";

const supportedRange = "^22.20.0 || ^24.0.0 || >=26.0.0";

describe("Node runtime compatibility", () => {
	it.each([
		["22.19.9", false],
		["22.20.0", true],
		["22.99.99", true],
		["23.0.0", false],
		["24.0.0", true],
		["24.99.99", true],
		["25.0.0", false],
		["26.0.0", true],
		["26.0.0-rc.1", false],
		["27.0.0", true],
	])("accepts only Vitest-supported Node %s", (version, expected) => {
		expect(isNodeVersionSupported(version, supportedRange)).toBe(expected);
	});

	it("compares minor and patch versions instead of only the major", () => {
		expect(isNodeVersionSupported("22.20.0", "^22.20.1")).toBe(false);
		expect(isNodeVersionSupported("22.20.1", "^22.20.1")).toBe(true);
	});

	it("rejects malformed versions and unsupported range syntax", () => {
		expect(() => parseNodeVersion("22")).toThrow("valid semantic version");
		expect(() => isNodeVersionSupported("22.20.0", ">=22")).toThrow(
			"unsupported engines.node clause",
		);
	});
});
