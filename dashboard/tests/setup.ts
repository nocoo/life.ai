import { vi } from "vitest";

// Shared mock for next/navigation - includes all exports used across tests
// Individual tests can override specific behaviors by reassigning the mock functions
export const mockNavigationState = {
  pathname: "/day",
  searchParams: new URLSearchParams(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockNavigationState.pathname,
  useSearchParams: () => mockNavigationState.searchParams,
}));

// Shared mock for next-auth/react
export const mockSignIn = vi.fn(() => {});

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

// Shared mock for next-themes
export const mockThemeState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
};

vi.mock("next-themes", () => ({
  useTheme: () => mockThemeState,
}));
