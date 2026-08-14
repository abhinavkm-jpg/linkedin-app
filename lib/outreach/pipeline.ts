import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  pipelineItems,
  replyDrafts,
  type Connection,
  type LinkedinAccount,
} from "@/db/schema";
import { listMessages } from "@/lib/unipile/client";
import {
  draftPipelineReply,
  getDefaultSystemPrompt,
  type ProspectContext,
} from "@/lib/ai/generate";

/**
 * Turn an inbound reply into a pipeline item + a fresh PENDING AI draft.
 * Idempotent-ish: reuses the existing item, supersedes any prior pending draft.
 * NEVER sends anything. Safe to call from the webhook (wrap in try/catch there)
 * or a backfill. Returns the pipeline item id, or null on hard failure.
 */
export async function refreshPipelineForReply(opts: {
  account: LinkedinAccount;
  conn: Connection;
  chatId: string | null;
  inboundText: string | null;
}): Promise<string | null> {
  const { account, conn, chatId } = opts;
  const inboundText = opts.inboundText?.trim() || null;

  // Conversation history (best-effort — never block on it).
  let priorMessages: Array<{ from: "me" | "them"; text: string }> = [];
  if (chatId) {
    try {
      const res = await listMessages({ chatId, limit: 20 });
      priorMessages = res.items
        .map((m) => ({ from: (m.is_sender === 1 ? "me" : "them") as "me" | "them", text: (m.text ?? "").trim() }))
        .filter((m) => m.text.length > 0)
        .reverse();
    } catch {
      /* ignore */
    }
  }

  // Upsert the pipeline item for this (account, connection).
  const [existing] = await db
    .select()
    .from(pipelineItems)
    .where(and(eq(pipelineItems.accountId, account.id), eq(pipelineItems.connectionId, conn.id)))
    .limit(1);

  const isNew = !existing;
  const currentStage = existing?.stage ?? "new_response";

  const prospect: ProspectContext = {
    firstName: conn.firstName,
    lastName: conn.lastName,
    headline: conn.headline,
    company: conn.company,
    position: conn.position,
    locationCountry: conn.locationCountry,
    summary: conn.enrichment?.summary ?? null,
    experience: conn.enrichment?.workExperience ?? [],
  };

  const voice = account.defaultPrompt?.trim() || (await getDefaultSystemPrompt());
  const strategy = account.replyStrategy?.trim() || undefined;
  const draft = await draftPipelineReply({ prospect, priorMessages, currentStage, voice, strategy });

  // Brand-new items adopt the AI-suggested stage; existing items keep their
  // (human-controlled) stage and just refresh intent + last inbound.
  const stage = isNew ? draft.suggestedStage : currentStage;

  let itemId: string;
  if (existing) {
    await db
      .update(pipelineItems)
      .set({
        intent: draft.intent,
        chatId: chatId ?? existing.chatId,
        lastInboundText: inboundText ?? existing.lastInboundText,
        lastInboundAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pipelineItems.id, existing.id));
    itemId = existing.id;
  } else {
    const [created] = await db
      .insert(pipelineItems)
      .values({
        accountId: account.id,
        connectionId: conn.id,
        chatId,
        stage,
        intent: draft.intent,
        lastInboundText: inboundText,
        lastInboundAt: new Date(),
      })
      .onConflictDoNothing({
        target: [pipelineItems.accountId, pipelineItems.connectionId],
      })
      .returning({ id: pipelineItems.id });
    if (created) {
      itemId = created.id;
    } else {
      // Lost a race — fetch the row that won.
      const [row] = await db
        .select({ id: pipelineItems.id })
        .from(pipelineItems)
        .where(and(eq(pipelineItems.accountId, account.id), eq(pipelineItems.connectionId, conn.id)))
        .limit(1);
      if (!row) return null;
      itemId = row.id;
    }
  }

  // Supersede any prior pending draft, then insert the fresh one.
  await db
    .update(replyDrafts)
    .set({ status: "superseded" })
    .where(and(eq(replyDrafts.pipelineItemId, itemId), eq(replyDrafts.status, "pending")));

  await db.insert(replyDrafts).values({
    pipelineItemId: itemId,
    accountId: account.id,
    connectionId: conn.id,
    chatId,
    stageAtDraft: stage,
    intent: draft.intent,
    objective: draft.objective,
    draftText: draft.reply,
    reason: draft.reason,
    suggestedStage: draft.suggestedStage,
    status: "pending",
  });

  return itemId;
}
