import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IntegrationsForm } from "@/components/integrations-form";
import { TeamManager, type Member } from "@/components/team-manager";
import { CapsEditor } from "@/components/caps-editor";
import { SchedulesCard } from "@/components/schedules-card";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, linkedinAccounts } from "@/db/schema";
import { getSettingsStatus } from "@/lib/settings";
import { listSchedules, type ScheduleInfo } from "@/lib/qstash";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const appUrl = env.APP_URL;

  let team: Member[] = [];
  let accounts: (typeof linkedinAccounts.$inferSelect)[] = [];
  let status = {
    unipileDsn: "",
    unipileApiKey: false,
    unipileWebhookSecret: false,
    anthropicApiKey: false,
    qstashToken: false,
    qstashSigningKeys: false,
  };

  try {
    [team, accounts, status] = await Promise.all([
      db.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users),
      db.select().from(linkedinAccounts).orderBy(desc(linkedinAccounts.createdAt)),
      getSettingsStatus(),
    ]);
  } catch {
    // DB not reachable yet.
  }

  let schedules: ScheduleInfo[] = [];
  if (isAdmin) {
    try {
      schedules = await listSchedules();
    } catch {
      // QStash not configured / unreachable.
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Integrations, team, and per-account limits." />
      <div className="space-y-6 p-6">
        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrations</CardTitle>
            <CardDescription>
              Your Unipile, Anthropic, and QStash keys. Stored encrypted in your database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <IntegrationsForm status={status} />
            ) : (
              <p className="text-sm text-muted-foreground">Only admins can edit integrations.</p>
            )}
          </CardContent>
        </Card>

        {/* Background schedules */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Background schedules</CardTitle>
              <CardDescription>
                Runs the send tick, auto-enroll, auto-enrich, daily connection sync, and acceptance
                poll via QStash (no Vercel Pro needed). Set this up once after deploying, with your
                QStash token saved and APP_URL pointing at your live domain. Re-run this after
                updates to pick up new schedules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SchedulesCard schedules={schedules} />
            </CardContent>
          </Card>
        )}

        {/* Webhook / job URLs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook &amp; job URLs</CardTitle>
            <CardDescription>Configure these in the Unipile dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field
              label="Unipile webhook URL (use your webhook secret)"
              value={`${appUrl}/api/webhooks/unipile?secret=YOUR_WEBHOOK_SECRET`}
            />
            <Field label="Background job endpoints" value={`${appUrl}/api/jobs/{sync,enrich,send,auto-enroll,poll-acceptance}`} />
          </CardContent>
        </Card>

        {/* Team */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team members</CardTitle>
            <CardDescription>Add teammates with email + password. The first user is admin.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin && session?.user?.id ? (
              <TeamManager members={team} currentUserId={session.user.id} />
            ) : (
              <div className="space-y-2">
                {team.map((u) => (
                  <div key={u.id} className="text-sm">
                    <span className="font-medium">{u.name ?? u.email}</span>{" "}
                    <span className="text-muted-foreground">
                      {u.email} · {u.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-account limits (admin) */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-account daily limits</CardTitle>
              <CardDescription>
                LinkedIn has no quota API — these caps are enforced by the app to keep accounts safe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts connected.</p>
              ) : (
                accounts.map((a) => (
                  <div key={a.id} className="space-y-2">
                    <p className="text-sm font-medium">{a.name}</p>
                    <CapsEditor
                      accountId={a.id}
                      initial={{
                        dailyInviteCap: a.dailyInviteCap,
                        dailyMessageCap: a.dailyMessageCap,
                        dailyInmailCap: a.dailyInmailCap,
                        dailyEnrichCap: a.dailyEnrichCap,
                        autoEnrichDailyCap: a.autoEnrichDailyCap,
                      }}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{value}</code>
    </div>
  );
}
