"use server";

import { revalidatePath } from "next/cache";
import { and, inArray, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { connections, enrollments, campaigns } from "@/db/schema";
import { enqueueJob } from "@/lib/qstash";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

/** Enroll a set of connections into a campaign, then kick the send worker. */
export async function enrollConnections(
  connectionIds: string[],
  campaignId: string,
): Promise<{ enrolled: number; skipped: number }> {
  await requireUser();
  if (connectionIds.length === 0) return { enrolled: 0, skipped: 0 };

  const camp = (
    await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1)
  )[0];
  if (!camp) throw new Error("Campaign not found");

  const conns = await db
    .select({ id: connections.id, accountId: connections.accountId })
    .from(connections)
    .where(inArray(connections.id, connectionIds));

  // Only enroll connections belonging to the campaign's account.
  let ids = conns.filter((c) => c.accountId === camp.accountId).map((c) => c.id);
  let skipped = 0;

  // Unique-DMs campaigns skip anyone already enrolled here (the DB index is no
  // longer unique, so dedup is enforced in app logic).
  if (camp.dedupeContacts && ids.length > 0) {
    const existing = await db
      .select({ connectionId: enrollments.connectionId })
      .from(enrollments)
      .where(and(eq(enrollments.campaignId, campaignId), inArray(enrollments.connectionId, ids)));
    const seen = new Set(existing.map((e) => e.connectionId));
    const before = ids.length;
    ids = ids.filter((id) => !seen.has(id));
    skipped = before - ids.length;
  }

  if (ids.length > 0) {
    await db.insert(enrollments).values(
      ids.map((id) => ({
        campaignId,
        connectionId: id,
        accountId: camp.accountId,
        state: "queued" as const,
        nextRunAt: new Date(),
      })),
    );
    // Adding people to a finished campaign brings it back to life.
    if (camp.status === "completed") {
      await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaignId));
    }
    await enqueueJob("send", { campaignId });
  }

  revalidatePath("/connections");
  revalidatePath("/campaigns");
  return { enrolled: ids.length, skipped };
}

/** Queue enrichment for selected connections (respects the daily cap in the worker). */
export async function enrichConnections(connectionIds: string[]): Promise<void> {
  await requireUser();
  if (connectionIds.length === 0) return;
  await enqueueJob("enrich", { connectionIds });
  revalidatePath("/connections");
}

/** Add or set tags on selected connections. */
export async function tagConnections(connectionIds: string[], tags: string[]): Promise<void> {
  await requireUser();
  if (connectionIds.length === 0) return;
  await db
    .update(connections)
    .set({ tags })
    .where(inArray(connections.id, connectionIds));
  revalidatePath("/connections");
}
