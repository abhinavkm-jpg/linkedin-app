import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections, linkedinAccounts } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { canSend, incrementCounter } from "@/lib/rate-limit";
import { getProfile, UnipileError } from "@/lib/unipile/client";
import type { ConnectionEnrichment } from "@/db/schema";

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

    if (!(await canSend(account.id, "enrich"))) {
      skipped++;
      continue;
    }

    const identifier = conn.publicIdentifier || conn.providerId || conn.memberId;
    if (!identifier) continue;

    try {
      const profile = await getProfile(identifier, {
        accountId: account.unipileAccountId,
        sections: ["experience", "about"],
        notify: false,
      });
      await incrementCounter(account.id, "enrich");

      const firstExp = profile.work_experience?.[0];
      const enrichment: ConnectionEnrichment = {
        summary: profile.summary ?? null,
        workExperience: (profile.work_experience ?? []).slice(0, 6).map((e) => ({
          position: e.position ?? null,
          company: e.company ?? null,
          current: e.current ?? null,
        })),
      };

      await db
        .update(connections)
        .set({
          providerId: profile.provider_id ?? conn.providerId,
          company: firstExp?.company ?? conn.company,
          position: firstExp?.position ?? conn.position,
          locationCountry: profile.primary_locale?.country ?? conn.locationCountry,
          enrichment,
          enrichedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connections.id, conn.id));
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
