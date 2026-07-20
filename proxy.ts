import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 "proxy" convention (formerly middleware). Uses the db-free auth
// config so it stays lightweight; it only checks session presence.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
