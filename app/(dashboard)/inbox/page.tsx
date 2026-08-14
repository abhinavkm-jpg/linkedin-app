import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { InboxList, type InboxRow } from "@/components/inbox-list";
import { db } from "@/db";
import { chats, connections, linkedinAccounts, replyDrafts, pipelineItems, pipelineStages } from "@/db/schema";
import { auth } from "@/auth";
import { getAccessibleAccountIds, accountScope } from "@/lib/access";

export const dynamic = "force-dynamic";

function profileUrl(publicIdentifier: string | null, publicProfileUrl: string | null): string | null {
  if (publicProfileUrl) return publicProfileUrl;
  if (publicIdentifier) return `https://www.linkedin.com/in/${publicIdentifier}`;
  return null;
}

export default async function InboxPage() {
  let rows: InboxRow[] = [];
  let error: string | null = null;

  try {
    const session = await auth();
    const accessibleIds = await getAccessibleAccountIds(session!.user);
    const data = await db
      .select({
        id: chats.id,
        attendeeName: chats.attendeeName,
        lastMessageText: chats.lastMessageText,
        lastMessageAt: chats.lastMessageAt,
        unreadCount: chats.unreadCount,
        aiDecision: chats.aiDecision,
        aiReason: chats.aiReason,
        accountName: linkedinAccounts.name,
        firstName: connections.firstName,
        lastName: connections.lastName,
        headline: connections.headline,
        avatarUrl: connections.profilePictureUrl,
        publicIdentifier: connections.publicIdentifier,
        publicProfileUrl: connections.publicProfileUrl,
        draftId: replyDrafts.id,
        draftText: replyDrafts.draftText,
        pipelineStage: pipelineItems.stage,
        pipelineStageLabel: pipelineStages.label,
      })
      .from(chats)
      .leftJoin(linkedinAccounts, eq(chats.accountId, linkedinAccounts.id))
      .leftJoin(connections, eq(chats.connectionId, connections.id))
      .leftJoin(
        replyDrafts,
        and(eq(replyDrafts.connectionId, chats.connectionId), eq(replyDrafts.status, "pending")),
      )
      .leftJoin(pipelineItems, eq(pipelineItems.connectionId, chats.connectionId))
      .leftJoin(pipelineStages, eq(pipelineStages.value, pipelineItems.stage))
      .where(accountScope(chats.accountId, accessibleIds))
      .orderBy(desc(chats.lastMessageAt))
      .limit(200);

    rows = data.map((c) => {
      const connName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      return {
        id: c.id,
        name: connName || c.attendeeName || "Unknown",
        headline: c.headline,
        avatarUrl: c.avatarUrl,
        profileUrl: profileUrl(c.publicIdentifier, c.publicProfileUrl),
        lastMessageText: c.lastMessageText,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
        unreadCount: c.unreadCount,
        aiDecision: c.aiDecision,
        aiReason: c.aiReason,
        accountName: c.accountName,
        draftId: c.draftId ?? null,
        draftText: c.draftText ?? null,
        pipelineStage: c.pipelineStage ?? null,
        pipelineStageLabel: c.pipelineStageLabel ?? null,
      };
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load inbox";
  }

  return (
    <>
      <PageHeader title="Inbox" description="Replies from prospects. Responding pauses their sequence." />
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <InboxList chats={rows} />
        )}
      </div>
    </>
  );
}
