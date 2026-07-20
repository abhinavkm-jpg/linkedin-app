import Link from "next/link";
import { Contact, Megaphone, MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { QuotaGauge } from "@/components/quota-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAccountsWithStats, getDashboardStats } from "@/lib/data";
import { accountStatusTone } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getAccountsWithStats>> = [];
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let error: string | null = null;

  try {
    [data, stats] = await Promise.all([getAccountsWithStats(), getDashboardStats()]);
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
            <StatCard icon={Contact} label="Connections" value={stats.totalConnections} />
            <StatCard icon={Megaphone} label="Active campaigns" value={stats.activeCampaigns} />
            <StatCard icon={Send} label="Sent today" value={stats.invitesToday + stats.messagesToday} />
            <StatCard icon={MessageSquare} label="Unread replies" value={stats.unreadChats} />
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
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No LinkedIn accounts connected yet.
                </p>
                <Button render={<Link href="/accounts" />} size="sm">
                  Connect an account
                </Button>
              </CardContent>
            </Card>
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

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
