import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
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
import type { LinkedinAccount } from "@/db/schema";

export async function getAccounts(): Promise<LinkedinAccount[]> {
  return db.select().from(linkedinAccounts).orderBy(desc(linkedinAccounts.createdAt));
}

export interface AccountWithStats extends LinkedinAccount {
  connectionCount: number;
  quotas: Record<SendKind, QuotaStatus>;
}

export async function getAccountsWithStats(): Promise<AccountWithStats[]> {
  const accounts = await getAccounts();

  const counts = await db
    .select({ accountId: connections.accountId, n: count() })
    .from(connections)
    .groupBy(connections.accountId);
  const countMap = new Map(counts.map((c) => [c.accountId, Number(c.n)]));

  const withStats = await Promise.all(
    accounts.map(async (a) => ({
      ...a,
      connectionCount: countMap.get(a.id) ?? 0,
      quotas: await getQuotaStatus(a.id),
    })),
  );
  return withStats;
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = todayStr();
  const todayStart = `${today}T00:00:00.000Z`;

  const [
    [{ totalConnections }],
    [{ activeCampaigns }],
    [{ enrolledActive }],
    [{ invitesToday }],
    [{ messagesToday }],
    [{ unreadChats }],
  ] = await Promise.all([
    db.select({ totalConnections: count() }).from(connections),
    db
      .select({ activeCampaigns: count() })
      .from(campaigns)
      .where(eq(campaigns.status, "active")),
    db
      .select({ enrolledActive: count() })
      .from(enrollments)
      .where(
        sql`${enrollments.state} not in ('completed','failed','skipped','replied')`,
      ),
    db
      .select({ invitesToday: count() })
      .from(activities)
      .where(
        and(
          eq(activities.type, "invite"),
          eq(activities.status, "success"),
          gte(activities.createdAt, new Date(todayStart)),
        ),
      ),
    db
      .select({ messagesToday: count() })
      .from(activities)
      .where(
        and(
          eq(activities.type, "message"),
          eq(activities.status, "success"),
          gte(activities.createdAt, new Date(todayStart)),
        ),
      ),
    db
      .select({ unreadChats: count() })
      .from(chats)
      .where(gte(chats.unreadCount, 1)),
  ]);

  // Replies today = chats whose last inbound landed today (approximation).
  const [{ repliesToday }] = await db
    .select({ repliesToday: count() })
    .from(chats)
    .where(gte(chats.lastMessageAt, new Date(todayStart)));

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
