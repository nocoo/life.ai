import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    fileParallelism: false,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        // Next.js page/layout files (rendered, not unit-tested)
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        // Auth and storage routes integrate with external services
        "src/app/api/auth/**",
        "src/app/api/storage/**",
        // React components and hooks
        "src/components/**",
        "src/views/**",
        "src/hooks/**",
        // Modules with platform-specific or untested entry points
        "src/lib/auth.ts",
        "src/lib/palette.ts",
        "src/lib/utils.ts",
        "src/lib/db.ts",
        "src/proxy.ts",
        "src/services/storage-service.ts",
        "src/viewmodels/settings-store.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        // istanbul counts TS optional params, default args, and `x ?? y`
        // narrowing as branches, lowering the achievable branch ratio
        // vs. line ratio. Matches the threshold used in the repo root.
        branches: 70,
      },
    },
  },
});
