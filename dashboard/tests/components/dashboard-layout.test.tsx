import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const media = vi.hoisted(() => ({
  matches: true,
  listeners: new Set<() => void>(),
}));

vi.mock("@/components/AppSidebar", () => ({
  AppSidebar: ({
    collapsed,
    enableShortcut,
    onNavigate,
    onToggle,
  }: {
    collapsed: boolean;
    enableShortcut?: boolean;
    onNavigate?: () => void;
    onToggle: () => void;
  }) => (
    <div data-testid={collapsed ? "collapsed-sidebar" : "expanded-sidebar"} data-shortcut={enableShortcut}>
      <button onClick={onNavigate}>Navigate</button>
      <button onClick={onToggle}>Toggle sidebar</button>
    </div>
  ),
}));

vi.mock("@nocoo/basalt", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => (asChild ? children : <button {...props}>{children}</button>),
  ContentIsland: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ThemeToggle: () => <button>Theme</button>,
}));

vi.mock("@nocoo/basalt/components/app-header", () => ({
  AppHeader: ({
    leading,
    actions,
  }: {
    leading?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <header>
      {leading}
      {actions}
    </header>
  ),
}));

vi.mock("@nocoo/basalt/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AppMain: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AppSkipLink: ({ children }: { children: React.ReactNode }) => <a href="#main">{children}</a>,
}));

import { DashboardLayout } from "@/components/DashboardLayout";

beforeEach(() => {
  media.matches = true;
  media.listeners.clear();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return media.matches;
    },
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => media.listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("DashboardLayout", () => {
  test("keeps one active sidebar and closes the sheet across navigation and breakpoints", async () => {
    render(<DashboardLayout>Content</DashboardLayout>);

    await waitFor(() => expect(screen.queryByTestId("collapsed-sidebar")).toBeNull());
    fireEvent.click(screen.getByLabelText("Open navigation"));
    expect(screen.getByTestId("mobile-sheet")).toBeTruthy();
    expect(screen.getByTestId("expanded-sidebar").dataset.shortcut).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect(screen.queryByTestId("mobile-sheet")).toBeNull();

    fireEvent.click(screen.getByLabelText("Open navigation"));
    act(() => {
      media.matches = false;
      media.listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.queryByTestId("mobile-sheet")).toBeNull();
      expect(screen.getByTestId("expanded-sidebar").dataset.shortcut).toBe("true");
      expect(document.body.style.overflow).toBe("");
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(screen.getByTestId("collapsed-sidebar")).toBeTruthy();
  });
});
