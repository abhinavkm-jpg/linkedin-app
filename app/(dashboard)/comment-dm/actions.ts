"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  commentCampaigns,
  commentCampaignPosts,
  linkedinAccounts,
  type LinkedinAccount,
} from "@/db/schema";
import { enqueueJob } from "@/lib/qstash";
import { getAccessibleAccountIds } from "@/lib/access";
import { getAccountOwner, listPosts } from "@/lib/unipile/client";
import { postCommentCount, postDate, postShareUrl, postSocialId, postTitle } from "@/lib/unipile/posts";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

/** Throw unless the current user may manage this account. */
async function assertAccountAccess(accountId: string) {
  const user = await requireUser();
  const ids = await getAccessibleAccountIds(user);
  if (ids !== null && !ids.includes(accountId)) throw new Error("Forbidden");
  return user;
}

/** Throw unless the user may manage this comment campaign; returns its account id. */
async function assertCampaignAccess(campaignId: string): Promise<string> {
  const [row] = await db
    .select({ accountId: commentCampaigns.accountId })
    .from(commentCampaigns)
    .where(eq(commentCampaigns.id, campaignId))
    .limit(1);
  if (!row) throw new Error("Campaign not found");
  await assertAccountAccess(row.accountId);
  return row.accountId;
}

export async function createCommentCampaign(input: {
  name: string;
  accountId: string;
}): Promise<void> {
  const user = await assertAccountAccess(input.accountId);
  const [row] = await db
    .insert(commentCampaigns)
    .values({
      name: input.name.trim() || "Untitled",
      accountId: input.accountId,
      ownerUserId: user.id,
      status: "draft",
    })
    .returning({ id: commentCampaigns.id });
  revalidatePath("/comment-dm");
  redirect(`/comment-dm/${row.id}`);
}

export async function updateCommentCampaign(
  id: string,
  input: {
    name?: string;
    templateId?: string | null;
    filterMode?: "none" | "keywords";
    keywords?: string[];
  },
): Promise<void> {
  await assertCampaignAccess(id);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim() || "Untitled";
  if (input.templateId !== undefined) patch.templateId = input.templateId;
  if (input.filterMode !== undefined) patch.filterMode = input.filterMode;
  if (input.keywords !== undefined) {
    patch.keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  }
  await db.update(commentCampaigns).set(patch).where(eq(commentCampaigns.id, id));
  revalidatePath(`/comment-dm/${id}`);
  revalidatePath("/comment-dm");
}

export async function setCommentCampaignStatus(
  id: string,
  status: "draft" | "active" | "paused" | "completed" | "archived",
): Promise<void> {
  await assertCampaignAccess(id);
  await db.update(commentCampaigns).set({ status, updatedAt: new Date() }).where(eq(commentCampaigns.id, id));
  if (status === "active") await enqueueJob("comment-dm", { campaignId: id });
  revalidatePath(`/comment-dm/${id}`);
  revalidatePath("/comment-dm");
}

export async function deleteCommentCampaign(id: string): Promise<void> {
  await assertCampaignAccess(id);
  await db.delete(commentCampaigns).where(eq(commentCampaigns.id, id));
  revalidatePath("/comment-dm");
  redirect("/comment-dm");
}

/** Resolve (and cache) the account owner's identifier for listing their posts. */
async function ownerIdentifier(account: LinkedinAccount): Promise<string> {
  if (account.ownerProviderId) return account.ownerProviderId;
  const me = await getAccountOwner(account.unipileAccountId);
  const id = me.provider_id || me.public_identifier || null;
  if (!id) throw new Error("Could not resolve the account owner's profile");
  await db
    .update(linkedinAccounts)
    .set({ ownerProviderId: id })
    .where(eq(linkedinAccounts.id, account.id));
  return id;
}

export type RecentPost = {
  postId: string;
  title: string;
  url: string | null;
  commentCount: number;
  date: string | null;
};

/** Fetch the connected account's own recent posts for the picker. */
export async function listAccountRecentPosts(accountId: string): Promise<RecentPost[]> {
  await assertAccountAccess(accountId);
  const [account] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  if (!account) throw new Error("Account not found");

  const identifier = await ownerIdentifier(account);
  const res = await listPosts({ accountId: account.unipileAccountId, identifier, limit: 30 });
  return (res.items ?? [])
    .map((p) => {
      const postId = postSocialId(p);
      if (!postId) return null;
      return {
        postId,
        title: postTitle(p),
        url: postShareUrl(p),
        commentCount: postCommentCount(p),
        date: postDate(p),
      } satisfies RecentPost;
    })
    .filter((p): p is RecentPost => p !== null);
}

export async function addCampaignPost(
  campaignId: string,
  input: { postId: string; postUrl?: string | null; title?: string | null },
): Promise<void> {
  await assertCampaignAccess(campaignId);
  await db
    .insert(commentCampaignPosts)
    .values({
      campaignId,
      postId: input.postId,
      postUrl: input.postUrl ?? null,
      title: input.title ?? null,
    })
    .onConflictDoNothing({
      target: [commentCampaignPosts.campaignId, commentCampaignPosts.postId],
    });
  revalidatePath(`/comment-dm/${campaignId}`);
}

export async function removeCampaignPost(postRowId: string): Promise<void> {
  const [row] = await db
    .select({ campaignId: commentCampaignPosts.campaignId })
    .from(commentCampaignPosts)
    .where(eq(commentCampaignPosts.id, postRowId))
    .limit(1);
  if (!row) return;
  await assertCampaignAccess(row.campaignId);
  await db.delete(commentCampaignPosts).where(eq(commentCampaignPosts.id, postRowId));
  revalidatePath(`/comment-dm/${row.campaignId}`);
}

/** Manually kick a poll+send pass (used by the "Run now" button). */
export async function runCommentCampaignNow(id: string): Promise<void> {
  await assertCampaignAccess(id);
  await enqueueJob("comment-dm", { campaignId: id });
  revalidatePath(`/comment-dm/${id}`);
}
