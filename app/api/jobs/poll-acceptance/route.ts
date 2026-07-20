import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, connections, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { listRelations, UnipileError } from "@/lib/unipile/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backup for the `new_relation` webhook (which can lag up to 8h). For each
 * account with invitations awaiting acceptance, fetch the most recent relations
 * page and advance any matching enrollments. Unipile advises polling only a few
 * times/day with randomized spacing, so schedule this sparingly.
 */
export async function POST(req: Request) {
  const job = await readJob(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  // Accounts that currently have awaiting_accept enrollments.
  const awaiting = await db
    .select({ accountId: enrollments.accountId })
    .from(enrollments)
    .where(eq(enrollments.state, "awaiting_accept"))
    .groupBy(enrollments.accountId);

  let advanced = 0;

  for (const { accountId } of awaiting) {
    const [account] = await db
      .select()
      .from(linkedinAccounts)
      .where(eq(linkedinAccounts.id, accountId))
      .limit(1);
    if (!account) continue;

    let recentIdentifiers: Set<string>;
    try {
      const page = await listRelations({ accountId: account.unipileAccountId, limit: 100 });
      recentIdentifiers = new Set(
        page.items.flatMap((r) => [r.member_id, r.public_identifier].filter(Boolean) as string[]),
      );
    } catch (e) {
      if (e instanceof UnipileError) continue;
      throw e;
    }
    if (recentIdentifiers.size === 0) continue;

    // Pending connections for this account with awaiting enrollments.
    const pending = await db
      .select({
        connId: connections.id,
        memberId: connections.memberId,
        publicId: connections.publicIdentifier,
        enrId: enrollments.id,
      })
      .from(enrollments)
      .innerJoin(connections, eq(connections.id, enrollments.connectionId))
      .where(
        and(eq(enrollments.state, "awaiting_accept"), eq(enrollments.accountId, accountId)),
      );

    const toAdvance = pending.filter(
      (p) =>
        (p.memberId && recentIdentifiers.has(p.memberId)) ||
        (p.publicId && recentIdentifiers.has(p.publicId)),
    );

    if (toAdvance.length > 0) {
      await db
        .update(enrollments)
        .set({ state: "accepted", nextRunAt: new Date() })
        .where(inArray(enrollments.id, toAdvance.map((t) => t.enrId)));
      await db
        .update(connections)
        .set({ relationshipStatus: "accepted" })
        .where(inArray(connections.id, toAdvance.map((t) => t.connId)));
      advanced += toAdvance.length;
    }
  }

  if (advanced > 0) {
    await enqueueJob("send", {});
  }

  return NextResponse.json({ ok: true, advanced });
}
