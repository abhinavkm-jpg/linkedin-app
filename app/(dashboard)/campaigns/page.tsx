import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignCreateDialog } from "@/components/campaign-create-dialog";
import { db } from "@/db";
import { campaigns, linkedinAccounts, enrollments } from "@/db/schema";

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
    accounts = await db
      .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
      .from(linkedinAccounts)
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
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No campaigns yet.{" "}
                {accounts.length === 0 && "Connect an account first."}
              </p>
              {accounts.length > 0 && <CampaignCreateDialog accounts={accounts} />}
            </CardContent>
          </Card>
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
