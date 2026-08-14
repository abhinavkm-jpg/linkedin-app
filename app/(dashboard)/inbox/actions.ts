"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chats, linkedinAccounts, activities, replyDrafts, pipelineItems } from "@/db/schema";
import { sendMessage, listMessages, UnipileError } from "@/lib/unipile/client";
import { incrementCounter } from "@/lib/rate-limit";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

export interface ThreadMessage {
  id: string;
  text: string;
  mine: boolean;
  at: string | null;
}

/** Fetch recent messages for a chat (oldest → newest) for the conversation view. */
export async function getChatThread(
  chatId: string,
): Promise<{ messages?: ThreadMessage[]; error?: string }> {
  await requireUser();
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat) return { error: "Chat not found" };

  try {
    const res = await listMessages({ chatId: chat.unipileChatId, limit: 30 });
    const messages: ThreadMessage[] = res.items
      .map((m) => ({
        id: m.id,
        text: m.text ?? "",
        mine: m.is_sender === 1,
        at: m.timestamp ?? null,
      }))
      .filter((m) => m.text.trim().length > 0)
      .reverse(); // API returns newest-first; show oldest-first
    return { messages };
  } catch (e) {
    if (e instanceof UnipileError) return { error: `Unipile ${e.status}` };
    return { error: e instanceof Error ? e.message : "Failed to load conversation" };
  }
}

export async function sendReply(
  chatId: string,
  text: string,
): Promise<{ error?: string; warning?: string }> {
  await requireUser();
  if (!text.trim()) return { error: "Message is empty" };

  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat) return { error: "Chat not found" };
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, chat.accountId))
    .limit(1);
  if (!account) return { error: "Account not found" };

  try {
    const res = await sendMessage({
      chatId: chat.unipileChatId,
      accountId: account.unipileAccountId,
      text,
    });
    await db
      .update(chats)
      .set({ lastMessageText: text, lastMessageAt: new Date(), unreadCount: 0 })
      .where(eq(chats.id, chatId));
    await db.insert(activities).values({
      accountId: account.id,
      connectionId: chat.connectionId,
      type: "message",
      status: "success",
      content: text,
      unipileChatId: chat.unipileChatId,
      unipileMessageId: res.message_id ?? res.id ?? null,
    });
    // Manual replies count toward the same daily message cap as automated sends,
    // so the automation sees the real total and backs off near the limit.
    const used = await incrementCounter(account.id, "message");

    // Resolve any pending AI reply draft for this person (leaves "Needs you")
    // and advance the pipeline item's last-outbound.
    if (chat.connectionId) {
      await db
        .update(replyDrafts)
        .set({ status: "sent", editedText: text, sentAt: new Date() })
        .where(
          and(eq(replyDrafts.connectionId, chat.connectionId), eq(replyDrafts.status, "pending")),
        );
      await db
        .update(pipelineItems)
        .set({ lastOutboundText: text, lastOutboundAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineItems.connectionId, chat.connectionId));
    }

    revalidatePath("/inbox");
    revalidatePath("/pipeline");
    if (used >= account.dailyMessageCap) {
      return {
        warning: `Sent — this account has now hit today's message limit (${account.dailyMessageCap}). Automated sending is paused until tomorrow.`,
      };
    }
    return {};
  } catch (e) {
    if (e instanceof UnipileError) return { error: `Unipile ${e.status}` };
    return { error: e instanceof Error ? e.message : "Send failed" };
  }
}

export async function markChatRead(chatId: string): Promise<void> {
  await requireUser();
  await db.update(chats).set({ unreadCount: 0 }).where(eq(chats.id, chatId));
  revalidatePath("/inbox");
}
