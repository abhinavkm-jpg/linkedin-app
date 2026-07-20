"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { linkedinAccounts } from "@/db/schema";
import { env } from "@/lib/env";
import { createHostedAuthLink, UnipileError } from "@/lib/unipile/client";
import { enqueueJob } from "@/lib/qstash";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
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

export async function updateAccountCaps(
  accountId: string,
  caps: {
    dailyInviteCap?: number;
    dailyMessageCap?: number;
    dailyInmailCap?: number;
    dailyEnrichCap?: number;
  },
): Promise<void> {
  await requireUser();
  await db.update(linkedinAccounts).set(caps).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Kick off a full connection sync for an account (chunked via QStash). */
export async function startSync(accountId: string): Promise<void> {
  await requireUser();
  await db
    .update(linkedinAccounts)
    .set({ syncStatus: "running", syncCursor: null })
    .where(eq(linkedinAccounts.id, accountId));
  await enqueueJob("sync", { accountId });
  revalidatePath("/accounts");
}

export async function removeAccount(accountId: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only admins can remove accounts");
  await db.delete(linkedinAccounts).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}
