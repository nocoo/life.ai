export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    // Protect all routes except login, auth/live APIs, static assets, and Next.js internals
    "/((?!login|api/auth|api/live|_next/static|_next/image|favicon.ico).*)",
  ],
};
