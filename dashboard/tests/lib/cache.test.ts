import { describe, expect, it, beforeEach } from "bun:test";
import { MemoryCache, isHistoricalMonth, isHistoricalYear } from "@/lib/cache";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>();
  });

  describe("get/set", () => {
    it("returns undefined for missing key", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("stores and retrieves value", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("overwrites existing value", () => {
      cache.set("key1", "value1");
      cache.set("key1", "value2");
      expect(cache.get("key1")).toBe("value2");
    });
  });

  describe("has", () => {
    it("returns false for missing key", () => {
      expect(cache.has("missing")).toBe(false);
    });

    it("returns true for existing key", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
    });
  });

  describe("delete", () => {
    it("removes existing key", () => {
      cache.set("key1", "value1");
      cache.delete("key1");
      expect(cache.has("key1")).toBe(false);
    });

    it("does nothing for missing key", () => {
      cache.delete("missing"); // should not throw
      expect(cache.has("missing")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all keys", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(false);
      expect(cache.size()).toBe(0);
    });
  });

  describe("size", () => {
    it("returns 0 for empty cache", () => {
      expect(cache.size()).toBe(0);
    });

    it("returns correct count", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      expect(cache.size()).toBe(2);
    });
  });

  describe("getOrSet", () => {
    it("returns cached value without calling factory", () => {
      cache.set("key1", "cached");
      let factoryCalled = false;
      const result = cache.getOrSet("key1", () => {
        factoryCalled = true;
        return "new";
      });
      expect(result).toBe("cached");
      expect(factoryCalled).toBe(false);
    });

    it("calls factory and caches result for missing key", () => {
      let factoryCalled = false;
      const result = cache.getOrSet("key1", () => {
        factoryCalled = true;
        return "computed";
      });
      expect(result).toBe("computed");
      expect(factoryCalled).toBe(true);
      expect(cache.get("key1")).toBe("computed");
    });
  });
});

describe("isHistoricalMonth", () => {
  // Test assumes current date context; use fixed reference
  const testWithReference = (month: string, refDate: Date) => {
    return isHistoricalMonth(month, refDate);
  };

  it("returns true for past months", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference("2026-02", ref)).toBe(true);
    expect(testWithReference("2026-01", ref)).toBe(true);
    expect(testWithReference("2025-12", ref)).toBe(true);
  });

  it("returns false for current month", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference("2026-03", ref)).toBe(false);
  });

  it("returns false for future months", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference("2026-04", ref)).toBe(false);
    expect(testWithReference("2027-01", ref)).toBe(false);
  });
});

describe("isHistoricalYear", () => {
  const testWithReference = (year: number, refDate: Date) => {
    return isHistoricalYear(year, refDate);
  };

  it("returns true for past years", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference(2025, ref)).toBe(true);
    expect(testWithReference(2024, ref)).toBe(true);
  });

  it("returns false for current year", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference(2026, ref)).toBe(false);
  });

  it("returns false for future years", () => {
    const ref = new Date("2026-03-15");
    expect(testWithReference(2027, ref)).toBe(false);
  });
});
