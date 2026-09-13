import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TooltipProvider } from "@nocoo/basalt";
import { AppSidebar } from "@/components/AppSidebar";

afterEach(cleanup);

describe("AppSidebar", () => {
  test("centers the collapsed rail controls", () => {
    render(
      <TooltipProvider>
        <AppSidebar collapsed onToggle={vi.fn()} />
      </TooltipProvider>,
    );

    const logo = screen.getByAltText("Life.ai");
    expect(logo.parentElement?.className).toContain("justify-center");
    expect(screen.getByLabelText("Expand sidebar").className).toContain("self-center");
    expect(screen.getByLabelText("Search (⌘K)").className).toContain("self-center");
  });

  test("keeps the expanded logo aligned with the collapsed center", () => {
    render(
      <TooltipProvider>
        <AppSidebar collapsed={false} onToggle={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByAltText("Life.ai").className).toContain("ml-2.5");
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeTruthy();
  });
});
