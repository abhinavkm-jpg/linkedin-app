import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyCounters, linkedinAccounts } from "@/db/schema";

export type SendKind = "invite" | "message" | "inmail" | "enrich";

/** Workspace-wide daily ceiling on profile-enrichment API calls. */
export const GLOBAL_DAILY_ENRICH_CAP = 200;

const COLUMN: Record<SendKind, "invitesSent" | "messagesSent" | "inmailsSent" | "enrichments"> =
  {
    invite: "invitesSent",
    message: "messagesSent",
    inmail: "inmailsSent",
    enrich: "enrichments",
  };

const CAP_COLUMN: Record<SendKind, keyof typeof linkedinAccounts.$inferSelect> = {
  invite: "dailyInviteCap",
  message: "dailyMessageCap",
  inmail: "dailyInmailCap",
  enrich: "dailyEnrichCap",
};

/** Current day as YYYY-MM-DD (UTC) — the bucket key for counters. */
export function todayStr(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Read (creating if needed) today's counter row for an account. */
export async function getTodayCounters(accountId: string, day = todayStr()) {
  const rows = await db
    .insert(dailyCounters)
    .values({ accountId, day })
    .onConflictDoNothing({ target: [dailyCounters.accountId, dailyCounters.day] })
    .returning();
  if (rows[0]) return rows[0];

  const existing = await db
    .select()
    .from(dailyCounters)
    .where(and(eq(dailyCounters.accountId, accountId), eq(dailyCounters.day, day)))
    .limit(1);
  return existing[0];
}

export interface QuotaStatus {
  used: number;
  cap: number;
  remaining: number;
}

/** Snapshot of all quotas for an account today (for dashboard gauges). */
export async function getQuotaStatus(
  accountId: string,
): Promise<Record<SendKind, QuotaStatus>> {
  const [counter] = await Promise.all([getTodayCounters(accountId)]);
  const acctRows = await db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.id, accountId))
    .limit(1);
  const acct = acctRows[0];

  const build = (kind: SendKind): QuotaStatus => {
    const used = (counter?.[COLUMN[kind]] as number) ?? 0;
    const cap = (acct?.[CAP_COLUMN[kind]] as number) ?? 0;
    return { used, cap, remaining: Math.max(0, cap - used) };
  };

  return {
    invite: build("invite"),
    message: build("message"),
    inmail: build("inmail"),
    enrich: build("enrich"),
  };
}

/** Whether an action of `kind` is under today's cap. */
export async function canSend(accountId: string, kind: SendKind): Promise<boolean> {
  const status = await getQuotaStatus(accountId);
  return status[kind].remaining > 0;
}

/** Total enrichment API calls used today across all accounts (workspace-wide). */
export async function enrichmentsToday(day = todayStr()): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyCounters.enrichments}), 0)::int` })
    .from(dailyCounters)
    .where(eq(dailyCounters.day, day));
  return Number(rows[0]?.total ?? 0);
}

/**
 * Whether we may enrich right now: under the per-account daily cap AND under
 * the workspace-wide global cap (200/day). Used to gate send-time enrichment.
 */
export async function canEnrichNow(accountId: string): Promise<boolean> {
  if (!(await canSend(accountId, "enrich"))) return false;
  return (await enrichmentsToday()) < GLOBAL_DAILY_ENRICH_CAP;
}

/**
 * Atomically increment today's counter. Returns the new value for `kind`.
 * Uses INSERT ... ON CONFLICT DO UPDATE so concurrent workers can't race.
 */
export async function incrementCounter(
  accountId: string,
  kind: SendKind,
  amount = 1,
  day = todayStr(),
): Promise<number> {
  const col = COLUMN[kind];
  const rows = await db
    .insert(dailyCounters)
    .values({ accountId, day, [col]: amount })
    .onConflictDoUpdate({
      target: [dailyCounters.accountId, dailyCounters.day],
      set: { [col]: sql`${dailyCounters[col]} + ${amount}` },
    })
    .returning();
  return (rows[0]?.[col] as number) ?? amount;
}

/**
 * Human-like spacing between consecutive sends from the same account. Unipile
 * warns against fixed intervals, so we pace one send per account every random
 * 2–10 minutes.
 */
export const SEND_GAP_MIN_SECONDS = 120;
export const SEND_GAP_MAX_SECONDS = 600;

export function randomSendGapSeconds(
  min = SEND_GAP_MIN_SECONDS,
  max = SEND_GAP_MAX_SECONDS,
): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A timestamp `randomSendGapSeconds` in the future — the account's next-send cooldown. */
export function nextSendCooldown(): Date {
  return new Date(Date.now() + randomSendGapSeconds() * 1000);
}
