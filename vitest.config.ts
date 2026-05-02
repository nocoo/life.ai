import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/test/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["scripts/import/**/*.ts", "scripts/verify/**/*.ts"],
      exclude: [
        "scripts/import/**/cli.ts",
        "scripts/import/**/init.ts",
        "scripts/import/**/refresh.ts",
        "scripts/import/footprint/explore-gpx.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        // istanbul counts TS default args / optional params as branches,
        // so the achievable bar is lower than the line/function bar.
        branches: 70,
        statements: 90,
      },
    },
  },
});
