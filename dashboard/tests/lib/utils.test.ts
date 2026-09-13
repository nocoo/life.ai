import { describe, expect, test } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  test("keeps the last conflicting utility class", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  test("merges state variants independently", () => {
    expect(cn("hover:bg-primary hover:text-white", "hover:bg-muted")).toBe(
      "hover:text-white hover:bg-muted",
    );
  });

  test("accepts conditional clsx inputs used by components", () => {
    expect(cn("rounded-md", false && "hidden", ["p-2", { "p-4": true }])).toBe(
      "rounded-md p-4",
    );
  });
});
