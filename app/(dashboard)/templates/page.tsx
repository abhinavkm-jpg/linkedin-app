import { desc, count, isNotNull } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TemplatesManager } from "@/components/templates-manager";
import { db } from "@/db";
import { templates, aiPrompts, sequenceSteps, type Template, type AiPrompt } from "@/db/schema";
import { auth } from "@/auth";
import { ownerVisibilityScope, isAdmin } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let data: {
    tpls: Template[];
    prompts: AiPrompt[];
    templateUsage: Record<string, number>;
    promptUsage: Record<string, number>;
    currentUserId: string;
    admin: boolean;
  } | null = null;
  let error: string | null = null;
  try {
    const session = await auth();
    const user = session!.user;
    const [tScope, pScope] = await Promise.all([
      ownerVisibilityScope(templates.ownerUserId, user),
      ownerVisibilityScope(aiPrompts.ownerUserId, user),
    ]);
    const [tpls, prompts, tplUse, promptUse] = await Promise.all([
      db.select().from(templates).where(tScope).orderBy(desc(templates.createdAt)),
      db.select().from(aiPrompts).where(pScope).orderBy(desc(aiPrompts.createdAt)),
      db
        .select({ id: sequenceSteps.templateId, n: count() })
        .from(sequenceSteps)
        .where(isNotNull(sequenceSteps.templateId))
        .groupBy(sequenceSteps.templateId),
      db
        .select({ id: sequenceSteps.aiPromptId, n: count() })
        .from(sequenceSteps)
        .where(isNotNull(sequenceSteps.aiPromptId))
        .groupBy(sequenceSteps.aiPromptId),
    ]);
    const templateUsage = Object.fromEntries(tplUse.map((r) => [r.id as string, Number(r.n)]));
    const promptUsage = Object.fromEntries(promptUse.map((r) => [r.id as string, Number(r.n)]));
    data = {
      tpls,
      prompts,
      templateUsage,
      promptUsage,
      currentUserId: user.id,
      admin: isAdmin(user),
    };
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  const content = error ? (
    <Card className="border-destructive/40">
      <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
    </Card>
  ) : data ? (
    <TemplatesManager
      templates={data.tpls}
      prompts={data.prompts}
      templateUsage={data.templateUsage}
      promptUsage={data.promptUsage}
      currentUserId={data.currentUserId}
      isAdmin={data.admin}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Templates & AI"
        description="Reusable message templates and AI prompts for personalized outreach."
      />
      <div className="p-6">{content}</div>
    </>
  );
}
