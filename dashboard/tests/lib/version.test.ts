import { describe, test, expect } from "bun:test";
import { APP_VERSION } from "@/lib/version";

describe("version", () => {
  test("APP_VERSION is defined", () => {
    expect(APP_VERSION).toBeDefined();
  });

  test("APP_VERSION is a valid semver string", () => {
    // Basic semver pattern: major.minor.patch
    const semverPattern = /^\d+\.\d+\.\d+/;
    expect(semverPattern.test(APP_VERSION)).toBe(true);
  });

  test("APP_VERSION matches package.json", async () => {
    const pkg = await import("../../package.json");
    expect(APP_VERSION).toBe(pkg.version);
  });
});
