import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  commentCampaignPosts,
  commentDmTargets,
  templates,
  type CommentCampaign,
  type CommentDmTarget,
  type LinkedinAccount,
} from "@/db/schema";
import {
  listPostComments,
  sendInvitation,
  startChat,
  UnipileError,
} from "@/lib/unipile/client";
import {
  commentAuthor,
  commentText as readCommentText,
  commenterKey,
} from "@/lib/unipile/posts";
import { renderTemplate, templateVarsFromCommenter } from "@/lib/templates";
import { canSend, incrementCounter } from "@/lib/rate-limit";

/** LinkedIn connection-note hard limit. */
const NOTE_MAX = 300;
/** Max comments pulled per post per poll (one page is plenty for our cadence). */
const COMMENTS_PER_POLL = 100;

function matchKeyword(text: string, keywords: string[]): string | null {
  const hay = text.toLowerCase();
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k && hay.includes(k)) return kw.trim();
  }
  return null;
}

/**
 * Poll one campaign's posts for new commenters and queue them as pending
 * targets. Sends nothing. Dedupes on (campaignId, commenterKey).
 */
export async function pollCommentCampaign(
  campaign: CommentCampaign,
  account: LinkedinAccount,
): Promise<{ queued: number }> {
  const posts = await db
    .select()
    .from(commentCampaignPosts)
    .where(eq(commentCampaignPosts.campaignId, campaign.id));

  let queued = 0;
  for (const post of posts) {
    let comments;
    try {
      const res = await listPostComments({
        accountId: account.unipileAccountId,
        postId: post.postId,
        limit: COMMENTS_PER_POLL,
      });
      comments = res.items ?? [];
    } catch (e) {
      console.error("[comment-dm] poll failed", post.postId, e instanceof Error ? e.message : e);
      continue;
    }

    for (const c of comments) {
      const author = commentAuthor(c);
      const text = readCommentText(c);

      // Skip company pages and anyone we can't identify/reach.
      if (author.isCompany || !author.providerId) continue;

      let matched: string | null = null;
      if (campaign.filterMode === "keywords") {
        matched = matchKeyword(text, campaign.keywords ?? []);
        if (!matched) continue; // didn't match the filter
      }

      const key = commenterKey(author, c);
      const inserted = await db
        .insert(commentDmTargets)
        .values({
          campaignId: campaign.id,
          accountId: account.id,
          postId: post.postId,
          commenterKey: key,
          commenterProviderId: author.providerId,
          commenterPublicId: author.publicId,
          commenterName: author.name,
          commentText: text,
          matchedKeyword: matched,
          connected: author.connected,
          state: "pending",
        })
        .onConflictDoNothing({
          target: [commentDmTargets.campaignId, commentDmTargets.commenterKey],
        })
        .returning({ id: commentDmTargets.id });
      if (inserted.length > 0) queued++;
    }

    await db
      .update(commentCampaignPosts)
      .set({ commentCount: comments.length, lastCommentPolledAt: new Date() })
      .where(eq(commentCampaignPosts.id, post.id));
  }

  return { queued };
}

/**
 * Reach one queued commenter. Connected (1st-degree) → DM (counts against the
 * message cap); otherwise → connection request with the message as the note
 * (counts against the invite cap). Both caps are shared with campaigns.
 *
 * Returns true only when a real send happened (so the caller starts the
 * account's cooldown), false when skipped/deferred without sending.
 */
export async function sendCommentDm(
  target: CommentDmTarget,
  campaign: CommentCampaign,
  account: LinkedinAccount,
): Promise<boolean> {
  if (!target.commenterProviderId) {
    await mark(target.id, "skipped", { reason: "No provider id" });
    return false;
  }

  // Resolve the message body from the campaign's template.
  const tpl = campaign.templateId
    ? (await db.select().from(templates).where(eq(templates.id, campaign.templateId)).limit(1))[0]
    : undefined;
  if (!tpl || !tpl.body.trim()) {
    await mark(target.id, "skipped", { reason: "No message template configured" });
    return false;
  }
  const message = renderTemplate(
    tpl.body,
    templateVarsFromCommenter({
      name: target.commenterName,
      commentText: target.commentText,
    }),
  ).trim();
  if (!message) {
    await mark(target.id, "skipped", { reason: "Rendered message was empty" });
    return false;
  }

  const kind = target.connected ? "message" : "invite";
  if (!(await canSend(account.id, kind))) {
    // Cap exhausted for this channel — release for a later run.
    await defer(target.id);
    return false;
  }

  try {
    if (target.connected) {
      const res = await startChat({
        accountId: account.unipileAccountId,
        attendeesIds: [target.commenterProviderId],
        text: message,
      });
      const chatId = res.chat_id ?? res.id ?? null;
      await incrementCounter(account.id, "message");
      await db.insert(activities).values({
        accountId: account.id,
        type: "message",
        status: "success",
        content: message,
        unipileChatId: chatId,
      });
      await mark(target.id, "sent", { channel: "dm", chatId });
    } else {
      const note = message.length > NOTE_MAX ? message.slice(0, NOTE_MAX) : message;
      const res = await sendInvitation({
        accountId: account.unipileAccountId,
        providerId: target.commenterProviderId,
        message: note,
      });
      await incrementCounter(account.id, "invite");
      await db.insert(activities).values({
        accountId: account.id,
        type: "invite",
        status: "success",
        content: note,
        unipileInvitationId: res.invitation_id ?? null,
      });
      await mark(target.id, "sent", { channel: "invite", invitationId: res.invitation_id ?? null });
    }
    return true;
  } catch (e) {
    if (e instanceof UnipileError && e.isRateLimited) {
      // Hit a provider limit — release for a later run.
      await defer(target.id);
      return false;
    }
    // Invite to an existing connection / already-pending invite: treat as done.
    if (e instanceof UnipileError && (e.isCannotResendYet || e.status === 422)) {
      await mark(target.id, "skipped", { reason: "Already connected or invite pending" });
      return false;
    }
    const msg = e instanceof Error ? e.message : String(e);
    await mark(target.id, "failed", { reason: msg });
    return false;
  }
}

/** Release a claimed row back to the queue (deferred, not consumed). */
async function defer(id: string) {
  await db
    .update(commentDmTargets)
    .set({ state: "pending" })
    .where(eq(commentDmTargets.id, id));
}

async function mark(
  id: string,
  state: "sent" | "skipped" | "failed",
  extra: {
    reason?: string;
    channel?: "dm" | "invite";
    chatId?: string | null;
    invitationId?: string | null;
  } = {},
) {
  await db
    .update(commentDmTargets)
    .set({
      state,
      reason: extra.reason ?? null,
      channel: extra.channel ?? null,
      chatId: extra.chatId ?? null,
      unipileInvitationId: extra.invitationId ?? null,
      sentAt: state === "sent" ? new Date() : null,
    })
    .where(eq(commentDmTargets.id, id));
}
