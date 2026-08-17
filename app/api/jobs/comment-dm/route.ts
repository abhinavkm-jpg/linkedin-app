import { NextResponse } from "next/server";
import { and, count, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { commentCampaigns, commentDmTargets, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { pollCommentCampaign, sendCommentDm } from "@/lib/outreach/comment-dm";
import { randomSendGapSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 12;
const CLAIM_STALE_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const job = await readJob<{ campaignId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const now = new Date();
  const campaignFilter = job.body.campaignId
    ? eq(commentCampaigns.id, job.body.campaignId)
    : undefined;

  // Recover rows claimed by a crashed/timed-out worker.
  await db
    .update(commentDmTargets)
    .set({ state: "pending" })
    .where(
      and(
        eq(commentDmTargets.state, "sending"),
        lt(commentDmTargets.createdAt, new Date(now.getTime() - CLAIM_STALE_MS)),
      ),
    );

  /* --- Poll phase: discover new commenters on active campaigns' posts. --- */
  const active = await db
    .select({ campaign: commentCampaigns, account: linkedinAccounts })
    .from(commentCampaigns)
    .innerJoin(linkedinAccounts, eq(linkedinAccounts.id, commentCampaigns.accountId))
    .where(and(eq(commentCampaigns.status, "active"), campaignFilter));

  let queued = 0;
  for (const { campaign, account } of active) {
    try {
      const r = await pollCommentCampaign(campaign, account);
      queued += r.queued;
    } catch (e) {
      console.error("[comment-dm] campaign poll failed", campaign.id, e instanceof Error ? e.message : e);
    }
  }

  /* --- Send phase: reach pending targets, one per account per run. --- */
  const candidates = await db
    .select({
      target: commentDmTargets,
      campaign: commentCampaigns,
      account: linkedinAccounts,
      nextSendAt: linkedinAccounts.nextSendAt,
    })
    .from(commentDmTargets)
    .innerJoin(commentCampaigns, eq(commentCampaigns.id, commentDmTargets.campaignId))
    .innerJoin(linkedinAccounts, eq(linkedinAccounts.id, commentDmTargets.accountId))
    .where(and(eq(commentDmTargets.state, "pending"), eq(commentCampaigns.status, "active")))
    .limit(BATCH);

  let sent = 0;
  const sentAccounts = new Set<string>();

  for (const cand of candidates) {
    if (sentAccounts.has(cand.account.id)) continue;
    if (cand.nextSendAt && cand.nextSendAt > now) continue; // shared per-account cooldown

    // Atomic claim so concurrent workers can't double-send.
    const claimed = await db
      .update(commentDmTargets)
      .set({ state: "sending" })
      .where(and(eq(commentDmTargets.id, cand.target.id), eq(commentDmTargets.state, "pending")))
      .returning({ id: commentDmTargets.id });
    if (claimed.length === 0) continue; // lost the race

    let didSend = false;
    try {
      didSend = await sendCommentDm(cand.target, cand.campaign, cand.account);
    } catch (e) {
      console.error("[comment-dm] send failed", cand.target.id, e instanceof Error ? e.message : e);
    }

    if (didSend) {
      sent++;
      sentAccounts.add(cand.account.id);
      // Share the SAME cooldown field the campaign send worker uses, so campaign
      // DMs and comment DMs interleave and jointly respect pacing + caps.
      await db
        .update(linkedinAccounts)
        .set({ nextSendAt: new Date(Date.now() + randomSendGapSeconds() * 1000) })
        .where(eq(linkedinAccounts.id, cand.account.id));
    }
  }

  // Re-enqueue if pending targets remain (the cron is the backstop).
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(commentDmTargets)
    .innerJoin(commentCampaigns, eq(commentCampaigns.id, commentDmTargets.campaignId))
    .where(and(eq(commentDmTargets.state, "pending"), eq(commentCampaigns.status, "active")));

  if (Number(remaining) > 0 && sent > 0) {
    await enqueueJob("comment-dm", job.body.campaignId ? { campaignId: job.body.campaignId } : {}, {
      delaySeconds: randomSendGapSeconds(),
    });
  }

  return NextResponse.json({ ok: true, queued, sent, remaining: Number(remaining) });
}
