"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  pipelineItems,
  pipelineStages,
  replyDrafts,
  connections,
  linkedinAccounts,
  chats,
  activities,
} from "@/db/schema";
import { sendMessage, startChat, getProfile, UnipileError } from "@/lib/unipile/client";
import { incrementCounter } from "@/lib/rate-limit";
import { getAccessibleAccountIds } from "@/lib/access";
import { refreshPipelineForReply } from "@/lib/outreach/pipeline";
import { STAGES } from "@/lib/pipeline";

export type StageConfig = { value: string; label: string; hidden: boolean; isBase: boolean; position: number };

/** Read configured pipeline stages, seeding the built-in defaults on first use. */
export async function getPipelineStages(): Promise<StageConfig[]> {
  await requireUser();
  let rows = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
  if (rows.length === 0) {
    await db
      .insert(pipelineStages)
      .values(STAGES.map((s, i) => ({ value: s.value, label: s.label, position: i, isBase: true })))
      .onConflictDoNothing({ target: pipelineStages.value });
    rows = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
  }
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    hidden: r.hidden,
    isBase: r.isBase,
    position: r.position,
  }));
}

export async function addPipelineStage(label: string): Promise<void> {
  await requireUser();
  const clean = label.trim();
  if (!clean) throw new Error("Name required");
  const base = "custom_" + clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  // Ensure a unique value.
  let value = base || `custom_${Date.now()}`;
  const existing = new Set(
    (await db.select({ v: pipelineStages.value }).from(pipelineStages)).map((r) => r.v),
  );
  let n = 2;
  while (existing.has(value)) value = `${base}_${n++}`;
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${pipelineStages.position}), 0)::int` })
    .from(pipelineStages);
  await db
    .insert(pipelineStages)
    .values({ value, label: clean, position: Number(maxPos) + 1, isBase: false })
    .onConflictDoNothing({ target: pipelineStages.value });
  revalidatePath("/pipeline");
}

export async function deletePipelineStage(value: string): Promise<{ error?: string }> {
  await requireUser();
  const [st] = await db.select().from(pipelineStages).where(eq(pipelineStages.value, value)).limit(1);
  if (!st) return {};
  if (st.isBase) return { error: "Built-in stages can be hidden but not deleted." };
  // Move any cards in this stage back to the first stage so nothing is orphaned.
  await db.update(pipelineItems).set({ stage: "new_response" }).where(eq(pipelineItems.stage, value));
  await db.delete(pipelineStages).where(eq(pipelineStages.value, value));
  revalidatePath("/pipeline");
  return {};
}

export async function setPipelineStageHidden(value: string, hidden: boolean): Promise<void> {
  await requireUser();
  await db.update(pipelineStages).set({ hidden }).where(eq(pipelineStages.value, value));
  revalidatePath("/pipeline");
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

/** Throw unless the caller may act on this account (admin = all). */
async function assertAccountAccess(accountId: string) {
  const user = await requireUser();
  const accessible = await getAccessibleAccountIds(user);
  if (accessible !== null && !accessible.includes(accountId)) {
    throw new Error("You don't have access to this conversation.");
  }
}

/**
 * The ONLY path that sends a reply-draft. Sends the (edited) text via Unipile,
 * logs it, counts it toward the daily cap, marks the draft sent, and advances
 * the pipeline item's last-outbound. No job or webhook can reach this.
 */
export async function approveReplyDraft(
  draftId: string,
  editedText?: string,
): Promise<{ error?: string; warning?: string }> {
  await requireUser();
  const [draft] = await db.select().from(replyDrafts).where(eq(replyDrafts.id, draftId)).limit(1);
  if (!draft || draft.status !== "pending") return { error: "Draft not found or already handled" };
  await assertAccountAccess(draft.accountId);

  const text = (editedText?.trim() || draft.draftText || "").trim();
  if (!text) return { error: "Message is empty — write a reply first." };

  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, draft.accountId))
    .limit(1);
  if (!account) return { error: "Account not found" };

  try {
    // Resolve the chat to send into: prefer the stored chat id, else open one.
    let chatId = draft.chatId ?? null;
    let messageId: string | undefined;
    if (chatId) {
      const res = await sendMessage({ chatId, accountId: account.unipileAccountId, text });
      messageId = res.message_id ?? res.id;
    } else if (draft.connectionId) {
      const [conn] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, draft.connectionId))
        .limit(1);
      let providerId = conn?.providerId ?? null;
      if (!providerId && (conn?.publicIdentifier || conn?.memberId)) {
        const profile = await getProfile((conn.publicIdentifier || conn.memberId)!, {
          accountId: account.unipileAccountId,
          notify: false,
        });
        providerId = profile.provider_id ?? null;
      }
      if (!providerId) return { error: "Could not resolve a chat to send into." };
      const res = await startChat({
        accountId: account.unipileAccountId,
        attendeesIds: [providerId],
        text,
      });
      chatId = res.chat_id ?? res.id ?? null;
      messageId = undefined;
    } else {
      return { error: "No chat linked to this draft." };
    }

    // Log + count (manual sends count toward the daily message cap).
    await db.insert(activities).values({
      accountId: account.id,
      connectionId: draft.connectionId,
      type: "message",
      status: "success",
      content: text,
      unipileChatId: chatId,
      unipileMessageId: messageId ?? null,
    });
    const used = await incrementCounter(account.id, "message");
    if (chatId) {
      await db
        .update(chats)
        .set({ lastMessageText: text, lastMessageAt: new Date(), unreadCount: 0 })
        .where(eq(chats.unipileChatId, chatId));
    }

    await db
      .update(replyDrafts)
      .set({ status: "sent", editedText: text, unipileMessageId: messageId ?? null, sentAt: new Date() })
      .where(eq(replyDrafts.id, draft.id));
    await db
      .update(pipelineItems)
      .set({ lastOutboundText: text, lastOutboundAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineItems.id, draft.pipelineItemId));

    revalidatePath("/pipeline");
    if (used >= account.dailyMessageCap) {
      return {
        warning: `Sent — this account has now hit today's message limit (${account.dailyMessageCap}). Automated sending is paused until tomorrow.`,
      };
    }
    return {};
  } catch (e) {
    if (e instanceof UnipileError) return { error: `LinkedIn/Unipile error (${e.status})` };
    return { error: e instanceof Error ? e.message : "Send failed" };
  }
}

