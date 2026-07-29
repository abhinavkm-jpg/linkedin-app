import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, count, isNotNull, eq } from "drizzle-orm";
import { ChevronLeft, Users, MessageSquare, Sparkles, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AccountCard } from "@/components/account-card";
import { CapsEditor } from "@/components/caps-editor";
import { TemplatesManager } from "@/components/templates-manager";
import { db } from "@/db";
import { users, aiPrompts, sequenceSteps, contentAssets } from "@/db/schema";
import { getAccountsWithStats } from "@/lib/data";
import { auth } from "@/auth";
import { isAdmin, ownerVisibilityScope } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const user = session!.user;
  if (!isAdmin(user)) notFound();

  const accounts = await getAccountsWithStats(user);
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();

  const pScope = await ownerVisibilityScope(aiPrompts.ownerUserId, user);
  const [members, prompts, promptUse, [{ assetCount }]] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    db.select().from(aiPrompts).where(pScope).orderBy(desc(aiPrompts.createdAt)),
    db
      .select({ id: sequenceSteps.aiPromptId, n: count() })
      .from(sequenceSteps)
      .where(isNotNull(sequenceSteps.aiPromptId))
      .groupBy(sequenceSteps.aiPromptId),
    db
      .select({ assetCount: count() })
      .from(contentAssets)
      .where(eq(contentAssets.accountId, id)),
  ]);
  const promptUsage = Object.fromEntries(promptUse.map((r) => [r.id as string, Number(r.n)]));

  const stats = [
    { icon: Users, label: "Connections synced", value: account.connectionCount },
    { icon: FileText, label: "Content assets", value: Number(assetCount) },
    { icon: MessageSquare, label: "Sent today", value: account.quotas.message.used + account.quotas.invite.used },
    { icon: Sparkles, label: "Enriched today", value: account.quotas.autoEnrich.used + account.quotas.enrich.used },
  ];

  return (
    <>
      <PageHeader title={`${account.name} — settings`} description="Limits, content library, prompt set, and prompts for this account.">
        <Button render={<Link href="/accounts" />} size="sm" variant="outline">
          <ChevronLeft className="h-4 w-4" /> Accounts
        </Button>
      </PageHeader>

      <div className="space-y-8 p-6">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-semibold tabular-nums">{s.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Overview & per-account controls (owner, sync, auto-enrich, content library, prompt set) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Account &amp; automation
          </h2>
          <AccountCard account={account} isAdmin members={members} settingsLink={false} />
        </section>

        {/* Daily limits */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Daily limits
          </h2>
          <Card>
            <CardContent className="py-4">
              <CapsEditor
                accountId={account.id}
                initial={{
                  dailyInviteCap: account.dailyInviteCap,
                  dailyMessageCap: account.dailyMessageCap,
                  dailyInmailCap: account.dailyInmailCap,
                  dailyEnrichCap: account.dailyEnrichCap,
                  autoEnrichDailyCap: account.autoEnrichDailyCap,
                }}
              />
            </CardContent>
          </Card>
        </section>

        {/* Prompts — view & edit (including the default) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            AI prompts — view &amp; edit
          </h2>
          <p className="text-xs text-muted-foreground">
            These prompts (including the default) power the voices you assign per stage in the
            account&apos;s prompt set above.
          </p>
          <TemplatesManager
            promptsOnly
            templates={[]}
            prompts={prompts}
            promptUsage={promptUsage}
            currentUserId={user.id}
            isAdmin
          />
        </section>
      </div>
    </>
  );
}
