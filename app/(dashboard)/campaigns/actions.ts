"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, max } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, sequenceSteps } from "@/db/schema";
import { enqueueJob } from "@/lib/qstash";
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