/** Reject a draft — nothing is sent. */
export async function rejectReplyDraft(draftId: string): Promise<void> {
  await requireUser();
  const [draft] = await db.select().from(replyDrafts).where(eq(replyDrafts.id, draftId)).limit(1);
  if (!draft) return;
  await assertAccountAccess(draft.accountId);
  await db.update(replyDrafts).set({ status: "rejected" }).where(eq(replyDrafts.id, draftId));
  revalidatePath("/pipeline");
}

/** Regenerate: supersede the current draft + draft a fresh one for the item. */
export async function regenerateReplyDraft(pipelineItemId: string): Promise<{ error?: string }> {
  await requireUser();
  const [item] = await db
    .select()
    .from(pipelineItems)
    .where(eq(pipelineItems.id, pipelineItemId))
    .limit(1);
  if (!item) return { error: "Pipeline item not found" };
  await assertAccountAccess(item.accountId);

  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, item.accountId))
    .limit(1);
  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, item.connectionId))
    .limit(1);
  if (!account || !conn) return { error: "Account or connection missing" };

  await refreshPipelineForReply({
    account,
    conn,
    chatId: item.chatId,
    inboundText: item.lastInboundText,
  });
  revalidatePath("/pipeline");
  return {};
}

/** Human stage override (sets outcome for won/lost). */
export async function setPipelineStage(itemId: string, stage: string): Promise<void> {
  await requireUser();
  const [valid] = await db
    .select({ v: pipelineStages.value })
    .from(pipelineStages)
    .where(eq(pipelineStages.value, stage))
    .limit(1);
  if (!valid) throw new Error("Invalid stage");
  const [item] = await db.select().from(pipelineItems).where(eq(pipelineItems.id, itemId)).limit(1);
  if (!item) return;
  await assertAccountAccess(item.accountId);
  const outcome = stage === "won" ? "won" : stage === "lost" ? "lost" : null;
  await db
    .update(pipelineItems)
    .set({ stage, outcome, updatedAt: new Date() })
    .where(eq(pipelineItems.id, itemId));
  revalidatePath("/pipeline");
}

export async function setMeetingStatus(itemId: string, status: string): Promise<void> {
  await requireUser();
  const [item] = await db.select().from(pipelineItems).where(eq(pipelineItems.id, itemId)).limit(1);
  if (!item) return;
  await assertAccountAccess(item.accountId);
  await db
    .update(pipelineItems)
    .set({ meetingStatus: status, updatedAt: new Date() })
    .where(eq(pipelineItems.id, itemId));
  revalidatePath("/pipeline");
}

/**
 * Backfill: import already-replied connections (that aren't in the pipeline yet)
 * for an account, generating a pending draft for each. Sends nothing.
 */
export async function importRepliedIntoPipeline(
  accountId: string,
): Promise<{ imported: number; error?: string }> {
  await assertAccountAccess(accountId);
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  if (!account) return { imported: 0, error: "Account not found" };

  // Replied connections on this account without a pipeline item yet.
  const replied = await db
    .select()
    .from(connections)
    .where(and(eq(connections.accountId, accountId), eq(connections.relationshipStatus, "replied")))
    .limit(50);

  let imported = 0;
  for (const conn of replied) {
    const [exists] = await db
      .select({ id: pipelineItems.id })
      .from(pipelineItems)
      .where(and(eq(pipelineItems.accountId, accountId), eq(pipelineItems.connectionId, conn.id)))
      .limit(1);
    if (exists) continue;
    const [chat] = await db
      .select({ unipileChatId: chats.unipileChatId })
      .from(chats)
      .where(eq(chats.connectionId, conn.id))
      .limit(1);
    try {
      await refreshPipelineForReply({
        account,
        conn,
        chatId: chat?.unipileChatId ?? null,
        inboundText: null,
      });
      imported++;
    } catch {
      /* skip a failed one */
    }
  }
  revalidatePath("/pipeline");
  return { imported };
}
