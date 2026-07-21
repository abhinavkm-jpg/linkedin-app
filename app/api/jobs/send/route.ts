import { NextResponse } from "next/server";
import { and, asc, eq, inArray, lt, lte, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, campaigns } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { processEnrollment } from "@/lib/outreach/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 8;
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

  // Only process enrollments whose campaign is ACTIVE — never draft/paused.
  const candidates = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(
      and(
        eq(campaigns.status, "active"),
        inArray(enrollments.state, [...DUE_STATES]),
        or(isNull(enrollments.nextRunAt), lte(enrollments.nextRunAt, now)),
        campaignFilter,
      ),
    )
    .orderBy(asc(enrollments.nextRunAt))
    .limit(BATCH);

  let processed = 0;
  for (const cand of candidates) {
    // Atomic claim: flip to `messaging` only if still due. A single UPDATE is
    // atomic per row, so only one concurrent worker wins each enrollment.
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
    if (!enr) continue; // lost the race to another worker

    try {
      await processEnrollment(enr);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(enrollments)
        .set({ state: "failed", lastError: msg, updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      console.error("[send] enrollment failed", enr.id, msg);
    }
  }

  if (candidates.length === BATCH) {
    await enqueueJob("send", job.body.campaignId ? { campaignId: job.body.campaignId } : {}, {
      delaySeconds: 30,
    });
  }

  return NextResponse.json({ ok: true, processed });
}
