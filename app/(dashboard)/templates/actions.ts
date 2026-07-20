"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { templates, aiPrompts } from "@/db/schema";
import { generateMessage, type OutreachStep } from "@/lib/ai/generate";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
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

/** Generate a sample AI message for previewing a prompt. */
export async function previewAiMessage(input: {
  systemPrompt?: string;
  model?: string;
  step: OutreachStep;
}): Promise<{ text?: string; bannedWordsFound?: string[]; error?: string }> {
  await requireUser();
  try {
    const res = await generateMessage({
      step: input.step,
      systemPrompt: input.systemPrompt,
      model: input.model,
      prospect: {
        firstName: "Jordan",
        lastName: "Rivera",
        headline: "VP of Demand Generation at Northwind SaaS",
        company: "Northwind SaaS",
        position: "VP of Demand Generation",
        locationCountry: "US",
        summary: "Leads pipeline and ABM programs for a mid-market B2B software company.",
      },
    });
    return { text: res.text, bannedWordsFound: res.bannedWordsFound };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}
