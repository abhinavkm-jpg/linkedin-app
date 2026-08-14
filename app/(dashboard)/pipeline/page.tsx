import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PipelineBoard, type PipelineRow } from "@/components/pipeline-panel";
import { db } from "@/db";
import {
  pipelineItems,
  connections,
  linkedinAccounts,
  chats,
  replyDrafts,
  type ConnectionEnrichment,
} from "@/db/schema";
import { auth } from "@/auth";
import { getAccessibleAccountIds, accountScope } from "@/lib/access";
import { getPipelineStages, type StageConfig } from "@/app/(dashboard)/pipeline/actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  let rows: PipelineRow[] = [];
  let accounts: { id: string; name: string }[] = [];
  let stages: StageConfig[] = [];
  let error: string | null = null;

  try {
    const session = await auth();
    const accessibleIds = await getAccessibleAccountIds(session!.user);

    const items = await db
      .select({
        id: pipelineItems.id,
        stage: pipelineItems.stage,
        intent: pipelineItems.intent,
        meetingStatus: pipelineItems.meetingStatus,
        lastInboundAt: pipelineItems.lastInboundAt,
        lastInboundText: pipelineItems.lastInboundText,
        lastOutboundText: pipelineItems.lastOutboundText,
        updatedAt: pipelineItems.updatedAt,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
        company: connections.company,
        position: connections.position,
        country: connections.locationCountry,
        publicIdentifier: connections.publicIdentifier,
        publicProfileUrl: connections.publicProfileUrl,
        enrichment: connections.enrichment,
        accountName: linkedinAccounts.name,
        chatInternalId: chats.id,
        draftText: replyDrafts.draftText,
      })
      .from(pipelineItems)
      .leftJoin(connections, eq(pipelineItems.connectionId, connections.id))
      .leftJoin(linkedinAccounts, eq(pipelineItems.accountId, linkedinAccounts.id))
      .leftJoin(chats, eq(chats.unipileChatId, pipelineItems.chatId))
      .leftJoin(
        replyDrafts,
        and(eq(replyDrafts.pipelineItemId, pipelineItems.id), eq(replyDrafts.status, "pending")),
      )
      .where(accountScope(pipelineItems.accountId, accessibleIds))
      .orderBy(desc(pipelineItems.updatedAt))
      .limit(500);

    rows = items.map((i) => ({
      id: i.id,
      name: [i.firstName, i.lastName].filter(Boolean).join(" ").trim() || i.headline || "Unknown",
      company: i.company,
      headline: i.headline,
      position: i.position,
      country: i.country,
      accountName: i.accountName,
      stage: i.stage,
      intent: i.intent,
      meetingStatus: i.meetingStatus,
      lastInboundAt: i.lastInboundAt ? i.lastInboundAt.toISOString() : null,
      lastInboundText: i.lastInboundText,
      lastOutboundText: i.lastOutboundText,
      updatedAt: i.updatedAt ? i.updatedAt.toISOString() : null,
      profileUrl:
        i.publicProfileUrl ??
        (i.publicIdentifier ? `https://www.linkedin.com/in/${i.publicIdentifier}` : null),
      summary: (i.enrichment as ConnectionEnrichment | null)?.summary ?? null,
      experience: ((i.enrichment as ConnectionEnrichment | null)?.workExperience ?? [])
        .slice(0, 5)
        .map((e) => ({ position: e.position ?? null, company: e.company ?? null }))
        .filter((e) => e.position || e.company),
      chatInternalId: i.chatInternalId,
      draftText: i.draftText ?? null,
    }));

    accounts = await db
      .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
      .from(linkedinAccounts)
      .where(accountScope(linkedinAccounts.id, accessibleIds))
      .orderBy(linkedinAccounts.name);

    stages = await getPipelineStages();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load pipeline";
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Leads who replied. Drag a card to move its stage. The AI reply draft lives in the Inbox (open the chat and tap the ✨ button)."
      />
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <PipelineBoard rows={rows} accounts={accounts} stages={stages} />
        )}
      </div>
    </>
  );
}
