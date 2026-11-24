import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LIFE_TEST_URL;
const token = process.env.LIFE_TEST_TOKEN;
if (
	!baseURL ||
	new URL(baseURL).hostname !== "127.0.0.1" ||
	!token ||
	!process.env.LIFE_TEST_STATE
) {
	throw new Error("Run Playwright through bun run test:l3 with isolated local resources");
}

export default defineConfig({
	testDir: "tests/browser",
	fullyParallel: false,
	workers: process.env.CI ? 2 : 4,
	retries: 0,
	timeout: 30_000,
	expect: { timeout: 8000 },
	forbidOnly: true,
	reporter: [["list"], ["html", { open: "never" }]],
	outputDir: "test-results/l3/browser",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		timezoneId: "Asia/Shanghai",
		locale: "zh-CN",
		extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": token },
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "parallel", testIgnore: /sources-and-cache\.spec\.ts|diary\.spec\.ts/ },
		{ name: "diary", testMatch: /diary\.spec\.ts/, dependencies: ["parallel"] },
		{ name: "sources", testMatch: /sources-and-cache\.spec\.ts/, dependencies: ["diary"] },
	],
});
