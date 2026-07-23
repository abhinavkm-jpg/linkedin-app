import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignCreateDialog } from "@/components/campaign-create-dialog";
import { EmptyState } from "@/components/empty-state";
import { Megaphone, User, ListOrdered, Zap, Bot, Users, MessageSquare, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { campaigns, linkedinAccounts, enrollments, sequenceSteps } from "@/db/schema";
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

// Colored top accent per status.
const statusAccent: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-slate-300 dark:bg-slate-600",
  paused: "bg-amber-400",
  completed: "bg-blue-500",
  archived: "bg-rose-400",
};

// Segment colors for the enrollment-state distribution bar (match the funnel).
const SEG: Record<string, string> = {
  queued: "bg-slate-400",
  enriching: "bg-cyan-500",
  messaging: "bg-blue-500",
  awaiting_accept: "bg-amber-500",
  accepted: "bg-blue-500",
  in_followup: "bg-violet-500",
  messaged: "bg-indigo-500",
  replied: "bg-emerald-500",
  completed: "bg-emerald-500",
  skipped: "bg-slate-300",
  failed: "bg-rose-500",
  paused: "bg-amber-400",
};

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  accountName: string;
  autoEnroll: boolean;
  aiReplyDecision: boolean;
  steps: number;
  enrolled: number;
  replied: number;
  completed: number;
  states: { state: string; n: number }[];
}

export default async function CampaignsPage() {
  let rows: CampaignRow[] = [];
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
        autoEnroll: campaigns.autoEnroll,
        aiReplyDecision: campaigns.aiReplyDecision,
      })
      .from(campaigns)
      .leftJoin(linkedinAccounts, eq(campaigns.accountId, linkedinAccounts.id))
      .where(accountScope(campaigns.accountId, accessibleIds))
      .orderBy(desc(campaigns.createdAt));

    const [stateRows, stepRows] = await Promise.all([
      db
        .select({ campaignId: enrollments.campaignId, state: enrollments.state, n: count() })
        .from(enrollments)
        .groupBy(enrollments.campaignId, enrollments.state),
      db
        .select({ campaignId: sequenceSteps.campaignId, n: count() })
        .from(sequenceSteps)
        .groupBy(sequenceSteps.campaignId),
    ]);

    const stateMap = new Map<string, { state: string; n: number }[]>();
    for (const r of stateRows) {
      const arr = stateMap.get(r.campaignId) ?? [];
      arr.push({ state: r.state, n: Number(r.n) });
      stateMap.set(r.campaignId, arr);
    }
    const stepMap = new Map(stepRows.map((r) => [r.campaignId, Number(r.n)]));

    rows = camps.map((c) => {
      const states = stateMap.get(c.id) ?? [];
      const enrolled = states.reduce((sum, s) => sum + s.n, 0);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        accountName: c.accountName ?? "—",
        autoEnroll: c.autoEnroll,
        aiReplyDecision: c.aiReplyDecision,
        steps: stepMap.get(c.id) ?? 0,
        enrolled,
        replied: states.find((s) => s.state === "replied")?.n ?? 0,
        completed: states.find((s) => s.state === "completed")?.n ?? 0,
        states,
      };
    });
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
              <Link key={c.id} href={`/campaigns/${c.id}`} className="group">
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
                  <CardContent className="space-y-3">
                    {/* KPI row */}
                    <div className="grid grid-cols-3 gap-2">
                      <Kpi icon={Users} label="Enrolled" value={c.enrolled} />
                      <Kpi icon={MessageSquare} label="Replied" value={c.replied} />
                      <Kpi icon={CheckCircle2} label="Done" value={c.completed} />
                    </div>

                    {/* State distribution bar */}
                    {c.enrolled > 0 && (
                      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted">
                        {c.states
                          .filter((s) => s.n > 0)
                          .map((s) => (
                            <div
                              key={s.state}
                              className={SEG[s.state] ?? "bg-slate-400"}
                              style={{ width: `${(s.n / c.enrolled) * 100}%` }}
                            />
                          ))}
                      </div>
                    )}

                    {/* Meta chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <Chip icon={ListOrdered}>
                        {c.steps} {c.steps === 1 ? "step" : "steps"}
                      </Chip>
                      {c.autoEnroll && <Chip icon={Zap}>Auto-enroll</Chip>}
                      {c.aiReplyDecision && <Chip icon={Bot}>AI replies</Chip>}
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

function Chip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}
