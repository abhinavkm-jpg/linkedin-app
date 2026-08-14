import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PipelineBoard, type PipelineRow } from "@/components/pipeline-panel";
import { db } from "@/db";
import { pipelineItems, connections, linkedinAccounts, chats } from "@/db/schema";
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
        stage: pipelineItems.stage,
        intent: pipelineItems.intent,
        lastInboundAt: pipelineItems.lastInboundAt,
        updatedAt: pipelineItems.updatedAt,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
        company: connections.company,
        accountName: linkedinAccounts.name,
        chatInternalId: chats.id,
      })
      .from(pipelineItems)
      .leftJoin(connections, eq(pipelineItems.connectionId, connections.id))
      .leftJoin(linkedinAccounts, eq(pipelineItems.accountId, linkedinAccounts.id))
      .leftJoin(chats, eq(chats.unipileChatId, pipelineItems.chatId))
      .where(accountScope(pipelineItems.accountId, accessibleIds))
      .orderBy(desc(pipelineItems.updatedAt))
      .limit(500);

    rows = items.map((i) => ({
      id: i.id,
      name: [i.firstName, i.lastName].filter(Boolean).join(" ").trim() || i.headline || "Unknown",
      company: i.company,
      headline: i.headline,
      accountName: i.accountName,
      stage: i.stage,
      intent: i.intent,
      lastInboundAt: i.lastInboundAt ? i.lastInboundAt.toISOString() : null,
      chatInternalId: i.chatInternalId,
    }));

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
        description="Leads who replied. Drag a card to move its stage. The AI reply draft lives in the Inbox (open the chat and tap the ✨ button)."
      />
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <PipelineBoard rows={rows} accounts={accounts} />
        )}
      </div>
    </>
  );
}
