"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { saveSettings, getSettings, type SettingsInput } from "@/lib/settings";
import { listAccounts, UnipileError } from "@/lib/unipile/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (session.user.role !== "admin") throw new Error("Admins only");
  return session.user;
}

export async function saveIntegrationSettings(input: SettingsInput): Promise<void> {
  await requireAdmin();
  await saveSettings(input);
  revalidatePath("/settings");
  revalidatePath("/");
}

/** Verify the Unipile credentials by listing accounts. */
export async function testUnipile(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  try {
    const s = await getSettings(true);
    if (!s.unipileDsn || !s.unipileApiKey) {
      return { ok: false, message: "DSN and API key are required." };
    }
    const res = await listAccounts({ limit: 1 });
    return { ok: true, message: `Connected. ${res.items.length >= 0 ? "Credentials valid." : ""}` };
  } catch (e) {
    if (e instanceof UnipileError) return { ok: false, message: `Unipile error ${e.status}` };
    return { ok: false, message: e instanceof Error ? e.message : "Test failed" };
  }
}

export async function addTeamMember(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "member";
}): Promise<{ error?: string }> {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  if (!email || input.password.length < 8) {
    return { error: "Valid email and 8+ character password required." };
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "A user with that email already exists." };

  const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({
    email,
    name: input.name.trim() || null,
    passwordHash,
    role: input.role,
  });
  revalidatePath("/settings");
  return {};
}

export async function removeTeamMember(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === id) throw new Error("You cannot remove yourself.");
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/settings");
}
