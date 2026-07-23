import { desc, count, isNotNull } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TemplatesManager } from "@/components/templates-manager";
import { db } from "@/db";
import { templates, aiPrompts, sequenceSteps, type Template, type AiPrompt } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let data: {
    tpls: Template[];
    prompts: AiPrompt[];
    templateUsage: Record<string, number>;
    promptUsage: Record<string, number>;
  } | null = null;
  let error: string | null = null;
  try {
    const [tpls, prompts, tplUse, promptUse] = await Promise.all([
      db.select().from(templates).orderBy(desc(templates.createdAt)),
      db.select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt)),
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
    data = { tpls, prompts, templateUsage, promptUsage };
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
