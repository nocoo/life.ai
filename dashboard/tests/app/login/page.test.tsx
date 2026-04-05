import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LoginContent } from "@/app/login/page";
import { mockNavigationState, mockSignIn } from "../../setup";

describe("LoginContent", () => {
  beforeEach(() => {
    mockSignIn.mockClear();
    mockNavigationState.searchParams = new URLSearchParams();
    mockNavigationState.pathname = "/login";
  });

  afterEach(() => {
    cleanup();
  });

  test("renders login badge card", () => {
    render(<LoginContent />);
    expect(screen.getByText("Welcome")).toBeTruthy();
    expect(screen.getByText("Sign in to get your badge")).toBeTruthy();
    expect(screen.getByText("Life.ai")).toBeTruthy();
    expect(screen.getByText("Visitor")).toBeTruthy();
  });

  test("renders Google sign-in button", () => {
    render(<LoginContent />);
    expect(screen.getByText("Continue with Google")).toBeTruthy();
  });

  test("renders GitHub link", () => {
    render(<LoginContent />);
    const githubLink = screen.getByLabelText("GitHub repository");
    expect(githubLink).toBeTruthy();
    expect(githubLink.getAttribute("href")).toBe("https://github.com/nicoxiang/life.ai");
    expect(githubLink.getAttribute("target")).toBe("_blank");
  });

  test("renders theme toggle", () => {
    render(<LoginContent />);
    // Theme toggle button exists
    expect(screen.getByLabelText("Toggle theme, currently light")).toBeTruthy();
  });

  test("renders secure authentication indicator", () => {
    render(<LoginContent />);
    expect(screen.getByText("Secure authentication")).toBeTruthy();
  });

  test("renders terms text", () => {
    render(<LoginContent />);
    expect(screen.getByText(/By signing in you agree to our Terms of Service/)).toBeTruthy();
  });

  test("clicking Google button calls signIn with default callback", () => {
    render(<LoginContent />);
    const button = screen.getByText("Continue with Google");
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/day" });
  });

  test("uses valid callbackUrl from search params", () => {
    mockNavigationState.searchParams = new URLSearchParams("callbackUrl=/settings");
    render(<LoginContent />);
    const button = screen.getByText("Continue with Google");
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/settings" });
  });

  test("ignores callbackUrl that does not start with /", () => {
    mockNavigationState.searchParams = new URLSearchParams("callbackUrl=https://evil.com");
    render(<LoginContent />);
    const button = screen.getByText("Continue with Google");
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/day" });
  });

  test("ignores callbackUrl starting with //", () => {
    mockNavigationState.searchParams = new URLSearchParams("callbackUrl=//evil.com");
    render(<LoginContent />);
    const button = screen.getByText("Continue with Google");
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/day" });
  });

  test("displays error message for AccessDenied", () => {
    mockNavigationState.searchParams = new URLSearchParams("error=AccessDenied");
    render(<LoginContent />);
    expect(screen.getByText("Your account is not authorized.")).toBeTruthy();
  });

  test("displays generic error message for other errors", () => {
    mockNavigationState.searchParams = new URLSearchParams("error=SomeError");
    render(<LoginContent />);
    expect(screen.getByText("Sign in failed. Please try again.")).toBeTruthy();
  });

  test("does not display error message when no error", () => {
    render(<LoginContent />);
    expect(screen.queryByText("Your account is not authorized.")).toBeNull();
    expect(screen.queryByText("Sign in failed. Please try again.")).toBeNull();
  });

  test("renders dynamic year and date in barcode section", () => {
    render(<LoginContent />);
    const year = new Date().getFullYear();
    // The ID format is "ID {year}-{MMDD}"
    const idElement = screen.getByText(/ID \d{4}-\d{4}/);
    expect(idElement.textContent?.includes(year.toString())).toBe(true);
  });
});
