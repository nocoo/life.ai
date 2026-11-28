import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		allowOnly: false,
		passWithNoTests: false,
		include: [
			"tests/unit/**/*.test.{ts,tsx}",
			"tests/worker/**/*.test.ts",
			"scripts/**/*.test.mjs",
		],
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
			exclude: [
				"src/components/**",
				"src/views/**",
				"src/pages/**",
				"src/app/**/{page,layout,loading,error,not-found}.tsx",
				"src/main.tsx",
				"src/App.tsx",
				"src/app.tsx",
				"**/index.ts",
				"**/*.d.ts",
				"**/types.ts",
			],
			reporter: ["text", "json-summary", "html"],
			thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
		},
	},
});
