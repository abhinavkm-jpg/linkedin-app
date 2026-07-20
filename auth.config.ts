import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no database, no bcrypt) shared with `proxy.ts`.
 * The Credentials provider with its db-backed `authorize` lives in `auth.ts`,
 * which runs in the Node runtime. The proxy only needs the `authorized`
 * callback to gate routes by session presence.
 */
export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/api/jobs") ||
        nextUrl.pathname.startsWith("/api/cron");
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
