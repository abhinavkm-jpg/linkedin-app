import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { importAccountChats } from "@/lib/outreach/import-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import existing LinkedIn conversations into `chats` so campaign dedupe never
 * messages someone we've already talked to (including old/manual threads).
 * Runs for one account (body.accountId) or all OK accounts.
 */
export async function POST(req: Request) {
  const job = await readJob<{ accountId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const accounts = job.body.accountId
    ? await db.select().from(linkedinAccounts).where(eq(linkedinAccounts.id, job.body.accountId))
    : await db.select().from(linkedinAccounts).where(eq(linkedinAccounts.status, "OK"));

  const results: { accountId: string; imported: number; matched: number }[] = [];
  for (const account of accounts) {
    try {
      const r = await importAccountChats(account);
      results.push({ accountId: account.id, ...r });
    } catch (e) {
      console.error("[import-chats] failed", account.id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, results });
}
