import { describe, test, expect, beforeEach, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";

// Mock next/navigation
mock.module("next/navigation", () => ({
  usePathname: () => "/day",
}));

describe("sidebar-context", () => {
  describe("SidebarProvider", () => {
    test("provides default values", () => {
      const { result } = renderHook(() => useSidebar(), {
        wrapper: SidebarProvider,
      });

      expect(result.current.collapsed).toBe(false);
      expect(result.current.mobileOpen).toBe(false);
      expect(typeof result.current.toggle).toBe("function");
      expect(typeof result.current.setCollapsed).toBe("function");
      expect(typeof result.current.setMobileOpen).toBe("function");
    });

    test("toggle() toggles collapsed state", () => {
      const { result } = renderHook(() => useSidebar(), {
        wrapper: SidebarProvider,
      });

      expect(result.current.collapsed).toBe(false);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.collapsed).toBe(true);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.collapsed).toBe(false);
    });

    test("setCollapsed() sets collapsed state", () => {
      const { result } = renderHook(() => useSidebar(), {
        wrapper: SidebarProvider,
      });

      act(() => {
        result.current.setCollapsed(true);
      });

      expect(result.current.collapsed).toBe(true);

      act(() => {
        result.current.setCollapsed(false);
      });

      expect(result.current.collapsed).toBe(false);
    });

    test("setMobileOpen() sets mobileOpen state", () => {
      const { result } = renderHook(() => useSidebar(), {
        wrapper: SidebarProvider,
      });

      act(() => {
        result.current.setMobileOpen(true);
      });

      expect(result.current.mobileOpen).toBe(true);

      act(() => {
        result.current.setMobileOpen(false);
      });

      expect(result.current.mobileOpen).toBe(false);
    });
  });

  describe("useSidebar", () => {
    test("throws error when used outside SidebarProvider", () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      expect(() => {
        renderHook(() => useSidebar());
      }).toThrow("useSidebar must be used within a SidebarProvider");

      console.error = originalError;
    });
  });
});
