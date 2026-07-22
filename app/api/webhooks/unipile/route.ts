import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  linkedinAccounts,
  connections,
  enrollments,
  chats,
  webhookEvents,
} from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { getAccount, UnipileError } from "@/lib/unipile/client";
import type { UnipileSourceStatus } from "@/lib/unipile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map a Unipile source status to our account_status enum. */
function mapStatus(status?: UnipileSourceStatus): typeof linkedinAccounts.$inferInsert.status {
  switch (status) {
    case "OK":
      return "OK";
    case "CONNECTING":
      return "CONNECTING";
    case "CREDENTIALS":
      return "CREDENTIALS";
    case "PERMISSIONS":
      return "PERMISSIONS";
    case "STOPPED":
      return "STOPPED";
    default:
      return "ERROR";
  }
}

/** Record an event once; returns false if we've already processed this id. */
async function recordOnce(source: string, externalId: string | null, payload: unknown) {
  if (!externalId) {
    await db.insert(webhookEvents).values({ source, payload });
    return true;
  }
  const rows = await db
    .insert(webhookEvents)
    .values({ source, externalId, payload })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

async function upsertAccountFromUnipile(accountId: string, name?: string, ownerUserId?: string) {
  let status: typeof linkedinAccounts.$inferInsert.status = "OK";
  let displayName = name ?? accountId;
  let ownerProviderId: string | undefined;

  try {
    const acct = await getAccount(accountId);
    displayName = name ?? acct.name ?? accountId;
    const src = acct.sources?.find((s) => s.status);
    status = mapStatus(src?.status);
    // Some responses expose the owner's provider id; best-effort.
    ownerProviderId = (acct as { provider_id?: string }).provider_id;
  } catch (e) {
    if (!(e instanceof UnipileError)) throw e;
  }

  await db
    .insert(linkedinAccounts)
    .values({
      unipileAccountId: accountId,
      name: displayName,
      status,
      ownerUserId: ownerUserId ?? null,
      ownerProviderId: ownerProviderId ?? null,
    })
    .onConflictDoUpdate({
      target: linkedinAccounts.unipileAccountId,
      set: { name: displayName, status, ...(ownerProviderId ? { ownerProviderId } : {}) },
    });
}

async function accountByUnipileId(unipileAccountId: string) {
  const rows = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.unipileAccountId, unipileAccountId))
    .limit(1);
  return rows[0];
}

