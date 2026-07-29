"use server";

import { revalidatePath } from "next/cache";
import { eq, count, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { linkedinAccounts, contentAssets, accountPromptSets, aiPrompts } from "@/db/schema";
import { desc } from "drizzle-orm";
import { env } from "@/lib/env";
import { createHostedAuthLink, listAccounts, UnipileError } from "@/lib/unipile/client";
import { enqueueJob } from "@/lib/qstash";
import { assertAdmin } from "@/lib/access";
import type { UnipileSourceStatus } from "@/lib/unipile/types";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user;
}

async function requireAdmin() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

/** Create a Unipile hosted-auth link the user opens to connect a LinkedIn account. */
export async function createConnectLink(): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    const { url } = await createHostedAuthLink({
      providers: ["LINKEDIN"],
      expiresOn,
      name: user.id, // echoed back on the CREATION_SUCCESS webhook → owner
      successRedirectUrl: `${env.APP_URL}/accounts?connected=1`,
      failureRedirectUrl: `${env.APP_URL}/accounts?connected=0`,
    });
    return { url };
  } catch (e) {
    if (e instanceof UnipileError) return { error: `Unipile error ${e.status}` };
    return { error: e instanceof Error ? e.message : "Failed to create link" };
  }
}

function mapStatus(status?: UnipileSourceStatus): typeof linkedinAccounts.$inferInsert.status {
  switch (status) {
    case "OK":
      return "OK";
    case "CONNECTING":
      return "CONNECTING";
    case "CREDENTIALS":
      return "CREDENTIALS";
    case "PERMISSIONS":
      return "PERMISSIONS";
    case "STOPPED":
      return "STOPPED";
    default:
      return status ? "ERROR" : "OK";
  }
}

/**
 * Import LinkedIn accounts already connected in the Unipile workspace, so you
 * don't have to re-run hosted auth for accounts that exist there.
 */
export async function importAccountsFromUnipile(): Promise<{ imported: number; error?: string }> {
  const user = await requireAdmin();
  try {
    const res = await listAccounts({ limit: 250 });
    const linkedin = res.items.filter((a) => a.type === "LINKEDIN");
    let imported = 0;
    for (const a of linkedin) {
      const status = mapStatus(a.sources?.find((s) => s.status)?.status);
      await db
        .insert(linkedinAccounts)
        .values({
          unipileAccountId: a.id,
          name: a.name || a.id,
          status,
          ownerUserId: user.id,
        })
        .onConflictDoUpdate({
          target: linkedinAccounts.unipileAccountId,
          set: { name: a.name || a.id, status },
        });
      imported++;
    }
    revalidatePath("/accounts");
    revalidatePath("/");
    return { imported };
  } catch (e) {
    if (e instanceof UnipileError) return { imported: 0, error: `Unipile error ${e.status}` };
    return { imported: 0, error: e instanceof Error ? e.message : "Import failed" };
  }
}

export async function updateAccountCaps(
  accountId: string,
  caps: {
    dailyInviteCap?: number;
    dailyMessageCap?: number;
    dailyInmailCap?: number;
    dailyEnrichCap?: number;
    autoEnrichDailyCap?: number;
  },
): Promise<void> {
  await requireAdmin();
  await db.update(linkedinAccounts).set(caps).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Toggle proactive daily enrichment for an account. Turning it on runs a batch now. */
export async function setAccountAutoEnrich(accountId: string, enabled: boolean): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ autoEnrich: enabled })
    .where(eq(linkedinAccounts.id, accountId));
  if (enabled) await enqueueJob("auto-enrich", {});
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Kick off a full connection sync for an account (chunked via QStash). Admin only. */
export async function startSync(accountId: string): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ syncStatus: "running", syncCursor: null })
    .where(eq(linkedinAccounts.id, accountId));
  await enqueueJob("sync", { accountId });
  revalidatePath("/accounts");
}

/** Assign (or clear) the member who owns an account. Admin only. */
export async function assignAccountOwner(
  accountId: string,
  userId: string | null,
): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ ownerUserId: userId })
    .where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function removeAccount(accountId: string): Promise<void> {
  await requireAdmin();
  await db.delete(linkedinAccounts).where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath("/");
}

/* -------------------------------------------------------------------------- */
/* Content library (per account)                                               */
/* -------------------------------------------------------------------------- */

const CONTENT_STAGES = [
  "connection_request",
  "welcome",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
] as const;

