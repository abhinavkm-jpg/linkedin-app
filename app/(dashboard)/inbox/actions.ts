"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chats, linkedinAccounts, activities } from "@/db/schema";
import { sendMessage, UnipileError } from "@/lib/unipile/client";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
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
