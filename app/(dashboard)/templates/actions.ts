"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { templates, aiPrompts, connections, linkedinAccounts, chats, activities } from "@/db/schema";
import {
  generateMessage,
  improveSystemPrompt,
  draftTemplate,
  type OutreachStep,
  type ProspectContext,
} from "@/lib/ai/generate";
import { renderTemplate, templateVarsFromConnection } from "@/lib/templates";
import { getConnections } from "@/lib/data-connections";
import { getAccessibleAccountIds } from "@/lib/access";
import { sendMessage, startChat, getProfile, UnipileError } from "@/lib/unipile/client";
import { incrementCounter } from "@/lib/rate-limit";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

/** Fictional prospect used when no real connection is picked for a preview. */
const SAMPLE_PROSPECT: ProspectContext = {
  firstName: "Jordan",
  lastName: "Rivera",
  headline: "VP of Demand Generation at Northwind SaaS",
  company: "Northwind SaaS",
  position: "VP of Demand Generation",
  locationCountry: "US",
  summary: "Leads pipeline and ABM programs for a mid-market B2B software company.",
};

/** Search connections (scoped to the user's accessible accounts) for the test picker. */
export async function searchConnectionsForTest(
  query: string,
): Promise<{ id: string; name: string; headline: string | null }[]> {
  const user = await requireUser();
  if (query.trim().length < 2) return [];
  const accessibleIds = await getAccessibleAccountIds(user);
  const { rows } = await getConnections({ search: query.trim(), pageSize: 8 }, accessibleIds);
  return rows.map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.headline || "Unknown",
    headline: c.headline,
  }));
}

/** Load a connection and turn it into an AI prospect context (with enrichment if present). */
async function prospectFromConnection(connectionId: string): Promise<ProspectContext | null> {
  const [c] = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  if (!c) return null;
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    headline: c.headline,
    company: c.company,
    position: c.position,
    locationCountry: c.locationCountry,
    summary: c.enrichment?.summary ?? null,
    experience: c.enrichment?.workExperience ?? [],
  };
}

/**
 * Send a one-off REAL LinkedIn message to a connection, to test copy/voice.
 * Mirrors the send engine's message path (existing chat → reply, else start a
 * new chat) but records a standalone activity — no campaign or enrollment.
 */
export async function sendTestMessage(input: {
  connectionId: string;
  text: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const text = input.text.trim();
  if (!text) return { error: "Nothing to send — preview a message first." };

  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, input.connectionId))
    .limit(1);
  if (!conn) return { error: "Connection not found" };

  // Members may only test on accounts assigned to them.
  const accessibleIds = await getAccessibleAccountIds(user);
  if (accessibleIds !== null && !accessibleIds.includes(conn.accountId)) {
    return { error: "You don't have access to this connection's account." };
  }

  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, conn.accountId))
    .limit(1);
  if (!account) return { error: "Account not found" };

  try {
    const existing = (
      await db.select().from(chats).where(eq(chats.connectionId, conn.id)).limit(1)
    )[0];
    let chatId: string | undefined = existing?.unipileChatId;
    let messageId: string | undefined;

    if (chatId) {
      const res = await sendMessage({ chatId, accountId: account.unipileAccountId, text });
      messageId = res.message_id ?? res.id;
    } else {
      // Resolve the provider id needed to start a new chat.
      let providerId = conn.providerId;
      if (!providerId) {
        const ident = conn.publicIdentifier || conn.memberId;
        if (ident) {
          const profile = await getProfile(ident, {
            accountId: account.unipileAccountId,
            notify: false,
          });
          providerId = profile.provider_id ?? null;
          if (providerId) {
            await db
              .update(connections)
              .set({ providerId })
              .where(eq(connections.id, conn.id));
          }
        }
      }
      if (!providerId) return { error: "Couldn't resolve this person's LinkedIn id to message them." };
      const res = await startChat({
        accountId: account.unipileAccountId,
        attendeesIds: [providerId],
        text,
      });
      chatId = res.chat_id ?? res.id;
      if (chatId) {
        await db
          .insert(chats)
          .values({
            accountId: account.id,
            connectionId: conn.id,
            unipileChatId: chatId,
            lastMessageText: text,
            lastMessageAt: new Date(),
          })
          .onConflictDoNothing({ target: chats.unipileChatId });
      }
    }

    await incrementCounter(account.id, "message");
    await db.insert(activities).values({
      accountId: account.id,
      connectionId: conn.id,
      type: "message",
      status: "success",
      content: text,
      unipileChatId: chatId ?? null,
      unipileMessageId: messageId ?? null,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnipileError) return { error: `LinkedIn/Unipile error (${e.status})` };
    return { error: e instanceof Error ? e.message : "Send failed" };
  }
}

