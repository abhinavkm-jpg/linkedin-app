import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections, enrollments, campaigns, type Campaign } from "@/db/schema";
import { enqueueJob } from "@/lib/qstash";

/**
 * Enroll a set of connections into a campaign. Shared by the manual "Enroll"
 * server action and the background auto-enroll job — so both dedupe, insert,
 * reactivate, and kick the send worker identically.
 *
 * - Only connections on the campaign's own account are enrolled.
 * - When `dedupe` (defaults to the campaign's `dedupeContacts`) is true, anyone
 *   already enrolled in this campaign is skipped. The auto-enroll job always
 *   passes `dedupe: true` so it only ever adds *new* people.
 * - A `completed` campaign is reactivated when people are added.
 */
export async function enrollConnectionIds(
  camp: Campaign,
  connectionIds: string[],
  opts: { dedupe?: boolean } = {},
): Promise<{ enrolled: number; skipped: number }> {
  if (connectionIds.length === 0) return { enrolled: 0, skipped: 0 };
  const dedupe = opts.dedupe ?? camp.dedupeContacts;

  // Only enroll connections belonging to the campaign's account.
  const conns = await db
    .select({ id: connections.id, accountId: connections.accountId })
    .from(connections)
    .where(inArray(connections.id, connectionIds));
  let ids = conns.filter((c) => c.accountId === camp.accountId).map((c) => c.id);
  let skipped = 0;

  if (dedupe && ids.length > 0) {
    const existing = await db
      .select({ connectionId: enrollments.connectionId })
      .from(enrollments)
      .where(and(eq(enrollments.campaignId, camp.id), inArray(enrollments.connectionId, ids)));
    const seen = new Set(existing.map((e) => e.connectionId));
    const before = ids.length;
    ids = ids.filter((id) => !seen.has(id));
    skipped = before - ids.length;
  }

  if (ids.length > 0) {
    await db.insert(enrollments).values(
      ids.map((id) => ({
        campaignId: camp.id,
        connectionId: id,
        accountId: camp.accountId,
        state: "queued" as const,
        nextRunAt: new Date(),
      })),
    );
    // Adding people to a finished campaign brings it back to life.
    if (camp.status === "completed") {
      await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, camp.id));
    }
    await enqueueJob("send", { campaignId: camp.id });
  }

  return { enrolled: ids.length, skipped };
}
