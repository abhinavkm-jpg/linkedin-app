import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TemplatesManager } from "@/components/templates-manager";
import { db } from "@/db";
import { templates, aiPrompts, type Template, type AiPrompt } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let data: { tpls: Template[]; prompts: AiPrompt[] } | null = null;
  let error: string | null = null;
  try {
    const [tpls, prompts] = await Promise.all([
      db.select().from(templates).orderBy(desc(templates.createdAt)),
      db.select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt)),
    ]);
    data = { tpls, prompts };
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  const content = error ? (
    <Card className="border-destructive/40">
      <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
    </Card>
  ) : data ? (
    <TemplatesManager templates={data.tpls} prompts={data.prompts} />
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
