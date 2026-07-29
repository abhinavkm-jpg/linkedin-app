import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, count, eq } from "drizzle-orm";
import {
  ChevronLeft,
  Users,
  MessageSquare,
  Sparkles,
  FileText,
  Gauge,
  Library,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AccountAvatar } from "@/components/account-avatar";
import { AccountCard } from "@/components/account-card";
import { CapsEditor } from "@/components/caps-editor";
import { PromptSetPanel } from "@/components/prompt-set-panel";
import { ContentLibraryPanel } from "@/components/content-library-panel";
import { db } from "@/db";
import { users, contentAssets, accountPromptSets } from "@/db/schema";
import { getAccountsWithStats } from "@/lib/data";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";

export const dynamic = "force-dynamic";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

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

  const [members, promptSet, sectionRows, assets] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    db
      .select({
        stage: accountPromptSets.stage,
        promptText: accountPromptSets.promptText,
        shareContent: accountPromptSets.shareContent,
      })
      .from(accountPromptSets)
      .where(eq(accountPromptSets.accountId, id)),
    db
      .select({ section: contentAssets.section, n: count() })
      .from(contentAssets)
      .where(eq(contentAssets.accountId, id))
      .groupBy(contentAssets.section),
    db
      .select({ title: contentAssets.title, url: contentAssets.url, section: contentAssets.section })
      .from(contentAssets)
      .where(eq(contentAssets.accountId, id))
      .orderBy(desc(contentAssets.createdAt))
      .limit(500),
  ]);

  const sections = sectionRows
    .map((s) => ({ section: s.section ?? "", n: Number(s.n) }))
    .filter((s) => s.section)
    .sort((a, b) => b.n - a.n);
  const assetPreview = assets.map((a) => ({
    title: a.title ?? "",
    url: a.url,
    section: a.section ?? "",
  }));
  const assetCount = sections.reduce((sum, s) => sum + s.n, 0);

  const stats = [
    { icon: Users, label: "Connections synced", value: account.connectionCount, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { icon: FileText, label: "Content assets", value: assetCount, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
    {
      icon: MessageSquare,
      label: "Sent today",
      value: account.quotas.message.used + account.quotas.invite.used,
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Sparkles,
      label: "Enriched today",
      value: account.quotas.autoEnrich.used + account.quotas.enrich.used,
      tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <>
      <PageHeader
        title={`${account.name} — settings`}
        description="Everything for this account: limits, DM prompts, and the content library."
      >
        <Button render={<Link href="/accounts" />} size="sm" variant="outline">
          <ChevronLeft className="h-4 w-4" /> Accounts
        </Button>
      </PageHeader>

      <div className="space-y-8 p-6">
        {/* Identity hero */}
        <div className="flex items-center gap-4 rounded-xl border bg-gradient-to-r from-primary/5 to-transparent p-4">
          <AccountAvatar name={account.name} className="h-14 w-14 text-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight">{account.name}</h2>
            <p className="text-sm text-muted-foreground">
              {account.connectionCount.toLocaleString()} connections · status {account.status}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 py-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{s.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Section icon={Zap} title="Account & automation" description="Owner, connection sync, and daily auto-enrichment.">
          <AccountCard account={account} isAdmin members={members} settingsLink={false} />
        </Section>

        <Section icon={Gauge} title="Daily limits" description="Caps that protect the account from over-sending.">
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
        </Section>

        <Section
          icon={MessageSquare}
          title="DM prompts"
          description="A separate, editable prompt for each stage of the sequence. Preview a sample before saving."
        >
          <PromptSetPanel
            accountId={account.id}
            accountName={account.name}
            initial={promptSet}
          />
        </Section>

        <Section
          icon={Library}
          title="Content library"
          description="Sync articles from this account's sitemap and choose which sections the AI may share in follow-ups."
        >
          <ContentLibraryPanel
            accountId={account.id}
            sitemapUrl={account.sitemapUrl}
            contentSections={account.contentSections}
            sections={sections}
            assets={assetPreview}
          />
        </Section>
      </div>
    </>
  );
}
