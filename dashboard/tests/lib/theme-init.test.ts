import { beforeEach, describe, expect, test, vi } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";

describe("theme initialization", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });

  test.each([
    [false, "217 91% 48%", "0 0% 100%", "light"],
    [true, "217 91% 65%", "0 0% 10%", "dark"],
  ])("preloads brand accent for dark=%s", (dark, primary, foreground, mode) => {
    vi.stubGlobal("matchMedia", () => ({ matches: dark }));
    Function(THEME_INIT_SCRIPT)();

    const root = document.documentElement;
    expect(root.dataset.mode).toBe(mode);
    expect(root.dataset.accent).toBe("primary");
    expect(root.style.getPropertyValue("--basalt-primary")).toBe(primary);
    expect(root.style.getPropertyValue("--basalt-primary-foreground")).toBe(foreground);
    expect(root.style.getPropertyValue("--basalt-ring")).toBe(primary);
  });
});
