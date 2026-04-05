import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

describe("Breadcrumbs", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders single item without link", () => {
    render(<Breadcrumbs items={[{ label: "Home" }]} />);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Home").getAttribute("aria-current")).toBe("page");
  });

  test("renders multiple items with links", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Day View" },
        ]}
      />
    );

    const homeLink = screen.getByText("Home");
    expect(homeLink.closest("a")?.getAttribute("href")).toBe("/");

    const dashboardLink = screen.getByText("Dashboard");
    expect(dashboardLink.closest("a")?.getAttribute("href")).toBe("/dashboard");

    const currentPage = screen.getByText("Day View");
    expect(currentPage.getAttribute("aria-current")).toBe("page");
  });

  test("renders navigation with proper aria-label", () => {
    render(<Breadcrumbs items={[{ label: "Home" }]} />);
    const nav = screen.getByLabelText("Breadcrumb");
    expect(nav).toBeTruthy();
  });

  test("renders chevron separators between items", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Page" },
        ]}
      />
    );
    // There should be one chevron (between two items)
    const chevrons = document.querySelectorAll("svg");
    expect(chevrons.length).toBe(1);
  });

  test("does not render chevron for single item", () => {
    render(<Breadcrumbs items={[{ label: "Home" }]} />);
    const chevrons = document.querySelectorAll("svg");
    expect(chevrons.length).toBe(0);
  });
});
