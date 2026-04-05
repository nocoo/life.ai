// 测试环境设置
import { Window } from "happy-dom";
import { mock } from "bun:test";

// Setup global DOM environment for React component testing
const window = new Window({ url: "http://localhost:3000" });

// Register globals
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
});

// Shared mock for next/navigation - includes all exports used across tests
// Individual tests can override specific behaviors by reassigning the mock functions
export const mockNavigationState = {
  pathname: "/day",
  searchParams: new URLSearchParams(),
};

mock.module("next/navigation", () => ({
  usePathname: () => mockNavigationState.pathname,
  useSearchParams: () => mockNavigationState.searchParams,
}));

// Shared mock for next-auth/react
export const mockSignIn = mock(() => {});

mock.module("next-auth/react", () => ({
  signIn: mockSignIn,
}));

// Shared mock for next-themes
export const mockThemeState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
};

mock.module("next-themes", () => ({
  useTheme: () => mockThemeState,
}));
