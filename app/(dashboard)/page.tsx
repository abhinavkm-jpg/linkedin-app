import Link from "next/link";
import { Contact, Megaphone, MessageSquare, Send, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuotaGauge } from "@/components/quota-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAccountsWithStats, getDashboardStats } from "@/lib/data";
import { accountStatusTone } from "@/lib/status";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;

  let data: Awaited<ReturnType<typeof getAccountsWithStats>> = [];
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let error: string | null = null;

  try {
    [data, stats] = await Promise.all([getAccountsWithStats(user), getDashboardStats(user)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Outreach activity and account health at a glance." />
      <div className="space-y-6 p-6">
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">
              Could not load data: {error}. Check your database configuration in the
              environment.
            </CardContent>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Contact} label="Connections" value={stats.totalConnections} tone="blue" />
            <StatCard icon={Megaphone} label="Active campaigns" value={stats.activeCampaigns} tone="violet" />
            <StatCard
              icon={Send}
              label="Sent today"
              value={stats.invitesToday + stats.messagesToday}
              tone="emerald"
            />
            <StatCard icon={MessageSquare} label="Unread replies" value={stats.unreadChats} tone="amber" />
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Accounts &amp; daily quota
            </h2>
            <Button render={<Link href="/accounts" />} size="sm" variant="outline">
              Manage accounts
            </Button>
          </div>

          {data.length === 0 && !error ? (
            <EmptyState
              icon={Users}
              title="No accounts connected yet"
              description="Connect or import a LinkedIn account to start syncing connections and running campaigns."
            >
              <Button render={<Link href="/accounts" />} size="sm">
                Connect an account
              </Button>
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.map((a) => (
                <Card key={a.id}>
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{a.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {a.connectionCount.toLocaleString()} connections
                      </p>
                    </div>
                    <Badge variant={accountStatusTone(a.status)}>{a.status}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <QuotaGauge label="Invites" used={a.quotas.invite.used} cap={a.quotas.invite.cap} />
                    <QuotaGauge label="Messages" used={a.quotas.message.used} cap={a.quotas.message.cap} />
                    <QuotaGauge label="Enrichments" used={a.quotas.enrich.used} cap={a.quotas.enrich.cap} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20",
  violet: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-5">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ring-4 ${TONES[tone] ?? TONES.blue}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {value.toLocaleString()}
          </p>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
