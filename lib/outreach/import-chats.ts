import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chats, connections, type LinkedinAccount } from "@/db/schema";
import { listChats, UnipileError } from "@/lib/unipile/client";

/**
 * Import the account's EXISTING LinkedIn conversations into the `chats` table so
 * the campaign dedupe knows who we've already talked to — including old/manual
 * threads the app never created itself. Matches each chat's attendee to a
 * connection by provider id when possible (so the per-connection guard works).
 * Idempotent: upserts on unipile_chat_id and never clears an existing link.
 */
export async function importAccountChats(
  account: LinkedinAccount,
  opts: { maxPages?: number } = {},
): Promise<{ imported: number; matched: number }> {
  let cursor: string | undefined;
  let pages = 0;
  let imported = 0;
  let matched = 0;
  const maxPages = opts.maxPages ?? 50; // ~5k chats safety cap

  do {
    let res;
    try {
      res = await listChats({ accountId: account.unipileAccountId, cursor, limit: 100 });
    } catch (e) {
      if (e instanceof UnipileError && e.isRateLimited) break; // stop gracefully; next run continues
      throw e;
    }

    for (const c of res.items ?? []) {
      if (!c.id) continue;
      const providerId = c.attendee_provider_id ?? null;

      let connectionId: string | null = null;
      if (providerId) {
        const [conn] = await db
          .select({ id: connections.id })
          .from(connections)
          .where(and(eq(connections.accountId, account.id), eq(connections.providerId, providerId)))
          .limit(1);
        if (conn) {
          connectionId = conn.id;
          matched++;
        }
      }

      await db
        .insert(chats)
        .values({
          accountId: account.id,
          connectionId,
          unipileChatId: c.id,
          attendeeProviderId: providerId,
          attendeeName: c.name ?? null,
          lastMessageAt: c.timestamp ? new Date(c.timestamp) : null,
        })
        .onConflictDoUpdate({
          target: chats.unipileChatId,
          set: {
            attendeeProviderId: providerId,
            attendeeName: c.name ?? null,
            // Never wipe an existing link; fill it in if we can now resolve one.
            connectionId: sql`coalesce(${chats.connectionId}, ${connectionId})`,
          },
        });
      imported++;
    }

    cursor = res.cursor ?? undefined;
    pages++;
  } while (cursor && pages < maxPages);

  return { imported, matched };
}
