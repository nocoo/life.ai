import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AppProviders } from "@/components/AppProviders";

afterEach(cleanup);

describe("AppProviders", () => {
  test("applies the Life.ai accent without persisting a competing selection", async () => {
    localStorage.removeItem("basalt-accent");
    document.documentElement.classList.add("light");

    render(
      <AppProviders>
        <span>Dashboard content</span>
      </AppProviders>,
    );

    expect(screen.getByText("Dashboard content")).toBeTruthy();
    await waitFor(() => {
      expect(document.documentElement.dataset.accent).toBe("primary");
      expect(document.documentElement.style.getPropertyValue("--basalt-primary")).toBe(
        "217 91% 48%",
      );
    });
    expect(localStorage.getItem("basalt-accent")).toBeNull();
  });
});
