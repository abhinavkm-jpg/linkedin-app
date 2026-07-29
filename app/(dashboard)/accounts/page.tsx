import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectAccountButton } from "@/components/connect-account-button";
import { ImportAccountsButton } from "@/components/import-accounts-button";
import { AccountCard } from "@/components/account-card";
import { EmptyState } from "@/components/empty-state";
import { Users, Network, CircleCheck, Send } from "lucide-react";
import { getAccountsWithStats } from "@/lib/data";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  const user = session!.user;
  const admin = isAdmin(user);

  let accounts: Awaited<ReturnType<typeof getAccountsWithStats>> = [];
  let members: { id: string; name: string | null; email: string }[] = [];
  let error: string | null = null;
  try {
    accounts = await getAccountsWithStats(user);
    if (admin) {
      members = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load accounts";
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description={
          admin
            ? "All connected LinkedIn accounts. Sync from Unipile and assign each to a team member."
            : "LinkedIn accounts assigned to you. Connect your own via Unipile."
        }
      >
        {admin && <ImportAccountsButton />}
        <ConnectAccountButton />
      </PageHeader>
      <div className="space-y-6 p-6">
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {accounts.length === 0 && !error ? (
          <EmptyState
            icon={Users}
            title={admin ? "No accounts connected" : "No accounts assigned"}
            description={
              admin
                ? "Import the LinkedIn accounts already connected in your Unipile workspace, or connect a new one."
                : "Connect your own LinkedIn account, or ask an admin to assign one to you."
            }
          >
            {admin ? <ImportAccountsButton /> : <ConnectAccountButton />}
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  { icon: Users, label: "Accounts", value: accounts.length },
                  {
                    icon: Network,
                    label: "Connections synced",
                    value: accounts.reduce((s, a) => s + a.connectionCount, 0),
                  },
                  {
                    icon: CircleCheck,
                    label: "Active",
                    value: accounts.filter((a) => a.status === "OK").length,
                  },
                  {
                    icon: Send,
                    label: "Sent today",
                    value: accounts.reduce(
                      (s, a) => s + a.quotas.message.used + a.quotas.invite.used,
                      0,
                    ),
                  },
                ] as const
              ).map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xl font-semibold tabular-nums">
                        {s.value.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((a) => (
                <AccountCard key={a.id} account={a} isAdmin={admin} members={members} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
