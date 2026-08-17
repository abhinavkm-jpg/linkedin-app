/**
 * Defensive accessors for Unipile post/comment payloads. Unipile's exact field
 * names differ across API versions/tenants, so ALL reads of UnipilePost /
 * UnipileComment go through here — if a live response uses different keys, this
 * is the single place to adjust.
 */
import type { UnipilePost, UnipileComment } from "./types";

/** The id to use when fetching a post's comments (activity/share URN). */
export function postSocialId(p: UnipilePost): string | null {
  return (p.social_id as string) || (p.id as string) || null;
}

export function postText(p: UnipilePost): string {
  return (p.text as string) ?? "";
}

export function postCommentCount(p: UnipilePost): number {
  return Number(p.comment_counter ?? 0) || 0;
}

export function postShareUrl(p: UnipilePost): string | null {
  return (p.share_url as string) ?? null;
}

export function postDate(p: UnipilePost): string | null {
  return (p.parsed_datetime as string) || (p.date as string) || null;
}

/** A short, human-readable title for a post (first line, trimmed). */
export function postTitle(p: UnipilePost): string {
  const text = postText(p).replace(/\s+/g, " ").trim();
  if (!text) return "(no text)";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export type CommentAuthor = {
  providerId: string | null;
  publicId: string | null;
  name: string | null;
  headline: string | null;
  isCompany: boolean;
  connected: boolean; // 1st-degree → we can DM; else invite
};

/** Extract the /in/<slug> handle from a LinkedIn profile URL. */
function slugFromProfileUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function commentAuthor(c: UnipileComment): CommentAuthor {
  const d = c.author_details ?? {};
  const first = (d.name as string) || (typeof c.author === "string" ? c.author : null);
  return {
    providerId: (d.id as string) || null,
    publicId: (d.public_identifier as string) || slugFromProfileUrl(d.profile_url) || null,
    name: first || null,
    headline: (d.headline as string) || null,
    isCompany: Boolean(d.is_company),
    connected: (d.network_distance as string) === "DISTANCE_1",
  };
}

export function commentText(c: UnipileComment): string {
  return (c.text as string) ?? "";
}

export function commentId(c: UnipileComment): string | null {
  return (c.id as string) ?? null;
}

/**
 * A stable dedupe key for a commenter within a campaign. Prefer providerId
 * (stable per person), then publicId; fall back to the comment id / a
 * name+text hash so we never insert the same commenter twice.
 */
export function commenterKey(a: CommentAuthor, c: UnipileComment): string {
  return (
    a.providerId ||
    a.publicId ||
    commentId(c) ||
    `anon:${(a.name ?? "").toLowerCase()}:${commentText(c).slice(0, 40)}`
  );
}
