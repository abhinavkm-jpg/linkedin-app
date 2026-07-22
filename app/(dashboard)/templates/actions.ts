"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { templates, aiPrompts, connections } from "@/db/schema";
import { generateMessage, type OutreachStep, type ProspectContext } from "@/lib/ai/generate";
import { renderTemplate, templateVarsFromConnection } from "@/lib/templates";
import { getConnections } from "@/lib/data-connections";
import { getAccessibleAccountIds } from "@/lib/access";

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
