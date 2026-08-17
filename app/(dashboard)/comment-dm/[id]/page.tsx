import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  commentCampaigns,
  commentCampaignPosts,
  commentDmTargets,
  linkedinAccounts,
  templates,
} from "@/db/schema";
import { auth } from "@/auth";
import { getAccessibleAccountIds, ownerVisibilityScope } from "@/lib/access";
import { CommentCampaignDetail } from "@/components/comment-campaign-detail";

export const dynamic = "force-dynamic";

export default async function CommentCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const accessibleIds = await getAccessibleAccountIds(session!.user);

  const [campaign] = await db
    .select()
    .from(commentCampaigns)
    .where(eq(commentCampaigns.id, id))
    .limit(1);
  if (!campaign) notFound();
  if (accessibleIds !== null && !accessibleIds.includes(campaign.accountId)) notFound();

  const [account] = await db
    .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, campaign.accountId))
    .limit(1);

  const [messageTemplates, posts, targets] = await Promise.all([
    db
      .select({ id: templates.id, name: templates.name })
      .from(templates)
      .where(
        and(eq(templates.type, "message"), await ownerVisibilityScope(templates.ownerUserId, session!.user)),
      )
      .orderBy(templates.name),
    db
      .select()
      .from(commentCampaignPosts)
      .where(eq(commentCampaignPosts.campaignId, id))
      .orderBy(desc(commentCampaignPosts.createdAt)),
    db
      .select()
      .from(commentDmTargets)
      .where(eq(commentDmTargets.campaignId, id))
      .orderBy(desc(commentDmTargets.createdAt))
      .limit(200),
  ]);

  return (
    <CommentCampaignDetail
      campaign={{
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        templateId: campaign.templateId,
        filterMode: campaign.filterMode === "keywords" ? "keywords" : "none",
        keywords: campaign.keywords ?? [],
        accountId: campaign.accountId,
        accountName: account?.name ?? "—",
      }}
      templates={messageTemplates}
      posts={posts.map((p) => ({
        id: p.id,
        postId: p.postId,
        title: p.title,
        url: p.postUrl,
        commentCount: p.commentCount,
      }))}
      targets={targets.map((t) => ({
        id: t.id,
        name: t.commenterName,
        publicId: t.commenterPublicId,
        commentText: t.commentText,
        matchedKeyword: t.matchedKeyword,
        connected: t.connected,
        channel: t.channel,
        state: t.state,
        reason: t.reason,
        sentAt: t.sentAt ? t.sentAt.toISOString() : null,
      }))}
    />
  );
}
