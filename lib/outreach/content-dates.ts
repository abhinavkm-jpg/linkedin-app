import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets, type LinkedinAccount } from "@/db/schema";

/**
 * Extract an article's real publish date from its HTML. Sitemap <lastmod> is
 * unreliable (often the sitemap's regeneration time), so we read the page:
 * JSON-LD datePublished → og article:published_time → <time datetime> →
 * JSON-LD dateModified. Returns null when nothing parseable is found.
 */
export function extractPublishedDate(html: string): Date | null {
  const tryDate = (v: string | null | undefined): Date | null => {
    if (!v) return null;
    const d = new Date(v.trim());
    return isNaN(d.getTime()) ? null : d;
  };
  const m = (re: RegExp): string | null => html.match(re)?.[1] ?? null;

  return (
    tryDate(m(/"datePublished"\s*:\s*"([^"]+)"/i)) ||
    tryDate(m(/property=["']article:published_time["']\s+content=["']([^"']+)["']/i)) ||
    tryDate(m(/content=["']([^"']+)["']\s+property=["']article:published_time["']/i)) ||
    tryDate(m(/<time[^>]*datetime=["']([^"']+)["']/i)) ||
    tryDate(m(/"dateModified"\s*:\s*"([^"]+)"/i))
  );
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MachintelBot)" } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Verify real publish dates for a batch of the account's shareable content, so
 * the freshness cutoff can trust them. Processes assets whose date isn't yet
 * verified. Bounded per run; safe to call repeatedly.
 */
export async function verifyContentDates(
  account: LinkedinAccount,
  opts: { limit?: number; concurrency?: number } = {},
): Promise<{ checked: number; dated: number; remaining: number }> {
  const sections = account.contentSections ?? [];
  if (sections.length === 0) return { checked: 0, dated: 0, remaining: 0 };

  const limit = opts.limit ?? 60;
  const concurrency = opts.concurrency ?? 5;

  const pending = await db
    .select({ id: contentAssets.id, url: contentAssets.url })
    .from(contentAssets)
    .where(
      and(
        eq(contentAssets.accountId, account.id),
        inArray(contentAssets.section, sections),
        eq(contentAssets.dateVerified, false),
      ),
    )
    .limit(limit);

  let dated = 0;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (a) => {
        const html = await fetchHtml(a.url);
        const date = html ? extractPublishedDate(html) : null;
        if (date) dated++;
        // Mark verified either way so we don't refetch a page that has no date;
        // undated assets stay ineligible (lastmod null) for sharing.
        await db
          .update(contentAssets)
          .set({ lastmod: date ?? null, dateVerified: true })
          .where(eq(contentAssets.id, a.id));
      }),
    );
  }

  const remaining = await db.$count(
    contentAssets,
    and(
      eq(contentAssets.accountId, account.id),
      inArray(contentAssets.section, sections),
      eq(contentAssets.dateVerified, false),
    ),
  );

  return { checked: pending.length, dated, remaining: Number(remaining) };
}
