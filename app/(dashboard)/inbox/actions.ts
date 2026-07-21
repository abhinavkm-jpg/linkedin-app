"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chats, linkedinAccounts, activities } from "@/db/schema";
import { sendMessage, listMessages, UnipileError } from "@/lib/unipile/client";

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

export async function sendReply(chatId: string, text: string): Promise<{ error?: string }> {
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
    revalidatePath("/inbox");
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
