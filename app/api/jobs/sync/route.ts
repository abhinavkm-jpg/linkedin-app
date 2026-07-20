import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts, connections } from "@/db/schema";
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { listRelations, UnipileError } from "@/lib/unipile/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chunked connection sync. Each invocation pulls one page (up to 1000) of the
 * account's relations, upserts them, then enqueues the next page until the
 * cursor is exhausted. This keeps every invocation well under the serverless
 * time limit even for 20k+ connection networks.
 */
export async function POST(req: Request) {
  const job = await readJob<{ accountId: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const { accountId } = job.body;
  const rows = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  const account = rows[0];
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

  try {
    const page = await listRelations({
      accountId: account.unipileAccountId,
      cursor: account.syncCursor ?? undefined,
      limit: 1000,
    });

    if (page.items.length > 0) {
      // Upsert this page. Conflict on (accountId, memberId) keeps sync idempotent.
      const values = page.items
        .filter((r) => r.member_id)
        .map((r) => ({
          accountId: account.id,
          memberId: r.member_id!,
          memberUrn: r.member_urn ?? null,
          connectionUrn: r.connection_urn ?? null,
          publicIdentifier: r.public_identifier ?? null,
          publicProfileUrl: r.public_profile_url ?? null,
          firstName: r.first_name ?? null,
          lastName: r.last_name ?? null,
          headline: r.headline ?? null,
          profilePictureUrl: r.profile_picture_url ?? null,
          relationshipStatus: "connection" as const,
          connectedAt: r.created_at ? new Date(r.created_at) : null,
          updatedAt: new Date(),
        }));

      if (values.length > 0) {
        await db
          .insert(connections)
          .values(values)
          .onConflictDoUpdate({
            target: [connections.accountId, connections.memberId],
            set: {
              headline: sql`excluded.headline`,
              publicIdentifier: sql`excluded.public_identifier`,
              publicProfileUrl: sql`excluded.public_profile_url`,
              profilePictureUrl: sql`excluded.profile_picture_url`,
              firstName: sql`excluded.first_name`,
              lastName: sql`excluded.last_name`,
              updatedAt: new Date(),
            },
          });
      }
    }

    const synced = account.syncedCount + page.items.length;

    if (page.cursor) {
      await db
        .update(linkedinAccounts)
        .set({ syncCursor: page.cursor, syncedCount: synced, syncStatus: "running" })
        .where(eq(linkedinAccounts.id, account.id));
      // Continue with the next page (small delay to spread load).
      await enqueueJob("sync", { accountId }, { delaySeconds: 2 });
      return NextResponse.json({ ok: true, synced, done: false });
    }

    // Done.
    await db
      .update(linkedinAccounts)
      .set({
        syncStatus: "idle",
        syncCursor: null,
        syncedCount: synced,
        lastSyncAt: new Date(),
      })
      .where(eq(linkedinAccounts.id, account.id));
    return NextResponse.json({ ok: true, synced, done: true });
  } catch (e) {
    const message = e instanceof UnipileError ? `Unipile ${e.status}` : String(e);
    await db
      .update(linkedinAccounts)
      .set({ syncStatus: "error" })
      .where(eq(linkedinAccounts.id, account.id));
    console.error("[sync] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
