import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { verifyContentDates } from "@/lib/outreach/content-dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verify real publish dates for shareable content (from each article page) so
 * content-sharing only ever picks recent articles. Processes a bounded batch
 * per run and re-enqueues while work remains.
 */
export async function POST(req: Request) {
  const job = await readJob<{ accountId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const accounts = job.body.accountId
    ? await db.select().from(linkedinAccounts).where(eq(linkedinAccounts.id, job.body.accountId))
    : await db.select().from(linkedinAccounts).where(eq(linkedinAccounts.status, "OK"));

  let remainingTotal = 0;
  const results: { accountId: string; checked: number; dated: number; remaining: number }[] = [];
  for (const account of accounts) {
    try {
      const r = await verifyContentDates(account, { limit: 60 });
      results.push({ accountId: account.id, ...r });
      remainingTotal += r.remaining;
    } catch (e) {
      console.error("[content-dates] failed", account.id, e instanceof Error ? e.message : e);
    }
  }

  // Keep going in the background until every asset has been checked.
  if (remainingTotal > 0) await enqueueJob("content-dates", job.body.accountId ? { accountId: job.body.accountId } : {}, { delaySeconds: 30 });

  return NextResponse.json({ ok: true, results, remainingTotal });
}
