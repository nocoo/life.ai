import { describe, test, expect } from "bun:test";
import { NAV_GROUPS, ALL_NAV_ITEMS, ROUTE_LABELS } from "@/lib/navigation";

describe("navigation", () => {
  describe("NAV_GROUPS", () => {
    test("has at least one group", () => {
      expect(NAV_GROUPS.length).toBeGreaterThan(0);
    });

    test("each group has label and items", () => {
      for (const group of NAV_GROUPS) {
        expect(group.label).toBeDefined();
        expect(Array.isArray(group.items)).toBe(true);
        expect(group.items.length).toBeGreaterThan(0);
      }
    });

    test("each item has href, label, and icon", () => {
      for (const group of NAV_GROUPS) {
        for (const item of group.items) {
          expect(item.href).toBeDefined();
          expect(item.href.startsWith("/")).toBe(true);
          expect(item.label).toBeDefined();
          expect(item.icon).toBeDefined();
        }
      }
    });

    test("日常 group has day, month, year items", () => {
      const dailyGroup = NAV_GROUPS.find((g) => g.label === "日常");
      expect(dailyGroup).toBeDefined();
      expect(dailyGroup!.defaultOpen).toBe(true);

      const hrefs = dailyGroup!.items.map((i) => i.href);
      expect(hrefs).toContain("/day");
      expect(hrefs).toContain("/month");
      expect(hrefs).toContain("/year");
    });
  });

  describe("ALL_NAV_ITEMS", () => {
    test("is flattened array of all nav items", () => {
      const expectedCount = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
      expect(ALL_NAV_ITEMS.length).toBe(expectedCount);
    });

    test("contains all items from NAV_GROUPS", () => {
      for (const group of NAV_GROUPS) {
        for (const item of group.items) {
          expect(ALL_NAV_ITEMS).toContainEqual(item);
        }
      }
    });
  });

  describe("ROUTE_LABELS", () => {
    test("has labels for all nav item hrefs", () => {
      for (const item of ALL_NAV_ITEMS) {
        expect(ROUTE_LABELS[item.href]).toBeDefined();
      }
    });

    test("has label for root path", () => {
      expect(ROUTE_LABELS["/"]).toBeDefined();
    });
  });
});
