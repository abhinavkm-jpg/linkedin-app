import { NextResponse } from "next/server";
import { and, asc, eq, inArray, lte, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { processEnrollment } from "@/lib/outreach/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 8;
const DUE_STATES = ["queued", "accepted", "in_followup", "messaging"] as const;

export async function POST(req: Request) {
  const job = await readJob<{ campaignId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const now = new Date();
  const due = await db
    .select()
    .from(enrollments)
    .where(
      and(
        inArray(enrollments.state, [...DUE_STATES]),
        or(isNull(enrollments.nextRunAt), lte(enrollments.nextRunAt, now)),
        job.body.campaignId ? eq(enrollments.campaignId, job.body.campaignId) : undefined,
      ),
    )
    .orderBy(asc(enrollments.nextRunAt))
    .limit(BATCH);

  let processed = 0;
  for (const enr of due) {
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

  // If we filled the batch, there may be more due — continue after a short gap.
  if (due.length === BATCH) {
    await enqueueJob("send", job.body.campaignId ? { campaignId: job.body.campaignId } : {}, {
      delaySeconds: 30,
    });
  }

  return NextResponse.json({ ok: true, processed });
}
