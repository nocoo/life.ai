import { test, expect } from "@playwright/test";

test.describe("Dashboard — BDD Smoke", () => {
  test("Given the dashboard is running, When I visit the login page, Then I see the welcome badge", async ({
    page,
  }) => {
    // Given: app is running on the E2E port (webServer in playwright.config.ts)

    // When: visit the public login route
    await page.goto("/login");

    // Then: the document title is set by the root layout
    await expect(page).toHaveTitle(/life\.ai/, { timeout: 15_000 });

    // And: the login card shows the Google sign-in entry point
    await expect(
      page.getByRole("button", { name: /Continue with Google/i }),
    ).toBeVisible();
  });
});
