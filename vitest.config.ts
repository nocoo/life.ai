import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/unit/**/*.test.{ts,tsx}", "tests/worker/**/*.test.ts"],
		environment: "node",
		restoreMocks: true,
		unstubGlobals: true,
		coverage: {
			provider: "v8",
			include: [
				"src/models/**/*.ts",
				"src/services/**/*.ts",
				"src/viewmodels/**/*.ts",
				"worker/**/*.ts",
			],
			reporter: ["text", "json-summary", "html"],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
		},
	},
});
