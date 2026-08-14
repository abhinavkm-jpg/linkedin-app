import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PipelinePanel, type PipelineRow } from "@/components/pipeline-panel";
import { db } from "@/db";
import { pipelineItems, replyDrafts, connections, linkedinAccounts } from "@/db/schema";
import { auth } from "@/auth";
import { getAccessibleAccountIds, accountScope } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  let rows: PipelineRow[] = [];
  let accounts: { id: string; name: string }[] = [];
  let error: string | null = null;

  try {
    const session = await auth();
    const accessibleIds = await getAccessibleAccountIds(session!.user);

    const items = await db
      .select({
        id: pipelineItems.id,
        accountId: pipelineItems.accountId,
        stage: pipelineItems.stage,
        intent: pipelineItems.intent,
        meetingStatus: pipelineItems.meetingStatus,
        lastInboundText: pipelineItems.lastInboundText,
        lastInboundAt: pipelineItems.lastInboundAt,
        lastOutboundText: pipelineItems.lastOutboundText,
        updatedAt: pipelineItems.updatedAt,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
        company: connections.company,
        publicIdentifier: connections.publicIdentifier,
        publicProfileUrl: connections.publicProfileUrl,
        accountName: linkedinAccounts.name,
      })
      .from(pipelineItems)
      .leftJoin(connections, eq(pipelineItems.connectionId, connections.id))
      .leftJoin(linkedinAccounts, eq(pipelineItems.accountId, linkedinAccounts.id))
      .where(accountScope(pipelineItems.accountId, accessibleIds))
      .orderBy(desc(pipelineItems.updatedAt))
      .limit(500);

    // Latest pending draft per item.
    const drafts = await db
      .select({
        id: replyDrafts.id,
        pipelineItemId: replyDrafts.pipelineItemId,
        objective: replyDrafts.objective,
        draftText: replyDrafts.draftText,
        reason: replyDrafts.reason,
        suggestedStage: replyDrafts.suggestedStage,
        createdAt: replyDrafts.createdAt,
      })
      .from(replyDrafts)
      .where(eq(replyDrafts.status, "pending"))
      .orderBy(desc(replyDrafts.createdAt));
    const draftByItem = new Map<string, (typeof drafts)[number]>();
    for (const d of drafts) if (!draftByItem.has(d.pipelineItemId)) draftByItem.set(d.pipelineItemId, d);

    rows = items.map((i) => {
      const d = draftByItem.get(i.id);
      const name = [i.firstName, i.lastName].filter(Boolean).join(" ").trim() || i.headline || "Unknown";
      const profileUrl =
        i.publicProfileUrl ??
        (i.publicIdentifier ? `https://www.linkedin.com/in/${i.publicIdentifier}` : null);
      return {
        id: i.id,
        name,
        company: i.company,
        headline: i.headline,
        accountName: i.accountName,
        profileUrl,
        stage: i.stage,
        intent: i.intent,
        meetingStatus: i.meetingStatus,
        lastInboundText: i.lastInboundText,
        lastInboundAt: i.lastInboundAt ? i.lastInboundAt.toISOString() : null,
        lastOutboundText: i.lastOutboundText,
        updatedAt: i.updatedAt.toISOString(),
        draft: d
          ? {
              id: d.id,
              objective: d.objective,
              text: d.draftText ?? "",
              reason: d.reason,
              suggestedStage: d.suggestedStage,
            }
          : null,
      };
    });

    // Accounts the user can pick from for the backfill button.
    accounts = await db
      .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
      .from(linkedinAccounts)
      .where(accountScope(linkedinAccounts.id, accessibleIds))
      .orderBy(linkedinAccounts.name);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load pipeline";
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="People who replied. AI drafts a next reply for your review — nothing is sent without your approval."
      />
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <PipelinePanel rows={rows} accounts={accounts} />
        )}
      </div>
    </>
  );
}
