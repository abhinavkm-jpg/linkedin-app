import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled fan-out: kick a connection sync for every healthy account that
 * isn't already syncing, so new connections are detected automatically. The
 * existing chunked `sync` job (idempotent upsert) does the actual crawl; the
 * auto-enroll / auto-enrich pipeline then handles any new matches on its own.
 */
export async function POST(req: Request) {
  const job = await readJob(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const accounts = await db
    .select({ id: linkedinAccounts.id })
    .from(linkedinAccounts)
    .where(and(eq(linkedinAccounts.status, "OK"), ne(linkedinAccounts.syncStatus, "running")));

  for (const a of accounts) {
    await db
      .update(linkedinAccounts)
      .set({ syncStatus: "running", syncCursor: null, syncedCount: 0 })
      .where(eq(linkedinAccounts.id, a.id));
    await enqueueJob("sync", { accountId: a.id });
  }

  return NextResponse.json({ ok: true, kicked: accounts.length });
}