export async function POST(req: Request) {
  // Authenticate the webhook via shared secret (query param or header).
  const { unipileWebhookSecret } = await getSettings();
  if (unipileWebhookSecret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
    if (provided !== unipileWebhookSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const status = body.status as string | undefined; // hosted-auth callbacks
  const event = body.event as string | undefined; // messaging/users/account webhooks
  const source = (body.source as string | undefined) ?? (status ? "hosted_auth" : "unknown");
  const accountId = (body.account_id as string | undefined) ?? undefined;

  // Build a best-effort idempotency key.
  const externalId =
    (body.message_id as string | undefined) ??
    (body.webhook_id as string | undefined) ??
    (status && accountId ? `${status}:${accountId}` : null);

  const fresh = await recordOnce(source, externalId, body);
  if (!fresh) return NextResponse.json({ ok: true, deduped: true });

  try {
    // 1) Hosted-auth account creation / reconnection.
    if (status === "CREATION_SUCCESS" || status === "RECONNECTED") {
      if (accountId) {
        const ownerUserId = (body.name as string | undefined) || undefined;
        await upsertAccountFromUnipile(accountId, undefined, ownerUserId);
      }
      return NextResponse.json({ ok: true });
    }

    // 2) Account status change.
    if (source === "account_status" || event === "account_status") {
      if (accountId) {
        const src = (body.sources as Array<{ status?: UnipileSourceStatus }> | undefined)?.[0];
        const newStatus = mapStatus(src?.status ?? (body.status as UnipileSourceStatus | undefined));
        await db
          .update(linkedinAccounts)
          .set({ status: newStatus })
          .where(eq(linkedinAccounts.unipileAccountId, accountId));
      }
      return NextResponse.json({ ok: true });
    }

    const account = accountId ? await accountByUnipileId(accountId) : undefined;
    if (!account) return NextResponse.json({ ok: true, note: "unknown account" });

    // 3) New relation → invitation accepted. Advance awaiting_accept enrollments.
    if (event === "new_relation" || source === "users") {
      const publicId = body.user_public_identifier as string | undefined;
      const providerId = body.user_provider_id as string | undefined;
      const conn = await findConnection(account.id, { publicId, providerId });
      if (conn) {
        await db
          .update(connections)
          .set({ relationshipStatus: "accepted", providerId: providerId ?? conn.providerId })
          .where(eq(connections.id, conn.id));
        await db
          .update(enrollments)
          .set({ state: "accepted", nextRunAt: new Date() })
          .where(
            and(eq(enrollments.connectionId, conn.id), eq(enrollments.state, "awaiting_accept")),
          );
      }
      return NextResponse.json({ ok: true });
    }

    // 4) Inbound message → reply. Detect inbound vs our own send.
    if (event === "message_received" || source === "messaging") {
      const sender = body.sender as
        | { attendee_provider_id?: string; attendee_name?: string; attendee_public_identifier?: string }
        | undefined;
      const ownerId =
        (body.account_info as { user_id?: string } | undefined)?.user_id ?? account.ownerProviderId;
      const senderProviderId = sender?.attendee_provider_id;
      // `is_sender` is authoritative: true = our account sent it, false = inbound reply.
      // Fall back to comparing the sender against the account owner's provider id.
      const isInbound =
        typeof body.is_sender === "boolean"
          ? body.is_sender === false
          : senderProviderId && ownerId
            ? senderProviderId !== ownerId
            : true;
      const chatId = body.chat_id as string | undefined;
      const text = body.message as string | undefined;

      // The chat's "attendee" is always the *prospect*, never our own account.
      // On an outbound message the sender is us, so take the counterpart from the
      // attendees list (the participant whose provider id isn't the owner's).
      const attendeesList =
        (body.attendees as
          | Array<{ attendee_provider_id?: string; attendee_name?: string; attendee_public_identifier?: string }>
          | undefined) ?? [];
      const counterpart =
        attendeesList.find((a) => a.attendee_provider_id && a.attendee_provider_id !== ownerId) ??
        (isInbound ? sender : undefined);
      const attendeeName = counterpart?.attendee_name ?? null;
      const attendeeProviderId = counterpart?.attendee_provider_id ?? null;
      const attendeePublicId = counterpart?.attendee_public_identifier ?? undefined;

      // Resolve the connection. Prefer the chat link we recorded on our own
      // outbound send (most reliable), then fall back to the prospect's identity.
      const conn =
        (chatId ? await connectionForChat(chatId) : undefined) ??
        (await findConnection(account.id, {
          providerId: attendeeProviderId ?? undefined,
          publicId: attendeePublicId,
        }));

      if (chatId) {
        await db
          .insert(chats)
          .values({
            accountId: account.id,
            connectionId: conn?.id ?? null,
            unipileChatId: chatId,
            attendeeProviderId,
            attendeeName,
            lastMessageText: text ?? null,
            lastMessageAt: new Date(),
            unreadCount: isInbound ? 1 : 0,
          })
          .onConflictDoUpdate({
            target: chats.unipileChatId,
            set: {
              lastMessageText: text ?? null,
              lastMessageAt: new Date(),
              ...(isInbound ? { unreadCount: sql`${chats.unreadCount} + 1` } : {}),
              ...(conn?.id ? { connectionId: conn.id } : {}),
              ...(attendeeName ? { attendeeName } : {}),
              ...(attendeeProviderId ? { attendeeProviderId } : {}),
            },
          });
      }

      if (isInbound && conn) {
        await db
          .update(connections)
          .set({ relationshipStatus: "replied" })
          .where(eq(connections.id, conn.id));
        // A reply stops the sequence AND is worth surfacing even if the
        // sequence already finished — so `replied` overrides `completed` too.
        await db
          .update(enrollments)
          .set({ state: "replied", nextRunAt: null })
          .where(
            and(
              eq(enrollments.connectionId, conn.id),
              sql`${enrollments.state} not in ('replied','failed','skipped')`,
            ),
          );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, note: "unhandled" });
  } catch (e) {
    console.error("[webhook] processing error", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** Resolve the connection linked to a chat we already recorded (e.g. on our own send). */
async function connectionForChat(unipileChatId: string) {
  const rows = await db
    .select({ connectionId: chats.connectionId })
    .from(chats)
    .where(eq(chats.unipileChatId, unipileChatId))
    .limit(1);
  const connId = rows[0]?.connectionId;
  if (!connId) return undefined;
  const conn = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connId))
    .limit(1);
  return conn[0];
}

async function findConnection(
  accountId: string,
  by: { publicId?: string; providerId?: string },
) {
  if (by.providerId) {
    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.accountId, accountId), eq(connections.providerId, by.providerId)))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  if (by.publicId) {
    const rows = await db
      .select()
      .from(connections)
      .where(
        and(eq(connections.accountId, accountId), eq(connections.publicIdentifier, by.publicId)),
      )
      .limit(1);
    if (rows[0]) return rows[0];
  }
  return undefined;
}
