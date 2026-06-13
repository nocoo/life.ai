import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/bdd",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL: "http://localhost:27011",
    trace: "on-first-retry",
    headless: true,
  },
  webServer: {
    command:
      "AUTH_SECRET=e2e-placeholder-secret AUTH_GOOGLE_ID=e2e-placeholder AUTH_GOOGLE_SECRET=e2e-placeholder bun run dev -- -p 27011",
    port: 27011,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
