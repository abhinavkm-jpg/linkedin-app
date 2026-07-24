import { NextResponse } from "next/server";
import { and, asc, count, eq, exists, notExists, inArray, lt, lte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, campaigns, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { processEnrollment } from "@/lib/outreach/send";
import { randomSendGapSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 12;
// Resting states eligible for sending. `messaging` is the transient "claimed /
// in-flight" state used to prevent concurrent workers double-sending.
const DUE_STATES = ["queued", "accepted", "in_followup"] as const;
const CLAIM_STALE_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const job = await readJob<{ campaignId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const now = new Date();

  // Recover claims left in-flight by a crashed/timed-out worker.
  await db
    .update(enrollments)
    .set({ state: "queued", updatedAt: now })
    .where(
      and(
        eq(enrollments.state, "messaging"),
        lt(enrollments.updatedAt, new Date(now.getTime() - CLAIM_STALE_MS)),
      ),
    );

  const campaignFilter = job.body.campaignId
    ? eq(enrollments.campaignId, job.body.campaignId)
    : undefined;

  const dueClause = and(
    eq(campaigns.status, "active"),
    inArray(enrollments.state, [...DUE_STATES]),
    or(isNull(enrollments.nextRunAt), lte(enrollments.nextRunAt, now)),
    campaignFilter,
  );

  // Candidates from ACTIVE campaigns, with their account's send cooldown.
  const candidates = await db
    .select({
      id: enrollments.id,
      accountId: enrollments.accountId,
      nextSendAt: linkedinAccounts.nextSendAt,
    })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .innerJoin(linkedinAccounts, eq(linkedinAccounts.id, enrollments.accountId))
    .where(dueClause)
    .orderBy(asc(enrollments.nextRunAt))
    .limit(BATCH);

  let sent = 0;
  // At most one real send per account per run; skip accounts on cooldown.
  const sentAccounts = new Set<string>();

  for (const cand of candidates) {
    if (sentAccounts.has(cand.accountId)) continue;
    if (cand.nextSendAt && cand.nextSendAt > now) continue; // account cooling down

    // Atomic claim (single UPDATE) so concurrent workers can't double-process.
    const claimed = await db
      .update(enrollments)
      .set({ state: "messaging", updatedAt: new Date() })
      .where(
        and(
          eq(enrollments.id, cand.id),
          inArray(enrollments.state, [...DUE_STATES]),
          or(isNull(enrollments.nextRunAt), lte(enrollments.nextRunAt, new Date())),
        ),
      )
      .returning();
    const enr = claimed[0];
    if (!enr) continue; // lost the race

    let didSend = false;
    try {
      didSend = await processEnrollment(enr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(enrollments)
        .set({ state: "failed", lastError: msg, updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      console.error("[send] enrollment failed", enr.id, msg);
    }

    // Only a real send starts the account's cooldown and consumes its slot.
    if (didSend) {
      sent++;
      sentAccounts.add(cand.accountId);
      await db
        .update(linkedinAccounts)
        .set({ nextSendAt: new Date(Date.now() + randomSendGapSeconds() * 1000) })
        .where(eq(linkedinAccounts.id, cand.accountId));
    }
  }

  // If any due work remains, re-check after a random 2–10 min gap (the 15-min
  // cron is the backstop). This paces sends instead of bursting them.
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(dueClause);

  if (Number(remaining) > 0) {
    await enqueueJob("send", job.body.campaignId ? { campaignId: job.body.campaignId } : {}, {
      delaySeconds: randomSendGapSeconds(),
    });
  }

  // Auto-complete active campaigns that have enrollments but nothing left to do.
  // `awaiting_accept` (pending invite) and `paused` (awaiting review) still count
  // as pending, so those campaigns stay active. Auto-enroll campaigns are
  // "evergreen" — they never auto-complete; they stay active to keep absorbing
  // new matching connections over time.
  const PENDING = [
    "queued",
    "accepted",
    "in_followup",
    "messaging",
    "awaiting_accept",
    "paused",
  ] as const;
  await db
    .update(campaigns)
    .set({ status: "completed" })
    .where(
      and(
        eq(campaigns.status, "active"),
        eq(campaigns.autoEnroll, false),
        exists(
          db
            .select({ x: sql`1` })
            .from(enrollments)
            .where(eq(enrollments.campaignId, campaigns.id)),
        ),
        notExists(
          db
            .select({ x: sql`1` })
            .from(enrollments)
            .where(and(eq(enrollments.campaignId, campaigns.id), inArray(enrollments.state, [...PENDING]))),
        ),
      ),
    );

  return NextResponse.json({ ok: true, sent, remaining: Number(remaining) });
}
