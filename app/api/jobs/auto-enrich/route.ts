import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { connections, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { canSend } from "@/lib/rate-limit";
import { UnipileError } from "@/lib/unipile/client";
import { enrichConnectionRow } from "@/lib/outreach/enrich";
import { enqueueJob } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Enrich at most this many per account per run (keeps under the 60s limit and
// avoids bursts). The per-account daily cap (default 150) bounds the total; the
// every-30-min schedule spreads calls across the day.
const PER_RUN_PER_ACCOUNT = 20;

/**
 * Proactive daily profile enrichment. For each account with `autoEnrich` on,
 * enrich un-enriched connections (oldest first) on the account's own daily
 * budget. Then kick `auto-enroll` so freshly-enriched connections that now pass
 * a campaign's ICP are added to the live campaign automatically.
 */
export async function POST(req: Request) {
  const job = await readJob(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const accounts = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.autoEnrich, true));

  let totalEnriched = 0;
  const perAccount: { accountId: string; enriched: number }[] = [];

  for (const account of accounts) {
    let enriched = 0;
    for (let i = 0; i < PER_RUN_PER_ACCOUNT; i++) {
      if (!(await canSend(account.id, "autoEnrich"))) break; // daily cap reached

      const [conn] = await db
        .select()
        .from(connections)
        .where(and(eq(connections.accountId, account.id), isNull(connections.enrichedAt)))
        .orderBy(asc(connections.createdAt))
        .limit(1);
      if (!conn) break; // nothing left to enrich on this account

      try {
        await enrichConnectionRow(conn, account, { counter: "autoEnrich" });
        enriched++;
      } catch (e) {
        if (e instanceof UnipileError && (e.isRateLimited || e.status === 429)) break;
        // Mark as attempted so a permanently-failing profile doesn't block the queue.
        await db
          .update(connections)
          .set({ enrichedAt: new Date() })
          .where(eq(connections.id, conn.id));
        console.error("[auto-enrich] failed for", conn.id, e instanceof Error ? e.message : e);
      }
    }
    if (enriched > 0) perAccount.push({ accountId: account.id, enriched });
    totalEnriched += enriched;
  }

  // Feed newly-enriched contacts into live campaigns (ICP-tested inside).
  if (totalEnriched > 0) {
    await enqueueJob("auto-enroll", {});
  }

  return NextResponse.json({ ok: true, enriched: totalEnriched, perAccount });
}
