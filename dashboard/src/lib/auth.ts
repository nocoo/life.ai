import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Access control: only these emails can sign in
const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// For reverse proxy environments with HTTPS, we need secure cookies
const useSecureCookies =
  process.env.NODE_ENV === "production" ||
  process.env.NEXTAUTH_URL?.startsWith("https://") ||
  process.env.USE_SECURE_COOKIES === "true";

export const { handlers, auth } = NextAuth({
  // Trust the host header for automatic URL detection behind reverse proxies
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Cookie configuration for reverse proxy environments
  cookies: {
    pkceCodeVerifier: {
      name: useSecureCookies
        ? "__Secure-authjs.pkce.code_verifier"
        : "authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    state: {
      name: useSecureCookies ? "__Secure-authjs.state" : "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies
        ? "__Secure-authjs.callback-url"
        : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies
        ? "__Host-authjs.csrf-token"
        : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) {
        return false;
      }
      return true;
    },
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const pathname = nextUrl.pathname;

      // Allow public paths: login page and static assets
      const isPublicPath =
        pathname === "/login" ||
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/api/auth/") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".webp");

      if (isPublicPath) {
        // Redirect logged-in users away from login page
        if (pathname === "/login" && isLoggedIn) {
          return Response.redirect(new URL("/day", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
  },
});
