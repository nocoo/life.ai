import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TooltipProvider } from "@nocoo/basalt";
import { AppSidebar } from "@/components/AppSidebar";
import { mockRouterPush } from "../setup";

afterEach(cleanup);
beforeEach(() => mockRouterPush.mockClear());

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

  test("notifies the mobile shell even when the active route is selected", () => {
    const onNavigate = vi.fn();
    render(
      <TooltipProvider>
        <AppSidebar collapsed={false} onToggle={vi.fn()} onNavigate={onNavigate} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "日视图" }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(mockRouterPush).toHaveBeenCalledWith("/day");
  });

  test("renders expanded and collapsed user identities", () => {
    const user = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://example.com/ada.png",
    };
    const { rerender } = render(
      <TooltipProvider>
        <AppSidebar collapsed={false} onToggle={vi.fn()} user={user} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();

    rerender(
      <TooltipProvider>
        <AppSidebar collapsed onToggle={vi.fn()} user={{ email: "unknown@example.com" }} />
      </TooltipProvider>,
    );
    expect(screen.getByText("?")).toBeTruthy();
  });

  test("opens search from the button and keyboard shortcut", () => {
    render(
      <TooltipProvider>
        <AppSidebar collapsed={false} onToggle={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    expect(screen.getByPlaceholderText("Search pages...")).toBeTruthy();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText("Search pages...")).toBeTruthy();
  });
});
