import { vi } from "vitest";

// Shared mock for next/navigation - includes all exports used across tests
// Individual tests can override specific behaviors by reassigning the mock functions
export const mockNavigationState = {
  pathname: "/day",
  searchParams: new URLSearchParams(),
};
export const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockNavigationState.pathname,
  useSearchParams: () => mockNavigationState.searchParams,
  useRouter: () => ({ push: mockRouterPush }),
}));

// Shared mock for next-auth/react
export const mockSignIn = vi.fn(() => {});

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));
