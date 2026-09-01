import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets, linkedinAccounts } from "@/db/schema";
import type { ProspectContext } from "@/lib/ai/generate";

export interface PickedAsset {
  title: string;
  url: string;
}

/**
 * Only ever share content published within this window — never old articles.
 * Assets with no known publish date (`lastmod`) are excluded, so we never share
 * something whose age we can't verify.
 */
export const CONTENT_MAX_AGE_DAYS = 183; // ~6 months

const STOP = new Set([
  "the", "and", "for", "with", "your", "our", "you", "are", "how", "why", "what", "from",
  "that", "this", "into", "using", "guide", "best", "top", "new", "2024", "2025", "2026",
  "a", "an", "of", "to", "in", "on", "at", "is", "it", "b2b",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Pick the content assets most relevant to a prospect, from the account's
 * shareable sections. Ranks by keyword overlap between each asset's title and
 * the prospect's headline / role / company / summary. Returns up to `limit`.
 */
export async function pickRelevantAssets(
  accountId: string,
  prospect: ProspectContext,
  limit = 5,
): Promise<PickedAsset[]> {
  const [acct] = await db
    .select({ sections: linkedinAccounts.contentSections })
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  const sections = acct?.sections ?? [];
  if (sections.length === 0) return [];

  // Hard freshness cutoff: only articles published within the window are eligible.
  const cutoff = new Date(Date.now() - CONTENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const assets = await db
    .select({ title: contentAssets.title, url: contentAssets.url, lastmod: contentAssets.lastmod })
    .from(contentAssets)
    .where(
      and(
        eq(contentAssets.accountId, accountId),
        inArray(contentAssets.section, sections),
        eq(contentAssets.dateVerified, true), // only page-confirmed dates are trusted
        gte(contentAssets.lastmod, cutoff), // excludes older + undated assets
      ),
    );
  const usable = assets.filter((a) => !!a.title && !!a.url);
  if (usable.length === 0) return []; // nothing fresh → share no link rather than an old one

  const terms = tokenize(
    `${prospect.headline ?? ""} ${prospect.position ?? ""} ${prospect.company ?? ""} ${prospect.summary ?? ""}`,
  );
  const when = (d: Date | null) => (d ? d.getTime() : 0);
  const scored = usable.map((a) => {
    const t = tokenize(a.title ?? "");
    let score = 0;
    for (const w of t) if (terms.has(w)) score += 1;
    return { a, score };
  });
  // Rank by relevance, then by freshness — so among equally-relevant articles
  // (and when nothing overlaps) the newest published one wins.
  scored.sort((x, y) => y.score - x.score || when(y.a.lastmod) - when(x.a.lastmod));
  return scored.slice(0, limit).map((s) => ({ title: s.a.title as string, url: s.a.url }));
}

/** Task-message instruction telling the model to reference one real article URL. */
export function contentInstruction(assets: PickedAsset[]): string {
  const list = assets.map((a) => `- ${a.title} — ${a.url}`).join("\n");
  return `This message MUST share a relevant resource. Reference exactly ONE of the articles below — pick the one most relevant to this prospect — using its EXACT url (never invent, shorten, or alter a URL). Weave it in naturally as a helpful resource, not a bare link dump.\nArticles:\n${list}`;
}
