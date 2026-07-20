import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, count } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CampaignDetail } from "@/components/campaign-detail";
import { db } from "@/db";
import { campaigns, sequenceSteps, templates, aiPrompts, enrollments } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) notFound();

  const [steps, tpls, prompts, stateCounts] = await Promise.all([
    db.select().from(sequenceSteps).where(eq(sequenceSteps.campaignId, id)).orderBy(asc(sequenceSteps.stepOrder)),
    db.select().from(templates).orderBy(desc(templates.createdAt)),
    db.select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt)),
    db
      .select({ state: enrollments.state, n: count() })
      .from(enrollments)
      .where(eq(enrollments.campaignId, id))
      .groupBy(enrollments.state),
  ]);

  return (
    <>
      <PageHeader title={campaign.name} description="Configure the sequence and monitor progress.">
        <Button render={<Link href="/campaigns" />} size="sm" variant="outline">
          <ChevronLeft className="h-4 w-4" /> All campaigns
        </Button>
      </PageHeader>
      <div className="p-6">
        <CampaignDetail
          campaign={campaign}
          steps={steps}
          templates={tpls}
          prompts={prompts}
          stats={stateCounts.map((s) => ({ state: s.state, n: Number(s.n) }))}
        />
      </div>
    </>
  );
}