/** Render a template against a real connection (or the sample when none is picked). */
export async function previewTemplateForConnection(input: {
  body: string;
  connectionId?: string;
}): Promise<{ text?: string; error?: string }> {
  await requireUser();
  if (input.connectionId) {
    const [c] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, input.connectionId))
      .limit(1);
    if (!c) return { error: "Connection not found" };
    return { text: renderTemplate(input.body, templateVarsFromConnection(c)) };
  }
  return {
    text: renderTemplate(input.body, {
      first_name: SAMPLE_PROSPECT.firstName,
      last_name: SAMPLE_PROSPECT.lastName,
      full_name: "Jordan Rivera",
      headline: SAMPLE_PROSPECT.headline,
      company: SAMPLE_PROSPECT.company,
      position: SAMPLE_PROSPECT.position,
      country: SAMPLE_PROSPECT.locationCountry,
    }),
  };
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  type: "invite" | "message";
  body: string;
}): Promise<void> {
  const user = await requireUser();
  if (input.id) {
    await db
      .update(templates)
      .set({ name: input.name, type: input.type, body: input.body })
      .where(eq(templates.id, input.id));
  } else {
    await db.insert(templates).values({
      ownerUserId: user.id,
      name: input.name,
      type: input.type,
      body: input.body,
    });
  }
  revalidatePath("/templates");
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireUser();
  await db.delete(templates).where(eq(templates.id, id));
  revalidatePath("/templates");
}

/** Draft or refine a message template body (with {{placeholders}}) via AI. */
export async function improveTemplateBody(input: {
  name: string;
  type: "invite" | "message";
  body: string;
}): Promise<{ text?: string; error?: string }> {
  await requireUser();
  try {
    return { text: await draftTemplate({ name: input.name, type: input.type, draft: input.body }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to draft the template" };
  }
}

/** Rewrite a rough prompt draft into a clean, structured system prompt. */
export async function improvePrompt(
  draft: string,
): Promise<{ text?: string; error?: string }> {
  await requireUser();
  try {
    return { text: await improveSystemPrompt(draft) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to improve the prompt" };
  }
}

export async function saveAiPrompt(input: {
  id?: string;
  name: string;
  systemPrompt: string;
  model: string;
  isDefault: boolean;
}): Promise<void> {
  await requireUser();
  if (input.isDefault) {
    await db.update(aiPrompts).set({ isDefault: false });
  }
  if (input.id) {
    await db
      .update(aiPrompts)
      .set({
        name: input.name,
        systemPrompt: input.systemPrompt,
        model: input.model,
        isDefault: input.isDefault,
      })
      .where(eq(aiPrompts.id, input.id));
  } else {
    await db.insert(aiPrompts).values({
      name: input.name,
      systemPrompt: input.systemPrompt,
      model: input.model,
      isDefault: input.isDefault,
    });
  }
  revalidatePath("/templates");
}

export async function deleteAiPrompt(id: string): Promise<void> {
  await requireUser();
  await db.delete(aiPrompts).where(eq(aiPrompts.id, id));
  revalidatePath("/templates");
}

/** Generate a sample AI message for previewing a prompt — against a real connection when picked. */
export async function previewAiMessage(input: {
  systemPrompt?: string;
  model?: string;
  step: OutreachStep;
  connectionId?: string;
}): Promise<{ text?: string; bannedWordsFound?: string[]; error?: string }> {
  await requireUser();
  try {
    let prospect = SAMPLE_PROSPECT;
    if (input.connectionId) {
      const real = await prospectFromConnection(input.connectionId);
      if (!real) return { error: "Connection not found" };
      prospect = real;
    }
    const res = await generateMessage({
      step: input.step,
      systemPrompt: input.systemPrompt,
      model: input.model,
      prospect,
    });
    return { text: res.text, bannedWordsFound: res.bannedWordsFound };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}
