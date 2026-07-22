"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { linkedinAccounts } from "@/db/schema";
import { env } from "@/lib/env";
import { createHostedAuthLink, listAccounts, UnipileError } from "@/lib/unipile/client";
import { enqueueJob } from "@/lib/qstash";
import { assertAdmin } from "@/lib/access";
import type { UnipileSourceStatus } from "@/lib/unipile/types";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

async function requireAdmin() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

/** Create a Unipile hosted-auth link the user opens to connect a LinkedIn account. */
export async function createConnectLink(): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    const { url } = await createHostedAuthLink({
      providers: ["LINKEDIN"],
      expiresOn,
      name: user.id, // echoed back on the CREATION_SUCCESS webhook → owner
      successRedirectUrl: `${env.APP_URL}/accounts?connected=1`,
      failureRedirectUrl: `${env.APP_URL}/accounts?connected=0`,
    });
    return { url };
  } catch (e) {
    if (e instanceof UnipileError) return { error: `Unipile error ${e.status}` };
    return { error: e instanceof Error ? e.message : "Failed to create link" };
  }
}

function mapStatus(status?: UnipileSourceStatus): typeof linkedinAccounts.$inferInsert.status {
  switch (status) {
    case "OK":
      return "OK";
    case "CONNECTING":
      return "CONNECTING";
    case "CREDENTIALS":
      return "CREDENTIALS";
    case "PERMISSIONS":
      return "PERMISSIONS";
    case "STOPPED":
      return "STOPPED";
    default:
      return status ? "ERROR" : "OK";
  }
}

/**
 * Import LinkedIn accounts already connected in the Unipile workspace, so you
 * don't have to re-run hosted auth for accounts that exist there.
 */
export async function importAccountsFromUnipile(): Promise<{ imported: number; error?: string }> {
  const user = await requireAdmin();
  try {
    const res = await listAccounts({ limit: 250 });
    const linkedin = res.items.filter((a) => a.type === "LINKEDIN");
    let imported = 0;
    for (const a of linkedin) {
      const status = mapStatus(a.sources?.find((s) => s.status)?.status);
      await db
        .insert(linkedinAccounts)
        .values({
          unipileAccountId: a.id,
          name: a.name || a.id,
          status,
          ownerUserId: user.id,
        })
        .onConflictDoUpdate({
          target: linkedinAccounts.unipileAccountId,
          set: { name: a.name || a.id, status },
        });
      imported++;
    }
    revalidatePath("/accounts");
    revalidatePath("/");
    return { imported };
  } catch (e) {
    if (e instanceof UnipileError) return { imported: 0, error: `Unipile error ${e.status}` };
    return { imported: 0, error: e instanceof Error ? e.message : "Import failed" };
  }
}

export async function updateAccountCaps(
  accountId: string,
  caps: {
    dailyInviteCap?: number;
    dailyMessageCap?: number;
    dailyInmailCap?: number;
    dailyEnrichCap?: number;
    autoEnrichDailyCap?: number;
  },
): Promise<void> {
  await requireAdmin();
  await db.update(linkedinAccounts).set(caps).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Toggle proactive daily enrichment for an account. Turning it on runs a batch now. */
export async function setAccountAutoEnrich(accountId: string, enabled: boolean): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ autoEnrich: enabled })
    .where(eq(linkedinAccounts.id, accountId));
  if (enabled) await enqueueJob("auto-enrich", {});
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Kick off a full connection sync for an account (chunked via QStash). Admin only. */
export async function startSync(accountId: string): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ syncStatus: "running", syncCursor: null })
    .where(eq(linkedinAccounts.id, accountId));
  await enqueueJob("sync", { accountId });
  revalidatePath("/accounts");
}

/** Assign (or clear) the member who owns an account. Admin only. */
export async function assignAccountOwner(
  accountId: string,
  userId: string | null,
): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ ownerUserId: userId })
    .where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function removeAccount(accountId: string): Promise<void> {
  await requireAdmin();
  await db.delete(linkedinAccounts).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}
