import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { canEnrichNow } from "@/lib/rate-limit";
import { UnipileError } from "@/lib/unipile/client";
import { enrichConnectionRow } from "@/lib/outreach/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lazily enrich connections via GET /users/{id}. Heavily rate-limited (~100/day
 * per account), so we stop as soon as an account hits its daily cap and skip
 * connections we can't enrich now — they can be retried tomorrow.
 */
export async function POST(req: Request) {
  const job = await readJob<{ connectionIds: string[] }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const ids = job.body.connectionIds ?? [];
  if (ids.length === 0) return NextResponse.json({ ok: true, enriched: 0 });

  const conns = await db.select().from(connections).where(inArray(connections.id, ids));
  const accountIds = [...new Set(conns.map((c) => c.accountId))];
  const accounts = await db
    .select()
    .from(linkedinAccounts)
    .where(inArray(linkedinAccounts.id, accountIds));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  let enriched = 0;
  let skipped = 0;

  for (const conn of conns) {
    const account = accountMap.get(conn.accountId);
    if (!account) continue;
    if (conn.enrichedAt) continue; // already enriched

    if (!(await canEnrichNow(account.id))) {
      skipped++;
      continue;
    }

    const identifier = conn.publicIdentifier || conn.providerId || conn.memberId;
    if (!identifier) continue;

    try {
      await enrichConnectionRow(conn, account, { counter: "enrich" });
      enriched++;
    } catch (e) {
      if (e instanceof UnipileError && (e.isRateLimited || e.status === 429)) {
        skipped++;
        continue; // stop hitting this account; leave for retry
      }
      console.error("[enrich] failed for", conn.id, e);
    }
  }

  return NextResponse.json({ ok: true, enriched, skipped });
}
