import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { CommentCampaignCreateDialog } from "@/components/comment-campaign-create-dialog";
import { MessagesSquare, User, FileText, Send } from "lucide-react";
import { db } from "@/db";
import { commentCampaigns, commentCampaignPosts, commentDmTargets, linkedinAccounts } from "@/db/schema";
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

const statusAccent: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-slate-300 dark:bg-slate-600",
  paused: "bg-amber-400",
  completed: "bg-blue-500",
  archived: "bg-rose-400",
};

interface Row {
  id: string;
  name: string;
  status: string;
  accountName: string;
  posts: number;
  sent: number;
}

export default async function CommentDmPage() {
  let rows: Row[] = [];
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
        id: commentCampaigns.id,
        name: commentCampaigns.name,
        status: commentCampaigns.status,
        accountName: linkedinAccounts.name,
      })
      .from(commentCampaigns)
      .leftJoin(linkedinAccounts, eq(commentCampaigns.accountId, linkedinAccounts.id))
      .where(accountScope(commentCampaigns.accountId, accessibleIds))
      .orderBy(desc(commentCampaigns.createdAt));

    const [postRows, sentRows] = await Promise.all([
      db
        .select({ campaignId: commentCampaignPosts.campaignId, n: count() })
        .from(commentCampaignPosts)
        .groupBy(commentCampaignPosts.campaignId),
      db
        .select({ campaignId: commentDmTargets.campaignId, n: count() })
        .from(commentDmTargets)
        .where(eq(commentDmTargets.state, "sent"))
        .groupBy(commentDmTargets.campaignId),
    ]);
    const postMap = new Map(postRows.map((r) => [r.campaignId, Number(r.n)]));
    const sentMap = new Map(sentRows.map((r) => [r.campaignId, Number(r.n)]));

    rows = camps.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      accountName: c.accountName ?? "—",
      posts: postMap.get(c.id) ?? 0,
      sent: sentMap.get(c.id) ?? 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load comment campaigns";
  }

  return (
    <>
      <PageHeader
        title="Comment DMs"
        description="Auto-message people who comment on selected posts. Sends share your account's daily caps with campaigns."
      >
        <CommentCampaignCreateDialog accounts={accounts} />
      </PageHeader>
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No comment campaigns yet"
            description={
              accounts.length === 0
                ? "Connect a LinkedIn account first, then create a comment campaign."
                : "Create a campaign, pick posts, choose a template, and start reaching commenters."
            }
          >
            {accounts.length > 0 && <CommentCampaignCreateDialog accounts={accounts} />}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <Link key={c.id} href={`/comment-dm/${c.id}`} className="group">
                <Card className="relative h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <div className={`absolute inset-x-0 top-0 h-1 ${statusAccent[c.status] ?? "bg-slate-300"}`} />
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pt-5">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base group-hover:text-primary">{c.name}</CardTitle>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.accountName}</span>
                      </p>
                    </div>
                    <Badge variant={statusTone[c.status] ?? "outline"} className="shrink-0 capitalize">
                      {c.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      <Kpi icon={FileText} label="Posts" value={c.posts} />
                      <Kpi icon={Send} label="Reached" value={c.sent} />
                    </div>
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

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
      <p className="text-lg font-semibold tabular-nums leading-none">{value.toLocaleString()}</p>
      <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
    </div>
  );
}
