"use server";

import { revalidatePath } from "next/cache";
import { inArray, eq } from "drizzle-orm";
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
): Promise<{ enrolled: number }> {
  await requireUser();
  if (connectionIds.length === 0) return { enrolled: 0 };

  const camp = (
    await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1)
  )[0];
  if (!camp) throw new Error("Campaign not found");

  const conns = await db
    .select({ id: connections.id, accountId: connections.accountId })
    .from(connections)
    .where(inArray(connections.id, connectionIds));

  // Only enroll connections belonging to the campaign's account.
  const eligible = conns.filter((c) => c.accountId === camp.accountId);
  if (eligible.length === 0) return { enrolled: 0 };

  await db
    .insert(enrollments)
    .values(
      eligible.map((c) => ({
        campaignId,
        connectionId: c.id,
        accountId: camp.accountId,
        state: "queued" as const,
        nextRunAt: new Date(),
      })),
    )
    .onConflictDoNothing({
      target: [enrollments.campaignId, enrollments.connectionId],
    });

  await enqueueJob("send", { campaignId });
  revalidatePath("/connections");
  revalidatePath("/campaigns");
  return { enrolled: eligible.length };
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
