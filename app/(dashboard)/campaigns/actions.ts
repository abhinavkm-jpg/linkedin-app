"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, max } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  campaigns,
  sequenceSteps,
  enrollments,
  activities,
  connections,
  linkedinAccounts,
} from "@/db/schema";
import { enqueueJob } from "@/lib/qstash";
import { sendStepNow } from "@/lib/outreach/send";
import { getIcpMatches } from "@/lib/data-connections";
import { enrollConnections } from "@/app/(dashboard)/connections/actions";
import type { CampaignTargeting } from "@/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

export async function createCampaign(input: {
  name: string;
  accountId: string;
  reviewBeforeSend: boolean;
  targeting?: CampaignTargeting;
}): Promise<void> {
  const user = await requireUser();
  const [row] = await db
    .insert(campaigns)
    .values({
      name: input.name,
      accountId: input.accountId,
      ownerUserId: user.id,
      reviewBeforeSend: input.reviewBeforeSend,
      targeting: input.targeting ?? {},
      status: "draft",
    })
    .returning({ id: campaigns.id });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${row.id}`);
}

export async function updateCampaignStatus(
  id: string,
  status: "draft" | "active" | "paused" | "completed" | "archived",
): Promise<void> {
  await requireUser();
  await db.update(campaigns).set({ status }).where(eq(campaigns.id, id));
  if (status === "active") await enqueueJob("send", { campaignId: id });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
}

export async function addStep(
  campaignId: string,
  input: {
    type: "invite" | "message";
    sourceType: "template" | "ai";
    templateId?: string | null;
    aiPromptId?: string | null;
    model?: string | null;
    delayHours: number;
    stopOnReply: boolean;
  },
): Promise<void> {
  await requireUser();
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(sequenceSteps.stepOrder) })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId));
  await db.insert(sequenceSteps).values({
    campaignId,
    stepOrder: (maxOrder ?? -1) + 1,
    type: input.type,
    sourceType: input.sourceType,
    templateId: input.templateId ?? null,
    aiPromptId: input.aiPromptId ?? null,
    model: input.model ?? null,
    delayHours: input.delayHours,
    stopOnReply: input.stopOnReply,
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteStep(stepId: string, campaignId: string): Promise<void> {
  await requireUser();
  await db.delete(sequenceSteps).where(eq(sequenceSteps.id, stepId));
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteCampaign(id: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only admins can delete campaigns");
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
  redirect("/campaigns");
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateCampaign(
  id: string,
  input: {
    name?: string;
    reviewBeforeSend?: boolean;
    targeting?: CampaignTargeting;
    dedupeContacts?: boolean;
  },
): Promise<void> {
  await requireUser();
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.reviewBeforeSend !== undefined) set.reviewBeforeSend = input.reviewBeforeSend;
  if (input.targeting !== undefined) set.targeting = input.targeting;
  if (input.dedupeContacts !== undefined) set.dedupeContacts = input.dedupeContacts;
  if (Object.keys(set).length === 0) return;
  await db.update(campaigns).set(set).where(eq(campaigns.id, id));

  // Turning review off releases any drafts parked "awaiting review".
  if (input.reviewBeforeSend === false) await resumeEnrollments(id);

  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
}

export async function updateStep(
  stepId: string,
  campaignId: string,
  input: {
    type: "invite" | "message";
    sourceType: "template" | "ai";
    templateId?: string | null;
    aiPromptId?: string | null;
    delayHours: number;
    stopOnReply: boolean;
  },
): Promise<void> {
  await requireUser();
  await db
    .update(sequenceSteps)
    .set({
      type: input.type,
      sourceType: input.sourceType,
      templateId: input.sourceType === "template" ? input.templateId ?? null : null,
      aiPromptId: input.sourceType === "ai" ? input.aiPromptId ?? null : null,
      delayHours: input.delayHours,
      stopOnReply: input.stopOnReply,
    })
    .where(eq(sequenceSteps.id, stepId));
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function moveStep(
  stepId: string,
  campaignId: string,
  dir: "up" | "down",
): Promise<void> {
  await requireUser();
  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId))
    .orderBy(asc(sequenceSteps.stepOrder));
  const i = steps.findIndex((s) => s.id === stepId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= steps.length) return;
  // Swap their stepOrder values.
  await db
    .update(sequenceSteps)
    .set({ stepOrder: steps[j].stepOrder })
    .where(eq(sequenceSteps.id, steps[i].id));
  await db
    .update(sequenceSteps)
    .set({ stepOrder: steps[i].stepOrder })
    .where(eq(sequenceSteps.id, steps[j].id));
  revalidatePath(`/campaigns/${campaignId}`);
}

/* -------------------------------------------------------------------------- */
/* Enrollment by ICP                                                           */
/* -------------------------------------------------------------------------- */

export async function enrollMatchingIcp(
  campaignId: string,
): Promise<{ enrolled: number; skipped: number; matched: number }> {
  await requireUser();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!camp) throw new Error("Campaign not found");

  const { ids, count } = await getIcpMatches(camp.accountId, camp.targeting, {
    excludeCampaignId: campaignId,
    idLimit: 1000,
    dedupe: camp.dedupeContacts,
  });
  if (ids.length === 0) return { enrolled: 0, skipped: 0, matched: count };

  const res = await enrollConnections(ids, campaignId);
  return { enrolled: res.enrolled, skipped: res.skipped, matched: count };
}

/* -------------------------------------------------------------------------- */
/* Review queue                                                                */
/* -------------------------------------------------------------------------- */

export async function approveDraft(activityId: string, editedText?: string): Promise<void> {
  await requireUser();
  const [act] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!act || act.status !== "pending" || !act.enrollmentId) throw new Error("Draft not found");

  const [enr] = await db.select().from(enrollments).where(eq(enrollments.id, act.enrollmentId)).limit(1);
  if (!enr) throw new Error("Enrollment not found");
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, enr.campaignId)).limit(1);
  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, enr.campaignId))
    .orderBy(asc(sequenceSteps.stepOrder));
  const step = steps[enr.currentStep];
  const [conn] = await db.select().from(connections).where(eq(connections.id, enr.connectionId)).limit(1);
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, enr.accountId))
    .limit(1);
  if (!camp || !step || !conn || !account) throw new Error("Campaign data incomplete");

  const text = (editedText?.trim() || act.content || "").trim();
  if (!text) throw new Error("Message is empty");

  // Remove the placeholder before sending (sendStepNow writes a success row).
  await db.delete(activities).where(eq(activities.id, activityId));
  await sendStepNow({ enr, step, steps, camp, conn, account, text });
  revalidatePath(`/campaigns/${enr.campaignId}`);
}

export async function skipDraft(activityId: string): Promise<void> {
  await requireUser();
  const [act] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!act) return;
  if (act.enrollmentId) {
    await db.update(enrollments).set({ state: "skipped" }).where(eq(enrollments.id, act.enrollmentId));
  }
  await db.delete(activities).where(eq(activities.id, activityId));
  if (act.campaignId) revalidatePath(`/campaigns/${act.campaignId}`);
}

/** Release enrollments parked "awaiting review" back into the send queue. */
export async function resumeEnrollments(campaignId: string): Promise<void> {
  await db
    .delete(activities)
    .where(and(eq(activities.campaignId, campaignId), eq(activities.status, "pending")));
  await db
    .update(enrollments)
    .set({ state: "queued", nextRunAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(and(eq(enrollments.campaignId, campaignId), eq(enrollments.state, "paused")));
  await enqueueJob("send", { campaignId });
}
