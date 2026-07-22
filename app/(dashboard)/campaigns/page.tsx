import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignCreateDialog } from "@/components/campaign-create-dialog";
import { EmptyState } from "@/components/empty-state";
import { Megaphone } from "lucide-react";
import { db } from "@/db";
import { campaigns, linkedinAccounts, enrollments } from "@/db/schema";
import { auth } from "@/auth";
import { getAccessibleAccountIds, accountScope } from "@/lib/access";

export const dynamic = "force-dynamic";

const statusTone: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "outline",
  paused: "secondary",
  completed: "secondary",
  archived: "destructive",
};

export default async function CampaignsPage() {
  let rows: {
    id: string;
    name: string;
    status: string;
    accountName: string;
    enrolled: number;
  }[] = [];
  let accounts: { id: string; name: string }[] = [];
  let error: string | null = null;

  try {
    const session = await auth();
    const accessibleIds = await getAccessibleAccountIds(session!.user);

    accounts = await db
      .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
      .from(linkedinAccounts)
      .where(accountScope(linkedinAccounts.id, accessibleIds))
      .orderBy(desc(linkedinAccounts.createdAt));

    const camps = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        accountName: linkedinAccounts.name,
      })
      .from(campaigns)
      .leftJoin(linkedinAccounts, eq(campaigns.accountId, linkedinAccounts.id))
      .where(accountScope(campaigns.accountId, accessibleIds))
      .orderBy(desc(campaigns.createdAt));

    const counts = await db
      .select({ campaignId: enrollments.campaignId, n: count() })
      .from(enrollments)
      .groupBy(enrollments.campaignId);
    const countMap = new Map(counts.map((c) => [c.campaignId, Number(c.n)]));

    rows = camps.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      accountName: c.accountName ?? "—",
      enrolled: countMap.get(c.id) ?? 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load campaigns";
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Sequences of invites and messages, with automatic follow-ups and reply-stop."
      >
        <CampaignCreateDialog accounts={accounts} />
      </PageHeader>
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description={
              accounts.length === 0
                ? "Connect a LinkedIn account first, then create a campaign to start reaching out."
                : "Create a campaign, set your ICP, enroll connections, and start the sequence."
            }
          >
            {accounts.length > 0 && <CampaignCreateDialog accounts={accounts} />}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <CardTitle className="truncate text-base">{c.name}</CardTitle>
                    <Badge variant={statusTone[c.status] ?? "outline"}>{c.status}</Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>{c.accountName}</p>
                    <p>{c.enrolled.toLocaleString()} enrolled</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
