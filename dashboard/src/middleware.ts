export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, static assets, and Next.js internals
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