/** Title-case the last slug of a URL path, e.g. /blog/next-gen-lead-gen/ → "Next Gen Lead Gen". */
function titleFromUrl(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segs[segs.length - 1] ?? "";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

/** First path segment, e.g. /blog/foo → "blog". */
function sectionFromUrl(url: string): string | null {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    return segs[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchSitemapText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MachintelBot)" } });
  if (!res.ok) throw new Error(`Sitemap fetch failed (${res.status})`);
  return res.text();
}

/** Crawl a sitemap (following one level of sitemap-index) into a de-duped URL list. */
async function crawlSitemap(url: string, depth = 0): Promise<string[]> {
  const xml = await fetchSitemapText(url);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (/<sitemapindex/i.test(xml) && depth < 2) {
    const all: string[] = [];
    for (const child of locs.slice(0, 50)) {
      try {
        all.push(...(await crawlSitemap(child, depth + 1)));
      } catch {
        /* skip a bad child sitemap */
      }
    }
    return [...new Set(all)];
  }
  return [...new Set(locs.filter((u) => /^https?:\/\//i.test(u)))];
}

export async function setSitemapUrl(accountId: string, url: string): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ sitemapUrl: url.trim() || null })
    .where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
}

export async function setContentSections(accountId: string, sections: string[]): Promise<void> {
  await requireAdmin();
  await db
    .update(linkedinAccounts)
    .set({ contentSections: sections })
    .where(eq(linkedinAccounts.id, accountId));
  revalidatePath("/accounts");
}

/** Fetch the account's sitemap, store every URL as a content asset (idempotent). */
export async function importContentFromSitemap(
  accountId: string,
): Promise<{ imported: number; sections: { section: string; n: number }[]; error?: string }> {
  await requireAdmin();
  const [acct] = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  if (!acct?.sitemapUrl) return { imported: 0, sections: [], error: "Set a sitemap URL first." };

  try {
    const urls = await crawlSitemap(acct.sitemapUrl);
    const values = urls
      .map((u) => ({ accountId, url: u, section: sectionFromUrl(u), title: titleFromUrl(u) }))
      .filter((v) => v.section); // skip the bare homepage
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500);
      await db
        .insert(contentAssets)
        .values(chunk)
        .onConflictDoUpdate({
          target: [contentAssets.accountId, contentAssets.url],
          set: { title: sql`excluded.title`, section: sql`excluded.section` },
        });
    }
    const sections = await db
      .select({ section: contentAssets.section, n: count() })
      .from(contentAssets)
      .where(eq(contentAssets.accountId, accountId))
      .groupBy(contentAssets.section);
    revalidatePath("/accounts");
    return {
      imported: values.length,
      sections: sections
        .map((s) => ({ section: s.section ?? "", n: Number(s.n) }))
        .filter((s) => s.section)
        .sort((a, b) => b.n - a.n),
    };
  } catch (e) {
    return { imported: 0, sections: [], error: e instanceof Error ? e.message : "Import failed" };
  }
}

/** Section counts for the content-library dialog (without re-importing). */
export async function getContentSections(
  accountId: string,
): Promise<{ section: string; n: number }[]> {
  await requireAdmin();
  const rows = await db
    .select({ section: contentAssets.section, n: count() })
    .from(contentAssets)
    .where(eq(contentAssets.accountId, accountId))
    .groupBy(contentAssets.section);
  return rows
    .map((s) => ({ section: s.section ?? "", n: Number(s.n) }))
    .filter((s) => s.section)
    .sort((a, b) => b.n - a.n);
}

/* -------------------------------------------------------------------------- */
/* Per-account prompt set (Phase 2)                                            */
/* -------------------------------------------------------------------------- */

export async function getAccountPromptSet(
  accountId: string,
): Promise<{ stage: string; aiPromptId: string | null; shareContent: boolean }[]> {
  await requireAdmin();
  const rows = await db
    .select({
      stage: accountPromptSets.stage,
      aiPromptId: accountPromptSets.aiPromptId,
      shareContent: accountPromptSets.shareContent,
    })
    .from(accountPromptSets)
    .where(eq(accountPromptSets.accountId, accountId));
  return rows;
}

/** All AI prompts (id + name) for the per-account prompt-set picker. Admin only. */
export async function listAiPromptsForPicker(): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  return db
    .select({ id: aiPrompts.id, name: aiPrompts.name })
    .from(aiPrompts)
    .orderBy(desc(aiPrompts.createdAt));
}

export async function saveAccountPromptSet(
  accountId: string,
  entries: { stage: string; aiPromptId: string | null; shareContent: boolean }[],
): Promise<void> {
  await requireAdmin();
  for (const e of entries) {
    if (!CONTENT_STAGES.includes(e.stage as (typeof CONTENT_STAGES)[number])) continue;
    await db
      .insert(accountPromptSets)
      .values({
        accountId,
        stage: e.stage,
        aiPromptId: e.aiPromptId,
        shareContent: e.shareContent,
      })
      .onConflictDoUpdate({
        target: [accountPromptSets.accountId, accountPromptSets.stage],
        set: { aiPromptId: e.aiPromptId, shareContent: e.shareContent },
      });
  }
  revalidatePath("/accounts");
}
