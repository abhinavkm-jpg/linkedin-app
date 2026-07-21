import "server-only";
import { and, count, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  connections,
  enrollments,
  linkedinAccounts,
  campaigns,
  chats,
} from "@/db/schema";
import { getQuotaStatus, todayStr, type QuotaStatus, type SendKind } from "@/lib/rate-limit";
import { getAccessibleAccountIds, accountScope, type AccessUser } from "@/lib/access";
import type { LinkedinAccount } from "@/db/schema";

export async function getAccounts(ids: string[] | null): Promise<LinkedinAccount[]> {
  const where = accountScope(linkedinAccounts.id, ids);
  return db
    .select()
    .from(linkedinAccounts)
    .where(where)
    .orderBy(desc(linkedinAccounts.createdAt));
}

export interface AccountWithStats extends LinkedinAccount {
  connectionCount: number;
  quotas: Record<SendKind, QuotaStatus>;
}

export async function getAccountsWithStats(user: AccessUser): Promise<AccountWithStats[]> {
  const ids = await getAccessibleAccountIds(user);
  const accounts = await getAccounts(ids);

  const counts = await db
    .select({ accountId: connections.accountId, n: count() })
    .from(connections)
    .groupBy(connections.accountId);
  const countMap = new Map(counts.map((c) => [c.accountId, Number(c.n)]));

  return Promise.all(
    accounts.map(async (a) => ({
      ...a,
      connectionCount: countMap.get(a.id) ?? 0,
      quotas: await getQuotaStatus(a.id),
    })),
  );
}

export interface DashboardStats {
  totalConnections: number;
  activeCampaigns: number;
  enrolledActive: number;
  repliesToday: number;
  invitesToday: number;
  messagesToday: number;
  unreadChats: number;
}

/** Combine a base condition with the account scope (dropping undefined). */
function scoped(base: SQL | undefined, scope: SQL | undefined): SQL | undefined {
  const parts = [base, scope].filter(Boolean) as SQL[];
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export async function getDashboardStats(user: AccessUser): Promise<DashboardStats> {
  const ids = await getAccessibleAccountIds(user);
  const today = todayStr();
  const todayStart = new Date(`${today}T00:00:00.000Z`);

  const connScope = accountScope(connections.accountId, ids);
  const campScope = accountScope(campaigns.accountId, ids);
  const enrScope = accountScope(enrollments.accountId, ids);
  const actScope = accountScope(activities.accountId, ids);
  const chatScope = accountScope(chats.accountId, ids);

  const [
    [{ totalConnections }],
    [{ activeCampaigns }],
    [{ enrolledActive }],
    [{ invitesToday }],
    [{ messagesToday }],
    [{ unreadChats }],
    [{ repliesToday }],
  ] = await Promise.all([
    db.select({ totalConnections: count() }).from(connections).where(connScope),
    db
      .select({ activeCampaigns: count() })
      .from(campaigns)
      .where(scoped(eq(campaigns.status, "active"), campScope)),
    db
      .select({ enrolledActive: count() })
      .from(enrollments)
      .where(
        scoped(sql`${enrollments.state} not in ('completed','failed','skipped','replied')`, enrScope),
      ),
    db
      .select({ invitesToday: count() })
      .from(activities)
      .where(
        scoped(
          and(
            eq(activities.type, "invite"),
            eq(activities.status, "success"),
            gte(activities.createdAt, todayStart),
          ),
          actScope,
        ),
      ),
    db
      .select({ messagesToday: count() })
      .from(activities)
      .where(
        scoped(
          and(
            eq(activities.type, "message"),
            eq(activities.status, "success"),
            gte(activities.createdAt, todayStart),
          ),
          actScope,
        ),
      ),
    db
      .select({ unreadChats: count() })
      .from(chats)
      .where(scoped(gte(chats.unreadCount, 1), chatScope)),
    db
      .select({ repliesToday: count() })
      .from(chats)
      .where(scoped(gte(chats.lastMessageAt, todayStart), chatScope)),
  ]);

  return {
    totalConnections: Number(totalConnections),
    activeCampaigns: Number(activeCampaigns),
    enrolledActive: Number(enrolledActive),
    repliesToday: Number(repliesToday),
    invitesToday: Number(invitesToday),
    messagesToday: Number(messagesToday),
    unreadChats: Number(unreadChats),
  };
}
