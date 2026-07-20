"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export async function authenticate(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // signIn throws a redirect on success (not an AuthError) — rethrow it.
    if (error instanceof AuthError) return "Invalid email or password.";
    throw error;
  }
}

export async function registerAdmin(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return "Email and password are required.";
  if (password.length < 8) return "Password must be at least 8 characters.";

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return "Setup is already complete. Please sign in.";

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name: name || null, passwordHash, role: "admin" });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return "Account created, but sign-in failed. Try logging in.";
    throw error;
  }
}
