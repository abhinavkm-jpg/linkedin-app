import { NextResponse } from "next/server";
import { and, asc, eq, inArray, lte, isNull, or } from "drizzle-orm";
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
import { readJob } from "@/lib/jobs";
import { enqueueJob } from "@/lib/qstash";
import { canSend, incrementCounter } from "@/lib/rate-limit";
import {
  sendInvitation,
  startChat,
  sendMessage,
  getProfile,
  UnipileError,
} from "@/lib/unipile/client";
import { renderTemplate, templateVarsFromConnection } from "@/lib/templates";
import { generateMessage, type OutreachStep, type ProspectContext } from "@/lib/ai/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 8;

const DUE_STATES = ["queued", "accepted", "in_followup", "messaging"] as const;

export async function POST(req: Request) {
  const job = await readJob<{ campaignId?: string }>(req);
  if (!job.ok) return NextResponse.json({ error: "unauthorized" }, { status: job.status });

  const now = new Date();
  const due = await db
    .select()
    .from(enrollments)
    .where(
      and(
        inArray(enrollments.state, [...DUE_STATES]),
        or(isNull(enrollments.nextRunAt), lte(enrollments.nextRunAt, now)),
        job.body.campaignId ? eq(enrollments.campaignId, job.body.campaignId) : undefined,
      ),
    )
    .orderBy(asc(enrollments.nextRunAt))
    .limit(BATCH);

  let processed = 0;
  const touchedCampaigns = new Set<string>();

  for (const enr of due) {
    touchedCampaigns.add(enr.campaignId);
    try {
      await processEnrollment(enr);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(enrollments)
        .set({ state: "failed", lastError: msg, updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      console.error("[send] enrollment failed", enr.id, msg);
    }
  }

  // If we filled the batch, there may be more due — continue after a short gap.
  if (due.length === BATCH) {
    await enqueueJob("send", job.body.campaignId ? { campaignId: job.body.campaignId } : {}, {
      delaySeconds: 30,
    });
  }

  return NextResponse.json({ ok: true, processed });
}

type Enrollment = typeof enrollments.$inferSelect;

async function processEnrollment(enr: Enrollment): Promise<void> {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, enr.campaignId)).limit(1);
  if (!camp || camp.status === "paused" || camp.status === "archived") {
    await db.update(enrollments).set({ state: "paused" }).where(eq(enrollments.id, enr.id));
    return;
  }

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, camp.id))
    .orderBy(asc(sequenceSteps.stepOrder));

  if (enr.currentStep >= steps.length) {
    await db.update(enrollments).set({ state: "completed" }).where(eq(enrollments.id, enr.id));
    return;
  }

  const step = steps[enr.currentStep];
  const [conn] = await db.select().from(connections).where(eq(connections.id, enr.connectionId)).limit(1);
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, enr.accountId))
    .limit(1);
  if (!conn || !account) throw new Error("Missing connection or account");

  const kind = step.type === "invite" ? "invite" : "message";
  if (!(await canSend(account.id, kind))) {
    // Cap reached — retry tomorrow.
    await db
      .update(enrollments)
      .set({ nextRunAt: tomorrow(), updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
    return;
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
    return;
  }

  if (step.type === "invite") {
    await doInvite(enr, step, steps, camp, conn, account, text);
  } else {
    await doMessage(enr, step, steps, camp, conn, account, text);
  }
}

async function doInvite(
  enr: Enrollment,
  step: SequenceStep,
  steps: SequenceStep[],
  camp: Campaign,
  conn: Connection,
  account: LinkedinAccount,
  text: string,
) {
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
    // Advance past the invite; wait for acceptance webhook to resume.
    await db
      .update(enrollments)
      .set({ currentStep: enr.currentStep + 1, state: "awaiting_accept", nextRunAt: null, updatedAt: new Date() })
      .where(eq(enrollments.id, enr.id));
  } catch (e) {
    if (e instanceof UnipileError && e.isCannotResendYet) {
      // Already invited/connected — skip to the next step.
      await db
        .update(enrollments)
        .set({ currentStep: enr.currentStep + 1, state: "accepted", nextRunAt: new Date(), updatedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
      return;
    }
    if (e instanceof UnipileError && e.isRateLimited) {
      await db.update(enrollments).set({ nextRunAt: tomorrow() }).where(eq(enrollments.id, enr.id));
      return;
    }
    throw e;
  }
}

async function doMessage(
  enr: Enrollment,
  step: SequenceStep,
  steps: SequenceStep[],
  camp: Campaign,
  conn: Connection,
  account: LinkedinAccount,
  text: string,
) {
  if (!text.trim()) throw new Error("Empty message body");

  // Reuse an existing chat if we have one; otherwise start a new chat.
  const existing = (
    await db.select().from(chats).where(eq(chats.connectionId, conn.id)).limit(1)
  )[0];

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
  } catch (e) {
    if (e instanceof UnipileError && e.isRateLimited) {
      await db.update(enrollments).set({ nextRunAt: tomorrow() }).where(eq(enrollments.id, enr.id));
      return;
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
async function resolveStepText(
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
    const res = await generateMessage({
      step: aiStepLabel(step, steps),
      prospect,
      systemPrompt,
      model,
    });
    return res.text;
  }

  return "";
}

/** Map a sequence step to the AI outreach-step label based on its position. */
function aiStepLabel(step: SequenceStep, steps: SequenceStep[]): OutreachStep {
  if (step.type === "invite") return "connection_request";
  // Count how many message steps precede this one.
  const messageSteps = steps.filter((s) => s.type === "message");
  const idx = messageSteps.findIndex((s) => s.id === step.id);
  return (["welcome", "follow_up_1", "follow_up_2", "follow_up_3"][idx] ?? "follow_up_3") as OutreachStep;
}

/** Ensure we have the provider id required for invites/new chats (enriches if needed). */
async function ensureProviderId(conn: Connection, account: LinkedinAccount): Promise<string | null> {
  if (conn.providerId) return conn.providerId;
  const identifier = conn.publicIdentifier || conn.memberId;
  if (!identifier) return null;
  if (!(await canSend(account.id, "enrich"))) return null;
  try {
    const profile = await getProfile(identifier, {
      accountId: account.unipileAccountId,
      notify: false,
    });
    await incrementCounter(account.id, "enrich");
    if (profile.provider_id) {
      await db
        .update(connections)
        .set({ providerId: profile.provider_id })
        .where(eq(connections.id, conn.id));
      return profile.provider_id;
    }
  } catch {
    return null;
  }
  return null;
}

function tomorrow(): Date {
  const d = new Date();
  d.setUTCHours(24, 5, 0, 0); // just after next UTC midnight (counter reset)
  return d;
}
