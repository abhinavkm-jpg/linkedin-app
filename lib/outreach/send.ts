import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  enrollments,
  campaigns,
  sequenceSteps,
  connections,
  linkedinAccounts,
  templates,
  aiPrompts,
  activities,
  chats,
  type SequenceStep,
  type Campaign,
  type Connection,
  type LinkedinAccount,
} from "@/db/schema";
import { canSend, canEnrichNow, incrementCounter } from "@/lib/rate-limit";
import { sendInvitation, startChat, sendMessage, getProfile, UnipileError } from "@/lib/unipile/client";
import { renderTemplate, templateVarsFromConnection } from "@/lib/templates";
import { generateMessage, type OutreachStep, type ProspectContext } from "@/lib/ai/generate";
import { connectionMatchesIcp, hasIcp } from "@/lib/icp";
import { enrichConnectionRow } from "@/lib/outreach/enrich";

export type Enrollment = typeof enrollments.$inferSelect;

/**
 * Process one due enrollment: resolve the current step's copy and either send
 * it or (when the campaign requires AI review) park it as a pending draft.
 * Shared by the send worker and — via `sendStepNow` — the approval flow.
 */
export async function processEnrollment(enr: Enrollment): Promise<boolean> {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, enr.campaignId)).limit(1);
  if (!camp) {
    await db
      .update(enrollments)
      .set({ state: "failed", lastError: "Campaign missing", updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
    return false;
  }
  // Only active campaigns send. For anything else (draft/paused/archived), release
  // the claim back to queued and hold — never complete.
  if (camp.status !== "active") {
    await db.update(enrollments).set({ state: "queued", nextRunAt: hold() }).where(eq(enrollments.id, enr.id));
    return false;
  }

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, camp.id))
    .orderBy(asc(sequenceSteps.stepOrder));

  // No steps yet → hold (do NOT complete — this was the "activated but nothing
  // sent" bug: 0 steps made `currentStep >= steps.length` true immediately).
  if (steps.length === 0) {
    await db.update(enrollments).set({ state: "queued", nextRunAt: hold() }).where(eq(enrollments.id, enr.id));
    return false;
  }

  // Genuinely finished the whole sequence.
  if (enr.currentStep >= steps.length) {
    await db.update(enrollments).set({ state: "completed" }).where(eq(enrollments.id, enr.id));
    return false;
  }

  const step = steps[enr.currentStep];
  const rows = await db.select().from(connections).where(eq(connections.id, enr.connectionId)).limit(1);
  let conn = rows[0];
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, enr.accountId))
    .limit(1);
  if (!conn || !account) throw new Error("Missing connection or account");

  // Stage-2 ICP: when the campaign has an ICP, enrich this connection now (once)
  // and re-check the ICP against the enriched job/company/country before sending.
  if (hasIcp(camp.targeting)) {
    if (!conn.enrichedAt) {
      // When the account auto-enriches, let that gentle ~1/min path do the
      // enrichment and just hold here — avoids bursty send-time profile lookups.
      if (account.autoEnrich) {
        await db
          .update(enrollments)
          .set({ state: "queued", nextRunAt: hold(), updatedAt: new Date() })
          .where(eq(enrollments.id, enr.id));
        return false;
      }
      if (!(await canEnrichNow(account.id))) {
        // Daily enrichment budget exhausted — try again tomorrow.
        await db
          .update(enrollments)
          .set({ state: "queued", nextRunAt: tomorrow(), updatedAt: new Date() })
          .where(eq(enrollments.id, enr.id));
        return false;
      }
      try {
        conn = await enrichConnectionRow(conn, account, { counter: "enrich" });
      } catch (e) {
        if (e instanceof UnipileError && e.isRateLimited) {
          await db
            .update(enrollments)
            .set({ state: "queued", nextRunAt: tomorrow(), updatedAt: new Date() })
            .where(eq(enrollments.id, enr.id));
          return false;
        }
        // Can't enrich this profile (e.g. 404) — skip and move to the next.
        await db.update(connections).set({ enrichedAt: new Date() }).where(eq(connections.id, conn.id));
        await db
          .update(enrollments)
          .set({ state: "skipped", lastError: "Enrichment failed", updatedAt: new Date() })
          .where(eq(enrollments.id, enr.id));
        return false;
      }
    }
    if (!connectionMatchesIcp(conn, camp.targeting)) {
      await db
        .update(enrollments)
        .set({ state: "skipped", lastError: "ICP mismatch after enrichment", updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      return false;
    }
  }

  const kind = step.type === "invite" ? "invite" : "message";
  if (!(await canSend(account.id, kind))) {
    await db
      .update(enrollments)
      .set({ state: "queued", nextRunAt: tomorrow(), updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
    return false;
  }

  const text = await resolveStepText(step, steps, camp, conn);

  // Review gate: AI drafts require approval unless the campaign opts out.
  if (camp.reviewBeforeSend && step.sourceType === "ai") {
    await db.insert(activities).values({
      accountId: account.id,
      connectionId: conn.id,
      campaignId: camp.id,
      enrollmentId: enr.id,
      type: step.type === "invite" ? "invite" : "message",
      status: "pending",
      content: text,
    });
    await db
      .update(enrollments)
      .set({ state: "paused", lastError: "Awaiting review", updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
    return false;
  }

  return sendStepNow({ enr, step, steps, camp, conn, account, text });
}

/** Send the current step immediately (bypasses the review gate). */
export async function sendStepNow(ctx: {
  enr: Enrollment;
  step: SequenceStep;
  steps: SequenceStep[];
  camp: Campaign;
  conn: Connection;
  account: LinkedinAccount;
  text: string;
}): Promise<boolean> {
  if (ctx.step.type === "invite") {
    return doInvite(ctx.enr, ctx.step, ctx.camp, ctx.conn, ctx.account, ctx.text);
  }
  return doMessage(ctx.enr, ctx.steps, ctx.camp, ctx.conn, ctx.account, ctx.text);
}

async function doInvite(
  enr: Enrollment,
  step: SequenceStep,
  camp: Campaign,
  conn: Connection,
  account: LinkedinAccount,
  text: string,
): Promise<boolean> {
  const providerId = await ensureProviderId(conn, account);
  if (!providerId) throw new Error("Could not resolve provider id for invite");

  try {
    const res = await sendInvitation({
      accountId: account.unipileAccountId,
      providerId,
      message: text.slice(0, 300) || undefined,
    });
    await incrementCounter(account.id, "invite");
    await db.insert(activities).values({
      accountId: account.id,
      connectionId: conn.id,
      campaignId: camp.id,
      enrollmentId: enr.id,
      type: "invite",
      status: "success",
      content: text,
      unipileInvitationId: res.invitation_id,
    });
    await db.update(connections).set({ relationshipStatus: "pending" }).where(eq(connections.id, conn.id));
    await db
      .update(enrollments)
      .set({ currentStep: enr.currentStep + 1, state: "awaiting_accept", nextRunAt: null, updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
    return true;
  } catch (e) {
    if (e instanceof UnipileError && e.isCannotResendYet) {
      await db
        .update(enrollments)
        .set({ currentStep: enr.currentStep + 1, state: "accepted", nextRunAt: new Date(), updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      return false;
    }
    if (e instanceof UnipileError && e.isRateLimited) {
      await db
        .update(enrollments)
        .set({ state: "queued", nextRunAt: tomorrow() })
        .where(eq(enrollments.id, enr.id));
      return false;
    }
    throw e;
  }
}

async function doMessage(
  enr: Enrollment,
  steps: SequenceStep[],
  camp: Campaign,
  conn: Connection,
  account: LinkedinAccount,
  text: string,
): Promise<boolean> {
  if (!text.trim()) throw new Error("Empty message body");

  const existing = (await db.select().from(chats).where(eq(chats.connectionId, conn.id)).limit(1))[0];
  let chatId: string | undefined = existing?.unipileChatId;
  let messageId: string | undefined;

  try {
    if (chatId) {
      const res = await sendMessage({ chatId, accountId: account.unipileAccountId, text });
      messageId = res.message_id ?? res.id;
    } else {
      const providerId = await ensureProviderId(conn, account);
      if (!providerId) throw new Error("Could not resolve provider id for message");
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
      campaignId: camp.id,
      enrollmentId: enr.id,
      type: "message",
      status: "success",
      content: text,
      unipileChatId: chatId ?? null,
      unipileMessageId: messageId ?? null,
    });
    await db.update(connections).set({ relationshipStatus: "messaged" }).where(eq(connections.id, conn.id));

    await advanceAfterMessage(enr, steps);
    return true;
  } catch (e) {
    if (e instanceof UnipileError && e.isRateLimited) {
      await db
        .update(enrollments)
        .set({ state: "queued", nextRunAt: tomorrow() })
        .where(eq(enrollments.id, enr.id));
      return false;
    }
    throw e;
  }
}

async function advanceAfterMessage(enr: Enrollment, steps: SequenceStep[]) {
  const nextIndex = enr.currentStep + 1;
  if (nextIndex < steps.length) {
    const delayHours = steps[nextIndex].delayHours ?? 24;
    const next = new Date(Date.now() + delayHours * 3600 * 1000);
    await db
      .update(enrollments)
      .set({ currentStep: nextIndex, state: "in_followup", nextRunAt: next, updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
  } else {
    await db
      .update(enrollments)
      .set({ currentStep: nextIndex, state: "completed", nextRunAt: null, updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
  }
}

/** Resolve the copy for a step: rendered template or AI-generated draft. */
export async function resolveStepText(
  step: SequenceStep,
  steps: SequenceStep[],
  camp: Campaign,
  conn: Connection,
): Promise<string> {
  if (step.sourceType === "template" && step.templateId) {
    const [tpl] = await db.select().from(templates).where(eq(templates.id, step.templateId)).limit(1);
    if (!tpl) return "";
    return renderTemplate(tpl.body, templateVarsFromConnection(conn));
  }

  if (step.sourceType === "ai") {
    let systemPrompt: string | undefined;
    let model = step.model ?? undefined;
    if (step.aiPromptId) {
      const [p] = await db.select().from(aiPrompts).where(eq(aiPrompts.id, step.aiPromptId)).limit(1);
      systemPrompt = p?.systemPrompt;
      model = model ?? p?.model;
    }
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
    const res = await generateMessage({ step: aiStepLabel(step, steps), prospect, systemPrompt, model });
    return res.text;
  }

  return "";
}

function aiStepLabel(step: SequenceStep, steps: SequenceStep[]): OutreachStep {
  if (step.type === "invite") return "connection_request";
  const messageSteps = steps.filter((s) => s.type === "message");
  const idx = messageSteps.findIndex((s) => s.id === step.id);
  return (["welcome", "follow_up_1", "follow_up_2", "follow_up_3"][idx] ?? "follow_up_3") as OutreachStep;
}

async function ensureProviderId(conn: Connection, account: LinkedinAccount): Promise<string | null> {
  if (conn.providerId) return conn.providerId;
  const identifier = conn.publicIdentifier || conn.memberId;
  if (!identifier) return null;
  if (!(await canSend(account.id, "enrich"))) return null;
  try {
    const profile = await getProfile(identifier, { accountId: account.unipileAccountId, notify: false });
    await incrementCounter(account.id, "enrich");
    if (profile.provider_id) {
      await db.update(connections).set({ providerId: profile.provider_id }).where(eq(connections.id, conn.id));
      return profile.provider_id;
    }
  } catch {
    return null;
  }
  return null;
}

export function tomorrow(): Date {
  const d = new Date();
  d.setUTCHours(24, 5, 0, 0);
  return d;
}

/** Short hold before re-checking (used when a campaign isn't ready to send yet). */
function hold(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}
