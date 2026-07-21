import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, count } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CampaignHeader } from "@/components/campaign-header";
import { IcpEditor } from "@/components/icp-editor";
import { EnrollmentPanel } from "@/components/enrollment-panel";
import { StepsEditor } from "@/components/steps-editor";
import { ReviewQueue } from "@/components/review-queue";
import { db } from "@/db";
import { campaigns, sequenceSteps, templates, aiPrompts, enrollments, connections, activities } from "@/db/schema";
import { getIcpMatches } from "@/lib/data-connections";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) notFound();

  const [steps, tpls, prompts, stateCounts, enrolled, drafts] = await Promise.all([
    db.select().from(sequenceSteps).where(eq(sequenceSteps.campaignId, id)).orderBy(asc(sequenceSteps.stepOrder)),
    db.select().from(templates).orderBy(desc(templates.createdAt)),
    db.select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt)),
    db
      .select({ state: enrollments.state, n: count() })
      .from(enrollments)
      .where(eq(enrollments.campaignId, id))
      .groupBy(enrollments.state),
    db
      .select({
        enrollmentId: enrollments.id,
        state: enrollments.state,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
      })
      .from(enrollments)
      .innerJoin(connections, eq(connections.id, enrollments.connectionId))
      .where(eq(enrollments.campaignId, id))
      .orderBy(desc(enrollments.updatedAt))
      .limit(100),
    db
      .select({
        activityId: activities.id,
        content: activities.content,
        type: activities.type,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
      })
      .from(activities)
      .innerJoin(connections, eq(connections.id, activities.connectionId))
      .where(and(eq(activities.campaignId, id), eq(activities.status, "pending")))
      .limit(50),
  ]);

  const t = campaign.targeting ?? {};
  const hasIcp =
    (t.titleKeywords?.length ?? 0) + (t.countries?.length ?? 0) + (t.tags?.length ?? 0) > 0;
  let icpMatchCount: number | null = null;
  if (hasIcp) {
    try {
      icpMatchCount = (
        await getIcpMatches(campaign.accountId, t, { excludeCampaignId: id, idLimit: 1 })
      ).count;
    } catch {
      icpMatchCount = null;
    }
  }

  const editable = campaign.status === "draft" || campaign.status === "paused";

  return (
    <>
      <PageHeader title={campaign.name} description="Configure targeting, sequence, and enrollment.">
        <Button render={<Link href="/campaigns" />} size="sm" variant="outline">
          <ChevronLeft className="h-4 w-4" /> All campaigns
        </Button>
      </PageHeader>
      <div className="space-y-6 p-6">
        <CampaignHeader
          id={campaign.id}
          name={campaign.name}
          status={campaign.status}
          reviewBeforeSend={campaign.reviewBeforeSend}
          hasSteps={steps.length > 0}
          stateCounts={stateCounts.map((s) => ({ state: s.state, n: Number(s.n) }))}
        />

        {drafts.length > 0 && (
          <ReviewQueue
            drafts={drafts.map((d) => ({
              activityId: d.activityId,
              type: d.type,
              content: d.content ?? "",
              name: [d.firstName, d.lastName].filter(Boolean).join(" ") || d.headline || "Unknown",
            }))}
          />
        )}

        <IcpEditor
          campaignId={campaign.id}
          targeting={t}
          matchCount={icpMatchCount}
          accountId={campaign.accountId}
        />

        <EnrollmentPanel
          campaignId={campaign.id}
          hasIcp={hasIcp}
          matchCount={icpMatchCount}
          enrolled={enrolled.map((e) => ({
            enrollmentId: e.enrollmentId,
            state: e.state,
            name: [e.firstName, e.lastName].filter(Boolean).join(" ") || e.headline || "Unknown",
            headline: e.headline,
          }))}
        />

        <StepsEditor
          campaignId={campaign.id}
          steps={steps}
          templates={tpls}
          prompts={prompts}
          editable={editable}
        />
      </div>
    </>
  );
}
