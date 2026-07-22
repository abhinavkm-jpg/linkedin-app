import { NextResponse } from "next/server";
import { and, asc, eq, isNull, exists, sql } from "drizzle-orm";
import { db } from "@/db";
import { connections, linkedinAccounts, enrollments, campaigns } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { canSend } from "@/lib/rate-limit";
import { UnipileError } from "@/lib/unipile/client";
import { enrichConnectionRow } from "@/lib/outreach/enrich";
import { enqueueJob } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One profile per run, then re-queue after a short gap — a gentle trickle that
// LinkedIn won't flag as a burst. The daily cap (default 150/account) stops it.
const GAP_SECONDS = 60; // wait ~1 min, then try the next
const THROTTLED_BACKOFF_SECONDS = 1800; // rate limited → back off 30 min
const SKIP_SECONDS = 5; // couldn't enrich this one → move on quickly

/**
 * Proactive daily enrichment, paced one-at-a-time. Enriches a single un-enriched
 * connection on an account that's still under its daily budget, then re-queues
 * itself 60s later to do the next. Kicked off when the toggle is turned on and
 * by a daily schedule; stops on its own when everything is enriched or capped.
 * (The separate auto-enroll schedule adds freshly-enriched matches to campaigns.)
 */
export async function POST(req: Request) {
  const job = await readJob(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const accounts = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.autoEnrich, true));

  for (const account of accounts) {
    if (!(await canSend(account.id, "autoEnrich"))) continue; // daily cap reached

    // Prefer connections already enrolled in an active campaign (they're in
    // play — enriching them lets the messaging pipeline flow); else oldest.
    const enrolledInActive = exists(
      db
        .select({ x: sql`1` })
        .from(enrollments)
        .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
        .where(
          and(eq(enrollments.connectionId, connections.id), eq(campaigns.status, "active")),
        ),
    );
    const [priority] = await db
      .select()
      .from(connections)
      .where(
        and(eq(connections.accountId, account.id), isNull(connections.enrichedAt), enrolledInActive),
      )
      .orderBy(asc(connections.createdAt))
      .limit(1);
    let conn = priority;
    if (!conn) {
      const [oldest] = await db
        .select()
        .from(connections)
        .where(and(eq(connections.accountId, account.id), isNull(connections.enrichedAt)))
        .orderBy(asc(connections.createdAt))
        .limit(1);
      conn = oldest;
    }
    if (!conn) continue; // nothing left on this account

    try {
      await enrichConnectionRow(conn, account, { counter: "autoEnrich" });
      // Success → line up the next one in ~1 minute.
      await enqueueJob("auto-enrich", {}, { delaySeconds: GAP_SECONDS });
      return NextResponse.json({ ok: true, enriched: 1, account: account.id });
    } catch (e) {
      if (e instanceof UnipileError && (e.isRateLimited || e.status === 429)) {
        // Throttled → wait for the window to clear before trying again.
        await enqueueJob("auto-enrich", {}, { delaySeconds: THROTTLED_BACKOFF_SECONDS });
        return NextResponse.json({ ok: true, rateLimited: true, account: account.id });
      }
      // Permanent failure (e.g. 404) → mark attempted and move on promptly.
      await db.update(connections).set({ enrichedAt: new Date() }).where(eq(connections.id, conn.id));
      console.error("[auto-enrich] failed for", conn.id, e instanceof Error ? e.message : e);
      await enqueueJob("auto-enrich", {}, { delaySeconds: SKIP_SECONDS });
      return NextResponse.json({ ok: true, skipped: conn.id });
    }
  }

  // No eligible work (all accounts capped or fully enriched) → stop the chain.
  return NextResponse.json({ ok: true, idle: true });
}
