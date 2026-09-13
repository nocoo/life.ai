import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";

let matches = false;
const listeners = new Set<() => void>();

function installMatchMedia() {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useIsMobile", () => {
  beforeEach(() => {
    matches = false;
    listeners.clear();
    installMatchMedia();
  });

  test("uses a mobile server snapshot to avoid reserving desktop rail space", () => {
    function Probe() {
      return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
    }
    expect(renderToString(<Probe />)).toContain("mobile");
  });

  test("tracks the viewport media query", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe(true);
  });
});
