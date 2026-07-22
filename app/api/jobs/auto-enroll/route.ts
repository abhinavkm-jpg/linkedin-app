import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { getIcpMatches } from "@/lib/data-connections";
import { enrollConnectionIds } from "@/lib/outreach/enroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max new enrollments to add per campaign per run. Repeated runs top up the
// queue; sending stays paced by the daily caps regardless of how many we enroll.
const AUTO_ENROLL_BATCH = 2000;

/**
 * Hands-off enrollment. For every ACTIVE campaign with `autoEnroll` on, pull the
 * matching connections that aren't already enrolled and add them. Because each
 * run excludes already-enrolled people (`dedupe: true`), running repeatedly tops
 * up the queue and picks up new matches over time without ever double-enrolling.
 */
export async function POST(req: Request) {
  const job = await readJob<{ campaignId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const where = job.body.campaignId
    ? and(eq(campaigns.status, "active"), eq(campaigns.autoEnroll, true), eq(campaigns.id, job.body.campaignId))
    : and(eq(campaigns.status, "active"), eq(campaigns.autoEnroll, true));

  const active = await db.select().from(campaigns).where(where);

  const results: { campaignId: string; enrolled: number }[] = [];
  for (const camp of active) {
    try {
      const { ids } = await getIcpMatches(camp.accountId, camp.targeting, {
        excludeCampaignId: camp.id,
        idLimit: AUTO_ENROLL_BATCH,
        dedupe: true, // always add only NEW people, regardless of multi-DM setting
      });
      if (ids.length === 0) continue;
      const res = await enrollConnectionIds(camp, ids, { dedupe: true });
      if (res.enrolled > 0) results.push({ campaignId: camp.id, enrolled: res.enrolled });
    } catch (e) {
      console.error("[auto-enroll] campaign failed", camp.id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, campaigns: active.length, enrolled: results });
}
